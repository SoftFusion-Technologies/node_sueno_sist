/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 24 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Endpoints de consulta de CHEQUES asociados a un PROVEEDOR:
 *  - Listado paginado/filtrable
 *  - Resumen/KPIs
 *
 * Notas:
 *  • No escribe/edita cheques, sólo lectura.
 *  • Filtra por proveedor_id tanto para cheques 'emitido' (nuestros pagos)
 *    como para 'recibido' (endosados/aplicados a ese proveedor).
 */

import db from '../../DataBase/db.js';
import { Op, literal, fn, col } from 'sequelize';

import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { ChequeraModel } from '../../Models/Cheques/MD_TB_Chequeras.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { QueryTypes } from 'sequelize';

/* =========================================================================
 * 1) Listado: GET /proveedores/:id/cheques
 *    Query:
 *      - page, limit (1..100)
 *      - q (busca en numero, beneficiario_nombre, observaciones, motivo_estado)
 *      - tipo ('emitido'|'recibido') opcional
 *      - estado (cualquiera del ENUM) opcional
 *      - fecha_from, fecha_to (filtra por fecha_emision o fecha_cobro_prevista si viene dateField='prevista')
 *      - dateField ('emision'|'vencimiento'|'prevista') por defecto 'emision'
 *      - orderBy (id, numero, monto, fecha_emision, fecha_vencimiento, fecha_cobro_prevista, created_at)
 *      - orderDir ('ASC'|'DESC')
 * =======================================================================*/
