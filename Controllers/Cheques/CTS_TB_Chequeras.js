// Controllers/Cheques/CTS_TB_Chequeras.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el módulo de Chequeras:
 *  - Listado con filtros/orden y KPIs (cheques emitidos, disponibles)
 *  - Obtención por ID con KPIs
 *  - Crear / Editar (validación de rangos y superposición)
 *  - Anular/Eliminar con protección por dependencias (cheques asociados)
 */

import db from '../../DataBase/db.js';
import { Op, literal } from 'sequelize';

import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { ChequeraModel } from '../../Models/Cheques/MD_TB_Chequeras.js';
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { registrarLog } from '../../Helpers/registrarLog.js';
import {
  validarRangoChequera,
  sugerirRangoDisponible
} from '../../Utils/chequeras.js';

import { AppError, toHttpError } from '../../Utils/httpErrors.js';
const existeSuperposicion = async (
  banco_cuenta_id,
  nro_desde,
  nro_hasta,
  excluirId = null
) => {
  // Existe otra chequera con intersección de rango en la misma cuenta
  const where = {
    banco_cuenta_id,
    [Op.and]: [
      { nro_desde: { [Op.lte]: nro_hasta } },
      { nro_hasta: { [Op.gte]: nro_desde } }
    ]
  };
  if (excluirId) where.id = { [Op.ne]: excluirId };
  const count = await ChequeraModel.count({ where });
  return count > 0;
};

/* =========================================================================
 * 1) Obtener TODAS las chequeras  GET /chequeras
 *    Filtros: q (descripcion o rango), banco_id, banco_cuenta_id, estado
 *    Orden: [id,banco_cuenta_id,descripcion,nro_desde,nro_hasta,proximo_nro,
 *            estado,created_at,updated_at,cantidadCheques,disponibles]
 *    Retrocompat: sin params -> array plano
 * =======================================================================*/
