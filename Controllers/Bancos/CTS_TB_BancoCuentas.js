// controllers/Bancos/CTS_TB_BancoCuentas.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el módulo de Cuentas Bancarias:
 *  - Listado con filtros/orden y KPIs (chequeras, movimientos, saldo)
 *  - Obtención por ID con KPIs
 *  - Crear / Editar (con validaciones y log)
 *  - Desactivar/Eliminar con protección por dependencias
 */

import db from '../../DataBase/db.js';
import { Op, fn, col, literal } from 'sequelize';

import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { ChequeraModel } from '../../Models/Cheques/MD_TB_Chequeras.js';
import { BancoMovimientoModel } from '../../Models/Bancos/MD_TB_BancoMovimientos.js';
import { registrarLog } from '../../Helpers/registrarLog.js';
import { AppError, toHttpError } from '../../Utils/httpErrors.js';

/* Pequeños helpers locales (evitamos dependencias externas) */
const MONEDAS = new Set(['ARS', 'USD', 'EUR', 'OTRA']);
const normStr = (s) => (typeof s === 'string' ? s.trim() : s);
const normUpper = (s) => (typeof s === 'string' ? s.trim().toUpperCase() : s);

// CBU Argentina: suelen ser 22 dígitos (no hacemos validación bancaria completa aquí)
const isLikelyCBU = (s) => /^\d{22}$/.test(s || '');
// Alias CBU: letras/números/._- (sin espacios), 6–20 aprox. (tolerante)
const isLikelyAlias = (s) => /^[A-Za-z0-9._-]{4,60}$/.test(s || '');

/* =========================================================================
 * 1) Obtener TODAS las cuentas bancarias  GET /banco-cuentas
 *    - Retrocompat: sin params -> array plano
 *    - Con params  : paginado con meta
 *    Filtros: q (nombre/numero/cbu/alias_cbu), banco_id, moneda, activo
 *    Orden: orderBy [id,banco_id,nombre_cuenta,moneda,activo,created_at,updated_at,
 *                    cantidadChequeras,cantidadMovimientos,saldo]
 * =======================================================================*/
