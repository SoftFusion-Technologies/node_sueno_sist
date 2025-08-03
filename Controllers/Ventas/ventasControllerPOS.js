// controllers/ventasController.js
import { Op, Sequelize } from 'sequelize';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { TallesModel } from '../../Models/Stock/MD_TB_Talles.js';

import db from '../../DataBase/db.js'; // Ajusta la ruta según tu proyecto
import { getFechaArgentina } from '../../Utils/fechaArgentina.js';

import { VentasModel } from '../../Models/Ventas/MD_TB_Ventas.js';
import { DetalleVentaModel } from '../../Models/Ventas/MD_TB_DetalleVenta.js';
import { VentaMediosPagoModel } from '../../Models/Ventas/MD_TB_VentaMediosPago.js';
import { ClienteModel } from '../../Models/MD_TB_Clientes.js';
import { CajaModel } from '../../Models/Ventas/MD_TB_Caja.js';
import { MovimientosCajaModel } from '../../Models/Ventas/MD_TB_MovimientosCaja.js';

import { UserModel } from '../../Models/MD_TB_Users.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { MediosPagoModel } from '../../Models/Ventas/MD_TB_MediosPago.js';
import { VentaDescuentosModel } from '../../Models/Ventas/MD_TB_VentaDescuentos.js';

import { DevolucionesModel } from '../../Models/Ventas/MD_TB_Devoluciones.js';
import { DetalleDevolucionModel } from '../../Models/Ventas/MD_TB_DetalleDevolucion.js';

import { ComboVentaLogModel } from '../../Models/Combos/MD_TB_ComboVentaLog.js';
import { DetalleVentaCombosModel } from '../../Models/Combos/MD_TB_DetalleVentaCombos.js';
import { ComboProductosPermitidosModel } from '../../Models/Combos/MD_TB_ComboProductosPermitidos.js';
/** 1. Búsqueda simple por SKU o nombre, sin agrupación (detalle por talle) */
export const buscarItemsVenta = async (req, res) => {
  const { query } = req.query;

  try {
    const items = await StockModel.findAll({
      where: {
        cantidad: { [Op.gt]: 0 },
        [Op.or]: [
          { codigo_sku: { [Op.like]: `%${query}%` } },
          { '$producto.nombre$': { [Op.like]: `%${query}%` } }
        ]
      },
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'precio']
        }
      ],
      limit: 20
    });

    const respuesta = items.map((s) => ({
      stock_id: s.id,
      producto_id: s.producto.id,
      nombre: `${s.producto.nombre} (${s.codigo_sku || 'sin SKU'})`,
      precio: parseFloat(s.producto.precio),
      talla_id: s.talle_id,
      cantidad_disponible: s.cantidad,
      codigo_sku: s.codigo_sku
    }));

    res.json(respuesta);
  } catch (error) {
    console.error('Error en búsqueda de stock:', error);
    res.status(500).json({ message: 'Error en búsqueda' });
  }
};

/** 2. Búsqueda agrupada por producto con stock total, sin detalle de talles */
export const buscarItemsVentaAgrupado = async (req, res) => {
  const { query } = req.query;

  try {
    const items = await StockModel.findAll({
      attributes: [
        'producto_id',
        [Sequelize.fn('SUM', Sequelize.col('cantidad')), 'cantidad_total']
      ],
      where: {
        cantidad: { [Op.gt]: 0 }
      },
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'precio']
        }
      ],
      group: [
        'producto_id',
        'producto.id',
        'producto.nombre',
        'producto.precio'
      ],
      having: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('producto.nombre')),
        {
          [Op.like]: `%${query?.toLowerCase() || ''}%`
        }
      ),
      limit: 20
    });

    const respuesta = items.map((s) => ({
      producto_id: s.producto_id,
      nombre: s.producto.nombre,
      precio: parseFloat(s.producto.precio),
      cantidad_total: parseInt(s.get('cantidad_total'), 10)
    }));

    res.json(respuesta);
  } catch (error) {
    console.error('Error en búsqueda agrupada de stock:', error);
    res.status(500).json({ message: 'Error en búsqueda' });
  }
};

