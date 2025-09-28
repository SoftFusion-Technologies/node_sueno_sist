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

/* =========================================================================
 * Helpers de validación
 * =======================================================================*/
const validarRangoChequera = (desde, hasta, proximo) => {
  const d = BigInt(desde ?? 0);
  const h = BigInt(hasta ?? 0);
  const p = BigInt(proximo ?? 0);
  if (d > h) throw new Error('nro_desde no puede ser mayor que nro_hasta');
  if (p < d || p > h) throw new Error('proximo_nro fuera del rango definido');
};

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
    usuario_log_id
  } = req.body || {};

  try {
    const cuenta = await BancoCuentaModel.findByPk(banco_cuenta_id, {
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });
    if (!cuenta) {
      return res
        .status(400)
        .json({ mensajeError: 'Cuenta bancaria inexistente' });
    }

    const prox = proximo_nro ?? nro_desde;
    validarRangoChequera(nro_desde, nro_hasta, prox);

    // Evitar superposición de rangos en la misma cuenta
    const overlap = await existeSuperposicion(
      banco_cuenta_id,
      nro_desde,
      nro_hasta
    );
    if (overlap) {
      return res.status(409).json({
        mensajeError:
          'Existe otra chequera con rango que se superpone en esta cuenta bancaria'
      });
    }

    const nueva = await ChequeraModel.create({
      banco_cuenta_id,
      descripcion: descripcion?.trim(),
      nro_desde,
      nro_hasta,
      proximo_nro: prox,
      estado: estado || 'activa'
    });

    try {
      await registrarLog(
        req,
        'chequeras',
        'crear',
        `creó la chequera "${nueva.descripcion}" en la cuenta "${cuenta.nombre_cuenta}" del banco "${cuenta.banco?.nombre}" (rango ${nro_desde}-${nro_hasta})`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      message: 'Chequera creada correctamente',
      chequera: nueva
    });
  } catch (error) {
    console.error('CR_Chequera_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar chequera  PUT/PATCH /chequeras/:id
 *    - Valida cambios de rango y superposición
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
      return res.status(404).json({ mensajeError: 'Chequera no encontrada' });
    }

    // Valores "nuevos" tentativos
    const banco_cuenta_id = body.banco_cuenta_id ?? antes.banco_cuenta_id;
    const nro_desde = body.nro_desde ?? antes.nro_desde;
    const nro_hasta = body.nro_hasta ?? antes.nro_hasta;
    const proximo_nro = body.proximo_nro ?? antes.proximo_nro;
    const descripcion = body.descripcion ?? antes.descripcion;
    const estado = body.estado ?? antes.estado;

    // Validaciones de rango y superposición
    validarRangoChequera(nro_desde, nro_hasta, proximo_nro);

    // Si cambia la cuenta o cambia el rango, chequear solapamiento
    if (
      Number(banco_cuenta_id) !== Number(antes.banco_cuenta_id) ||
      Number(nro_desde) !== Number(antes.nro_desde) ||
      Number(nro_hasta) !== Number(antes.nro_hasta)
    ) {
      const cuentaNueva = await BancoCuentaModel.findByPk(banco_cuenta_id);
      if (!cuentaNueva) {
        return res
          .status(400)
          .json({ mensajeError: 'Cuenta bancaria destino inexistente' });
      }
      const overlap = await existeSuperposicion(
        banco_cuenta_id,
        nro_desde,
        nro_hasta,
        id
      );
      if (overlap) {
        return res.status(409).json({
          mensajeError:
            'Existe otra chequera con rango que se superpone en esta cuenta bancaria'
        });
      }
    }

    // Auditar cambios
    const camposAuditar = [
      'banco_cuenta_id',
      'descripcion',
      'nro_desde',
      'nro_hasta',
      'proximo_nro',
      'estado'
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

    const [updated] = await ChequeraModel.update(
      {
        banco_cuenta_id,
        descripcion,
        nro_desde,
        nro_hasta,
        proximo_nro,
        estado
      },
      { where: { id } }
    );

    if (updated !== 1) {
      return res.status(404).json({ mensajeError: 'Chequera no encontrada' });
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
      const desc =
        cambios.length > 0
          ? `actualizó la chequera "${antes.descripcion}" y ${cambios.join(
              ', '
            )}`
          : `actualizó la chequera "${antes.descripcion}" sin cambios relevantes`;
      await registrarLog(req, 'chequeras', 'editar', desc, usuario_log_id);
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      message: 'Chequera actualizada correctamente',
      chequera: actualizada
    });
  } catch (error) {
    console.error('UR_Chequera_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Anular/Eliminar chequera  DELETE /chequeras/:id?forzar=true
 *    Reglas:
 *      - Si hay cheques asociados => bloquear eliminación dura.
 *      - ?forzar=true => estado='anulada' (no cascada destructiva).
 * =======================================================================*/
export const ER_Chequera_CTS = async (req, res) => {
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
      return res.status(404).json({ mensajeError: 'Chequera no encontrada' });
    }

    const countCheques = await ChequeModel.count({
      where: { chequera_id: id }
    });

    if (countCheques > 0 && !forzado) {
      return res.status(409).json({
        mensajeError:
          'Esta CHEQUERA tiene cheques asociados. ¿Desea ANULARLA de todas formas?',
        detalle: { chequesAsociados: countCheques }
      });
    }

    if (countCheques > 0 && forzado) {
      await ChequeraModel.update({ estado: 'anulada' }, { where: { id } });

      try {
        await registrarLog(
          req,
          'chequeras',
          'editar',
          `anuló la chequera "${chequera.descripcion}" (cheques asociados: ${countCheques})`,
          usuario_log_id
        );
      } catch (logErr) {
        console.warn('registrarLog falló:', logErr?.message || logErr);
      }

      return res.json({
        message:
          'Chequera ANULADA (posee dependencias). Para eliminarla definitivamente, primero gestione sus cheques asociados.'
      });
    }

    // Sin dependencias => eliminación física
    await ChequeraModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'chequeras',
        'eliminar',
        `eliminó la chequera "${chequera.descripcion}"`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Chequera eliminada correctamente.' });
  } catch (error) {
    console.error('ER_Chequera_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
