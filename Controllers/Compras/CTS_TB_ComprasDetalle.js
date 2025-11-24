/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores CRUD para 'compras_detalle' con recálculo de totales en la cabecera de compra.
 * Reglas clave:
 * - Solo se pueden crear/editar/borrar líneas cuando la compra está en 'borrador'.
 * - total_linea se calcula server-side si no viene; siempre se valida.
 * - Tras cualquier cambio en detalle: se recalculan subtotal/iva/percepciones/retenciones/total de 'compras'.
 * - Transacciones Sequelize v6 + locks optimistas.
 *
 * Tema: Controladores - Compras (Detalle)
 * Capa: Backend
 */

import { Op } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

// Modelos (usar tus rutas reales de modelos)
import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { CompraDetalleModel } from '../../Models/Compras/MD_TB_ComprasDetalle.js';
import { CompraImpuestoModel } from '../../Models/Compras/MD_TB_ComprasImpuestos.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = CompraDetalleModel.sequelize;

/* ----------------------------------------------
 * Utilidades de cálculo
 * ---------------------------------------------- */
const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

function calcularTotalLinea({
  cantidad,
  costo_unit_neto,
  alicuota_iva = 21,
  inc_iva = 0,
  descuento_porcentaje = 0,
  otros_impuestos = 0
}) {
  const qty = Math.max(1, parseInt(cantidad, 10));
  const costo = toNum(costo_unit_neto);
  const desc = toNum(descuento_porcentaje);
  const base = qty * costo * (1 - desc / 100);
  const iva = inc_iva ? 0 : base * (toNum(alicuota_iva) / 100);
  const otros = toNum(otros_impuestos);
  return round2(base + iva + otros);
}

function recomputarTotalesDesde(detalles = [], impuestosDoc = []) {
  let subtotal_neto = 0;
  let iva_total = 0;
  let percepciones_total = 0;
  let retenciones_total = 0;
  let total = 0;

  for (const d of detalles) {
    // asegurar total_linea coherente para reporting
    const qty = Math.max(1, parseInt(d.cantidad, 10));
    const costo = toNum(d.costo_unit_neto);
    const desc = toNum(d.descuento_porcentaje);
    const base = qty * costo * (1 - desc / 100);
    const iva = d.inc_iva ? 0 : base * (toNum(d.alicuota_iva) / 100);
    const otros = toNum(d.otros_impuestos);

    const total_linea = round2(base + iva + otros);
    d.total_linea = total_linea; // side effect

    subtotal_neto += base;
    iva_total += iva;
    total += total_linea;
  }

  for (const i of impuestosDoc) {
    const tipo = (i.tipo || '').toUpperCase();
    const monto = toNum(i.monto);
    if (tipo === 'IVA') {
      iva_total += monto; // desglose adicional
    } else if (tipo === 'PERCEPCION') {
      percepciones_total += monto;
    } else if (tipo === 'RETENCION') {
      retenciones_total += monto;
    } else {
      total += monto; // otros
    }
  }

  subtotal_neto = round2(subtotal_neto);
  iva_total = round2(iva_total);
  percepciones_total = round2(percepciones_total);
  retenciones_total = round2(retenciones_total);
  total = round2(total + percepciones_total + retenciones_total);

  return {
    subtotal_neto,
    iva_total,
    percepciones_total,
    retenciones_total,
    total
  };
}

async function recalcCompra(compra_id, t) {
  const compra = await CompraModel.findByPk(compra_id, {
    include: [
      { model: CompraDetalleModel, as: 'detalles' },
      { model: CompraImpuestoModel, as: 'impuestos' }
    ],
    transaction: t,
    lock: t?.LOCK?.UPDATE
  });
  if (!compra) throw new Error('Compra no encontrada para recálculo');

  const totals = recomputarTotalesDesde(
    compra.detalles || [],
    compra.impuestos || []
  );

  compra.subtotal_neto = totals.subtotal_neto;
  compra.iva_total = totals.iva_total;
  compra.percepciones_total = totals.percepciones_total;
  compra.retenciones_total = totals.retenciones_total;
  compra.total = totals.total;
  await compra.save({ transaction: t });

  return compra;
}

