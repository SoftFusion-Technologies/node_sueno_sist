/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 24 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones CRUD y flujo de las ÓRDENES DE COMPRA.
 *
 * Cubre:
 * - Crear borrador (con detalles y totales estimados server-side).
 * - Actualizar borrador.
 * - Listar con filtros por proveedor/fecha/estado/prioridad/local.
 * - Obtener una OC con sus detalles.
 * - Eliminar borrador.
 * - Cambiar estado (borrador/pending/aprobada/rechazada/cerrada).
 *
 * IMPORTANTE:
 * - Confirmar / aprobar una OC **NO crea** automáticamente una fila en `compras`.
 *   Más adelante se puede implementar un endpoint "Generar compra desde OC"
 *   que copie cabecera + detalles a `compras` / `compras_detalle`.
 *
 * Tema: Controladores - Ordenes de Compra
 * Capa: Backend
 */

import { Op } from 'sequelize';

import { OrdenCompraModel } from '../../Models/Compras/MD_TB_OrdenesCompra.js';
import { OrdenCompraDetalleModel } from '../../Models/Compras/MD_TB_OrdenesCompraDetalle.js';

import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = OrdenCompraModel.sequelize;

const toNum = (v) => Number(v ?? 0);
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------
 * Helper: recalcular totales estimados de la OC
 *    - Recibe detalles (array)
 *    - Recibe percepciones_estimadas y retenciones_estimadas (cabecera)
 * ------------------------------------------------------ */
const recalcularTotalesOrden = (
  detalles = [],
  percepciones_estimadas = 0,
  retenciones_estimadas = 0
) => {
  let subtotal_neto_estimado = 0;
  let iva_estimado = 0;
  let otros_det_impuestos = 0;

  for (const d of detalles) {
    const cant = toNum(d.cantidad) || 0;
    // soportar nombres "estimados" o los de compra básica por si se reusa estructura
    const aliIva =
      d.alicuota_iva_estimado != null
        ? toNum(d.alicuota_iva_estimado)
        : toNum(d.alicuota_iva);
    const descPct = toNum(d.descuento_porcentaje); // ej: 10
    const otrosImpLinea =
      d.otros_impuestos_estimados != null
        ? toNum(d.otros_impuestos_estimados)
        : toNum(d.otros_impuestos);
    const incIva =
      d.inc_iva_estimado != null ? !!d.inc_iva_estimado : !!d.inc_iva;

    let costoUnit =
      d.costo_unit_estimado != null
        ? toNum(d.costo_unit_estimado)
        : toNum(d.costo_unit_neto);

    if (cant <= 0 || costoUnit < 0) continue;

    let netoUnit = 0;
    let ivaUnit = 0;

    // 1) separar neto/iva según inc_iva
    if (incIva && aliIva > 0) {
      const factor = 1 + aliIva / 100;
      netoUnit = costoUnit / factor;
      ivaUnit = costoUnit - netoUnit;
    } else {
      netoUnit = costoUnit;
      ivaUnit = (costoUnit * aliIva) / 100;
    }

    // 2) aplicar descuento (sobre neto e IVA proporcionalmente)
    if (descPct > 0 && descPct < 100) {
      const factorDesc = (100 - descPct) / 100;
      netoUnit = netoUnit * factorDesc;
      ivaUnit = ivaUnit * factorDesc;
    }

    // 3) acumular por línea
    const netoLinea = netoUnit * cant;
    const ivaLinea = ivaUnit * cant;

    subtotal_neto_estimado += netoLinea;
    iva_estimado += ivaLinea;
    otros_det_impuestos += otrosImpLinea;

    // 4) total_linea_estimado (actualizado en el objeto d)
    d.total_linea_estimado = round2(netoLinea + ivaLinea + otrosImpLinea);
  }

  const percEst = toNum(percepciones_estimadas);
  const retEst = toNum(retenciones_estimadas);

  const total_estimado = round2(
    subtotal_neto_estimado +
      iva_estimado +
      otros_det_impuestos +
      percEst -
      retEst
  );

  return {
    subtotal_neto_estimado: round2(subtotal_neto_estimado),
    iva_estimado: round2(iva_estimado),
    percepciones_estimadas: percEst,
    retenciones_estimadas: retEst,
    total_estimado
  };
};

const getUsuarioId = (req) =>
  Number(
    req.body?.usuario_log_id ??
      req.query?.usuario_log_id ??
      req.user?.id ??
      null
  ) || null;

/* ======================================================
 * 1) Crear ÓRDEN DE COMPRA en borrador
 *    POST /ordenes-compra
 * ==================================================== */
