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

    // Filtros base
    const where = { proveedor_id: proveedorId };
    if (tipo && ['emitido', 'recibido'].includes(tipo)) {
      where.tipo = tipo;
    }
    if (estado) {
      where.estado = estado;
    }

    if (q && q.trim() !== '') {
      const like = { [Op.like]: `%${q.trim()}%` };
      where[Op.or] = [
        { numero: isFinite(q) ? Number(q) : -999999999 }, // match exact si es nro
        { beneficiario_nombre: like },
        { observaciones: like },
        { motivo_estado: like }
      ];
    }

    // Filtro por fechas
    const df = (dateField || 'emision').toLowerCase();
    let dateCol = 'fecha_emision';
    if (df === 'vencimiento') dateCol = 'fecha_vencimiento';
    if (df === 'prevista') dateCol = 'fecha_cobro_prevista';

    if (fecha_from || fecha_to) {
      where[dateCol] = {};
      if (fecha_from) where[dateCol][Op.gte] = fecha_from;
      if (fecha_to) where[dateCol][Op.lte] = fecha_to;
    }

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

    const include = [
      { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] },
      {
        model: ChequeraModel,
        as: 'chequera',
        attributes: ['id', 'descripcion', 'banco_cuenta_id'],
        include: [
          {
            model: BancoCuentaModel,
            as: 'cuenta',
            attributes: ['id', 'nombre_cuenta', 'moneda', 'banco_id']
          }
        ]
      }
    ];

    const total = await ChequeModel.count({ where });
    const rows = await ChequeModel.findAll({
      where,
      include,
      order: [[ordBy, ordDir]],
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
        orderBy: ordBy,
        orderDir: ordDir
      }
    });
  } catch (error) {
    console.error('OBRS_Proveedor_Cheques_CTS:', error);
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

    const table = ChequeModel.getTableName();

    const [aggEstado, aggTipo, aggTotal] = await Promise.all([
      // Por estado
      ChequeModel.sequelize.query(
        `
        SELECT estado, COUNT(*) AS cantidad, SUM(monto) AS monto
        FROM \`${table}\`
        WHERE proveedor_id = :pid
        GROUP BY estado
        ORDER BY estado;
        `,
        { replacements: { pid: proveedorId }, type: db.QueryTypes.SELECT }
      ),
      // Por tipo
      ChequeModel.sequelize.query(
        `
        SELECT tipo, COUNT(*) AS cantidad, SUM(monto) AS monto
        FROM \`${table}\`
        WHERE proveedor_id = :pid
        GROUP BY tipo
        ORDER BY tipo;
        `,
        { replacements: { pid: proveedorId }, type: db.QueryTypes.SELECT }
      ),
      // Totales
      ChequeModel.sequelize.query(
        `
        SELECT COUNT(*) AS totalCheques, COALESCE(SUM(monto),0) AS totalMonto
        FROM \`${table}\`
        WHERE proveedor_id = :pid;
        `,
        { replacements: { pid: proveedorId }, type: db.QueryTypes.SELECT }
      )
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
    console.error('GET_Proveedor_Cheques_Resumen_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