/** 3. Búsqueda detallada con talles y stock para selección exacta */
export const buscarItemsVentaDetallado = async (req, res) => {
  const { query, combo_id } = req.query;
  const isNumeric = query && !isNaN(Number(query));

  try {
    let productosPermitidos = [];
    let categoriasPermitidas = [];

    if (combo_id) {
      const permitidos = await ComboProductosPermitidosModel.findAll({
        where: { combo_id }
      });

      productosPermitidos = permitidos
        .filter((p) => p.producto_id)
        .map((p) => p.producto_id);

      categoriasPermitidas = permitidos
        .filter((p) => p.categoria_id)
        .map((p) => p.categoria_id);
    }

    let whereStock = {
      cantidad: { [Op.gt]: 0 },
      [Op.or]: [
        { codigo_sku: { [Op.like]: `%${query}%` } },
        { '$producto.nombre$': { [Op.like]: `%${query}%` } },
        ...(isNumeric
          ? [{ '$producto.id$': Number(query) }, { id: Number(query) }]
          : [])
      ]
    };

    if (
      combo_id &&
      (productosPermitidos.length > 0 || categoriasPermitidas.length > 0)
    ) {
      whereStock[Op.and] = [
        {
          [Op.or]: [
            { '$producto.id$': productosPermitidos },
            { '$producto.categoria_id$': categoriasPermitidas }
          ]
        }
      ];
    }

    const items = await StockModel.findAll({
      where: whereStock,
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: [
            'id',
            'nombre',
            'precio',
            'descuento_porcentaje',
            'precio_con_descuento',
            'categoria_id'
          ]
        },
        {
          model: TallesModel,
          as: 'talle',
          attributes: ['id', 'nombre']
        }
      ],
      limit: 50
    });

    const respuesta = items.map((s) => ({
      stock_id: s.id,
      producto_id: s.producto.id,
      nombre: s.producto.nombre,
      precio: parseFloat(s.producto.precio),
      descuento_porcentaje: s.producto.descuento_porcentaje
        ? parseFloat(s.producto.descuento_porcentaje)
        : 0,
      precio_con_descuento: s.producto.precio_con_descuento
        ? parseFloat(s.producto.precio_con_descuento)
        : parseFloat(s.producto.precio),
      talle_id: s.talle_id,
      talle_nombre: s.talle?.nombre || 'Sin talle',
      cantidad_disponible: s.cantidad,
      codigo_sku: s.codigo_sku,
      categoria_id: s.producto.categoria_id
    }));

    res.json(respuesta);
  } catch (error) {
    console.error('Error en búsqueda detallada de stock:', error);
    res.status(500).json({ message: 'Error en búsqueda detallada' });
  }
};