export const CR_OrdenCompra_CrearBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);

    const {
      canal = 'C1',
      proveedor_id,
      local_id = null,
      fecha = new Date(),
      // 🔹 IMPORTANTE: este es el nombre que esperamos desde el front
      fecha_estimada_entrega = null,
      condicion_compra = 'cuenta_corriente',
      moneda = 'ARS',
      prioridad = 'media',
      observaciones = null,
      percepciones_estimadas = 0,
      retenciones_estimadas = 0,
      detalles = []
    } = req.body || {};

    console.log('orden compra recibidos:', req.body);

    if (!proveedor_id) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Falta proveedor_id' });
    }

    // 🔹 CAMBIO: YA NO rechazamos si detalles está vacío.
    const detallesArray = Array.isArray(detalles) ? detalles : [];

    // Recalcular totales estimados en backend (puede ser todo 0 si no hay detalles)
    const tot = recalcularTotalesOrden(
      detallesArray,
      percepciones_estimadas,
      retenciones_estimadas
    );

    const orden = await OrdenCompraModel.create(
      {
        canal,
        proveedor_id,
        local_id,
        fecha,
        fecha_estimada_entrega,
        condicion_compra,
        moneda,
        prioridad,
        observaciones,
        subtotal_neto_estimado: tot.subtotal_neto_estimado,
        iva_estimado: tot.iva_estimado,
        percepciones_estimadas: tot.percepciones_estimadas,
        retenciones_estimadas: tot.retenciones_estimadas,
        total_estimado: tot.total_estimado,
        estado: 'borrador',
        created_by: usuario_id
      },
      { transaction: t }
    );

    // 🔹 Solo si vienen detalles los insertamos
    if (detallesArray.length > 0) {
      for (const d of detallesArray) {
        d.orden_compra_id = orden.id;
      }

      await OrdenCompraDetalleModel.bulkCreate(detallesArray, {
        transaction: t
      });
    }

    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: moneda || 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const logDescripcion = [
      'creó una ORDEN DE COMPRA en borrador',
      `OC_ID=${orden.id}`,
      `ProveedorID=${proveedor_id}`,
      `Canal=${canal}`,
      `Condición=${condicion_compra}`,
      `Prioridad=${prioridad}`,
      `TotalEstimado=${formatCurrency(tot.total_estimado)}`,
      `Ítems=${detallesArray.length}`
    ].join(' | ');

    await registrarLog(
      req,
      'ordenes_compra',
      'crear',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true, orden });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('[CR_OrdenCompra_CrearBorrador_CTS] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error creando Orden de Compra'
    });
  }
};

/* ======================================================
 * 2) Actualizar ÓRDEN DE COMPRA en borrador
 *    PUT /ordenes-compra/:id
 * ==================================================== */
