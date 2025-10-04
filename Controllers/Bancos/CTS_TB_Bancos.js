// controllers/Bancos/CTS_TB_Bancos.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el módulo de Bancos:
 *  - Listado con filtros/orden y conteo de cuentas
 *  - Obtención por ID con conteo de cuentas
 *  - Crear / Editar (con log y validaciones de unicidad)
 *  - Desactivar/Eliminar (protección ante dependencias)
 */

import db from '../../DataBase/db.js';
import { Op, fn, col, literal } from 'sequelize';

import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

import { AppError, toHttpError } from '../../Utils/httpErrors.js';

/* =========================================================================
 * 1) Obtener TODOS los bancos (+cantidad de cuentas)  GET /bancos
 *    - Retrocompat: si no pasan params -> devuelve array plano
 *    - Con params -> devuelve paginado con meta
 *    Filtros: q (nombre/cuit/alias), activo (0/1/true/false)
 *    Orden: orderBy [id,nombre,cuit,alias,activo,created_at,updated_at,cantidadCuentas]
 *           orderDir [ASC|DESC]
 * =======================================================================*/
export const OBRS_Bancos_CTS = async (req, res) => {
  try {
    const { page, limit, q, activo, orderBy, orderDir } = req.query || {};

    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'activo') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    const bancosTable = BancoModel.getTableName(); // 'bancos'
    const cuentasTable = BancoCuentaModel.getTableName(); // 'banco_cuentas'

    const countLiteral = literal(`(
      SELECT COUNT(*)
      FROM \`${cuentasTable}\` AS c
      WHERE c.\`banco_id\` = \`${bancosTable}\`.id
    )`);

    // WHERE
    const where = {};
    if (q && q.trim() !== '') {
      const like = { [Op.like]: `%${q.trim()}%` };
      where[Op.or] = [{ nombre: like }, { cuit: like }, { alias: like }];
    }
    if (activo !== undefined) {
      const val = String(activo).toLowerCase();
      if (['1', 'true', 'si', 'sí'].includes(val)) where.activo = true;
      else if (['0', 'false', 'no'].includes(val)) where.activo = false;
    }

    // Orden
    const validColumns = [
      'id',
      'nombre',
      'cuit',
      'alias',
      'activo',
      'created_at',
      'updated_at',
      'cantidadCuentas'
    ];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // 🔁 SIN params -> array plano
    if (!hasParams) {
      const filas = await BancoModel.findAll({
        where,
        attributes: {
          include: [[countLiteral, 'cantidadCuentas']]
        },
        order:
          colName === 'cantidadCuentas'
            ? [[countLiteral, dirName]]
            : [[colName, dirName]]
      });
      return res.json(filas);
    }

    // ✅ CON params -> paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await BancoModel.count({ where });

    const rows = await BancoModel.findAll({
      where,
      attributes: {
        include: [[countLiteral, 'cantidadCuentas']]
      },
      order:
        colName === 'cantidadCuentas'
          ? [[countLiteral, dirName]]
          : [[colName, dirName]],
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
        orderBy: colName,
        orderDir: dirName,
        q: q || '',
        activo: activo ?? ''
      }
    });
  } catch (error) {
    console.error('OBRS_Bancos_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Obtener UN banco por ID (+cantidad de cuentas)  GET /bancos/:id
 * =======================================================================*/
export const OBR_Banco_CTS = async (req, res) => {
  try {
    const banco = await BancoModel.findOne({
      where: { id: req.params.id },
      include: [{ model: BancoCuentaModel, as: 'cuentas', attributes: [] }],
      attributes: {
        include: [[fn('COUNT', col('cuentas.id')), 'cantidadCuentas']]
      },
      group: ['bancos.id']
    });

    if (!banco) {
      return res.status(404).json({ mensajeError: 'Banco no encontrado' });
    }

    res.json(banco);
  } catch (error) {
    console.error('OBR_Banco_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear banco  POST /bancos
 * =======================================================================*/
export const CR_Banco_CTS = async (req, res) => {
  const { nombre, cuit, alias, activo, usuario_log_id } = req.body || {};

  try {
    // Validaciones de negocio
    if (!nombre?.trim()) {
      throw new AppError({
        status: 400,
        code: 'NOMBRE_REQUERIDO',
        message: 'El nombre del banco es obligatorio.',
        tips: ['Completá el campo Nombre.'],
        details: { field: 'nombre' }
      });
    }

    // Unicidad por nombre (case-sensitive según collation; ajustar si querés)
    const existe = await BancoModel.findOne({
      where: { nombre: nombre.trim() }
    });
    if (existe) {
      throw new AppError({
        status: 409,
        code: 'DUPLICATE',
        message: 'Ya existe un banco con ese nombre.',
        tips: ['Usá un nombre distinto o editá el banco existente.'],
        details: { fields: ['nombre'] }
      });
    }

    const nuevo = await BancoModel.create({
      nombre: nombre.trim(),
      cuit: cuit?.trim() || null,
      alias: alias?.trim() || null,
      activo: activo === undefined ? true : Boolean(activo)
    });

    // Log best-effort
    try {
      await registrarLog(
        req,
        'bancos',
        'crear',
        `creó el banco "${nuevo.nombre}"`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      ok: true,
      message: 'Banco creado correctamente',
      banco: nuevo
    });
  } catch (err) {
    const httpErr = toHttpError(err, {
      message: 'No se pudo crear el banco.'
    });
    console.error('CR_Banco_CTS:', err);
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
 * 4) Actualizar banco  PUT/PATCH /bancos/:id
 *    - Audita cambios campo a campo
 * =======================================================================*/
export const UR_Banco_CTS = async (req, res) => {
  const { id } = req.params;
  const { usuario_log_id } = req.body || {};

  try {
    const antes = await BancoModel.findByPk(id);
    if (!antes) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Banco no encontrado.'
      });
    }

    // Validación de nombre (si viene)
    if (Object.prototype.hasOwnProperty.call(req.body, 'nombre')) {
      const nuevoNombre = req.body.nombre?.trim() || '';
      if (!nuevoNombre) {
        throw new AppError({
          status: 400,
          code: 'NOMBRE_REQUERIDO',
          message: 'El nombre del banco es obligatorio.',
          tips: ['Completá el campo Nombre.'],
          details: { field: 'nombre' }
        });
      }
      if (nuevoNombre !== antes.nombre) {
        const ya = await BancoModel.findOne({
          where: { nombre: nuevoNombre, id: { [Op.ne]: id } }
        });
        if (ya) {
          throw new AppError({
            status: 409,
            code: 'DUPLICATE',
            message: 'Ya existe un banco con ese nombre.',
            tips: ['Usá un nombre distinto.'],
            details: { fields: ['nombre'] }
          });
        }
      }
    }

    const payload = {
      nombre:
        req.body.nombre !== undefined ? req.body.nombre?.trim() : antes.nombre,
      cuit: req.body.cuit !== undefined ? req.body.cuit?.trim() : antes.cuit,
      alias:
        req.body.alias !== undefined ? req.body.alias?.trim() : antes.alias,
      activo:
        req.body.activo === undefined ? antes.activo : Boolean(req.body.activo)
    };

    const [updated] = await BancoModel.update(payload, { where: { id } });
    if (updated !== 1) {
      // Muy raro que llegue acá si antes existía, pero por seguridad
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Banco no encontrado.'
      });
    }

    const actualizado = await BancoModel.findByPk(id);

    // Auditar cambios campo a campo
    const camposAuditar = ['nombre', 'cuit', 'alias', 'activo'];
    const cambios = [];
    for (const key of camposAuditar) {
      const oldV = String(antes[key] ?? '');
      const newV = String(actualizado[key] ?? '');
      if (oldV !== newV) {
        cambios.push(`cambió "${key}" de "${oldV}" a "${newV}"`);
      }
    }

    try {
      const desc =
        cambios.length > 0
          ? `actualizó el banco "${antes.nombre}" y ${cambios.join(', ')}`
          : `actualizó el banco "${antes.nombre}" sin cambios relevantes`;
      await registrarLog(req, 'bancos', 'editar', desc, usuario_log_id);
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      ok: true,
      message: 'Banco actualizado correctamente',
      banco: actualizado
    });
  } catch (err) {
    const httpErr = toHttpError(err, {
      message: 'No se pudo actualizar el banco.'
    });
    console.error('UR_Banco_CTS:', err);
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
 * 5) Eliminar/Desactivar banco  DELETE /bancos/:id?forzar=true
 *    Reglas:
 *      - Si hay cuentas asociadas, bloquear eliminación dura.
 *      - Si ?forzar=true => desactivar (activo=0) y devolver mensaje claro.
 * =======================================================================*/
export const ER_Banco_CTS = async (req, res) => {
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
    const banco = await BancoModel.findByPk(id);
    if (!banco) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Banco no encontrado.'
      });
    }

    // Dependencias: cuentas por banco
    const cuentas = await BancoCuentaModel.count({ where: { banco_id: id } });

    if (cuentas > 0 && !forzado) {
      throw new AppError({
        status: 409,
        code: 'HAS_DEPENDENCIES',
        message:
          'Este BANCO tiene cuentas asociadas. ¿Desea desactivarlo de todas formas?',
        tips: [
          'Podés desactivarlo para ocultarlo de las listas.',
          'Para eliminarlo definitivamente, primero migrá o eliminá sus cuentas/movimientos.'
        ],
        details: { cuentasAsociadas: cuentas }
      });
    }

    if (cuentas > 0 && forzado) {
      // Seguridad: no hacemos cascada destructiva. Se marca inactivo.
      await BancoModel.update({ activo: false }, { where: { id } });

      try {
        await registrarLog(
          req,
          'bancos',
          'editar',
          `desactivó el banco "${banco.nombre}" (cuentas asociadas: ${cuentas})`,
          usuario_log_id
        );
      } catch (logErr) {
        console.warn('registrarLog falló:', logErr?.message || logErr);
      }

      return res.json({
        ok: true,
        message:
          'Banco desactivado (posee dependencias). Para eliminarlo definitivamente, primero migrá o eliminá sus cuentas y movimientos.'
      });
    }

    // Sin dependencias => eliminación física
    await BancoModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'bancos',
        'eliminar',
        `eliminó el banco "${banco.nombre}"`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ ok: true, message: 'Banco eliminado correctamente.' });
  } catch (err) {
    const httpErr = toHttpError(err, {
      message: 'No se pudo eliminar/desactivar el banco.'
    });
    console.error('ER_Banco_CTS:', err);
    return res.status(httpErr.status).json({
      ok: false,
      code: httpErr.code,
      mensajeError: httpErr.message,
      tips: httpErr.tips,
      details: httpErr.details
    });
  }
};
