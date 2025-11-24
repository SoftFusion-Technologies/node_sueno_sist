/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores PRO para `pagos_proveedor_medios` (multi-medios por pago).
 * - Lista/obtiene/crea/actualiza/elimina medios.
 * - Valida consistencia por tipo (EFECTIVO/TRANSFERENCIA/DEPÓSITO/CHEQUE_AJUSTE/OTRO).
 * - Sincroniza SIEMPRE `pagos_proveedor.monto_total = SUM(medios.monto)` (invariante acordada).
 * - Endpoints de utilería: resumen y reconciliación.
 * - Hooks seguros, logs y transacciones.
 *
 * Tema: Controladores - Compras / Tesorería
 * Capa: Backend
 */

import { Op } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

import { PagoProveedorModel } from '../../Models/Compras/MD_TB_PagosProveedor.js';
import { PagoProveedorMedioModel } from '../../Models/Compras/MD_TB_PagosProveedorMedios.js';
import { MediosPagoModel } from '../../Models/Ventas/MD_TB_MediosPago.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { MovimientosCajaModel } from '../../Models/Ventas/MD_TB_MovimientosCaja.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = PagoProveedorMedioModel.sequelize;

const TIPOS = new Set([
  'EFECTIVO',
  'TRANSFERENCIA',
  'DEPOSITO',
  'CHEQUE_RECIBIDO',
  'CHEQUE_EMITIDO',
  'AJUSTE',
  'OTRO'
]);

const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

async function recalcAndSyncPagoTotal(pago_id, t) {
  const sum = (await PagoProveedorMedioModel.sum('monto', { where: { pago_id }, transaction: t })) || 0;
  const monto_total = round2(sum);
  await PagoProveedorModel.update({ monto_total }, { where: { id: pago_id }, transaction: t });
  return monto_total;
}

async function mustPago(pago_id, t) {
  const pago = await PagoProveedorModel.findByPk(pago_id, { transaction: t, lock: t?.LOCK?.UPDATE });
  if (!pago) throw new Error('Pago a proveedor no encontrado');
  return pago;
}

async function validateReferenciasPorTipo(payload, t) {
  const { tipo_origen, banco_cuenta_id, cheque_id, movimiento_caja_id } = payload;

  if (!TIPOS.has(String(tipo_origen))) throw new Error('tipo_origen inválido');

  switch (tipo_origen) {
    case 'EFECTIVO': {
      if (!movimiento_caja_id) {
        // Permitimos crear el medio sin movimiento; puede setearse luego.
        // Si viene, validar existencia.
      }
      if (movimiento_caja_id) {
        const mc = await MovimientosCajaModel.findByPk(movimiento_caja_id, { transaction: t });
        if (!mc) throw new Error('movimiento_caja_id inexistente');
      }
      break;
    }
    case 'TRANSFERENCIA':
    case 'DEPOSITO': {
      if (!banco_cuenta_id) throw new Error('banco_cuenta_id es obligatorio para TRANSFERENCIA/DEPOSITO');
      const bc = await BancoCuentaModel.findByPk(banco_cuenta_id, { transaction: t });
      if (!bc) throw new Error('banco_cuenta_id inexistente');
      break;
    }
    case 'CHEQUE_RECIBIDO':
    case 'CHEQUE_EMITIDO': {
      if (!cheque_id) throw new Error('cheque_id es obligatorio para CHEQUE_*');
      const ch = await ChequeModel.findByPk(cheque_id, { transaction: t });
      if (!ch) throw new Error('cheque_id inexistente');
      // Validar tipo
      const esperado = tipo_origen === 'CHEQUE_RECIBIDO' ? 'recibido' : 'emitido';
      if (String(ch.tipo) !== esperado) throw new Error(`El cheque no es del tipo ${esperado}`);
      break;
    }
    case 'AJUSTE':
    case 'OTRO':
    default:
      // sin validaciones específicas
      break;
  }
}

/* =====================================================
 * GET /pagos-proveedor/:pago_id/medios  (o /pagos-proveedor-medios?pago_id=)
 * Filtros: tipo_origen
 * ===================================================== */
