/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo contiene controladores para manejar devoluciones de productos.
 *
 * Tema: Controladores - Devoluciones
 * Capa: Backend
 */

import { DevolucionesModel } from '../../Models/Ventas/MD_TB_Devoluciones.js';
import { DetalleDevolucionModel } from '../../Models/Ventas/MD_TB_DetalleDevolucion.js';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import { VentasModel } from '../../Models/Ventas/MD_TB_Ventas.js';
import { DetalleVentaModel } from '../../Models/Ventas/MD_TB_DetalleVenta.js';

import { CajaModel } from '../../Models/Ventas/MD_TB_Caja.js';
import { MovimientosCajaModel } from '../../Models/Ventas/MD_TB_MovimientosCaja.js';
import { VentaMediosPagoModel } from '../../Models/Ventas/MD_TB_VentaMediosPago.js';
import MD_TB_MediosPago from '../../Models/Ventas/MD_TB_MediosPago.js';
import { UserModel } from '../../Models/MD_TB_Users.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
// import { TallesModel } from '../../Models/Stock/MD_TB_Talles.js';
import db from '../../DataBase/db.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

const { MediosPagoModel } = MD_TB_MediosPago;
// Obtener todas las devoluciones
export const OBRS_Devoluciones_CTS = async (req, res) => {
  try {
    const devoluciones = await DevolucionesModel.findAll({
      include: [{ model: VentasModel }],
      order: [['id', 'DESC']]
    });
    res.json(devoluciones);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener una devolución por ID
export const OBR_Devolucion_CTS = async (req, res) => {
  try {
    const devolucion = await DevolucionesModel.findByPk(req.params.id, {
      include: [
        { model: VentasModel },
        { model: UserModel, as: 'usuario' },
        { model: LocalesModel, as: 'local' },
        {
          model: DetalleDevolucionModel,
          as: 'detalles',
          include: [
            {
              model: StockModel,
              include: [
                { model: ProductosModel, as: 'producto' }
                // { model: TallesModel, as: 'talle' }
              ]
            }
          ]
        }
      ]
    });

    if (!devolucion) {
      return res.status(404).json({ mensajeError: 'Devolución no encontrada' });
    }

    res.json(devolucion);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear una nueva devolución
export const CR_Devolucion_CTS = async (req, res) => {
  const { venta_id, usuario_id, local_id, detalles, motivo } = req.body;

  if (
    !venta_id ||
    !usuario_id ||
    !local_id ||
    !Array.isArray(detalles) ||
    detalles.length === 0
  ) {
    return res.status(400).json({ mensajeError: 'Faltan datos obligatorios.' });
  }

  const t = await db.transaction();
  try {
    // Caja abierta del usuario/local
    const cajaAbierta = await CajaModel.findOne({
      where: { local_id, usuario_id, fecha_cierre: null },
      order: [['id', 'DESC']],
      transaction: t
    });
    if (!cajaAbierta) {
      await t.rollback();
      return res
        .status(400)
        .json({
          mensajeError:
            'No hay una caja abierta para este usuario en este local.'
        });
    }

    // Venta con detalles y medio de pago
    const venta = await VentasModel.findByPk(venta_id, {
      include: [
        { model: DetalleVentaModel, as: 'detalles' },
        { model: VentaMediosPagoModel, as: 'venta_medios_pago' }
      ],
      transaction: t
    });
    if (!venta) {
      await t.rollback();
      return res.status(404).json({ mensajeError: 'Venta no encontrada.' });
    }

    // Resolver nombres de productos para el log
    const stockIds = [...new Set(detalles.map((d) => d.stock_id))];
    const stocks = stockIds.length
      ? await StockModel.findAll({
          where: { id: stockIds },
          include: [
            {
              model: ProductosModel,
              as: 'producto',
              attributes: ['id', 'nombre']
            }
          ],
          transaction: t
        })
      : [];
    const mapaNombreProductoPorStock = new Map(
      stocks.map((s) => [
        s.id,
        s.producto?.nombre || `Producto#${s.producto_id}`
      ])
    );

    // Crear cabecera de devolución
    const devolucion = await DevolucionesModel.create(
      {
        venta_id,
        usuario_id,
        local_id,
        motivo: motivo ?? null,
        total_devuelto: 0,
        fecha: new Date()
      },
      { transaction: t }
    );

    let totalCalculado = 0;

    // Procesar cada ítem devuelto
    for (const item of detalles) {
      const { detalle_venta_id, stock_id, cantidad, monto } = item;

      if (monto == null || isNaN(monto)) {
        await t.rollback();
        return res
          .status(400)
          .json({
            mensajeError: 'Falta el monto en uno de los ítems a devolver.'
          });
      }

      const detalleVenta = venta.detalles.find(
        (d) => d.id === detalle_venta_id
      );
      if (!detalleVenta) {
        await t.rollback();
        return res
          .status(400)
          .json({
            mensajeError: `Detalle de venta inexistente: ${detalle_venta_id}`
          });
      }

      // Validar cantidades ya devueltas
      const cantidadVendida = detalleVenta.cantidad;
      const cantidadYaDevuelta = await DetalleDevolucionModel.sum('cantidad', {
        where: { detalle_venta_id },
        transaction: t
      });
      const disponibleParaDevolver =
        cantidadVendida - (cantidadYaDevuelta || 0);
      if (cantidad > disponibleParaDevolver) {
        await t.rollback();
        return res.status(400).json({
          mensajeError: `Ya se devolvieron ${
            cantidadYaDevuelta ?? 0
          } de ${cantidadVendida}. Solo podés devolver hasta ${disponibleParaDevolver}.`
        });
      }

      // Crear detalle de devolución (precio_unitario = monto/cantidad)
      await DetalleDevolucionModel.create(
        {
          devolucion_id: devolucion.id,
          detalle_venta_id,
          stock_id,
          cantidad,
          precio_unitario: cantidad ? Number(monto) / Number(cantidad) : 0,
          monto: Number(monto)
        },
        { transaction: t }
      );

      totalCalculado += Number(monto);

      // Restituir stock
      const stock = await StockModel.findByPk(stock_id, { transaction: t });
      if (!stock) {
        await t.rollback();
        return res
          .status(400)
          .json({ mensajeError: `Stock no encontrado ID ${stock_id}` });
      }
      stock.cantidad += cantidad;
      await stock.save({ transaction: t });
    }

    // Actualizar total en devolución
    await devolucion.update(
      { total_devuelto: totalCalculado },
      { transaction: t }
    );

    // Movimiento en caja (egreso)
    await MovimientosCajaModel.create(
      {
        tipo: 'egreso',
        descripcion: `Devolución de venta #${venta_id}`,
        monto: totalCalculado,
        referencia: `DEV-${devolucion.id}`,
        fecha: new Date(),
        caja_id: cajaAbierta.id
      },
      { transaction: t }
    );

    await t.commit();

    // ===================== LOG (fuera del commit) =====================
    try {
      const fmtARS = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      });

      const [usuarioLog, localLog] = await Promise.all([
        UserModel.findByPk(usuario_id, { attributes: ['id', 'nombre'] }),
        LocalesModel.findByPk(local_id, { attributes: ['id', 'nombre'] })
      ]);

      const itemsTxt = detalles
        .map((d) => {
          const nombre =
            mapaNombreProductoPorStock.get(d.stock_id) ?? `Stock#${d.stock_id}`;
          return `${nombre} x${d.cantidad} (${fmtARS
            .format(Number(d.monto || 0))
            .replace(/\s+/g, '')})`;
        })
        .join(', ');

      // Medio de pago (tomamos el primero de la venta si existe)
      const mp = venta.venta_medios_pago?.[0];
      const medioPagoTxt = mp
        ? (
            await MediosPagoModel.findByPk(mp.medio_pago_id, {
              attributes: ['id', 'nombre']
            })
          )?.nombre
        : '—';

      const parts = [
        `registró la devolución #${devolucion.id} de la venta #${venta_id}`,
        `en ${
          localLog?.nombre ? `local "${localLog.nombre}"` : `local #${local_id}`
        }`,
        `por ${fmtARS.format(Number(totalCalculado)).replace(/\s+/g, '')}`,
        `(medio de pago original: ${medioPagoTxt ?? '—'})`,
        itemsTxt ? `Ítems: ${itemsTxt}` : ''
      ];
      if (motivo) parts.push(`Motivo: ${motivo}`);

      await registrarLog(
        req,
        'ventas',
        'devolver',
        parts.filter(Boolean).join(' · '),
        usuario_id
      );
    } catch (e) {
      console.warn('[registrarLog devolucion] no crítico:', e.message);
    }
    // ================================================================

    return res.json({
      message: 'Devolución registrada correctamente',
      devolucion
    });
  } catch (error) {
    await t.rollback();
    console.error('Error al registrar devolución:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar devolución
export const ER_Devolucion_CTS = async (req, res) => {
  try {
    const eliminado = await DevolucionesModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Devolución no encontrada' });

    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
