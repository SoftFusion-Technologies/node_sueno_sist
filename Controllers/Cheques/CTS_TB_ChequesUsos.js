/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 29 / 10 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el módulo de Usos de Cheques (cheques_usos).
 *  - Listado con filtros/paginado
 *  - Obtención por ID
 *  - Acciones: usar (aplicar/depositar/entregar/rechazar/anular) y acreditar
 *  - Todo con snapshots del cheque, idempotencia y logs.
 */

// Controllers/ChequesUsos/CTS_TB_ChequesUsos.js
import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { AppError, toHttpError } from '../../Utils/httpErrors.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { ChequeUsoModel } from '../../Models/Cheques/MD_TB_ChequesUsos.js';
import { ChequeMovimientoModel } from '../../Models/Cheques/MD_TB_ChequeMovimientos.js';

// ---- helpers existentes ----
const assert = (cond, message, meta = {}) => {
  if (!cond) throw new AppError({ status: 400, code: 'VALIDATION_ERROR', message, details: meta });
};
const nextEstadoFromAccion = (accion) =>
  ({ aplicar_a_compra: 'aplicado_a_compra', depositar: 'depositado', entregar: 'entregado', rechazar: 'rechazado', anular: 'anulado' }[accion] || null);
function validarReglas(accion, chq, body) {
  if (accion === 'depositar') {
    assert(chq.tipo === 'recibido', 'Sólo cheques recibidos pueden depositarse');
    assert(chq.estado === 'en_cartera', 'El cheque debe estar en cartera para depositarlo', { estado: chq.estado });
    assert(body.fecha_valor, 'fecha_valor requerida (fecha de depósito)');
  }
  if (accion === 'aplicar_a_compra') {
    assert(chq.tipo === 'recibido', 'Sólo cheques recibidos pueden aplicarse a compra');
    assert(['en_cartera', 'acreditado'].includes(chq.estado), 'El cheque debe estar en cartera o acreditado para aplicarse a compra', { estado: chq.estado });
    assert(body.proveedor_id, 'proveedor_id requerido para aplicar a compra');
  }
  if (accion === 'rechazar') assert(chq.tipo === 'recibido', 'Sólo cheques recibidos pueden rechazarse');
  if (accion === 'anular') assert(['registrado','en_cartera'].includes(chq.estado), 'Sólo cheques sin uso pueden anularse');
  if (accion === 'entregar') assert(chq.estado === 'en_cartera', 'Sólo cheques en cartera pueden entregarse');
}

// ---- NUEVO: mapping para movimientos ----
const mapAccionToMovimiento = (accion, body) => {
  const tipo_mov = ({
    aplicar_a_compra: 'aplicacion',
    depositar: 'deposito',
    acreditar: 'acreditacion',
    entregar: 'entrega',
    rechazar: 'rechazo',
    anular: 'anulacion',
    compensar: 'compensacion'
  }[accion]);

  let referencia_tipo = 'otro';
  let referencia_id = null;

  if (accion === 'aplicar_a_compra') {
    referencia_tipo = 'compra';
    referencia_id   = body.compra_id || body.proveedor_id || null;
  } else if (accion === 'depositar') {
    referencia_tipo = 'deposito';
    referencia_id   = body.banco_cuenta_id || null;
  } else if (accion === 'acreditar') {
    referencia_tipo = 'conciliacion';
    referencia_id   = body.banco_cuenta_id || null;
  } else if (accion === 'entregar') {
    referencia_tipo = 'pago';
    referencia_id   = body.proveedor_id || null;
  } else if (accion === 'compensar') {
    referencia_tipo = 'conciliacion';
    referencia_id   = body.banco_cuenta_id || null;
  }

  return { tipo_mov, referencia_tipo, referencia_id };
};


// ============================ 1) Listado ============================
/**
 * GET /cheques-usos
 * Filtros: cheque_id, accion, resultado_estado, proveedor_id, caja_id, desde, hasta, q (observaciones)
 * Paginado: page, limit
 * Orden: orderBy (fecha_operacion|monto_usado|id), orderDir (ASC|DESC)
 */