/* ----------------------------------------------
 * Listar detalles por compra
 * ---------------------------------------------- */
export const OBRS_ComprasDetalle_CTS = async (req, res) => {
  try {
    const { compra_id, page = 1, pageSize = 50 } = req.query;
    if (!compra_id)
      return res
        .status(400)
        .json({ ok: false, error: 'compra_id es obligatorio' });

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await CompraDetalleModel.findAndCountAll({
      where: { compra_id },
      limit: Number(pageSize),
      offset,
      order: [['id', 'ASC']]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { total: count, page: Number(page), pageSize: Number(pageSize) }
    });
  } catch (err) {
    console.error('[OBRS_ComprasDetalle_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando detalles' });
  }
};

/* ----------------------------------------------
 * Obtener un detalle
 * ---------------------------------------------- */
export const OBR_CompraDetalle_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const det = await CompraDetalleModel.findByPk(id);
    if (!det)
      return res
        .status(404)
        .json({ ok: false, error: 'Detalle no encontrado' });
    res.json({ ok: true, data: det });
  } catch (err) {
    console.error('[OBR_CompraDetalle_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo detalle' });
  }
};

/* ----------------------------------------------
 * Crear detalle (solo si compra está en borrador)
 * ---------------------------------------------- */
export const CR_CompraDetalle_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const {
      compra_id,
      producto_id = null,
      producto_proveedor_id = null,
      descripcion = null,
      cantidad,
      costo_unit_neto,
      alicuota_iva = 21,
      inc_iva = false,
      descuento_porcentaje = 0,
      otros_impuestos = 0,
      cuenta_contable = null
    } = req.body || {};

    if (!compra_id)
      return res.status(400).json({ ok: false, error: 'Falta compra_id' });

    const compra = await CompraModel.findByPk(compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Solo se puede agregar detalle a compras en borrador'
        });

    const total_linea = calcularTotalLinea({
      cantidad,
      costo_unit_neto,
      alicuota_iva,
      inc_iva,
      descuento_porcentaje,
      otros_impuestos
    });

    const nuevo = await CompraDetalleModel.create(
      {
        compra_id,
        producto_id,
        producto_proveedor_id,
        descripcion,
        cantidad,
        costo_unit_neto,
        alicuota_iva,
        inc_iva,
        descuento_porcentaje,
        otros_impuestos,
        total_linea,
        cuenta_contable
      },
      { transaction: t }
    );

    await recalcCompra(compra_id, t);

    await registrarLog(
      req,
      'compras_detalle',
      'crear',
      'linea',
      `compra_id=${compra_id} detalle_id=${nuevo.id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: nuevo });
  } catch (err) {
    await t.rollback();
    console.error('[CR_CompraDetalle_Crear_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error creando detalle' });
  }
};

/* ----------------------------------------------
 * Actualizar detalle (solo si compra está en borrador)
 * ---------------------------------------------- */
export const UR_CompraDetalle_Actualizar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;

    const det = await CompraDetalleModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!det)
      return res
        .status(404)
        .json({ ok: false, error: 'Detalle no encontrado' });

    const compra = await CompraModel.findByPk(det.compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Solo se puede editar detalle en compras en borrador'
        });

    const {
      producto_id,
      producto_proveedor_id,
      descripcion,
      cantidad,
      costo_unit_neto,
      alicuota_iva,
      inc_iva,
      descuento_porcentaje,
      otros_impuestos,
      cuenta_contable
    } = req.body || {};

    // Asignar cambios
    if (producto_id !== undefined) det.producto_id = producto_id;
    if (producto_proveedor_id !== undefined)
      det.producto_proveedor_id = producto_proveedor_id;
    if (descripcion !== undefined) det.descripcion = descripcion;
    if (cantidad !== undefined) det.cantidad = cantidad;
    if (costo_unit_neto !== undefined) det.costo_unit_neto = costo_unit_neto;
    if (alicuota_iva !== undefined) det.alicuota_iva = alicuota_iva;
    if (inc_iva !== undefined) det.inc_iva = inc_iva;
    if (descuento_porcentaje !== undefined)
      det.descuento_porcentaje = descuento_porcentaje;
    if (otros_impuestos !== undefined) det.otros_impuestos = otros_impuestos;
    if (cuenta_contable !== undefined) det.cuenta_contable = cuenta_contable;

    // Recalcular total_linea
    det.total_linea = calcularTotalLinea(det);

    await det.save({ transaction: t });

    await recalcCompra(det.compra_id, t);

    await registrarLog(
      req,
      'compras_detalle',
      'actualizar',
      'linea',
      `compra_id=${det.compra_id} detalle_id=${det.id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: det });
  } catch (err) {
    await t.rollback();
    console.error('[UR_CompraDetalle_Actualizar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando detalle' });
  }
};

