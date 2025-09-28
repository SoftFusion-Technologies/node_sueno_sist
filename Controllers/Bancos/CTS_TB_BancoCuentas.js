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
    moneda,
    numero_cuenta,
    cbu,
    alias_cbu,
    activo,
    usuario_log_id
  } = req.body || {};

  try {
    // Validar banco
    const banco = await BancoModel.findByPk(banco_id);
    if (!banco) {
      return res.status(400).json({ mensajeError: 'Banco inexistente' });
    }

    // Soft uniqueness: mismo banco + mismo nombre_cuenta
    const dup = await BancoCuentaModel.findOne({
      where: { banco_id, nombre_cuenta: nombre_cuenta?.trim() }
    });
    if (dup) {
      return res
        .status(409)
        .json({
          mensajeError: 'Ya existe una cuenta con ese nombre en este banco'
        });
    }

    const nueva = await BancoCuentaModel.create({
      banco_id,
      nombre_cuenta: nombre_cuenta?.trim(),
      moneda: moneda || 'ARS',
      numero_cuenta: numero_cuenta?.trim() || null,
      cbu: cbu?.trim() || null,
      alias_cbu: alias_cbu?.trim() || null,
      activo: activo === undefined ? true : Boolean(activo)
    });

    // Log no bloqueante
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
  } catch (error) {
    console.error('CR_BancoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar cuenta bancaria  PUT/PATCH /banco-cuentas/:id
 *    - Permite cambiar banco_id (valida existencia)
 *    - Audita cambios campo a campo
 * =======================================================================*/
export const UR_BancoCuenta_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;

  try {
    const antes = await BancoCuentaModel.findByPk(id, {
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });
    if (!antes) {
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });
    }

    // Si cambian de banco, validar
    let nuevoBanco = antes.banco;
    if (
      body.banco_id !== undefined &&
      Number(body.banco_id) !== Number(antes.banco_id)
    ) {
      nuevoBanco = await BancoModel.findByPk(body.banco_id);
      if (!nuevoBanco) {
        return res
          .status(400)
          .json({ mensajeError: 'Banco destino inexistente' });
      }

      // Soft uniqueness: mismo banco + nombre_cuenta
      const dup = await BancoCuentaModel.findOne({
        where: {
          banco_id: body.banco_id,
          nombre_cuenta: (body.nombre_cuenta ?? antes.nombre_cuenta).trim(),
          id: { [Op.ne]: id }
        }
      });
      if (dup) {
        return res
          .status(409)
          .json({
            mensajeError:
              'Ya existe una cuenta con ese nombre en el banco destino'
          });
      }
    } else if (
      body.nombre_cuenta &&
      body.nombre_cuenta.trim() !== antes.nombre_cuenta
    ) {
      // Cambia solo el nombre: evitar duplicado en el mismo banco
      const dup = await BancoCuentaModel.findOne({
        where: {
          banco_id: antes.banco_id,
          nombre_cuenta: body.nombre_cuenta.trim(),
          id: { [Op.ne]: id }
        }
      });
      if (dup) {
        return res
          .status(409)
          .json({
            mensajeError: 'Ya existe una cuenta con ese nombre en este banco'
          });
      }
    }

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
      if (
        Object.prototype.hasOwnProperty.call(body, key) &&
        (body[key]?.toString() ?? null) !== (antes[key]?.toString() ?? null)
      ) {
        cambios.push(
          `cambió "${key}" de "${antes[key] ?? ''}" a "${body[key] ?? ''}"`
        );
      }
    }

    const [updated] = await BancoCuentaModel.update(
      {
        banco_id: body.banco_id ?? antes.banco_id,
        nombre_cuenta: body.nombre_cuenta?.trim() ?? antes.nombre_cuenta,
        moneda: body.moneda ?? antes.moneda,
        numero_cuenta: body.numero_cuenta?.trim() ?? antes.numero_cuenta,
        cbu: body.cbu?.trim() ?? antes.cbu,
        alias_cbu: body.alias_cbu?.trim() ?? antes.alias_cbu,
        activo: body.activo === undefined ? antes.activo : Boolean(body.activo)
      },
      { where: { id } }
    );

    if (updated !== 1) {
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });
    }

    const actualizada = await BancoCuentaModel.findByPk(id, {
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });

    // Log no bloqueante
    try {
      const desc =
        cambios.length > 0
          ? `actualizó la cuenta "${antes.nombre_cuenta}" y ${cambios.join(
              ', '
            )}`
          : `actualizó la cuenta "${antes.nombre_cuenta}" sin cambios relevantes`;
      await registrarLog(req, 'banco_cuentas', 'editar', desc, usuario_log_id);
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      message: 'Cuenta bancaria actualizada correctamente',
      cuenta: actualizada
    });
  } catch (error) {
    console.error('UR_BancoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar/Desactivar cuenta bancaria  DELETE /banco-cuentas/:id?forzar=true
 *    Reglas:
 *      - Si hay chequeras o movimientos => bloquear eliminación dura.
 *      - ?forzar=true => marcar inactiva (activo=0).
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
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });
    if (!cuenta) {
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });
    }

    const [cantCheq, cantMov] = await Promise.all([
      ChequeraModel.count({ where: { banco_cuenta_id: id } }),
      BancoMovimientoModel.count({ where: { banco_cuenta_id: id } })
    ]);

    if ((cantCheq > 0 || cantMov > 0) && !forzado) {
      const detalles = [];
      if (cantCheq > 0) detalles.push('tiene chequeras asociadas');
      if (cantMov > 0) detalles.push('posee movimientos bancarios');
      return res.status(409).json({
        mensajeError: `Esta CUENTA ${detalles.join(
          ' y '
        )}. ¿Desea desactivarla de todas formas?`,
        detalle: { chequerasAsociadas: cantCheq, movimientosAsociados: cantMov }
      });
    }

    if (cantCheq > 0 || cantMov > 0) {
      // Desactivar (no borrar en cascada)
      await BancoCuentaModel.update({ activo: false }, { where: { id } });

      try {
        await registrarLog(
          req,
          'banco_cuentas',
          'editar',
          `desactivó la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (chequeras: ${cantCheq}, movimientos: ${cantMov})`,
          usuario_log_id
        );
      } catch (logErr) {
        console.warn('registrarLog falló:', logErr?.message || logErr);
      }

      return res.json({
        message:
          'Cuenta desactivada (posee dependencias). Para eliminarla definitivamente, primero migre/borre chequeras y movimientos.'
      });
    }

    // Sin dependencias => eliminación física
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
  } catch (error) {
    console.error('ER_BancoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