export const OBRS_BancoCuentas_CTS = async (req, res) => {
  try {
    const { page, limit, q, banco_id, moneda, activo, orderBy, orderDir } =
      req.query || {};

    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'banco_id') ||
      Object.prototype.hasOwnProperty.call(req.query, 'moneda') ||
      Object.prototype.hasOwnProperty.call(req.query, 'activo') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    const cuentasTable = BancoCuentaModel.getTableName(); // 'banco_cuentas'
    const cheqTable = ChequeraModel.getTableName(); // 'chequeras'
    const movTable = BancoMovimientoModel.getTableName(); // 'banco_movimientos'

    const countChequeras = literal(`(
      SELECT COUNT(*)
      FROM \`${cheqTable}\` ch
      WHERE ch.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    const countMovimientos = literal(`(
      SELECT COUNT(*)
      FROM \`${movTable}\` bm
      WHERE bm.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    const saldoLiteral = literal(`(
      SELECT IFNULL(SUM(bm.credito - bm.debito), 0)
      FROM \`${movTable}\` bm
      WHERE bm.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    // WHERE
    const where = {};
    if (q && q.trim() !== '') {
      const like = { [Op.like]: `%${q.trim()}%` };
      where[Op.or] = [
        { nombre_cuenta: like },
        { numero_cuenta: like },
        { cbu: like },
        { alias_cbu: like }
      ];
    }
    if (banco_id) {
      where.banco_id = Number(banco_id);
    }
    if (moneda && ['ARS', 'USD', 'EUR', 'OTRA'].includes(moneda)) {
      where.moneda = moneda;
    }
    if (activo !== undefined) {
      const val = String(activo).toLowerCase();
      if (['1', 'true', 'si', 'sí'].includes(val)) where.activo = true;
      else if (['0', 'false', 'no'].includes(val)) where.activo = false;
    }

    // Orden
    const validColumns = [
      'id',
      'banco_id',
      'nombre_cuenta',
      'moneda',
      'activo',
      'created_at',
      'updated_at',
      'cantidadChequeras',
      'cantidadMovimientos',
      'saldo'
    ];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // 🔁 SIN params -> array plano
    if (!hasParams) {
      const filas = await BancoCuentaModel.findAll({
        where,
        attributes: {
          include: [
            [countChequeras, 'cantidadChequeras'],
            [countMovimientos, 'cantidadMovimientos'],
            [saldoLiteral, 'saldo']
          ]
        },
        order:
          colName === 'cantidadChequeras'
            ? [[countChequeras, dirName]]
            : colName === 'cantidadMovimientos'
            ? [[countMovimientos, dirName]]
            : colName === 'saldo'
            ? [[saldoLiteral, dirName]]
            : [[colName, dirName]],
        include: [
          { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
        ]
      });
      return res.json(filas);
    }

    // ✅ CON params -> paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await BancoCuentaModel.count({ where });

    const rows = await BancoCuentaModel.findAll({
      where,
      attributes: {
        include: [
          [countChequeras, 'cantidadChequeras'],
          [countMovimientos, 'cantidadMovimientos'],
          [saldoLiteral, 'saldo']
        ]
      },
      order:
        colName === 'cantidadChequeras'
          ? [[countChequeras, dirName]]
          : colName === 'cantidadMovimientos'
          ? [[countMovimientos, dirName]]
          : colName === 'saldo'
          ? [[saldoLiteral, dirName]]
          : [[colName, dirName]],
      limit: limitNum,
      offset,
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
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
        orderBy: colName,
        orderDir: dirName,
        q: q || '',
        banco_id: banco_id || '',
        moneda: moneda || '',
        activo: activo ?? ''
      }
    });
  } catch (error) {
    console.error('OBRS_BancoCuentas_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Obtener UNA cuenta por ID + KPIs  GET /banco-cuentas/:id
 * =======================================================================*/
export const OBR_BancoCuenta_CTS = async (req, res) => {
  try {
    const cuentasTable = BancoCuentaModel.getTableName();
    const cheqTable = ChequeraModel.getTableName();
    const movTable = BancoMovimientoModel.getTableName();

    const countChequeras = literal(`(
      SELECT COUNT(*) FROM \`${cheqTable}\` ch
      WHERE ch.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    const countMovimientos = literal(`(
      SELECT COUNT(*) FROM \`${movTable}\` bm
      WHERE bm.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    const saldoLiteral = literal(`(
      SELECT IFNULL(SUM(bm.credito - bm.debito), 0)
      FROM \`${movTable}\` bm
      WHERE bm.\`banco_cuenta_id\` = \`${cuentasTable}\`.id
    )`);

    const cuenta = await BancoCuentaModel.findOne({
      where: { id: req.params.id },
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ],
      attributes: {
        include: [
          [countChequeras, 'cantidadChequeras'],
          [countMovimientos, 'cantidadMovimientos'],
          [saldoLiteral, 'saldo']
        ]
      }
    });

    if (!cuenta) {
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });
    }

    res.json(cuenta);
  } catch (error) {
    console.error('OBR_BancoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear cuenta bancaria  POST /banco-cuentas
 *    - Valida banco_id existente
 *    - Evita duplicado exacto (banco_id + nombre_cuenta) como soft-rule
 * =======================================================================*/
export const CR_BancoCuenta_CTS = async (req, res) => {
  const {
    banco_id,
    nombre_cuenta,
    moneda = 'ARS',
    numero_cuenta,
    cbu,
    alias_cbu,
    activo,
    usuario_log_id
  } = req.body || {};

  try {
    // 1) Validaciones de entrada (claras y accionables)
    if (!banco_id) {
      throw new AppError({
        status: 400,
        code: 'BANCO_REQUIRED',
        message: 'Debe seleccionar un banco',
        tips: ['Elegí un banco de la lista.'],
        details: { field: 'banco_id' }
      });
    }
    if (!nombre_cuenta || !normStr(nombre_cuenta)) {
      throw new AppError({
        status: 400,
        code: 'NOMBRE_REQUIRED',
        message: 'El nombre/titular de la cuenta es obligatorio',
        tips: ['Completá el campo Nombre/Titular.'],
        details: { field: 'nombre_cuenta' }
      });
    }
    const monedaOk = MONEDAS.has(String(moneda).toUpperCase());
    if (!monedaOk) {
      throw new AppError({
        status: 400,
        code: 'MONEDA_INVALIDA',
        message: 'La moneda indicada no es válida',
        tips: ['Usá ARS, USD, EUR u OTRA.'],
        details: { field: 'moneda', value: moneda }
      });
    }
    if (cbu && !isLikelyCBU(cbu)) {
      throw new AppError({
        status: 400,
        code: 'CBU_INVALIDO',
        message: 'El CBU parece inválido',
        tips: ['Debe tener 22 dígitos sin espacios.'],
        details: { field: 'cbu' }
      });
    }
    if (alias_cbu && !isLikelyAlias(alias_cbu)) {
      throw new AppError({
        status: 400,
        code: 'ALIAS_INVALIDO',
        message: 'El alias CBU parece inválido',
        tips: [
          'Usá letras/números/puntos/guiones (sin espacios).',
          'Entre 4 y 60 caracteres.'
        ],
        details: { field: 'alias_cbu' }
      });
    }

    // 2) Banco existente
    const banco = await BancoModel.findByPk(banco_id);
    if (!banco) {
      throw new AppError({
        status: 400,
        code: 'BANCO_INEXISTENTE',
        message: 'Banco inexistente',
        tips: ['Seleccioná un banco válido de la lista.'],
        details: { field: 'banco_id' }
      });
    }

    // 3) Soft uniqueness: mismo banco + mismo nombre_cuenta
    const dup = await BancoCuentaModel.findOne({
      where: { banco_id, nombre_cuenta: normStr(nombre_cuenta) }
    });
    if (dup) {
      throw new AppError({
        status: 409,
        code: 'DUPLICATE',
        message: 'Ya existe una cuenta con ese nombre en este banco',
        tips: [
          'Usá un nombre diferente.',
          'Si es la misma, verificá antes de crear un duplicado.'
        ],
        details: { fields: ['banco_id', 'nombre_cuenta'] }
      });
    }

    // 4) Alta
    const nueva = await BancoCuentaModel.create({
      banco_id,
      nombre_cuenta: normStr(nombre_cuenta),
      moneda: String(moneda).toUpperCase(),
      numero_cuenta: normStr(numero_cuenta) || null,
      cbu: normStr(cbu) || null,
      alias_cbu: normUpper(alias_cbu) || null,
      activo: activo === undefined ? true : Boolean(activo)
    });

    // 5) Log best-effort
    try {
      await registrarLog(
        req,
        'banco_cuentas',
        'crear',
        `creó la cuenta "${nueva.nombre_cuenta}" en el banco "${banco.nombre}"`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Cuenta creada correctamente', cuenta: nueva });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('CR_BancoCuenta_CTS:', {
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


/* =========================================================================
 * 4) Actualizar cuenta bancaria  PUT/PATCH /banco-cuentas/:id
 *    - Permite cambiar banco_id (valida existencia)
 *    - Soft uniqueness (banco_id + nombre_cuenta)
 *    - Valida moneda/CBU/Alias
 *    - Audita cambios
 *    - Errores normalizados
 * =======================================================================*/
export const UR_BancoCuenta_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;

  try {
    const antes = await BancoCuentaModel.findByPk(id, {
      include: [{ model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }]
    });
    if (!antes) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Cuenta bancaria no encontrada'
      });
    }

    // Campos candidatos (con fallback a valores actuales)
    const next = {
      banco_id: body.banco_id ?? antes.banco_id,
      nombre_cuenta: normStr(body.nombre_cuenta) ?? antes.nombre_cuenta,
      moneda: (body.moneda ?? antes.moneda)?.toString().toUpperCase(),
      numero_cuenta: normStr(body.numero_cuenta) ?? antes.numero_cuenta,
      cbu: normStr(body.cbu) ?? antes.cbu,
      alias_cbu: normUpper(body.alias_cbu) ?? antes.alias_cbu,
      activo:
        body.activo === undefined ? antes.activo : Boolean(body.activo)
    };

    // Validaciones
    if (!next.nombre_cuenta) {
      throw new AppError({
        status: 400,
        code: 'NOMBRE_REQUIRED',
        message: 'El nombre/titular de la cuenta es obligatorio',
        tips: ['Completá el campo Nombre/Titular.'],
        details: { field: 'nombre_cuenta' }
      });
    }
    if (!MONEDAS.has(next.moneda)) {
      throw new AppError({
        status: 400,
        code: 'MONEDA_INVALIDA',
        message: 'La moneda indicada no es válida',
        tips: ['Usá ARS, USD, EUR u OTRA.'],
        details: { field: 'moneda', value: next.moneda }
      });
    }
    if (next.cbu && !isLikelyCBU(next.cbu)) {
      throw new AppError({
        status: 400,
        code: 'CBU_INVALIDO',
        message: 'El CBU parece inválido',
        tips: ['Debe tener 22 dígitos sin espacios.'],
        details: { field: 'cbu' }
      });
    }
    if (next.alias_cbu && !isLikelyAlias(next.alias_cbu)) {
      throw new AppError({
        status: 400,
        code: 'ALIAS_INVALIDO',
        message: 'El alias CBU parece inválido',
        tips: [
          'Usá letras/números/puntos/guiones (sin espacios).',
          'Entre 4 y 60 caracteres.'
        ],
        details: { field: 'alias_cbu' }
      });
    }

    // Validar banco si cambia
    let bancoDestino = antes.banco;
    if (Number(next.banco_id) !== Number(antes.banco_id)) {
      bancoDestino = await BancoModel.findByPk(next.banco_id);
      if (!bancoDestino) {
        throw new AppError({
          status: 400,
          code: 'BANCO_INEXISTENTE',
          message: 'Banco destino inexistente',
          tips: ['Seleccioná un banco válido de la lista.'],
          details: { field: 'banco_id' }
        });
      }
    }

    // Soft uniqueness: (banco_id, nombre_cuenta) distinto del actual
    if (
      Number(next.banco_id) !== Number(antes.banco_id) ||
      next.nombre_cuenta !== antes.nombre_cuenta
    ) {
      const dup = await BancoCuentaModel.findOne({
        where: {
          banco_id: next.banco_id,
          nombre_cuenta: next.nombre_cuenta,
          id: { [Op.ne]: id }
        }
      });
      if (dup) {
        throw new AppError({
          status: 409,
          code: 'DUPLICATE',
          message:
            Number(next.banco_id) !== Number(antes.banco_id)
              ? 'Ya existe una cuenta con ese nombre en el banco destino'
              : 'Ya existe una cuenta con ese nombre en este banco',
          tips: ['Elegí un nombre diferente o verificá duplicados.'],
          details: { fields: ['banco_id', 'nombre_cuenta'] }
        });
      }
    }

    // Auditoría de cambios
    const camposAuditar = [
      'banco_id',
      'nombre_cuenta',
      'moneda',
      'numero_cuenta',
      'cbu',
      'alias_cbu',
      'activo'
    ];
    const cambios = [];
    for (const key of camposAuditar) {
      const prev = (antes[key]?.toString?.() ?? antes[key] ?? '') + '';
      const val = (next[key]?.toString?.() ?? next[key] ?? '') + '';
      if (prev !== val) {
        cambios.push(`cambió "${key}" de "${prev}" a "${val}"`);
      }
    }

    // Update
    const [updated] = await BancoCuentaModel.update(next, { where: { id } });
    if (updated !== 1) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Cuenta bancaria no encontrada'
      });
    }

    const actualizada = await BancoCuentaModel.findByPk(id, {
      include: [{ model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }]
    });

    // Log best-effort
    try {
      const desc =
        cambios.length > 0
          ? `actualizó la cuenta "${antes.nombre_cuenta}" y ${cambios.join(', ')}`
          : `actualizó la cuenta "${antes.nombre_cuenta}" sin cambios relevantes`;
      await registrarLog(req, 'banco_cuentas', 'editar', desc, usuario_log_id);
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      message: 'Cuenta bancaria actualizada correctamente',
      cuenta: actualizada
    });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('UR_BancoCuenta_CTS:', {
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

/* =========================================================================
 * 5) Eliminar/Desactivar cuenta bancaria  DELETE /banco-cuentas/:id?forzar=true
 *    Reglas:
 *      - Si hay movimientos => JAMÁS eliminar físicamente (aunque forzar).
 *        * Si ?forzar=true => desactivar (activo=0) y devolver mensaje.
 *        * Si ?forzar=false => 409 con advertencia y detalles.
 *      - Si no hay movimientos pero hay chequeras => misma lógica:
 *        * ?forzar=true => desactivar
 *        * ?forzar=false => 409
 *      - Si no hay dependencias => eliminación física.
 * =======================================================================*/
export const ER_BancoCuenta_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const usuario_log_id =
    body.usuario_log_id ?? req.query.usuario_log_id ?? null;

  const rawForzado = body.forzado ?? body.forzar ?? req.query.forzar ?? 'false';
  const forzado =
    rawForzado === true ||
    rawForzado === 'true' ||
    rawForzado === 1 ||
    rawForzado === '1';

  try {
    const cuenta = await BancoCuentaModel.findByPk(id, {
      include: [{ model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }]
    });
    if (!cuenta) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Cuenta bancaria no encontrada'
      });
    }

    // Contar dependencias
    const [cantCheq, cantMov] = await Promise.all([
      ChequeraModel.count({ where: { banco_cuenta_id: id } }),
      BancoMovimientoModel.count({ where: { banco_cuenta_id: id } })
    ]);

    // 1) Si hay MOVIMIENTOS: NUNCA permitimos eliminación física
    if (cantMov > 0) {
      if (!forzado) {
        throw new AppError({
          status: 409,
          code: 'HAS_MOVEMENTS',
          message:
            'Esta cuenta posee movimientos bancarios. ¿Desea desactivarla de todas formas?',
          tips: [
            'Para eliminar definitivamente, primero migre o elimine sus movimientos (si su negocio lo permite).',
            'Como alternativa inmediata, desactive la cuenta para que no se use más.'
          ],
          details: { movimientosAsociados: cantMov, chequerasAsociadas: cantCheq }
        });
      }

      // forzado=true => desactivar
      await BancoCuentaModel.update({ activo: false }, { where: { id } });

      try {
        await registrarLog(
          req,
          'banco_cuentas',
          'editar',
          `desactivó la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (movimientos: ${cantMov}, chequeras: ${cantCheq})`,
          usuario_log_id
        );
      } catch (logErr) {
        console.warn('registrarLog falló:', logErr?.message || logErr);
      }

      return res.json({
        message:
          'Cuenta desactivada. Tiene movimientos asociados, por lo que no puede eliminarse físicamente.',
        cuenta_id: id
      });
    }

    // 2) Sin movimientos pero con CHEQUERAS: tampoco eliminación dura sin forzar
    if (cantCheq > 0) {
      if (!forzado) {
        throw new AppError({
          status: 409,
          code: 'HAS_CHEQUERAS',
          message:
            'Esta cuenta tiene chequeras asociadas. ¿Desea desactivarla de todas formas?',
          tips: [
            'Para eliminar definitivamente, primero migre o elimine sus chequeras vinculadas.',
            'Como alternativa inmediata, desactive la cuenta para bloquear su uso.'
          ],
          details: { chequerasAsociadas: cantCheq }
        });
      }

      // forzado=true => desactivar
      await BancoCuentaModel.update({ activo: false }, { where: { id } });

      try {
        await registrarLog(
          req,
          'banco_cuentas',
          'editar',
          `desactivó la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (chequeras: ${cantCheq})`,
          usuario_log_id
        );
      } catch (logErr) {
        console.warn('registrarLog falló:', logErr?.message || logErr);
      }

      return res.json({
        message:
          'Cuenta desactivada. Posee chequeras asociadas, por lo que no se elimina físicamente.',
        cuenta_id: id
      });
    }

    // 3) SIN dependencias => eliminación física
    await BancoCuentaModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'banco_cuentas',
        'eliminar',
        `eliminó la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}"`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Cuenta bancaria eliminada correctamente.' });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('ER_BancoCuenta_CTS:', {
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