export const UR_OrdenCompra_ActualizarBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const { id } = req.params;

    const {
      canal,
      proveedor_id,
      local_id,
      fecha,
      fecha_estimada_entrega,
      condicion_compra,
      moneda,
      prioridad,
      observaciones,
      percepciones_estimadas,
      retenciones_estimadas,
      // 👇 OJO: no le ponemos valor por defecto []
      detalles: detallesBody
    } = req.body || {};

    const orden = await OrdenCompraModel.findByPk(id, {
      include: [{ model: OrdenCompraDetalleModel, as: 'detalles' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!orden) {
      await t.rollback();
      return res
        .status(404)
        .json({ ok: false, error: 'Orden de compra no encontrada' });
    }

    if (orden.estado !== 'borrador') {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede editar una Orden de Compra en estado borrador'
      });
    }

    // =====================================================
    // Determinar si vienen DETALLES NUEVOS en el body
    // =====================================================
    const hayDetallesNuevos =
      Array.isArray(detallesBody) && detallesBody.length > 0;

    // =====================================================
    // 1) Normalizar detalles para recalcular totales
    //    - Si vienen detalles nuevos → usar esos
    //    - Si NO vienen → usar los existentes de la OC
    // =====================================================
    const mapDetalle = (d) => {
      const cant = Number(d.cantidad) || 0;
      const costo = Number(
        d.costo_unit_estimado ??
          d.precio_unitario ??
          0
      );

      const alicIva = Number(d.alicuota_iva_estimado ?? 21);
      const incIva = Number(d.inc_iva_estimado ?? 0);
      const desc = Number(d.descuento_porcentaje ?? 0);
      const otrosImp = Number(d.otros_impuestos_estimados ?? 0);
      const totalLinea = Number(d.total_linea_estimado ?? 0);

      return {
        orden_compra_id: orden.id,
        producto_id: d.producto_id,
        descripcion: d.descripcion || null,
        cantidad: cant,
        costo_unit_estimado: costo,
        alicuota_iva_estimado: alicIva,
        inc_iva_estimado: incIva,
        descuento_porcentaje: desc,
        otros_impuestos_estimados: otrosImp,
        total_linea_estimado: totalLinea
      };
    };

    let detallesMapped = [];

    if (hayDetallesNuevos) {
      // 🧾 Vienen detalles en el body → los usamos para totales y para reemplazar en DB
      detallesMapped = detallesBody.map(mapDetalle);
    } else {
      // 🧾 No vinieron detalles → usamos los ya guardados en la OC
      const detallesExistentes = orden.detalles || [];

      // Si no hay detalles en DB, dejamos totales en 0 y NO obligamos a tener detalles:
      // permitimos cabecera sin detalle en borrador.
      if (detallesExistentes.length > 0) {
        detallesMapped = detallesExistentes.map((d) =>
          mapDetalle({
            producto_id: d.producto_id,
            descripcion: d.descripcion,
            cantidad: d.cantidad,
            costo_unit_estimado: d.costo_unit_estimado,
            alicuota_iva_estimado: d.alicuota_iva_estimado,
            inc_iva_estimado: d.inc_iva_estimado,
            descuento_porcentaje: d.descuento_porcentaje,
            otros_impuestos_estimados: d.otros_impuestos_estimados,
            total_linea_estimado: d.total_linea_estimado
          })
        );
      } else {
        // Sin detalles → totales en 0
        detallesMapped = [];
      }
    }

    // =====================================================
    // 2) Recalcular totales OC (en base a detallesMapped)
    // =====================================================
    const percEst =
      percepciones_estimadas != null
        ? percepciones_estimadas
        : orden.percepciones_estimadas;
    const retEst =
      retenciones_estimadas != null
        ? retenciones_estimadas
        : orden.retenciones_estimadas;

    const tot = recalcularTotalesOrden(detallesMapped, percEst, retEst);

    Object.assign(orden, {
      canal: canal ?? orden.canal,
      proveedor_id: proveedor_id ?? orden.proveedor_id,
      local_id: local_id ?? orden.local_id,
      fecha: fecha ?? orden.fecha,
      fecha_estimada_entrega:
        fecha_estimada_entrega ?? orden.fecha_estimada_entrega,
      condicion_compra: condicion_compra ?? orden.condicion_compra,
      moneda: moneda ?? orden.moneda,
      prioridad: prioridad ?? orden.prioridad,
      observaciones: observaciones ?? orden.observaciones,
      subtotal_neto_estimado: tot.subtotal_neto_estimado,
      iva_estimado: tot.iva_estimado,
      percepciones_estimadas: tot.percepciones_estimadas,
      retenciones_estimadas: tot.retenciones_estimadas,
      total_estimado: tot.total_estimado,
      updated_by: usuario_id
    });

    await orden.save({ transaction: t });

    // =====================================================
    // 3) Reemplazar detalles SOLO si vinieron nuevos
    // =====================================================
    if (hayDetallesNuevos) {
      await OrdenCompraDetalleModel.destroy({
        where: { orden_compra_id: orden.id },
        transaction: t
      });

      if (detallesMapped.length) {
        await OrdenCompraDetalleModel.bulkCreate(detallesMapped, {
          transaction: t
        });
      }
    }

    await registrarLog(
      req,
      'ordenes_compra',
      'actualizar',
      `borrador — OC_ID=${orden.id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true, orden });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('[UR_OrdenCompra_ActualizarBorrador_CTS] Error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error actualizando Orden de Compra' });
  }
};

/* ======================================================
 * 3) Listado de Órdenes de Compra
 *    GET /ordenes-compra
 *    Filtros: fecha_desde, fecha_hasta, estado, proveedor_id,
 *             local_id, prioridad, canal, q_proveedor, q
 * ==================================================== */
export const OBRS_OrdenesCompra_CTS = async (req, res) => {
  try {
    const {
      fecha_desde,
      fecha_hasta,
      estado,
      proveedor_id,
      local_id,
      prioridad,
      canal,
      q_proveedor,
      q,
      page = 1,
      pageSize = 50
    } = req.query || {};

    const where = {};
    if (canal) where.canal = canal;
    if (estado) where.estado = estado;
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (local_id) where.local_id = Number(local_id);
    if (prioridad) where.prioridad = prioridad;

    if (fecha_desde || fecha_hasta) {
      where.fecha = {};
      if (fecha_desde) where.fecha[Op.gte] = `${fecha_desde} 00:00:00`;
      if (fecha_hasta) where.fecha[Op.lte] = `${fecha_hasta} 23:59:59`;
    }

    const whereProveedor = {};
    if (q_proveedor && String(q_proveedor).trim()) {
      const v = `%${String(q_proveedor).trim()}%`;
      whereProveedor[Op.or] = [
        { razon_social: { [Op.like]: v } },
        { nombre_fantasia: { [Op.like]: v } },
        { cuit: { [Op.like]: v } }
      ];
    }

    if (q && String(q).trim()) {
      const texto = `%${String(q).trim()}%`;
      where[Op.or] = [
        { observaciones: { [Op.like]: texto } }
        // se podría añadir campo "nro_interno" si existiera
      ];
    }

    const limit = Number(pageSize) || 50;
    const offset = (Number(page) - 1) * limit;

    const { rows, count } = await OrdenCompraModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ],
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor',
          required: Object.keys(whereProveedor).length > 0,
          where: Object.keys(whereProveedor).length ? whereProveedor : undefined
        },
        {
          model: LocalesModel,
          as: 'local',
          required: false
        }
      ]
    });

    return res.json({
      ok: true,
      data: rows,
      meta: {
        total: count,
        page: Number(page),
        pageSize: limit
      }
    });
  } catch (err) {
    console.error('[OBRS_OrdenesCompra_CTS] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error listando Órdenes de Compra'
    });
  }
};

/* ======================================================
 * 4) Obtener una OC por id
 *    GET /ordenes-compra/:id
 * ==================================================== */
export const OBR_OrdenCompra_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const orden = await OrdenCompraModel.findByPk(id, {
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor'
        },
        {
          model: LocalesModel,
          as: 'local'
        },
        {
          model: OrdenCompraDetalleModel,
          as: 'detalles'
        }
      ]
    });

    if (!orden) {
      return res
        .status(404)
        .json({ ok: false, error: 'Orden de compra no encontrada' });
    }

    return res.json({ ok: true, data: orden });
  } catch (err) {
    console.error('[OBR_OrdenCompra_CTS] Error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error obteniendo Orden de Compra' });
  }
};

/* ======================================================
 * 5) Eliminar OC en borrador
 *    DELETE /ordenes-compra/:id
 * ==================================================== */
export const ER_OrdenCompra_EliminarBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const { id } = req.params;

    const orden = await OrdenCompraModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!orden) {
      await t.rollback();
      return res
        .status(404)
        .json({ ok: false, error: 'Orden de compra no encontrada' });
    }

    if (orden.estado !== 'borrador') {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede eliminar una OC en borrador'
      });
    }

    await OrdenCompraDetalleModel.destroy({
      where: { orden_compra_id: orden.id },
      transaction: t
    });

    await orden.destroy({ transaction: t });

    await registrarLog(
      req,
      'ordenes_compra',
      'eliminar',
      `borrador — OC_ID=${id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('[ER_OrdenCompra_EliminarBorrador_CTS] Error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error eliminando Orden de Compra' });
  }
};