export const OBRS_ChequesUsos_CTS = async (req, res) => {
  try {
    const {
      page,
      limit,
      cheque_id,
      accion,
      resultado_estado,
      proveedor_id,
      caja_id,
      desde,
      hasta,
      q,
      orderBy,
      orderDir
    } = req.query || {};

    const hasParams = Object.keys(req.query || {}).length > 0;

    const where = {};
    if (cheque_id) where.cheque_id = Number(cheque_id);
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (caja_id) where.caja_id = Number(caja_id);
    if (accion && typeof accion === 'string') where.accion = accion;
    if (resultado_estado && typeof resultado_estado === 'string')
      where.resultado_estado = resultado_estado;
    if (q && q.trim()) where.observaciones = { [Op.like]: `%${q.trim()}%` };

    // Rango por fecha_operacion
    if (desde || hasta) {
      where.fecha_operacion = {};
      if (desde) where.fecha_operacion[Op.gte] = new Date(`${desde}T00:00:00`);
      if (hasta) where.fecha_operacion[Op.lte] = new Date(`${hasta}T23:59:59`);
    }

    const validOrder = ['fecha_operacion', 'monto_usado', 'id'];
    const col = validOrder.includes(orderBy || '')
      ? orderBy
      : 'fecha_operacion';
    const dir = ['ASC', 'DESC'].includes(String(orderDir || '').toUpperCase())
      ? String(orderDir).toUpperCase()
      : 'DESC';

    // Sin params => plano (hasta 500 por seguridad)
    if (!hasParams) {
      const filas = await ChequeUsoModel.findAll({
        where,
        limit: 500,
        order: [[col, dir]]
      });
      return res.json(filas);
    }

    // Con paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await ChequeUsoModel.count({ where });
    const rows = await ChequeUsoModel.findAll({
      where,
      order: [[col, dir]],
      limit: limitNum,
      offset
    });

    const totalPages = Math.max(Math.ceil(total / limitNum), 1);
    return res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        orderBy: col,
        orderDir: dir,
        cheque_id: cheque_id || '',
        accion: accion || '',
        resultado_estado: resultado_estado || '',
        proveedor_id: proveedor_id || '',
        caja_id: caja_id || '',
        desde: desde || '',
        hasta: hasta || '',
        q: q || ''
      }
    });
  } catch (err) {
    console.error('OBRS_ChequesUsos_CTS:', err);
    res.status(500).json({ mensajeError: err.message });
  }
};

// ============================ 2) Obtener por ID ============================
/** GET /cheques-usos/:id */
export const OBR_ChequeUso_CTS = async (req, res) => {
  try {
    const uso = await ChequeUsoModel.findByPk(req.params.id);
    if (!uso) {
      return res
        .status(404)
        .json({ mensajeError: 'Uso de cheque no encontrado' });
    }
    res.json(uso);
  } catch (err) {
    console.error('OBR_ChequeUso_CTS:', err);
    res.status(500).json({ mensajeError: err.message });
  }
};

// ============================ 3) Usar cheque (acción genérica) ============================
/**
 * POST /cheques-usos/usar/:cheque_id
 * Body:
 *  - accion: 'aplicar_a_compra' | 'depositar' | 'entregar' | 'rechazar' | 'anular'
 *  - monto (opcional, default = chq.monto)
 *  - proveedor_id/compra_id/caja_id/banco_cuenta_id/fecha_valor/observaciones
 * Header:
 *  - X-User-Id
 *  - Idempotency-Key (opcional)
 */