/* ----------------------------------------------
 * Eliminar detalle (solo si compra está en borrador)
 * ---------------------------------------------- */
export const ER_CompraDetalle_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;

    const det = await CompraDetalleModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!det)
      return res
        .status(404)
        .json({ ok: false, error: 'Detalle no encontrado' });

    const compra = await CompraModel.findByPk(det.compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Solo se puede eliminar detalle en compras en borrador'
        });

    await det.destroy({ transaction: t });

    await recalcCompra(det.compra_id, t);

    await registrarLog(
      req,
      'compras_detalle',
      'eliminar',
      'linea',
      `compra_id=${det.compra_id} detalle_id=${id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    console.error('[ER_CompraDetalle_Borrar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error eliminando detalle' });
  }
};

/* ----------------------------------------------
 * Reemplazo masivo de líneas (opcional)
 * Reescribe todas las líneas de una compra en borrador.
 * ---------------------------------------------- */
export const CR_ComprasDetalle_Reemplazar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { compra_id, detalles = [] } = req.body || {};

    if (!compra_id)
      return res.status(400).json({ ok: false, error: 'Falta compra_id' });

    const compra = await CompraModel.findByPk(compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Solo se puede reemplazar detalle en compras en borrador'
        });

    // Normalizar + calcular totales
    const dets = (detalles || []).map((d) => ({
      compra_id,
      producto_id: d.producto_id ?? null,
      producto_proveedor_id: d.producto_proveedor_id ?? null,
      descripcion: d.descripcion ?? null,
      cantidad: d.cantidad,
      costo_unit_neto: d.costo_unit_neto,
      alicuota_iva: d.alicuota_iva ?? 21,
      inc_iva: d.inc_iva ?? false,
      descuento_porcentaje: d.descuento_porcentaje ?? 0,
      otros_impuestos: d.otros_impuestos ?? 0,
      total_linea: 0,
      cuenta_contable: d.cuenta_contable ?? null
    }));

    for (const d of dets) {
      d.total_linea = calcularTotalLinea(d);
    }

    await CompraDetalleModel.destroy({ where: { compra_id }, transaction: t });
    if (dets.length)
      await CompraDetalleModel.bulkCreate(dets, { transaction: t });

    await recalcCompra(compra_id, t);

    await registrarLog(
      req,
      'compras_detalle',
      'reemplazar',
      'bulk',
      `compra_id=${compra_id} items=${dets.length}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, count: dets.length });
  } catch (err) {
    await t.rollback();
    console.error('[CR_ComprasDetalle_Reemplazar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error reemplazando detalles' });
  }
};

export default {
  OBRS_ComprasDetalle_CTS,
  OBR_CompraDetalle_CTS,
  CR_CompraDetalle_Crear_CTS,
  UR_CompraDetalle_Actualizar_CTS,
  ER_CompraDetalle_Borrar_CTS,
  CR_ComprasDetalle_Reemplazar_CTS
};