/* ======================================================
 * 6) Cambiar estado de la OC
 *    PATCH /ordenes-compra/:id/estado
 *    body: { estado_nuevo, approved_by }
 *
 *    Nota:
 *    - Aprobada NO crea compra. Solo cambia workflow.
 * ==================================================== */
export const ACC_OrdenCompra_CambiarEstado_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const { id } = req.params;
    const { estado_nuevo, approved_by } = req.body || {};

    const valoresPermitidos = [
      'borrador',
      'pendiente_aprobacion',
      'aprobada',
      'rechazada',
      'cerrada'
    ];

    if (!estado_nuevo || !valoresPermitidos.includes(estado_nuevo)) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error:
          'estado_nuevo es requerido y debe ser uno de: ' +
          valoresPermitidos.join(', ')
      });
    }

    const orden = await OrdenCompraModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!orden) {
      await t.rollback();
      return res
        .status(404)
        .json({ ok: false, error: 'Orden de compra no encontrada' });
    }

    const estadoActual = orden.estado;

    // Pequeño control de flujo (se puede endurecer si querés)
    const transicionValida = () => {
      if (estadoActual === 'borrador') {
        // agrego 'aprobada' para permitir aprobar directo
        return ['pendiente_aprobacion', 'aprobada', 'rechazada'].includes(
          estado_nuevo
        );
      }
      if (estadoActual === 'pendiente_aprobacion') {
        return ['aprobada', 'rechazada'].includes(estado_nuevo);
      }
      if (estadoActual === 'aprobada') {
        return ['cerrada'].includes(estado_nuevo);
      }
      if (estadoActual === 'rechazada') {
        return ['cerrada'].includes(estado_nuevo);
      }
      if (estadoActual === 'cerrada') {
        return false;
      }
      return false;
    };

    if (!transicionValida()) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: `Transición de estado inválida: ${estadoActual} → ${estado_nuevo}`
      });
    }

    orden.estado = estado_nuevo;

    if (estado_nuevo === 'aprobada') {
      orden.approved_by = approved_by ?? usuario_id;
    }

    orden.updated_by = usuario_id;

    await orden.save({ transaction: t });

    await registrarLog(
      req,
      'ordenes_compra',
      'cambiar_estado',
      `OC_ID=${orden.id} | ${estadoActual} -> ${estado_nuevo}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true, orden });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('[ACC_OrdenCompra_CambiarEstado_CTS] Error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error cambiando estado de la OC' });
  }
};
