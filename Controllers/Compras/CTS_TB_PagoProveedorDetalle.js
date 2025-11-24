/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar aplicaciones de pagos a compras (pago_proveedor_detalle).
 * - Crear/editar/eliminar aplicaciones (imputaciones) de un pago a CxP.
 * - Reglas: una aplicación por (pago_id, compra_id) (UNIQUE),
 *           sum(aplicaciones) ≤ pago.monto_total,
 *           monto_aplicado ≤ saldo de la CxP correspondiente,
 *           el proveedor de la compra debe coincidir con el del pago.
 * - Actualiza saldo/estado de CxP en cada operación.
 *
 * Tema: Controladores - Compras/Tesorería
 * Capa: Backend
 */

import { Op, fn, col } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

// ===== Modelos =====
import { PagoProveedorDetalleModel } from '../../Models/Compras/MD_TB_PagoProveedorDetalle.js';
import { PagoProveedorModel } from '../../Models/Compras/MD_TB_PagosProveedor.js';
import { CxpProveedorModel } from '../../Models/Compras/MD_TB_CuentasPagarProveedores.js';
import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = PagoProveedorDetalleModel.sequelize;

// ===== Helpers numéricos =====
const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

async function getSumAplicadoPago(
  pago_id,
  t,
  { excluirDetalleId = null } = {}
) {
  const where = { pago_id };
  if (excluirDetalleId) where.id = { [Op.ne]: excluirDetalleId };
  const row = await PagoProveedorDetalleModel.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('monto_aplicado')), 0), 'aplicado']
    ],
    where,
    transaction: t
  });
  return toNum(row?.get?.('aplicado') ?? 0);
}

async function getSumAplicadoCompra(
  compra_id,
  t,
  { excluirDetalleId = null } = {}
) {
  const where = { compra_id };
  if (excluirDetalleId) where.id = { [Op.ne]: excluirDetalleId };
  const row = await PagoProveedorDetalleModel.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('monto_aplicado')), 0), 'aplicado']
    ],
    where,
    transaction: t
  });
  return toNum(row?.get?.('aplicado') ?? 0);
}

async function syncSaldoYEstadoCxPByCompraId(compra_id, t) {
  const cxp = await CxpProveedorModel.findOne({
    where: { compra_id },
    transaction: t,
    lock: t.LOCK.UPDATE
  });
  if (!cxp) return null;
  const aplicado = await getSumAplicadoCompra(compra_id, t);
  const nuevoSaldo = Math.max(0, round2(toNum(cxp.monto_total) - aplicado));
  cxp.saldo = nuevoSaldo;
  cxp.estado =
    nuevoSaldo <= 0 ? 'cancelado' : aplicado > 0 ? 'parcial' : 'pendiente';
  await cxp.save({ transaction: t });
  return cxp;
}

/* =====================================================
 * Listar aplicaciones con filtros
 * GET /pagos-proveedor-detalle?pago_id=&compra_id=&proveedor_id=&page=&pageSize=
 * ===================================================== */
export const OBRS_PagoProvDet_CTS = async (req, res) => {
  try {
    const {
      pago_id,
      compra_id,
      proveedor_id,
      page = 1,
      pageSize = 20
    } = req.query || {};
    const where = {};
    if (pago_id) where.pago_id = pago_id;
    if (compra_id) where.compra_id = compra_id;

    const include = [
      {
        model: PagoProveedorModel,
        as: 'pago',
        include: proveedor_id
          ? [
              {
                model: ProveedoresModel,
                as: 'proveedor',
                where: { id: proveedor_id }
              }
            ]
          : [{ model: ProveedoresModel, as: 'proveedor' }]
      },
      { model: CompraModel, as: 'compra' }
    ];

    const offset = (Number(page) - 1) * Number(pageSize);
    const { rows, count } = await PagoProveedorDetalleModel.findAndCountAll({
      where,
      include,
      limit: Number(pageSize),
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { total: count, page: Number(page), pageSize: Number(pageSize) }
    });
  } catch (err) {
    console.error('[OBRS_PagoProvDet_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando aplicaciones' });
  }
};

/* =====================================================
 * Obtener una aplicación
 * ===================================================== */
export const OBR_PagoProvDet_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await PagoProveedorDetalleModel.findByPk(id, {
      include: [
        {
          model: PagoProveedorModel,
          as: 'pago',
          include: [{ model: ProveedoresModel, as: 'proveedor' }]
        },
        { model: CompraModel, as: 'compra' }
      ]
    });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Aplicación no encontrada' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_PagoProvDet_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo aplicación' });
  }
};

/* =====================================================
 * Crear aplicación
 * Body: { pago_id, compra_id, monto_aplicado }
 * ===================================================== */