// Registrar una venta completa
export const registrarVenta = async (req, res) => {
  const {
    cliente_id,
    productos,
    combos = [], // 🆕 Soporte para combos
    total,
    medio_pago_id,
    usuario_id,
    local_id,
    descuento_porcentaje = 0,
    recargo_porcentaje = 0,
    aplicar_descuento = true, // <-- Nuevo parámetro para aplicar o no ajustes
    origenes_descuento = [],
    cuotas = 1,
    monto_por_cuota = null,
    porcentaje_recargo_cuotas = 0,
    diferencia_redondeo = 0,
    precio_base = 0,
    recargo_monto_cuotas = 0
  } = req.body;

  // Validaciones básicas
  if (!Array.isArray(productos) || productos.length === 0)
    return res
      .status(400)
      .json({ mensajeError: 'No hay productos en el carrito' });

  if (!usuario_id || !local_id)
    return res
      .status(400)
      .json({ mensajeError: 'Usuario o local no informado' });

  if (!medio_pago_id)
    return res
      .status(400)
      .json({ mensajeError: 'Medio de pago no seleccionado' });

  if (!total || total <= 0)
    return res.status(400).json({ mensajeError: 'Total inválido' });

  const descuento = Number(descuento_porcentaje);
  const recargo = Number(recargo_porcentaje);

  if (isNaN(descuento) || descuento < 0 || descuento > 100)
    return res
      .status(400)
      .json({ mensajeError: 'Porcentaje de descuento inválido (0-100)' });
  if (isNaN(recargo) || recargo < 0 || recargo > 100)
    return res
      .status(400)
      .json({ mensajeError: 'Porcentaje de recargo inválido (0-100)' });

  // No recalculamos nada: el total ya viene final del frontend
  let totalFinal = parseFloat(total);

  const t = await db.transaction();
  try {
    const cajaAbierta = await CajaModel.findOne({
      where: { local_id, usuario_id, fecha_cierre: null },
      transaction: t
    });
    if (!cajaAbierta)
      throw new Error('No hay caja abierta para este usuario/local');

    for (let p of productos) {
      const stock = await StockModel.findByPk(p.stock_id, { transaction: t });
      if (!stock) throw new Error(`Producto no encontrado (ID: ${p.stock_id})`);
      if (stock.cantidad < p.cantidad) {
        throw new Error(
          `Stock insuficiente para "${
            stock.nombre || p.stock_id
          }". Disponible: ${stock.cantidad}`
        );
      }
    }

    const fechaFinal = getFechaArgentina();

    const venta = await VentasModel.create(
      {
        cliente_id: cliente_id || null,
        usuario_id,
        local_id,
        total: totalFinal,
        fecha: fechaFinal,
        descuento_porcentaje: aplicar_descuento ? descuento : 0,
        recargo_porcentaje: aplicar_descuento ? recargo : 0,
        aplicar_descuento, // Guardamos si se aplicó o no
        estado: 'confirmada',
        // 🔽 Nuevos campos añadidos
        cuotas,
        monto_por_cuota,
        porcentaje_recargo_cuotas,
        diferencia_redondeo,
        precio_base,
        recargo_monto_cuotas
      },
      { transaction: t }
    );

    for (let p of productos) {
      await DetalleVentaModel.create(
        {
          venta_id: venta.id,
          stock_id: p.stock_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          descuento: p.descuento || 0,
          descuento_porcentaje: p.descuento_porcentaje || 0,
          precio_unitario_con_descuento:
            p.precio_unitario_con_descuento || p.precio_unitario
        },
        { transaction: t }
      );

      const stock = await StockModel.findByPk(p.stock_id, { transaction: t });
      stock.cantidad -= p.cantidad;
      await stock.save({ transaction: t });
    }

    // 💥 Insertar combos vendidos
    for (const combo of combos) {
      // 1. Insertar en combo_venta_log
      await ComboVentaLogModel.create(
        {
          venta_id: venta.id,
          combo_id: combo.combo_id,
          precio_combo: combo.precio_combo,
          cantidad: 1
        },
        { transaction: t }
      );

      // 2. Insertar en detalle_venta_combos
      for (const item of combo.productos) {
        await DetalleVentaCombosModel.create(
          {
            venta_id: venta.id,
            combo_id: combo.combo_id,
            stock_id: item.stock_id
          },
          { transaction: t }
        );
      }
    }

    await VentaMediosPagoModel.create(
      {
        venta_id: venta.id,
        medio_pago_id,
        monto: totalFinal
      },
      { transaction: t }
    );

    console.log(origenes_descuento);
    // Insertar origenes de descuento (si existen)
    if (Array.isArray(origenes_descuento) && origenes_descuento.length > 0) {
      for (const d of origenes_descuento) {
        // Validación básica
        if (!['producto', 'medio_pago', 'manual'].includes(d.tipo)) continue;

        await VentaDescuentosModel.create(
          {
            venta_id: venta.id,
            tipo: d.tipo,
            referencia_id: d.referencia_id ?? null,
            detalle: d.detalle ?? '',
            porcentaje: Number(d.porcentaje ?? 0),
            monto: Number(d.monto ?? 0)
          },
          { transaction: t }
        );
      }
    }

    await MovimientosCajaModel.create(
      {
        caja_id: cajaAbierta.id,
        tipo: 'ingreso',
        descripcion: `Venta #${venta.id}`,
        monto: totalFinal,
        referencia: String(venta.id)
      },
      { transaction: t }
    );

    if (cliente_id) {
      await ClienteModel.update(
        { fecha_ultima_compra: new Date() },
        { where: { id: cliente_id }, transaction: t }
      );
    }

    await t.commit();

    res.status(201).json({
      message: 'Venta registrada correctamente',
      venta_id: venta.id,
      total: totalFinal,
      descuento_porcentaje: aplicar_descuento ? descuento : 0,
      recargo_porcentaje: aplicar_descuento ? recargo : 0,
      aplicar_descuento,
      cliente_id: venta.cliente_id,
      productos,
      medio_pago_id,
      caja_id: cajaAbierta.id
    });
  } catch (error) {
    await t.rollback();
    console.error('[Error en registrarVenta]', error);
    res
      .status(500)
      .json({ mensajeError: error.message || 'Error al registrar la venta' });
  }
};