export const OBRS_PagosProveedorMedios_CTS = async (req, res) => {
  try {
    const pago_id = req.params?.pago_id || req.query?.pago_id;
    const { tipo_origen, page = 1, pageSize = 50 } = req.query || {};

    const where = {};
    if (pago_id) where.pago_id = pago_id;
    if (tipo_origen) where.tipo_origen = tipo_origen;

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await PagoProveedorMedioModel.findAndCountAll({
      where,
      limit: Number(pageSize),
      offset,
      include: [
        { model: MediosPagoModel, as: 'medioPago', required: false },
        { model: BancoCuentaModel, as: 'bancoCuenta', required: false },
        { model: ChequeModel, as: 'cheque', required: false }
      ],
      order: [['id', 'ASC']]
    });

    // Extra: totalizado
    const totalizado = round2(rows.reduce((acc, r) => acc + toNum(r.monto), 0));

    res.json({ ok: true, data: rows, meta: { total: count, page: Number(page), pageSize: Number(pageSize), totalizado } });
  } catch (err) {
    console.error('[OBRS_PagosProveedorMedios_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando medios del pago' });
  }
};

/* =====================================================
 * GET /pagos-proveedor-medios/:id
 * ===================================================== */
export const OBR_PagoProveedorMedio_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await PagoProveedorMedioModel.findByPk(id, {
      include: [
        { model: MediosPagoModel, as: 'medioPago', required: false },
        { model: BancoCuentaModel, as: 'bancoCuenta', required: false },
        { model: ChequeModel, as: 'cheque', required: false }
      ]
    });
    if (!row) return res.status(404).json({ ok: false, error: 'Medio no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_PagoProveedorMedio_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo medio' });
  }
};

/* =====================================================
 * POST /pagos-proveedor/:pago_id/medios
 * Body: { tipo_origen, monto, medio_pago_id?, banco_cuenta_id?, cheque_id?, movimiento_caja_id?, observaciones? }
 * Reglas clave:
 * - tipo_origen válido y refs coherentes.
 * - monto > 0.
 * - Sincroniza header: pago.monto_total = SUM(medios).
 * ===================================================== */