export const CR_PagoProvDet_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { pago_id, compra_id, monto_aplicado } = req.body || {};

    if (!pago_id || !compra_id || !monto_aplicado)
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan pago_id/compra_id/monto_aplicado' });

    const pago = await PagoProveedorModel.findByPk(pago_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!pago)
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });

    // Evitar duplicados (cumple UNIQUE uq_pago_compra)
    const dup = await PagoProveedorDetalleModel.findOne({
      where: { pago_id, compra_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (dup)
      return res
        .status(409)
        .json({
          ok: false,
          error: 'Ya existe una aplicación para ese pago y compra'
        });

    // Validar compra y proveedor
    const compra = await CompraModel.findByPk(compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.proveedor_id !== pago.proveedor_id)
      return res
        .status(400)
        .json({ ok: false, error: 'La compra pertenece a otro proveedor' });

    // Validar límites: pago disponible y saldo CxP
    const aplicadoPago = await getSumAplicadoPago(pago_id, t);
    const disponiblePago = round2(toNum(pago.monto_total) - aplicadoPago);

    const cxp = await CxpProveedorModel.findOne({
      where: { compra_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp)
      return res
        .status(400)
        .json({ ok: false, error: 'No existe CxP para la compra indicada' });

    const monto = round2(monto_aplicado);
    if (monto <= 0)
      return res
        .status(400)
        .json({ ok: false, error: 'monto_aplicado debe ser > 0' });
    if (monto > disponiblePago)
      return res
        .status(400)
        .json({
          ok: false,
          error: `Monto supera disponible del pago (${disponiblePago})`
        });
    if (monto > toNum(cxp.saldo))
      return res
        .status(400)
        .json({
          ok: false,
          error: `Monto supera saldo de la CxP (${cxp.saldo})`
        });

    const created = await PagoProveedorDetalleModel.create(
      { pago_id, compra_id, monto_aplicado: monto },
      { transaction: t }
    );

    await syncSaldoYEstadoCxPByCompraId(compra_id, t);

    await registrarLog(
      req,
      'pago_proveedor_detalle',
      'crear',
      'aplicacion',
      `pago_id=${pago_id} compra_id=${compra_id} monto=${monto}`,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const withIncludes = await PagoProveedorDetalleModel.findByPk(created.id, {
      include: [
        {
          model: PagoProveedorModel,
          as: 'pago',
          include: [{ model: ProveedoresModel, as: 'proveedor' }]
        },
        { model: CompraModel, as: 'compra' }
      ]
    });

    res.json({ ok: true, data: withIncludes });
  } catch (err) {
    await t.rollback();
    console.error('[CR_PagoProvDet_Crear_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error creando aplicación' });
  }
};

/* =====================================================
 * Actualizar monto de una aplicación
 * Body: { monto_aplicado }
 * Revalida: disponible del pago y saldo de la CxP (suma con otras apps del mismo pago)
 * ===================================================== */
export const UR_PagoProvDet_Actualizar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const { monto_aplicado } = req.body || {};

    const det = await PagoProveedorDetalleModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!det)
      return res
        .status(404)
        .json({ ok: false, error: 'Aplicación no encontrada' });

    const pago = await PagoProveedorModel.findByPk(det.pago_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!pago)
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });

    const nuevoMonto = round2(monto_aplicado);
    if (nuevoMonto <= 0)
      return res
        .status(400)
        .json({ ok: false, error: 'monto_aplicado debe ser > 0' });

    // Disponible del pago (excluyendo esta app)
    const aplicadoOtros = await getSumAplicadoPago(det.pago_id, t, {
      excluirDetalleId: det.id
    });
    if (aplicadoOtros + nuevoMonto > toNum(pago.monto_total))
      return res
        .status(400)
        .json({
          ok: false,
          error: 'La suma aplicada supera el monto_total del pago'
        });

    // Saldo de la CxP (sumando que "liberamos" el monto anterior)
    const cxp = await CxpProveedorModel.findOne({
      where: { compra_id: det.compra_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp)
      return res
        .status(400)
        .json({ ok: false, error: 'No existe CxP para la compra indicada' });

    const saldoAjustado = round2(toNum(cxp.saldo) + toNum(det.monto_aplicado));
    if (nuevoMonto > saldoAjustado)
      return res
        .status(400)
        .json({
          ok: false,
          error: `Monto supera saldo disponible de la CxP (${saldoAjustado})`
        });

    det.monto_aplicado = nuevoMonto;
    await det.save({ transaction: t });

    await syncSaldoYEstadoCxPByCompraId(det.compra_id, t);

    await registrarLog(
      req,
      'pago_proveedor_detalle',
      'actualizar',
      'aplicacion',
      `id=${id} nuevo_monto=${nuevoMonto}`,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const updated = await PagoProveedorDetalleModel.findByPk(id, {
      include: [
        {
          model: PagoProveedorModel,
          as: 'pago',
          include: [{ model: ProveedoresModel, as: 'proveedor' }]
        },
        { model: CompraModel, as: 'compra' }
      ]
    });

    res.json({ ok: true, data: updated });
  } catch (err) {
    await t.rollback();
    console.error('[UR_PagoProvDet_Actualizar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando aplicación' });
  }
};

/* =====================================================
 * Borrar aplicación (desaplicar)
 * ===================================================== */
export const ER_PagoProvDet_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const det = await PagoProveedorDetalleModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!det)
      return res
        .status(404)
        .json({ ok: false, error: 'Aplicación no encontrada' });

    const compra_id = det.compra_id;

    await det.destroy({ transaction: t });
    await syncSaldoYEstadoCxPByCompraId(compra_id, t);

    await registrarLog(
      req,
      'pago_proveedor_detalle',
      'eliminar',
      'aplicacion',
      `id=${id} compra_id=${compra_id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    console.error('[ER_PagoProvDet_Borrar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error eliminando aplicación' });
  }
};

export default {
  OBRS_PagoProvDet_CTS,
  OBR_PagoProvDet_CTS,
  CR_PagoProvDet_Crear_CTS,
  UR_PagoProvDet_Actualizar_CTS,
  ER_PagoProvDet_Borrar_CTS
};