export const CR_ChequeUso_Usar_CTS = async (req, res) => {
  const chequeId = Number(req.params.cheque_id);
  const body = req.body || {};
  const accion = String(body.accion || '');
  const usuario_id = Number(req.headers['x-user-id'] || body.usuario_id || 0);
  const idem = req.headers['idempotency-key'] || body.idempotency_key || null;

  const t = await db.transaction();
  try {
    assert(
      [
        'aplicar_a_compra',
        'depositar',
        'entregar',
        'rechazar',
        'anular',
        'acreditar',
        'compensar'
      ].includes(accion),
      'Acción inválida',
      { accion }
    );

    // Idempotencia del USO
    if (idem) {
      const dup = await ChequeUsoModel.findOne({
        where: { idempotency_key: idem },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (dup) {
        const movTipo = mapAccionToMovimiento(
          dup.accion || accion,
          body
        )?.tipo_mov;
        const mov = await ChequeMovimientoModel.findOne({
          where: {
            cheque_id: dup.cheque_id || chequeId,
            tipo_mov: movTipo,
            notas: { [Op.like]: `%uso_id=${dup.id}%` }
          },
          order: [['created_at', 'DESC']],
          transaction: t
        });
        await t.commit();
        // (opcional) log de replay para auditoría suave (no crítico)
        try {
          await registrarLog(
            req,
            'cheques_usos',
            'crear',
            `replay de "${dup.accion}" en cheque_id=${dup.cheque_id} uso_id=${dup.id} idem=${idem}`,
            usuario_id
          );
        } catch {}
        return res.json({
          ok: true,
          replay: true,
          uso: dup,
          movimiento: mov || null
        });
      }
    }

    const chq = await ChequeModel.findByPk(chequeId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    assert(chq, 'Cheque no encontrado', { cheque_id: chequeId });

    const prevEstado = chq.estado; // ← para log

    validarReglas(accion, chq, body);

    const montoUsar =
      accion === 'aplicar_a_compra'
        ? Number(body.monto || 0)
        : Number(body.monto || chq.monto);
    assert(montoUsar > 0, 'Monto inválido', { monto: body.monto });

    // ---- Estado (manejo de parcial para aplicar_a_compra) ----
    let nextEstado = null;
    if (accion === 'aplicar_a_compra') {
      const previo = await ChequeUsoModel.sum('monto_usado', {
        where: { cheque_id: chq.id, accion: 'aplicar_a_compra' },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const totalAplicado = Number(previo || 0) + montoUsar;
      const montoCheque = Number(chq.monto);
      nextEstado = totalAplicado >= montoCheque ? 'aplicado_a_compra' : null;
    } else {
      nextEstado = nextEstadoFromAccion(accion);
    }

    if (nextEstado) {
      chq.estado = nextEstado;
      await chq.save({ transaction: t });
    }

    // ---- Insert USO (historial) ----
    const uso = await ChequeUsoModel.create(
      {
        cheque_id: chq.id,
        accion,
        resultado_estado: nextEstado || null,
        monto_usado: montoUsar,
        proveedor_id: body.proveedor_id || null,
        compra_id: body.compra_id || null,
        caja_id: body.caja_id || null,
        movimiento_caja_id: body.movimiento_caja_id || null,
        banco_cuenta_id: body.banco_cuenta_id || null,
        fecha_valor: body.fecha_valor || null,
        observaciones: body.observaciones || null,
        usuario_id,
        idempotency_key: idem || null,
        // snapshot
        cheque_numero: chq.numero,
        cheque_formato: chq.formato,
        cheque_monto: chq.monto,
        cheque_fecha_emision: chq.fecha_emision,
        cheque_fecha_vencimiento: chq.fecha_vencimiento,
        cheque_banco_id: chq.banco_id,
        cheque_tipo: chq.tipo,
        cheque_canal: chq.canal
      },
      { transaction: t }
    );

    // ---- MOVIMIENTO (bitácora) ----
    const { tipo_mov, referencia_tipo, referencia_id } = mapAccionToMovimiento(
      accion,
      body
    );
    const fecha_mov =
      ['depositar', 'acreditar'].includes(accion) && body.fecha_valor
        ? new Date(`${body.fecha_valor}T00:00:00`)
        : new Date();

    const notasBase = body.observaciones ? `${body.observaciones} · ` : '';
    const notas = `${notasBase}uso_id=${uso.id} · accion=${accion} · monto=${montoUsar}`;

    const mov = await ChequeMovimientoModel.create(
      {
        cheque_id: chq.id,
        tipo_mov, // ENUM: 'aplicacion', 'deposito', 'acreditacion', etc.
        fecha_mov,
        referencia_tipo, // 'compra' | 'deposito' | 'pago' | 'conciliacion' | 'otro'
        referencia_id, // compra_id / banco_cuenta_id / proveedor_id según caso
        notas,
        user_id: usuario_id
      },
      { transaction: t }
    );

    await t.commit();

    // ---- LOGS de auditoría (best-effort, fuera de la tx) ----
    try {
      // Log principal del uso con before → after y metadata clave
      await registrarLog(
        req,
        'cheques',
        'usar',
        `aplicó "${accion}" al cheque #${chq.numero}: ${prevEstado || '—'} → ${
          nextEstado || prevEstado
        } · ` +
          `monto=${fmtAR(montoUsar)} · uso_id=${uso.id}` +
          `${mov?.id ? ` · mov_id=${mov.id}` : ''}` +
          `${body.compra_id ? ` · compra_id=${body.compra_id}` : ''}` +
          `${body.proveedor_id ? ` · proveedor_id=${body.proveedor_id}` : ''}` +
          `${body.caja_id ? ` · caja_id=${body.caja_id}` : ''}` +
          `${idem ? ` · idem=${idem}` : ''}`,
        usuario_id
      );

      // Log específico de movimiento (más granular)
      await registrarLog(
        req,
        'cheque_movimientos',
        'crear',
        `registró movimiento "${tipo_mov}" para cheque #${chq.numero} (uso_id=${
          uso.id
        }${mov?.id ? `, mov_id=${mov.id}` : ''})`,
        usuario_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ ok: true, cheque: chq, uso, movimiento: mov });
  } catch (err) {
    try {
      await t.rollback();
    } catch {}
    const httpErr = toHttpError(err);
    console.error('CR_ChequeUso_Usar_CTS:', {
      code: httpErr.code,
      message: httpErr.message,
      raw: err?.message
    });
    return res.status(httpErr.status).json({
      ok: false,
      code: httpErr.code,
      mensajeError: httpErr.message,
      tips: httpErr.tips,
      details: httpErr.details
    });
  }
};
// ============================ 4) Acreditar cheque ============================
/**
 * POST /cheques-usos/acreditar/:cheque_id
 * Body: { fecha_valor (YYYY-MM-DD), observaciones? }
 * Header: X-User-Id, Idempotency-Key?
 */
export const CR_ChequeUso_Acreditar_CTS = async (req, res) => {
  const chequeId = Number(req.params.cheque_id);
  const { fecha_valor, observaciones } = req.body || {};
  const usuario_id = Number(req.headers['x-user-id'] || 0);
  const idem = req.headers['idempotency-key'] || null;

  const t = await db.transaction();
  try {
    // Idempotencia
    if (idem) {
      const dup = await ChequeUsoModel.findOne({
        where: { idempotency_key: idem }
      });
      if (dup) return res.json({ ok: true, replay: true, uso: dup });
    }

    const chq = await ChequeModel.findByPk(chequeId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    assert(chq, 'Cheque no encontrado', { cheque_id: chequeId });
    assert(
      chq.tipo === 'recibido',
      'Sólo cheques recibidos pueden acreditarse'
    );
    assert(
      chq.estado === 'depositado',
      'El cheque debe estar depositado para acreditarse',
      { estado: chq.estado }
    );
    assert(fecha_valor, 'fecha_valor requerida (fecha de acreditación)');

    chq.estado = 'acreditado';
    await chq.save({ transaction: t });

    const uso = await ChequeUsoModel.create(
      {
        cheque_id: chq.id,
        accion: 'acreditar',
        resultado_estado: 'acreditado',
        monto_usado: chq.monto,
        fecha_valor,
        observaciones: observaciones || null,
        usuario_id,
        idempotency_key: idem || null,
        ...snapshotFromCheque(chq)
      },
      { transaction: t }
    );

    try {
      await registrarLog(
        req,
        'cheques',
        'usar',
        `acreditó el cheque #${chq.numero} por $${chq.monto}`,
        usuario_id
      );
    } catch {}

    await t.commit();
    res.json({ ok: true, cheque: chq, uso });
  } catch (err) {
    await t.rollback();
    const httpErr = toHttpError(err);
    console.error('CR_ChequeUso_Acreditar_CTS:', {
      code: httpErr.code,
      message: httpErr.message,
      raw: err?.message
    });
    return res.status(httpErr.status).json({
      ok: false,
      code: httpErr.code,
      mensajeError: httpErr.message,
      tips: httpErr.tips,
      details: httpErr.details
    });
  }
};