export const CR_PagoProveedorMedio_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const pago_id = req.params?.pago_id || req.body?.pago_id;
    let { tipo_origen, monto, medio_pago_id = null, banco_cuenta_id = null, cheque_id = null, movimiento_caja_id = null, observaciones = null } = req.body || {};

    if (!pago_id || !tipo_origen || monto == null)
      return res.status(400).json({ ok: false, error: 'Faltan pago_id/tipo_origen/monto' });

    await mustPago(pago_id, t);

    await validateReferenciasPorTipo({ tipo_origen, banco_cuenta_id, cheque_id, movimiento_caja_id }, t);

    monto = round2(monto);
    if (monto <= 0) return res.status(400).json({ ok: false, error: 'monto debe ser > 0' });

    const created = await PagoProveedorMedioModel.create(
      {
        pago_id,
        tipo_origen,
        medio_pago_id,
        banco_cuenta_id,
        cheque_id,
        movimiento_caja_id,
        monto,
        observaciones: observaciones?.trim() || null
      },
      { transaction: t }
    );

    const nuevoTotal = await recalcAndSyncPagoTotal(pago_id, t);

    await registrarLog(
      req,
      'pagos_proveedor_medios',
      'crear',
      'alta',
      `pago_id=${pago_id} tipo=${tipo_origen} monto=${monto}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: created, monto_total: nuevoTotal });
  } catch (err) {
    await t.rollback();
    console.error('[CR_PagoProveedorMedio_Crear_CTS] error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Error creando medio' });
  }
};

/* =====================================================
 * PUT /pagos-proveedor-medios/:id
 * Body: { monto?, observaciones? }
 * - No permite cambiar tipo_origen ni referencias si tiene vínculos externos.
 * - Recalcula/sincroniza header.
 * ===================================================== */
export const UR_PagoProveedorMedio_Actualizar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const row = await PagoProveedorMedioModel.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return res.status(404).json({ ok: false, error: 'Medio no encontrado' });

    const patch = {};

    if (typeof req.body.monto !== 'undefined') {
      const m = round2(req.body.monto);
      if (m <= 0) return res.status(400).json({ ok: false, error: 'monto debe ser > 0' });
      patch.monto = m;
    }

    if (typeof req.body.observaciones !== 'undefined') {
      patch.observaciones = (req.body.observaciones ?? null) && String(req.body.observaciones).trim();
    }

    // Protección: no permitir cambiar estructura crítica por PUT genérico
    const forbidden = ['tipo_origen', 'medio_pago_id', 'banco_cuenta_id', 'cheque_id', 'movimiento_caja_id'];
    for (const k of forbidden) if (k in req.body) return res.status(400).json({ ok: false, error: `No se permite modificar ${k} por este endpoint` });

    await row.update(patch, { transaction: t });

    const nuevoTotal = await recalcAndSyncPagoTotal(row.pago_id, t);

    await registrarLog(req, 'pagos_proveedor_medios', 'actualizar', 'edicion', `id=${id} patch=${JSON.stringify(patch)}`, usuario_id).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: row, monto_total: nuevoTotal });
  } catch (err) {
    await t.rollback();
    console.error('[UR_PagoProveedorMedio_Actualizar_CTS] error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Error actualizando medio' });
  }
};

/* =====================================================
 * DELETE /pagos-proveedor-medios/:id
 * Query: force=1 (si tiene referencias externas y querés eliminar igual)
 * ===================================================== */
export const ER_PagoProveedorMedio_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const force = ['1', 'true', 1, true].includes(req.query?.force);

    const row = await PagoProveedorMedioModel.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return res.status(404).json({ ok: false, error: 'Medio no encontrado' });

    // Si tiene vínculos sensibles, bloquear salvo force
    if (!force && (row.cheque_id || row.movimiento_caja_id || row.banco_cuenta_id)) {
      return res.status(409).json({
        ok: false,
        error: 'El medio tiene referencias (cheque/caja/banco). Use ?force=1 si comprende el impacto.'
      });
    }

    const pago_id = row.pago_id;
    await row.destroy({ transaction: t });

    const nuevoTotal = await recalcAndSyncPagoTotal(pago_id, t);

    await registrarLog(req, 'pagos_proveedor_medios', 'eliminar', 'baja', `id=${id} pago_id=${pago_id}`, usuario_id).catch(() => {});

    await t.commit();
    res.json({ ok: true, monto_total: nuevoTotal });
  } catch (err) {
    await t.rollback();
    console.error('[ER_PagoProveedorMedio_Borrar_CTS] error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Error eliminando medio' });
  }
};

/* =====================================================
 * GET /pagos-proveedor/:pago_id/medios/resumen
 * Devuelve: { suma_medios, header_monto_total, diferencia }
 * ===================================================== */
export const OBR_PagosProveedorMedios_Resumen_CTS = async (req, res) => {
  try {
    const pago_id = req.params?.pago_id || req.query?.pago_id;
    if (!pago_id) return res.status(400).json({ ok: false, error: 'pago_id requerido' });

    const [pago, suma] = await Promise.all([
      PagoProveedorModel.findByPk(pago_id),
      PagoProveedorMedioModel.sum('monto', { where: { pago_id } })
    ]);

    if (!pago) return res.status(404).json({ ok: false, error: 'Pago no encontrado' });

    const suma_medios = round2(suma || 0);
    const header_monto_total = round2(pago.monto_total || 0);
    const diferencia = round2(suma_medios - header_monto_total);

    res.json({ ok: true, data: { suma_medios, header_monto_total, diferencia } });
  } catch (err) {
    console.error('[OBR_PagosProveedorMedios_Resumen_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo resumen' });
  }
};

/* =====================================================
 * POST /pagos-proveedor/:pago_id/medios/reconciliar
 * Fuerza la sincronización header = SUM(medios)
 * ===================================================== */
export const CR_PagosProveedorMedios_Reconciliar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const pago_id = req.params?.pago_id || req.body?.pago_id;
    if (!pago_id) return res.status(400).json({ ok: false, error: 'pago_id requerido' });

    await mustPago(pago_id, t);
    const nuevoTotal = await recalcAndSyncPagoTotal(pago_id, t);

    await t.commit();
    res.json({ ok: true, monto_total: nuevoTotal });
  } catch (err) {
    await t.rollback();
    console.error('[CR_PagosProveedorMedios_Reconciliar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'No se pudo reconciliar' });
  }
};

export default {
  OBRS_PagosProveedorMedios_CTS,
  OBR_PagoProveedorMedio_CTS,
  CR_PagoProveedorMedio_Crear_CTS,
  UR_PagoProveedorMedio_Actualizar_CTS,
  ER_PagoProveedorMedio_Borrar_CTS,
  OBR_PagosProveedorMedios_Resumen_CTS,
  CR_PagosProveedorMedios_Reconciliar_CTS
};
