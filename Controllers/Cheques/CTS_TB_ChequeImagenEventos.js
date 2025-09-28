// Controllers/Cheques/CTS_TB_ChequeImagenEventos.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Lectura y administración de eventos de imágenes de cheques:
 *  - Listar con filtros (imagen, cheque, evento, fecha)
 *  - Ver detalle
 *  - Crear evento manual (opcional)
 *  - Eliminar evento (administrativo)
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { ChequeImagenEventoModel } from '../../Models/Cheques/MD_TB_ChequeImagenEventos.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================================================================
 * 1) Listar  GET /cheques/:cheque_id/imagenes/eventos
 *    query: imagen_id?, evento?=upload|download|delete, from?, to?, page?, limit?
 * =======================================================================*/
export const OBRS_ChequeImagenEventos_CTS = async (req, res) => {
  try {
    const cheque_id = Number(req.params.cheque_id);
    const { imagen_id, evento, from, to, page, limit, orderDir } =
      req.query || {};

    const where = { cheque_id };
    if (imagen_id) where.imagen_id = Number(imagen_id);
    if (evento && ['upload', 'download', 'delete'].includes(evento))
      where.evento = evento;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'DESC';

    const hasParams = Object.keys(req.query || {}).length > 0;
    if (!hasParams) {
      const rows = await ChequeImagenEventoModel.findAll({
        where,
        order: [
          ['created_at', dirName],
          ['id', 'DESC']
        ]
      });
      return res.json(rows);
    }

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const total = await ChequeImagenEventoModel.count({ where });
    const rows = await ChequeImagenEventoModel.findAll({
      where,
      order: [
        ['created_at', dirName],
        ['id', 'DESC']
      ],
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
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('OBRS_ChequeImagenEventos_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Detalle  GET /cheques/:cheque_id/imagenes/eventos/:id
 * =======================================================================*/
export const OBR_ChequeImagenEvento_CTS = async (req, res) => {
  try {
    const row = await ChequeImagenEventoModel.findOne({
      where: {
        id: Number(req.params.id),
        cheque_id: Number(req.params.cheque_id)
      }
    });
    if (!row)
      return res.status(404).json({ mensajeError: 'Evento no encontrado' });
    res.json(row);
  } catch (error) {
    console.error('OBR_ChequeImagenEvento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear (manual/administrativo)  POST /cheques/:cheque_id/imagenes/eventos
 *    body: { imagen_id, evento: upload|download|delete, detalle?, usuario_log_id? }
 * =======================================================================*/
export const CR_ChequeImagenEvento_CTS = async (req, res) => {
  const cheque_id = Number(req.params.cheque_id);
  const { imagen_id, evento, detalle, usuario_log_id } = req.body || {};
  try {
    if (!imagen_id)
      return res.status(400).json({ mensajeError: 'imagen_id es requerido' });
    if (!['upload', 'download', 'delete'].includes(evento)) {
      return res
        .status(400)
        .json({ mensajeError: 'evento inválido (upload|download|delete)' });
    }

    const row = await ChequeImagenEventoModel.create({
      imagen_id: Number(imagen_id),
      cheque_id,
      evento,
      user_id: usuario_log_id || null,
      ip_addr: null,
      user_agent: null,
      detalle: detalle?.toString() || null
    });

    try {
      await registrarLog(
        req,
        'cheque_imagen_eventos',
        'crear',
        `registró evento ${evento} (imagen_id=${imagen_id})`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Evento registrado', evento: row });
  } catch (error) {
    console.error('CR_ChequeImagenEvento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Eliminar (administrativo)  DELETE /cheques/:cheque_id/imagenes/eventos/:id
 * =======================================================================*/
export const ER_ChequeImagenEvento_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;
  try {
    const row = await ChequeImagenEventoModel.findByPk(id);
    if (!row)
      return res.status(404).json({ mensajeError: 'Evento no encontrado' });

    await ChequeImagenEventoModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'cheque_imagen_eventos',
        'eliminar',
        `eliminó evento #${id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Evento eliminado correctamente.' });
  } catch (error) {
    console.error('ER_ChequeImagenEvento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
