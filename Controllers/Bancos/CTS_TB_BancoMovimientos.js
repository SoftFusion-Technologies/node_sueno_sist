// Controllers/Bancos/CTS_TB_BancoMovimientos.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores de movimientos bancarios:
 *  - Listado con filtros/orden, KPIs y (opcional) saldo acumulado
 *  - Detalle por ID
 *  - Crear / Editar (validaciones débito/ crédito)
 *  - Eliminar (protección si referencia_tipo='cheque' salvo forzar)
 *  - Saldo / Resumen / Export CSV
 */

import db from '../../DataBase/db.js';
import { Op, literal, Transaction } from 'sequelize';

import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { BancoMovimientoModel } from '../../Models/Bancos/MD_TB_BancoMovimientos.js';
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================================================================
 * 1) Listado  GET /banco-movimientos
 *    Filtros: q (descripcion), banco_id, banco_cuenta_id, fecha_from, fecha_to,
 *             referencia_tipo, referencia_id
 *    Orden: [id, fecha, debito, credito, created_at]
 *    Opcional: includeSaldoAcumulado=true => agrega running balance (MySQL 8)
 * =======================================================================*/
export const OBRS_BancoMovimientos_CTS = async (req, res) => {
  try {
    const {
      page,
      limit,
      q,
      banco_id,
      banco_cuenta_id,
      fecha_from,
      fecha_to,
      referencia_tipo,
      referencia_id,
      orderBy,
      orderDir,
      includeSaldoAcumulado
    } = req.query || {};

    const hasParams = Object.keys(req.query || {}).length > 0;

    const movTable = BancoMovimientoModel.getTableName();
    const cuentasTable = BancoCuentaModel.getTableName();

    const where = {};
    if (q && q.trim() !== '') {
      where.descripcion = { [Op.like]: `%${q.trim()}%` };
    }
    if (banco_cuenta_id) where.banco_cuenta_id = Number(banco_cuenta_id);
    if (referencia_tipo) where.referencia_tipo = referencia_tipo;
    if (referencia_id) where.referencia_id = Number(referencia_id);

    // Filtro por banco a través de la cuenta
    const includeCuenta = banco_id
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

    if (fecha_from || fecha_to) {
      where.fecha = {};
      if (fecha_from) where.fecha[Op.gte] = fecha_from;
      if (fecha_to) where.fecha[Op.lte] = fecha_to;
    }

    const validColumns = ['id', 'fecha', 'debito', 'credito', 'created_at'];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'fecha';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // Campo saldo acumulado (window function)
    const saldoAcum = literal(`(
      SUM(\`${movTable}\`.\`credito\` - \`${movTable}\`.\`debito\`)
      OVER (PARTITION BY \`${movTable}\`.\`banco_cuenta_id\`
            ORDER BY \`${movTable}\`.\`fecha\`, \`${movTable}\`.\`id\`)
    )`);

    // SIN params → array plano
    if (!hasParams) {
      const filas = await BancoMovimientoModel.findAll({
        where,
        attributes: includeSaldoAcumulado
          ? { include: [[saldoAcum, 'saldo_acumulado']] }
          : undefined,
        order: [
          [colName, dirName],
          ['id', dirName]
        ],
        include: includeCuenta
      });
      return res.json(filas);
    }

    // CON params → paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const total = await BancoMovimientoModel.count({
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

    const rows = await BancoMovimientoModel.findAll({
      where,
      attributes: includeSaldoAcumulado
        ? { include: [[saldoAcum, 'saldo_acumulado']] }
        : undefined,
      order: [
        [colName, dirName],
        ['id', dirName]
      ],
      limit: limitNum,
      offset,
      include: includeCuenta
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
        orderDir: dirName
      }
    });
  } catch (error) {
    console.error('OBRS_BancoMovimientos_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Detalle  GET /banco-movimientos/:id
 * =======================================================================*/
export const OBR_BancoMovimiento_CTS = async (req, res) => {
  try {
    const row = await BancoMovimientoModel.findByPk(req.params.id, {
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
    if (!row)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });
    res.json(row);
  } catch (error) {
    console.error('OBR_BancoMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear  POST /banco-movimientos
 * =======================================================================*/
export const CR_BancoMovimiento_CTS = async (req, res) => {
  const body = req.body || {};
  const { usuario_log_id } = body;

  try {
    // Validar cuenta
    const cuenta = await BancoCuentaModel.findByPk(body.banco_cuenta_id, {
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }
      ]
    });
    if (!cuenta)
      return res
        .status(400)
        .json({ mensajeError: 'Cuenta bancaria inexistente' });

    // Regla: o débito o crédito > 0
    const deb = Number(body.debito || 0),
      cre = Number(body.credito || 0);
    if (!((deb > 0 && cre === 0) || (cre > 0 && deb === 0))) {
      return res
        .status(400)
        .json({ mensajeError: 'Debe consignar solo débito o crédito (>0)' });
    }

    const nuevo = await BancoMovimientoModel.create({
      banco_cuenta_id: body.banco_cuenta_id,
      fecha: body.fecha,
      descripcion: body.descripcion?.trim(),
      debito: deb,
      credito: cre,
      referencia_tipo: body.referencia_tipo || 'otro',
      referencia_id: body.referencia_id ?? null
    });

    try {
      await registrarLog(
        req,
        'banco_movimientos',
        'crear',
        `creó movimiento en "${cuenta.nombre_cuenta}" (${
          cuenta.banco?.nombre
        }): ${cre > 0 ? 'CR +' : 'DB -'}${deb || cre}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Movimiento creado correctamente', movimiento: nuevo });
  } catch (error) {
    console.error('CR_BancoMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar  PUT/PATCH /banco-movimientos/:id
 * =======================================================================*/
export const UR_BancoMovimiento_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;

  try {
    const antes = await BancoMovimientoModel.findByPk(id, {
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [{ model: BancoModel, as: 'banco' }]
        }
      ]
    });
    if (!antes)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    // Si cambia cuenta, validar
    if (
      body.banco_cuenta_id &&
      Number(body.banco_cuenta_id) !== Number(antes.banco_cuenta_id)
    ) {
      const cuenta = await BancoCuentaModel.findByPk(body.banco_cuenta_id);
      if (!cuenta)
        return res
          .status(400)
          .json({ mensajeError: 'Cuenta destino inexistente' });
    }

    // Validar débito/crédito
    const deb =
      body.debito !== undefined ? Number(body.debito) : Number(antes.debito);
    const cre =
      body.credito !== undefined ? Number(body.credito) : Number(antes.credito);
    if (!((deb > 0 && cre === 0) || (cre > 0 && deb === 0))) {
      return res
        .status(400)
        .json({ mensajeError: 'Debe consignar solo débito o crédito (>0)' });
    }

    const cambios = [];
    for (const k of [
      'banco_cuenta_id',
      'fecha',
      'descripcion',
      'debito',
      'credito',
      'referencia_tipo',
      'referencia_id'
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

    const [updated] = await BancoMovimientoModel.update(
      {
        banco_cuenta_id: body.banco_cuenta_id ?? antes.banco_cuenta_id,
        fecha: body.fecha ?? antes.fecha,
        descripcion: body.descripcion?.trim() ?? antes.descripcion,
        debito: deb,
        credito: cre,
        referencia_tipo: body.referencia_tipo ?? antes.referencia_tipo,
        referencia_id: body.referencia_id ?? antes.referencia_id
      },
      { where: { id } }
    );
    if (updated !== 1)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    const actualizado = await BancoMovimientoModel.findByPk(id);

    try {
      await registrarLog(
        req,
        'banco_movimientos',
        'editar',
        cambios.length
          ? `actualizó movimiento y ${cambios.join(', ')}`
          : 'actualizó movimiento sin cambios relevantes',
        usuario_log_id
      );
    } catch {}

    res.json({
      message: 'Movimiento actualizado correctamente',
      movimiento: actualizado
    });
  } catch (error) {
    console.error('UR_BancoMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar  DELETE /banco-movimientos/:id?forzar=true
 *    - Si referencia_tipo='cheque' => bloquear salvo ?forzar
 * =======================================================================*/
export const ER_BancoMovimiento_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const rawForzado = req.body?.forzado ?? req.query?.forzar ?? 'false';
  const forzado = [true, 'true', 1, '1'].includes(rawForzado);
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;

  try {
    const mov = await BancoMovimientoModel.findByPk(id);
    if (!mov)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    if (mov.referencia_tipo === 'cheque' && !forzado) {
      return res
        .status(409)
        .json({
          mensajeError:
            'Movimiento vinculado a CHEQUE. ¿Desea eliminarlo de todas formas?'
        });
    }

    await BancoMovimientoModel.destroy({ where: { id } });

    try {
      await registrarLog(
        req,
        'banco_movimientos',
        'eliminar',
        `eliminó movimiento #${id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Movimiento eliminado correctamente.' });
  } catch (error) {
    console.error('ER_BancoMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 6) Saldo a fecha  GET /banco-cuentas/:id/saldo?hasta=YYYY-MM-DD
 * =======================================================================*/
export const GET_SaldoCuenta_CTS = async (req, res) => {
  try {
    const cuentaId = Number(req.params.id);
    const hasta = req.query?.hasta || '9999-12-31';

    const movTable = BancoMovimientoModel.getTableName();
    const saldo = await BancoMovimientoModel.sequelize.query(
      `
      SELECT IFNULL(SUM(credito - debito), 0) AS saldo
      FROM \`${movTable}\`
      WHERE banco_cuenta_id = :cuentaId
        AND fecha <= :hasta
      `,
      { replacements: { cuentaId, hasta }, type: db.QueryTypes.SELECT }
    );

    res.json({
      banco_cuenta_id: cuentaId,
      hasta,
      saldo: Number(saldo?.[0]?.saldo || 0)
    });
  } catch (error) {
    console.error('GET_SaldoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 7) Resumen de cuenta  GET /banco-cuentas/:id/resumen?from&to
 *    Devuelve: saldo_inicial, total_debitos, total_creditos, saldo_final
 * =======================================================================*/
export const GET_ResumenCuenta_CTS = async (req, res) => {
  try {
    const cuentaId = Number(req.params.id);
    const from = req.query?.from || '1900-01-01';
    const to = req.query?.to || '9999-12-31';

    const movTable = BancoMovimientoModel.getTableName();

    const [saldoIniRow] = await db.query(
      `
      SELECT IFNULL(SUM(credito - debito), 0) AS saldo
      FROM \`${movTable}\`
      WHERE banco_cuenta_id = :cuentaId
        AND fecha < :from
      `,
      { replacements: { cuentaId, from }, type: db.QueryTypes.SELECT }
    );

    const [totRow] = await db.query(
      `
      SELECT
        IFNULL(SUM(debito), 0) AS debitos,
        IFNULL(SUM(credito), 0) AS creditos
      FROM \`${movTable}\`
      WHERE banco_cuenta_id = :cuentaId
        AND fecha BETWEEN :from AND :to
      `,
      { replacements: { cuentaId, from, to }, type: db.QueryTypes.SELECT }
    );

    const saldo_inicial = Number(saldoIniRow?.saldo || 0);
    const total_debitos = Number(totRow?.debitos || 0);
    const total_creditos = Number(totRow?.creditos || 0);
    const saldo_final = saldo_inicial + total_creditos - total_debitos;

    res.json({
      banco_cuenta_id: cuentaId,
      from,
      to,
      saldo_inicial,
      total_debitos,
      total_creditos,
      saldo_final
    });
  } catch (error) {
    console.error('GET_ResumenCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 8) Export CSV  GET /banco-movimientos/export.csv?banco_cuenta_id&from&to
 * =======================================================================*/
export const EXP_BancoMovimientos_CSV_CTS = async (req, res) => {
  try {
    const cuentaId = Number(req.query?.banco_cuenta_id);
    const from = req.query?.from || '1900-01-01';
    const to = req.query?.to || '9999-12-31';
    if (!cuentaId)
      return res
        .status(400)
        .json({ mensajeError: 'banco_cuenta_id requerido' });

    const rows = await BancoMovimientoModel.findAll({
      where: {
        banco_cuenta_id: cuentaId,
        fecha: { [Op.between]: [from, to] }
      },
      order: [
        ['fecha', 'ASC'],
        ['id', 'ASC']
      ]
    });

    const header = [
      'id',
      'fecha',
      'descripcion',
      'debito',
      'credito',
      'referencia_tipo',
      'referencia_id'
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const vals = [
        r.id,
        r.fecha,
        `"${(r.descripcion || '').replace(/"/g, '""')}"`,
        r.debito,
        r.credito,
        r.referencia_tipo || '',
        r.referencia_id || ''
      ];
      lines.push(vals.join(','));
    }
    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="movimientos_${cuentaId}_${from}_${to}.csv"`
    );
    return res.send(csv);
  } catch (error) {
    console.error('EXP_BancoMovimientos_CSV_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
