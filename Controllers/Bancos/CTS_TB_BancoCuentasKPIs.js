// Controllers/Bancos/CTS_TB_BancoCuentasKPIs.js
/*
 * Programador: Benjamin Orellana
 * Fecha: 21/09/2025
 * Descripción:
 *   - GET_SaldoCuenta_CTS : saldo acumulado hasta una fecha
 *   - GET_ResumenCuenta_CTS: resumen del período + serie diaria/mensual con acumulado
 */

import db from '../../DataBase/db.js';
import { Op, QueryTypes } from 'sequelize';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { BancoMovimientoModel } from '../../Models/Bancos/MD_TB_BancoMovimientos.js';

// normaliza "YYYY-MM-DD" => fin de día (23:59:59)
const endOfDay = (s) => {
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T23:59:59`);
  return new Date(s);
};
// start of day para "from"
const startOfDay = (s) => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  return new Date(s);
};

/* =========================================================================
 * GET /banco-cuentas/:id/saldo?hasta=YYYY-MM-DD
 * Devuelve: { banco_cuenta_id, hasta, debitos, creditos, saldo }
 * =======================================================================*/
export const GET_SaldoCuenta_CTS = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hasta = endOfDay(req.query?.hasta);

    const cuenta = await BancoCuentaModel.findByPk(id);
    if (!cuenta)
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });

    const where = { banco_cuenta_id: id, fecha: { [Op.lte]: hasta } };

    const [row] = await BancoMovimientoModel.findAll({
      where,
      attributes: [
        [db.fn('COALESCE', db.fn('SUM', db.col('debito')), 0), 'debitos'],
        [db.fn('COALESCE', db.fn('SUM', db.col('credito')), 0), 'creditos']
      ],
      raw: true
    });

    const debitos = Number(row?.debitos || 0);
    const creditos = Number(row?.creditos || 0);
    const saldo = creditos - debitos;

    return res.json({
      banco_cuenta_id: id,
      hasta: hasta.toISOString(),
      debitos,
      creditos,
      saldo
    });
  } catch (error) {
    console.error('GET_SaldoCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * GET /banco-cuentas/:id/resumen?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|month
 * Devuelve:
 * {
 *   cuenta: { id, nombre_cuenta, banco_id },
 *   periodo: { from, to },
 *   totales: { saldo_inicial, debitos, creditos, saldo_final },
 *   series: [ { bucket, debitos, creditos, neto, acumulado } ]
 * }
 * =======================================================================*/
export const GET_ResumenCuenta_CTS = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const group = (req.query?.group || 'day').toLowerCase(); // 'day' | 'month'
    const from = startOfDay(req.query?.from);
    const to = endOfDay(req.query?.to);

    const cuenta = await BancoCuentaModel.findByPk(id, { raw: true });
    if (!cuenta)
      return res
        .status(404)
        .json({ mensajeError: 'Cuenta bancaria no encontrada' });

    if (!from || !to) {
      return res.status(400).json({
        mensajeError: 'Parámetros from y to son requeridos (YYYY-MM-DD)'
      });
    }

    // 1) Saldo inicial (antes de "from")
    const [iniRow] = await db.query(
      `SELECT
         COALESCE(SUM(credito),0) AS creditos,
         COALESCE(SUM(debito),0)  AS debitos
       FROM banco_movimientos
       WHERE banco_cuenta_id = :id AND fecha < :from`,
      { type: QueryTypes.SELECT, replacements: { id, from } }
    );
    const saldo_inicial = Number(iniRow.creditos) - Number(iniRow.debitos);

    // 2) Totales dentro del período
    const [perRow] = await db.query(
      `SELECT
         COALESCE(SUM(credito),0) AS creditos,
         COALESCE(SUM(debito),0)  AS debitos
       FROM banco_movimientos
       WHERE banco_cuenta_id = :id AND fecha >= :from AND fecha <= :to`,
      { type: QueryTypes.SELECT, replacements: { id, from, to } }
    );
    const debitos = Number(perRow.debitos);
    const creditos = Number(perRow.creditos);
    const saldo_final = saldo_inicial + creditos - debitos;

    // 3) Serie agrupada (día o mes)
    const bucketExpr =
      group === 'month'
        ? "DATE_FORMAT(fecha, '%Y-%m-01')" // primer día del mes
        : 'DATE(fecha)'; // día

    const series = await db.query(
      `SELECT
         ${bucketExpr} AS bucket,
         COALESCE(SUM(credito),0) AS creditos,
         COALESCE(SUM(debito),0)  AS debitos
       FROM banco_movimientos
       WHERE banco_cuenta_id = :id AND fecha >= :from AND fecha <= :to
       GROUP BY bucket
       ORDER BY bucket ASC`,
      { type: QueryTypes.SELECT, replacements: { id, from, to } }
    );

    // 4) Neto y acumulado (arranca en saldo_inicial)
    let acumulado = saldo_inicial;
    const seriesOut = series.map((r) => {
      const deb = Number(r.debitos || 0);
      const cre = Number(r.creditos || 0);
      const neto = cre - deb;
      acumulado += neto;
      return {
        bucket: r.bucket,
        debitos: deb,
        creditos: cre,
        neto,
        acumulado
      };
    });

    return res.json({
      cuenta: {
        id: cuenta.id,
        nombre_cuenta: cuenta.nombre_cuenta,
        banco_id: cuenta.banco_id
      },
      periodo: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        group
      },
      totales: { saldo_inicial, debitos, creditos, saldo_final },
      series: seriesOut
    });
  } catch (error) {
    console.error('GET_ResumenCuenta_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