export const OBRS_Proveedor_Cheques_CTS = async (req, res) => {
  try {
    const proveedorId = Number(req.params.id);
    if (!proveedorId) {
      return res.status(400).json({ mensajeError: 'Proveedor inválido' });
    }

    const {
      page,
      limit,
      q,
      tipo,
      estado,
      fecha_from,
      fecha_to,
      dateField,
      orderBy,
      orderDir
    } = req.query || {};

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const df = (dateField || 'emision').toLowerCase();
    const dateCol =
      df === 'vencimiento'
        ? 'fecha_vencimiento'
        : df === 'prevista'
        ? 'fecha_cobro_prevista'
        : 'fecha_emision';

    const validOrder = [
      'id',
      'numero',
      'monto',
      'fecha_emision',
      'fecha_vencimiento',
      'fecha_cobro_prevista',
      'created_at'
    ];
    const ordBy = validOrder.includes(orderBy || '') ? orderBy : 'id';
    const ordDir = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'DESC';

    const qNum = q && /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;
    const qLike = q ? `%${q.trim()}%` : null;

    // Subconsulta: IDs de cheques asociados al proveedor por cualquiera de las dos vías
    const idsSQL = `
      SELECT c.id
      FROM cheques c
      WHERE c.proveedor_id = :pid
      UNION
      SELECT c2.id
      FROM cheques c2
      JOIN cheques_usos u ON u.cheque_id = c2.id
      WHERE u.proveedor_id = :pid
    `;

    // Filtros parametrizados para aplicar SOBRE el conjunto de IDs
    const filters = [];
    if (tipo) filters.push('c.tipo = :tipo');
    if (estado) filters.push('c.estado = :estado');
    if (fecha_from) filters.push(`c.\`${dateCol}\` >= :fFrom`);
    if (fecha_to) filters.push(`c.\`${dateCol}\` <= :fTo`);
    if (q) {
      filters.push(
        '(c.numero = :qNum OR c.beneficiario_nombre LIKE :qLike OR c.observaciones LIKE :qLike)'
      );
    }
    const whereExtra = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const baseSelect = `
      FROM cheques c
      LEFT JOIN bancos b            ON b.id = c.banco_id
      LEFT JOIN chequeras ch        ON ch.id = c.chequera_id
      LEFT JOIN banco_cuentas bc    ON bc.id = ch.banco_cuenta_id
      WHERE c.id IN (${idsSQL}) ${whereExtra}
    `;

    // Total para paginado
    const countSQL = `SELECT COUNT(*) AS total ${baseSelect}`;
    const countRow = await db.query(countSQL, {
      type: QueryTypes.SELECT,
      replacements: {
        pid: proveedorId,
        tipo: tipo || null,
        estado: estado || null,
        fFrom: fecha_from || null,
        fTo: fecha_to || null,
        qNum: qNum,
        qLike: qLike
      }
    });
    const total = Number(countRow?.[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(total / limitNum), 1);

    // Page rows
    const rowsSQL = `
      SELECT
        c.*,
        b.nombre   AS banco_nombre,
        ch.id      AS chequera_id,
        ch.descripcion AS chequera_descripcion,
        bc.id      AS cuenta_id,
        bc.nombre_cuenta,
        bc.moneda,
        bc.banco_id AS cuenta_banco_id
      ${baseSelect}
      ORDER BY ${ordBy} ${ordDir}
      LIMIT :limit OFFSET :offset
    `;
    const rows = await db.query(rowsSQL, {
      type: QueryTypes.SELECT,
      replacements: {
        pid: proveedorId,
        tipo: tipo || null,
        estado: estado || null,
        fFrom: fecha_from || null,
        fTo: fecha_to || null,
        qNum: qNum,
        qLike: qLike,
        limit: limitNum,
        offset
      }
    });

    return res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        orderBy: ordBy,
        orderDir: ordDir
      }
    });
  } catch (error) {
    console.error('OBRS_Proveedor_Cheques_CTS (UNION):', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
/* =========================================================================
 * 2) Resumen/KPIs: GET /proveedores/:id/cheques/resumen
 *    Devuelve:
 *      - totalCheques, totalMonto
 *      - porEstado: [{estado, cantidad, monto}]
 *      - porTipo: [{tipo, cantidad, monto}]
 * =======================================================================*/
export const GET_Proveedor_Cheques_Resumen_CTS = async (req, res) => {
  try {
    const proveedorId = Number(req.params.id);
    if (!proveedorId) {
      return res.status(400).json({ mensajeError: 'Proveedor inválido' });
    }

    const idsSQL = `
      SELECT c.id
      FROM cheques c
      WHERE c.proveedor_id = :pid
      UNION
      SELECT c2.id
      FROM cheques c2
      JOIN cheques_usos u ON u.cheque_id = c2.id
      WHERE u.proveedor_id = :pid
    `;

    const totalSQL = `
      SELECT COUNT(*) AS totalCheques, COALESCE(SUM(c.monto),0) AS totalMonto
      FROM cheques c
      WHERE c.id IN (${idsSQL})
    `;
    const byEstadoSQL = `
      SELECT c.estado, COUNT(*) AS cantidad, COALESCE(SUM(c.monto),0) AS monto
      FROM cheques c
      WHERE c.id IN (${idsSQL})
      GROUP BY c.estado
      ORDER BY c.estado
    `;
    const byTipoSQL = `
      SELECT c.tipo, COUNT(*) AS cantidad, COALESCE(SUM(c.monto),0) AS monto
      FROM cheques c
      WHERE c.id IN (${idsSQL})
      GROUP BY c.tipo
      ORDER BY c.tipo
    `;

    const [aggTotal, aggEstado, aggTipo] = await Promise.all([
      db.query(totalSQL, {
        type: db.QueryTypes.SELECT,
        replacements: { pid: proveedorId }
      }),
      db.query(byEstadoSQL, {
        type: db.QueryTypes.SELECT,
        replacements: { pid: proveedorId }
      }),
      db.query(byTipoSQL, {
        type: db.QueryTypes.SELECT,
        replacements: { pid: proveedorId }
      })
    ]);

    const resumen = {
      totalCheques: Number(aggTotal?.[0]?.totalCheques || 0),
      totalMonto: Number(aggTotal?.[0]?.totalMonto || 0),
      porEstado: (aggEstado || []).map((r) => ({
        estado: r.estado,
        cantidad: Number(r.cantidad || 0),
        monto: Number(r.monto || 0)
      })),
      porTipo: (aggTipo || []).map((r) => ({
        tipo: r.tipo,
        cantidad: Number(r.cantidad || 0),
        monto: Number(r.monto || 0)
      }))
    };

    return res.json(resumen);
  } catch (error) {
    console.error('GET_Proveedor_Cheques_Resumen_CTS (UNION):', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

