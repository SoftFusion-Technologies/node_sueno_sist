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
import { TallesModel } from '../../Models/Stock/MD_TB_Talles.js';

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
                { model: ProductosModel, as: 'producto' },
                { model: TallesModel, as: 'talle' }
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
    !detalles ||
    detalles.length === 0
  ) {
    return res.status(400).json({ mensajeError: 'Faltan datos obligatorios.' });
  }

  try {
    // 🛑 Validar que haya caja abierta para ese usuario y local
    const cajaAbierta = await CajaModel.findOne({
      where: {
        local_id,
        usuario_id,
        fecha_cierre: null
      },
      order: [['id', 'DESC']]
    });

    if (!cajaAbierta) {
      return res.status(400).json({
        mensajeError: 'No hay una caja abierta para este usuario en este local.'
      });
    }

    // Obtener datos de la venta
    const venta = await VentasModel.findByPk(venta_id, {
      include: [
        { model: DetalleVentaModel, as: 'detalles' },
        {
          model: VentaMediosPagoModel,
          as: 'venta_medios_pago',
          include: [{ model: MediosPagoModel, as: 'medios_pago' }]
        }
      ]
    });

    // Crear la devolución base
    const devolucion = await DevolucionesModel.create({
      venta_id,
      usuario_id,
      local_id,
      motivo: motivo ?? null,
      total_devuelto: 0,
      fecha: new Date()
    });

    let totalCalculado = 0;

    for (const item of detalles) {
      const { detalle_venta_id, stock_id, cantidad, monto } = item;

      if (monto == null || isNaN(monto)) {
        return res.status(400).json({
          mensajeError: 'Falta el monto en uno de los ítems a devolver.'
        });
      }

      const detalleVenta = venta.detalles.find(
        (d) => d.id === detalle_venta_id
      );
      if (!detalleVenta) continue;

      const cantidadVendida = detalleVenta.cantidad;
      const cantidadYaDevuelta = await DetalleDevolucionModel.sum('cantidad', {
        where: { detalle_venta_id }
      });

      const disponibleParaDevolver =
        cantidadVendida - (cantidadYaDevuelta || 0);
      if (cantidad > disponibleParaDevolver) {
        return res.status(400).json({
          mensajeError: `Ya se devolvieron ${
            cantidadYaDevuelta ?? 0
          } de ${cantidadVendida}. Solo podés devolver hasta ${disponibleParaDevolver}.`
        });
      }

      // Crear detalle de devolución con monto enviado
      await DetalleDevolucionModel.create({
        devolucion_id: devolucion.id,
        detalle_venta_id,
        stock_id,
        cantidad,
        precio_unitario: monto / cantidad,
        monto
      });

      totalCalculado += Number(monto);

      // Restituir stock
      const stock = await StockModel.findByPk(stock_id);
      if (stock) {
        stock.cantidad += cantidad;
        await stock.save();
      }
    }

    // Actualizar devolución con total calculado
    await devolucion.update({ total_devuelto: totalCalculado });

    // Crear el movimiento en la caja abierta
    await MovimientosCajaModel.create({
      tipo: 'egreso',
      descripcion: `Devolución de venta #${venta_id}`,
      monto: totalCalculado,
      referencia: `DEV-${devolucion.id}`,
      fecha: new Date(),
      caja_id: cajaAbierta.id
    });

    res.json({ message: 'Devolución registrada correctamente', devolucion });
  } catch (error) {
    console.error('Error al registrar devolución:', error);
    res.status(500).json({ mensajeError: error.message });
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
