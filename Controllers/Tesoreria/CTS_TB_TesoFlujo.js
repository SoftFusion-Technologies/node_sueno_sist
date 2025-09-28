// Controllers/Tesoreria/CTS_TB_TesoFlujo.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores de Tesorería (proyección de flujo):
 *  - Listado / Detalle / Crear / Editar / Eliminar
 *  - Proyección agregada por día (ingresos, egresos, neto, acumulado)
 *  - Export CSV
 */

import db from '../../DataBase/db.js';
import { Op, literal } from 'sequelize';
import { TesoFlujoModel } from '../../Models/Tesoreria/MD_TB_TesoFlujo.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================================================================
 * 1) Listado  GET /teso-flujo
 *    Filtros: fecha_from, fecha_to, signo, origen_tipo, origen_id, q (descripcion)
 *    Orden: [fecha, id]
 * =======================================================================*/
export const OBRS_TesoFlujo_CTS = async (req, res) => {
  try {
    const {
      page,
      limit,
      fecha_from,
      fecha_to,
      signo,
      origen_tipo,
      origen_id,
      q,
      orderDir
    } = req.query || {};

    const hasParams = Object.keys(req.query || {}).length > 0;

    const where = {};
    if (fecha_from || fecha_to) {
      where.fecha = {};
      if (fecha_from) where.fecha[Op.gte] = fecha_from;
      if (fecha_to) where.fecha[Op.lte] = fecha_to;
    }
    if (signo && ['ingreso', 'egreso'].includes(signo)) where.signo = signo;
    if (origen_tipo) where.origen_tipo = origen_tipo;
    if (origen_id) where.origen_id = Number(origen_id);
    if (q && q.trim() !== '')
      where.descripcion = { [Op.like]: `%${q.trim()}%` };

    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    if (!hasParams) {
      const filas = await TesoFlujoModel.findAll({
        where,
        order: [
          ['fecha', dirName],
          ['id', dirName]
        ]
      });
      return res.json(filas);
    }

    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 500);
    const offset = (pageNum - 1) * limitNum;

    const total = await TesoFlujoModel.count({ where });
    const rows = await TesoFlujoModel.findAll({
      where,
      order: [
        ['fecha', dirName],
        ['id', dirName]
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
    console.error('OBRS_TesoFlujo_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Detalle  GET /teso-flujo/:id
 * =======================================================================*/
export const OBR_TesoFlujo_CTS = async (req, res) => {
  try {
    const row = await TesoFlujoModel.findByPk(req.params.id);
    if (!row)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });
    res.json(row);
  } catch (error) {
    console.error('OBR_TesoFlujo_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear  POST /teso-flujo
 * =======================================================================*/
export const CR_TesoFlujo_CTS = async (req, res) => {
  const body = req.body || {};
  const { usuario_log_id } = body;
  try {
    if (!['ingreso', 'egreso'].includes(body.signo)) {
      return res
        .status(400)
        .json({ mensajeError: 'signo inválido (ingreso|egreso)' });
    }
    if (!body.fecha) {
      return res.status(400).json({ mensajeError: 'fecha es requerida' });
    }
    if (!(Number(body.monto) > 0)) {
      return res.status(400).json({ mensajeError: 'monto debe ser > 0' });
    }

    const nuevo = await TesoFlujoModel.create({
      origen_tipo: body.origen_tipo || 'otro',
      origen_id: body.origen_id ?? 0,
      fecha: body.fecha,
      signo: body.signo,
      monto: body.monto,
      descripcion: body.descripcion?.trim() || null
    });

    try {
      await registrarLog(
        req,
        'teso_flujo',
        'crear',
        `creó proyección ${body.signo} $${body.monto} para ${body.fecha}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Proyección creada correctamente', flujo: nuevo });
  } catch (error) {
    console.error('CR_TesoFlujo_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar  PUT/PATCH /teso-flujo/:id
 * =======================================================================*/
export const UR_TesoFlujo_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;
  try {
    const antes = await TesoFlujoModel.findByPk(id);
    if (!antes)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });

    if (body.signo && !['ingreso', 'egreso'].includes(body.signo)) {
      return res
        .status(400)
        .json({ mensajeError: 'signo inválido (ingreso|egreso)' });
    }
    if (body.monto !== undefined && !(Number(body.monto) > 0)) {
      return res.status(400).json({ mensajeError: 'monto debe ser > 0' });
    }

    const cambios = [];
    for (const k of [
      'origen_tipo',
      'origen_id',
      'fecha',
      'signo',
      'monto',
      'descripcion'
    ]) {
      if (
        Object.prototype.hasOwnProperty.call(body, k) &&
        (body[k]?.toString() ?? null) !== (antes[k]?.toString() ?? null)
      ) {
        cambios.push(
          `cambió "${k}" de "${antes[k] ?? ''}" a "${body[k] ?? ''}"`
        );
      }
    }

    const [updated] = await TesoFlujoModel.update(
      {
        origen_tipo: body.origen_tipo ?? antes.origen_tipo,
        origen_id: body.origen_id ?? antes.origen_id,
        fecha: body.fecha ?? antes.fecha,
        signo: body.signo ?? antes.signo,
        monto: body.monto ?? antes.monto,
        descripcion: body.descripcion?.trim() ?? antes.descripcion
      },
      { where: { id } }
    );
    if (updated !== 1)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });

    const actual = await TesoFlujoModel.findByPk(id);

    try {
      await registrarLog(
        req,
        'teso_flujo',
        'editar',
        cambios.length
          ? `actualizó proyección y ${cambios.join(', ')}`
          : 'actualizó proyección sin cambios relevantes',
        usuario_log_id
      );
    } catch {}

    res.json({
      message: 'Proyección actualizada correctamente',
      flujo: actual
    });
  } catch (error) {
    console.error('UR_TesoFlujo_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar  DELETE /teso-flujo/:id
 * =======================================================================*/
export const ER_TesoFlujo_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;

  try {
    const row = await TesoFlujoModel.findByPk(id);
    if (!row)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });

    await TesoFlujoModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'teso_flujo',
        'eliminar',
        `eliminó proyección #${id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Proyección eliminada correctamente.' });
  } catch (error) {
    console.error('ER_TesoFlujo_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 6) Proyección agregada  GET /teso-flujo/proyeccion?from&to
 *    Devuelve por día: ingresos, egresos, neto y acumulado
 * =======================================================================*/
export const GET_TesoFlujo_Proyeccion_CTS = async (req, res) => {
  try {
    const from = req.query?.from || '1900-01-01';
    const to = req.query?.to || '9999-12-31';

    const table = TesoFlujoModel.getTableName();

    const rows = await TesoFlujoModel.sequelize.query(
      `
      SELECT
        fecha,
        SUM(CASE WHEN signo='ingreso' THEN monto ELSE 0 END) AS ingresos,
        SUM(CASE WHEN signo='egreso'  THEN monto ELSE 0 END) AS egresos,
        SUM(CASE WHEN signo='ingreso' THEN monto ELSE -monto END) AS neto
      FROM \`${table}\`
      WHERE fecha BETWEEN :from AND :to
      GROUP BY fecha
      ORDER BY fecha ASC;
      `,
      { replacements: { from, to }, type: db.QueryTypes.SELECT }
    );

    // acumulado
    let acc = 0;
    const data = rows.map((r) => {
      acc += Number(r.neto);
      return {
        fecha: r.fecha,
        ingresos: Number(r.ingresos),
        egresos: Number(r.egresos),
        neto: Number(r.neto),
        acumulado: acc
      };
    });

    res.json({ from, to, data });
  } catch (error) {
    console.error('GET_TesoFlujo_Proyeccion_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 7) Export CSV  GET /teso-flujo/export.csv?from&to&signo
 * =======================================================================*/
export const EXP_TesoFlujo_CSV_CTS = async (req, res) => {
  try {
    const from = req.query?.from || '1900-01-01';
    const to = req.query?.to || '9999-12-31';
    const signo = req.query?.signo;

    const where = {
      fecha: { [Op.between]: [from, to] }
    };
    if (signo && ['ingreso', 'egreso'].includes(signo)) where.signo = signo;

    const rows = await TesoFlujoModel.findAll({
      where,
      order: [
        ['fecha', 'ASC'],
        ['id', 'ASC']
      ]
    });

    const header = [
      'id',
      'fecha',
      'signo',
      'monto',
      'origen_tipo',
      'origen_id',
      'descripcion'
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const vals = [
        r.id,
        r.fecha,
        r.signo,
        r.monto,
        r.origen_tipo || '',
        r.origen_id || 0,
        `"${(r.descripcion || '').replace(/"/g, '""')}"`
      ];
      lines.push(vals.join(','));
    }
    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="teso_flujo_${from}_${to}${
        signo ? `_${signo}` : ''
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error('EXP_TesoFlujo_CSV_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