// controllers/ventasController.js
export const OBR_VentaDetalle_CTS = async (req, res) => {
  try {
    const venta = await VentasModel.findByPk(req.params.id, {
      include: [
        {
          model: DetalleVentaModel,
          as: 'detalles',
          include: [
            {
              model: StockModel,
              include: [{ model: ProductosModel }, { model: TallesModel }]
            }
          ]
        },
        { model: ClienteModel },
        { model: UserModel },
        { model: LocalesModel },
        {
          model: VentaMediosPagoModel,
          as: 'venta_medios_pago',
          include: [{ model: MediosPagoModel }]
        },
        {
          model: VentaDescuentosModel,
          as: 'descuentos' // 👈 Agregado
        }, // 🔁 Agregamos las devoluciones y sus detalles
        {
          model: DevolucionesModel,
          as: 'devoluciones',
          attributes: ['id', 'fecha', 'total_devuelto'],
          include: [
            {
              model: DetalleDevolucionModel,
              as: 'detalles',
              attributes: ['id', 'cantidad', 'stock_id', 'detalle_venta_id']
            }
          ]
        }
      ]
    });

    if (!venta)
      return res.status(404).json({ mensajeError: 'Venta no encontrada' });

    // Calcular subtotal sin descuentos
    let totalSinDescuento = 0;
    let descuentoProducto = 0;
    let descuentoCarrito = 0; // si tienes descuentos aplicados en carrito
    let descuentoMedioPago = 0; // si tienes descuentos aplicados por medio de pago

    for (const detalle of venta.detalles) {
      const precioBase = detalle.precio_unitario * detalle.cantidad;
      totalSinDescuento += precioBase;
      // Aquí puedes calcular descuentos específicos por detalle si guardas ese dato
      // Por ejemplo, si detalle.descuento existe
      if (detalle.descuento) {
        descuentoProducto += detalle.descuento * detalle.cantidad;
      }
    }

    // Suponiendo que tienes campos en venta para descuentos de carrito y medio pago
    descuentoCarrito = venta.descuento_carrito || 0;
    descuentoMedioPago = venta.descuento_medio_pago || 0;

    const respuesta = {
      ...venta.toJSON(),
      total_sin_descuentos: totalSinDescuento,
      total_descuento_producto: descuentoProducto,
      total_descuento_carrito: descuentoCarrito,
      total_descuento_medio_pago: descuentoMedioPago
    };

    res.json(respuesta);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// 🚫 Anular una venta
export const anularVenta = async (req, res) => {
  const ventaId = req.params.id;
  const t = await db.transaction();

  try {
    const venta = await VentasModel.findByPk(ventaId, {
      include: [
        {
          model: DetalleVentaModel,
          as: 'detalles'
        },
        {
          model: VentaMediosPagoModel,
          as: 'venta_medios_pago'
        }
      ],
      transaction: t
    });

    if (!venta) {
      await t.rollback();
      return res.status(404).json({ mensajeError: 'Venta no encontrada' });
    }

    if (venta.estado === 'anulada') {
      await t.rollback();
      return res.status(400).json({ mensajeError: 'La venta ya fue anulada' });
    }

    const devoluciones = await DevolucionesModel.findAll({
      where: { venta_id: ventaId },
      transaction: t
    });

    if (devoluciones.length > 0) {
      throw new Error(
        'No se puede anular una venta que ya tiene devoluciones registradas'
      );
    }

    const caja = await CajaModel.findOne({
      where: {
        local_id: venta.local_id,
        usuario_id: venta.usuario_id,
        fecha_cierre: null
      },
      transaction: t
    });

    if (!caja) throw new Error('No hay caja abierta');

    // Devolver stock
    for (const detalle of venta.detalles) {
      const stock = await StockModel.findByPk(detalle.stock_id, {
        transaction: t
      });
      if (!stock) throw new Error(`Stock no encontrado ID ${detalle.stock_id}`);
      stock.cantidad += detalle.cantidad;
      await stock.save({ transaction: t });
    }

    // Egreso en caja (devolución de dinero)
    await MovimientosCajaModel.create(
      {
        caja_id: caja.id,
        tipo: 'egreso',
        descripcion: `Anulación venta #${venta.id}`,
        monto: venta.total,
        referencia: `ANUL-${venta.id}`
      },
      { transaction: t }
    );

    // Cambiar estado
    venta.estado = 'anulada';
    await venta.save({ transaction: t });

    await t.commit();
    res.json({ mensaje: 'Venta anulada correctamente', id: venta.id });
  } catch (error) {
    await t.rollback();
    console.error('[Error al anular venta]', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