export const OBRS_Chequeras_CTS = async (req, res) => {
  try {
    const {
      page,
      limit,
      q,
      banco_id,
      banco_cuenta_id,
      estado,
      orderBy,
      orderDir
    } = req.query || {};

    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'banco_id') ||
      Object.prototype.hasOwnProperty.call(req.query, 'banco_cuenta_id') ||
      Object.prototype.hasOwnProperty.call(req.query, 'estado') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    const cheqTable = ChequeraModel.getTableName(); // 'chequeras'
    const chqTable = ChequeModel.getTableName(); // 'cheques'

    const countCheques = literal(`(
      SELECT COUNT(*) FROM \`${chqTable}\` ch
      WHERE ch.\`chequera_id\` = \`${cheqTable}\`.id
    )`);

    const disponibles = literal(
      `GREATEST(\`${cheqTable}\`.\`nro_hasta\` - GREATEST(\`${cheqTable}\`.\`proximo_nro\`, \`${cheqTable}\`.\`nro_desde\`) + 1, 0)`
    );

    // WHERE
    const where = {};
    if (q && q.trim() !== '') {
      const s = q.trim();
      const like = { [Op.like]: `%${s}%` };
      where[Op.or] = [
        { descripcion: like },
        // búsquedas por rango como texto
        db.where(literal('CAST(nro_desde AS CHAR)'), { [Op.like]: `%${s}%` }),
        db.where(literal('CAST(nro_hasta AS CHAR)'), { [Op.like]: `%${s}%` })
      ];
    }
    if (
      estado &&
      ['activa', 'agotada', 'bloqueada', 'anulada'].includes(estado)
    ) {
      where.estado = estado;
    }
    if (banco_cuenta_id) {
      where.banco_cuenta_id = Number(banco_cuenta_id);
    }

    // Filtro por banco_id a través de la relación con cuentas
    const includeBanco = banco_id
      ? [
          {
            model: BancoCuentaModel,
            as: 'cuenta',
            required: true,
            where: { banco_id: Number(banco_id) },
            include: [
              { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
            ]
          }
        ]
      : [
          {
            model: BancoCuentaModel,
            as: 'cuenta',
            include: [
              { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
            ]
          }
        ];

    // Orden
    const validColumns = [
      'id',
      'banco_cuenta_id',
      'descripcion',
      'nro_desde',
      'nro_hasta',
      'proximo_nro',
      'estado',
      'created_at',
      'updated_at',
      'cantidadCheques',
      'disponibles'
    ];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // 🔁 SIN params -> array plano
    if (!hasParams) {
      const filas = await ChequeraModel.findAll({
        where,
        attributes: {
          include: [
            [countCheques, 'cantidadCheques'],
            [disponibles, 'disponibles']
          ]
        },
        order:
          colName === 'cantidadCheques'
            ? [[countCheques, dirName]]
            : colName === 'disponibles'
            ? [[disponibles, dirName]]
            : [[colName, dirName]],
        include: includeBanco
      });
      return res.json(filas);
    }

    // ✅ CON params -> paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await ChequeraModel.count({
      where,
      include: banco_id
        ? [
            {
              model: BancoCuentaModel,
              as: 'cuenta',
              required: true,
              where: { banco_id: Number(banco_id) }
            }
          ]
        : []
    });

    const rows = await ChequeraModel.findAll({
      where,
      attributes: {
        include: [
          [countCheques, 'cantidadCheques'],
          [disponibles, 'disponibles']
        ]
      },
      order:
        colName === 'cantidadCheques'
          ? [[countCheques, dirName]]
          : colName === 'disponibles'
          ? [[disponibles, dirName]]
          : [[colName, dirName]],
      limit: limitNum,
      offset,
      include: includeBanco
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
        banco_cuenta_id: banco_cuenta_id || '',
        estado: estado || ''
      }
    });
  } catch (error) {
    console.error('OBRS_Chequeras_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Obtener UNA chequera por ID + KPIs  GET /chequeras/:id
 * =======================================================================*/
export const OBR_Chequera_CTS = async (req, res) => {
  try {
    const cheqTable = ChequeraModel.getTableName();
    const chqTable = ChequeModel.getTableName();

    const countCheques = literal(`(
      SELECT COUNT(*) FROM \`${chqTable}\` ch
      WHERE ch.\`chequera_id\` = \`${cheqTable}\`.id
    )`);

    const disponibles = literal(
      `GREATEST(\`${cheqTable}\`.\`nro_hasta\` - GREATEST(\`${cheqTable}\`.\`proximo_nro\`, \`${cheqTable}\`.\`nro_desde\`) + 1, 0)`
    );

    const chequera = await ChequeraModel.findOne({
      where: { id: req.params.id },
      attributes: {
        include: [
          [countCheques, 'cantidadCheques'],
          [disponibles, 'disponibles']
        ]
      },
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [
            { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
          ]
        }
      ]
    });

    if (!chequera) {
      return res.status(404).json({ mensajeError: 'Chequera no encontrada' });
    }

    res.json(chequera);
  } catch (error) {
    console.error('OBR_Chequera_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear chequera  POST /chequeras
 *    - Valida cuenta existente, rango y superposición
 * =======================================================================*/
export const CR_Chequera_CTS = async (req, res) => {
  const {
    banco_cuenta_id,
    descripcion,
    nro_desde,
    nro_hasta,
    proximo_nro, // opcional; si falta, se setea = nro_desde
    estado, // opcional; por defecto 'activa'
    usuario_log_id,
    auto // opcional; si true => aplica sugerencia automáticamente
  } = req.body || {};

  try {
    // 1) Validar cuenta
    const cuenta = await BancoCuentaModel.findByPk(banco_cuenta_id, {
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });
    if (!cuenta) {
      throw new AppError({
        status: 400,
        code: 'CUENTA_INEXISTENTE',
        message: 'Cuenta bancaria inexistente',
        tips: ['Seleccioná una cuenta válida.'],
        details: { field: 'banco_cuenta_id' }
      });
    }

    // 2) Validar rango básico
    const prox = proximo_nro ?? nro_desde;
    validarRangoChequera(nro_desde, nro_hasta, prox);

    // 3) Chequear superposición/sugerir
    const len = Number(nro_hasta) - Number(nro_desde) + 1;

    // ¿se superpone con alguna existente?
    const solapa = await ChequeraModel.findOne({
      where: {
        banco_cuenta_id
        // Solapa si: (nuevo.desde <= existente.hasta) && (nuevo.hasta >= existente.desde)
        // Sequelize version simplificada usando literal ó reemplazar por Op
      }
      // Usamos literal por claridad (si tenés Op.between/between-like adaptalo):
      // Nota: con Sequelize, conviene construir con [Op.and]/[Op.or]
      // Para brevedad dejamos un literal seguro:
      // *Asegurate de parametrizar si armás raw.*
      // Aquí simplificamos consultando todas y chequeando en JS (robusto y claro):
    });

    // Para robustez: mejor traer todos y chequear en JS (menos errores por dialectos)
    const existentes = await ChequeraModel.findAll({
      where: { banco_cuenta_id },
      attributes: ['nro_desde', 'nro_hasta'],
      order: [['nro_desde', 'ASC']]
    });

    const d = Number(nro_desde),
      h = Number(nro_hasta);
    const haySolape = existentes.some(
      (r) => d <= Number(r.nro_hasta) && h >= Number(r.nro_desde)
    );

    if (haySolape) {
      // Generar sugerencia
      const prefer = d; // intentemos respetar el inicio pedido si hubiera hueco ahí
      const sug = await sugerirRangoDisponible(banco_cuenta_id, len, prefer);

      // Si auto=true => aplicamos sugerencia y creamos
      const debeAuto =
        auto === true || auto === 1 || auto === '1' || auto === 'true';
      if (!debeAuto) {
        throw new AppError({
          status: 409,
          code: 'RANGO_SUPERPUESTO',
          message:
            'El rango solicitado se superpone con una chequera existente',
          tips: [
            `Usá el rango sugerido ${sug.nro_desde}–${sug.nro_hasta} para evitar superposición.`,
            'O ajustá manualmente "desde/hasta" para que no se superpongan.'
          ],
          details: {
            requested: { nro_desde: d, nro_hasta: h },
            suggestion: { ...sug, proximo_nro: sug.nro_desde }
          }
        });
      }

      // auto: crear con sugerencia
      const nuevaAuto = await ChequeraModel.create({
        banco_cuenta_id,
        descripcion: descripcion?.trim(),
        nro_desde: sug.nro_desde,
        nro_hasta: sug.nro_hasta,
        proximo_nro: sug.nro_desde,
        estado: estado || 'activa'
      });

      try {
        await registrarLog(
          req,
          'chequeras',
          'crear',
          `creó la chequera "${nuevaAuto.descripcion}" en la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (rango ${sug.nro_desde}-${sug.nro_hasta}, sugerido)`,
          usuario_log_id
        );
      } catch {}

      return res.json({
        ok: true,
        message: 'Chequera creada con rango sugerido',
        chequera: nuevaAuto,
        suggestionApplied: true
      });
    }

    // 4) Crear normal si NO hay solape
    const nueva = await ChequeraModel.create({
      banco_cuenta_id,
      descripcion: descripcion?.trim(),
      nro_desde: d,
      nro_hasta: h,
      proximo_nro: prox,
      estado: estado || 'activa'
    });

    try {
      await registrarLog(
        req,
        'chequeras',
        'crear',
        `creó la chequera "${nueva.descripcion}" en la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (rango ${d}-${h})`,
        usuario_log_id
      );
    } catch {}

    return res.json({
      ok: true,
      message: 'Chequera creada correctamente',
      chequera: nueva
    });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('CR_Chequera_CTS:', {
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
 * 4) Actualizar chequera  PUT/PATCH /chequeras/:id
 *    - Valida cambios de rango y superposición
 *    - Errores normalizados
 * =======================================================================*/
export const UR_Chequera_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;

  try {
    const antes = await ChequeraModel.findByPk(id, {
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [
            { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
          ]
        }
      ]
    });
    if (!antes) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Chequera no encontrada'
      });
    }

    const next = {
      banco_cuenta_id: body.banco_cuenta_id ?? antes.banco_cuenta_id,
      descripcion: body.descripcion ?? antes.descripcion,
      nro_desde: body.nro_desde ?? antes.nro_desde,
      nro_hasta: body.nro_hasta ?? antes.nro_hasta,
      proximo_nro: body.proximo_nro ?? antes.proximo_nro,
      estado: body.estado ?? antes.estado
    };

    validarRangoChequera(next.nro_desde, next.nro_hasta, next.proximo_nro);

    // Si cambia cuenta o rango -> verificar superposición
    if (
      Number(next.banco_cuenta_id) !== Number(antes.banco_cuenta_id) ||
      Number(next.nro_desde) !== Number(antes.nro_desde) ||
      Number(next.nro_hasta) !== Number(antes.nro_hasta)
    ) {
      const cta = await BancoCuentaModel.findByPk(next.banco_cuenta_id);
      if (!cta) {
        throw new AppError({
          status: 400,
          code: 'CUENTA_INEXISTENTE',
          message: 'Cuenta bancaria destino inexistente',
          details: { field: 'banco_cuenta_id', value: next.banco_cuenta_id }
        });
      }
      const overlap = await existeSuperposicion(
        next.banco_cuenta_id,
        Number(next.nro_desde),
        Number(next.nro_hasta),
        id
      );
      if (overlap) {
        throw new AppError({
          status: 409,
          code: 'RANGO_SUPERPUESTO',
          message:
            'El rango propuesto se superpone con otra chequera de la cuenta',
          tips: [
            'Ajustá "Desde / Hasta" para que no se superpongan.',
            'Podés crear otra chequera usando el rango sugerido del asistente.'
          ]
        });
      }
    }

    // Auditoría
    const campos = [
      'banco_cuenta_id',
      'descripcion',
      'nro_desde',
      'nro_hasta',
      'proximo_nro',
      'estado'
    ];
    const cambios = [];
    for (const k of campos) {
      const prev = (antes[k]?.toString?.() ?? antes[k] ?? '') + '';
      const val = (next[k]?.toString?.() ?? next[k] ?? '') + '';
      if (prev !== val) cambios.push(`cambió "${k}" de "${prev}" a "${val}"`);
    }

    const [updated] = await ChequeraModel.update(next, { where: { id } });
    if (updated !== 1) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Chequera no encontrada'
      });
    }

    const actualizada = await ChequeraModel.findByPk(id, {
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [
            { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
          ]
        }
      ]
    });

    try {
      const desc = cambios.length
        ? `actualizó la chequera "${antes.descripcion || ''}" y ${cambios.join(
            ', '
          )}`
        : `actualizó la chequera "${
            antes.descripcion || ''
          }" sin cambios relevantes`;
      await registrarLog(req, 'chequeras', 'editar', desc, usuario_log_id);
    } catch {}

    return res.json({
      message: 'Chequera actualizada correctamente',
      chequera: actualizada
    });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('UR_Chequera_CTS:', {
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
 * 5) Anular/Eliminar chequera  DELETE /chequeras/:id?forzar=true
 *    Reglas:
 *      - Si hay cheques asociados => 409 (unless forzar) → estado='anulada'
 *      - Sin dependencias => eliminación física
 * =======================================================================*/
export const ER_Chequera_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const usuario_log_id =
    body.usuario_log_id ?? req.query.usuario_log_id ?? null;

  const rawForzado = body.forzado ?? body.forzar ?? req.query.forzar ?? 'false';
  const forzado = [true, 'true', 1, '1'].includes(rawForzado);

  try {
    const chequera = await ChequeraModel.findByPk(id, {
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [
            { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
          ]
        }
      ]
    });
    if (!chequera) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Chequera no encontrada'
      });
    }

    const countCheques = await ChequeModel.count({
      where: { chequera_id: id }
    });

    if (countCheques > 0 && !forzado) {
      throw new AppError({
        status: 409,
        code: 'HAS_CHEQUES',
        message:
          'Esta chequera tiene cheques asociados. ¿Desea ANULARLA de todas formas?',
        tips: [
          'Para eliminarla definitivamente, primero gestione o migre los cheques asociados.'
        ],
        details: { chequesAsociados: countCheques }
      });
    }

    if (countCheques > 0 && forzado) {
      await ChequeraModel.update({ estado: 'anulada' }, { where: { id } });

      try {
        await registrarLog(
          req,
          'chequeras',
          'editar',
          `anuló la chequera "${
            chequera.descripcion || ''
          }" (cheques asociados: ${countCheques})`,
          usuario_log_id
        );
      } catch {}

      return res.json({
        message:
          'Chequera ANULADA. Posee cheques asociados, por lo que no se elimina físicamente.',
        chequera_id: id
      });
    }

    // Sin dependencias → eliminación física
    await ChequeraModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'chequeras',
        'eliminar',
        `eliminó la chequera "${chequera.descripcion || ''}"`,
        usuario_log_id
      );
    } catch {}

    return res.json({ message: 'Chequera eliminada correctamente.' });
  } catch (err) {
    const httpErr = toHttpError(err);
    console.error('ER_Chequera_CTS:', {
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
