// Controllers/Analiticas/ResumenCajaController.js
import db from '../../DataBase/db.js'; // instancia Sequelize
const DIA_TZ = 'America/Argentina/Tucuman'; // día local

// Utilidad: normaliza y arma rangos de fecha local
function buildDateRange({ desde, hasta }) {
  // desde/hasta esperados en ISO local (ej. '2025-10-23')
  // Convención: [desde 00:00:00, hasta + 1 día 00:00:00)
  const d = desde ? new Date(`${desde}T00:00:00`) : null;
  const h = hasta ? new Date(`${hasta}T00:00:00`) : null;
  return { desde: d, hasta: h };
}

// ============================
// GET /resumen-caja
// - Por caja (caja_id) o por rango (local_id + desde/hasta)
// - Devuelve:
//   * encabezado (ventas): cantidad_ventas, total_cobrado
//   * totalesPorMedio (ventas por medios)
//   * movimientosCaja: ingresos_totales, egresos_totales   (TODOS los movimientos de caja)
//   * movimientosManuales: ingresos_manuales, egresos_manuales (opcional, NO ventas)
//   * reconciliacion: total_por_medios vs total_de_ventas (ventas)
//   * diagnostico: compara ingresos_totales por movimientos vs ventas+manuales
// ============================
// ============================
// GET /resumen-caja (FIX ingresos_totales = ventas + manuales)
// ============================
export const getResumenCaja = async (req, res) => {
  try {
    const { caja_id, local_id } = req.query;
    let { desde, hasta } = req.query;

    const buildDateRange = ({ desde, hasta }) => ({
      desde: new Date(`${desde}T00:00:00`),
      hasta: new Date(`${hasta}T00:00:00`)
    });

    if (!caja_id && !local_id) {
      return res.status(400).json({ error: 'Falta local_id o caja_id' });
    }

    // ---------------- POR CAJA ----------------
    if (caja_id) {
      const [caja] = await db.query(
        `
        SELECT id, local_id, fecha_apertura, COALESCE(fecha_cierre, NOW()) AS fecha_cierre,
               saldo_inicial, saldo_final
        FROM caja
        WHERE id = :caja_id
        LIMIT 1
        `,
        { replacements: { caja_id }, type: db.QueryTypes.SELECT }
      );
      if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });

      const paramsVentas = {
        cLocal: caja.local_id,
        fApertura: caja.fecha_apertura,
        fCierre: caja.fecha_cierre
      };

      // Ventas por medio
      const totalesPorMedio = await db.query(
        `
        SELECT mp.id AS medio_pago_id, mp.nombre AS medio_pago,
               ROUND(SUM(COALESCE(vm.monto,0)), 2) AS total_medio
        FROM ventas v
        JOIN venta_medios_pago vm ON vm.venta_id = v.id
        JOIN medios_pago mp ON mp.id = vm.medio_pago_id
        WHERE v.estado = 'confirmada'
          AND v.local_id = :cLocal
          AND v.fecha >= :fApertura
          AND v.fecha <= :fCierre
        GROUP BY mp.id, mp.nombre
        ORDER BY mp.orden, mp.nombre
        `,
        { replacements: paramsVentas, type: db.QueryTypes.SELECT }
      );

      // Encabezado ventas
      const [encabezado] = await db.query(
        `
        SELECT COUNT(DISTINCT v.id) AS cantidad_ventas,
               ROUND(SUM(COALESCE(vm.monto,0)), 2) AS total_cobrado
        FROM ventas v
        JOIN venta_medios_pago vm ON vm.venta_id = v.id
        WHERE v.estado='confirmada'
          AND v.local_id = :cLocal
          AND v.fecha >= :fApertura
          AND v.fecha <= :fCierre
        `,
        { replacements: paramsVentas, type: db.QueryTypes.SELECT }
      );

      // Ingresos de ventas (explícito)
      const [ingVentasRow] = await db.query(
        `
        SELECT ROUND(SUM(COALESCE(vm.monto,0)),2) AS ingresos_ventas
        FROM ventas v
        JOIN venta_medios_pago vm ON vm.venta_id = v.id
        WHERE v.estado='confirmada'
          AND v.local_id = :cLocal
          AND v.fecha >= :fApertura
          AND v.fecha <= :fCierre
        `,
        { replacements: paramsVentas, type: db.QueryTypes.SELECT }
      );

      // Egresos totales desde movimientos (solo egresos)
      const [egresosMov] = await db.query(
        `
        SELECT 
          ROUND(SUM(CASE WHEN m.tipo='egreso' THEN COALESCE(m.monto,0) ELSE 0 END),2) AS egresos_totales
        FROM movimientos_caja m
        WHERE m.caja_id = :cajaId
        `,
        { replacements: { cajaId: caja.id }, type: db.QueryTypes.SELECT }
      );

      // Manuales (NO ventas) — referencia puede ser NULL/no numérica; si no mapea a venta, es manual
      const [movMan] = await db.query(
        `
        SELECT 
          ROUND(SUM(
            CASE 
              WHEN m.tipo='ingreso'
                   AND vm2.venta_id IS NULL
                   AND UPPER(COALESCE(m.descripcion,'')) NOT LIKE 'VENTA%'
              THEN COALESCE(m.monto,0) 
              ELSE 0 
            END
          ), 2) AS ingresos_manuales,
          ROUND(SUM(
            CASE WHEN m.tipo='egreso' THEN COALESCE(m.monto,0) ELSE 0 END
          ), 2) AS egresos_manuales
        FROM movimientos_caja m
        LEFT JOIN venta_medios_pago vm2
          ON vm2.venta_id = CASE
                              WHEN m.referencia REGEXP '^[0-9]+$'
                                THEN CAST(m.referencia AS UNSIGNED)
                              ELSE NULL
                            END
        WHERE m.caja_id = :cajaId
        `,
        { replacements: { cajaId: caja.id }, type: db.QueryTypes.SELECT }
      );

      // Reconciliación ventas
      const [recon] = await db.query(
        `
        SELECT 
          ROUND(SUM(COALESCE(vm.monto,0)),2) AS total_por_medios,
          ROUND(SUM(COALESCE(v.total,0)),2)  AS total_de_ventas
        FROM ventas v
        JOIN venta_medios_pago vm ON vm.venta_id = v.id
        WHERE v.estado='confirmada'
          AND v.local_id = :cLocal
          AND v.fecha >= :fApertura
          AND v.fecha <= :fCierre
        `,
        { replacements: paramsVentas, type: db.QueryTypes.SELECT }
      );

      // Cálculos finales
      const ingresos_ventas = Number(ingVentasRow?.ingresos_ventas || 0);
      const ingresos_manuales = Number(movMan?.ingresos_manuales || 0);
      const ingresos_totales_fix = Number(
        (ingresos_ventas + ingresos_manuales).toFixed(2)
      );
      const egresos_totales = Number(egresosMov?.egresos_totales || 0);

      const total_cobrado = Number(encabezado?.total_cobrado || 0);
      const ingresos_ventas_mas_manuales = Number(
        (total_cobrado + ingresos_manuales).toFixed(2)
      );

      return res.json({
        scope: 'caja',
        caja_id: Number(caja_id),
        caja_info: {
          local_id: Number(caja.local_id),
          fecha_apertura: caja.fecha_apertura,
          fecha_cierre: caja.fecha_cierre
        },
        encabezado,
        totalesPorMedio,
        movimientosCaja: {
          ingresos_totales: ingresos_totales_fix, // ventas + manuales
          egresos_totales
        },
        movimientosManuales: {
          ingresos_manuales,
          egresos_manuales: Number(movMan?.egresos_manuales || 0)
        },
        reconciliacion: recon,
        diagnostico: {
          ingresos_por_movimientos: ingresos_totales_fix,
          ingresos_por_ventas_mas_manuales: ingresos_ventas_mas_manuales,
          diferencia: Number(
            (ingresos_totales_fix - ingresos_ventas_mas_manuales).toFixed(2)
          )
        }
      });
    }

    // ---------------- POR RANGO ----------------
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Faltan desde/hasta (YYYY-MM-DD)' });
    }
    const { desde: d, hasta: h } = buildDateRange({ desde, hasta });
    const paramsRango = { localId: Number(local_id), desde: d, hasta: h };

    const totalesPorMedio = await db.query(
      `
      SELECT mp.id AS medio_pago_id, mp.nombre AS medio_pago,
             ROUND(SUM(COALESCE(vm.monto,0)), 2) AS total_medio
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      JOIN medios_pago mp ON mp.id = vm.medio_pago_id
      WHERE v.estado = 'confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
      GROUP BY mp.id, mp.nombre
      ORDER BY mp.orden, mp.nombre
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    const [encabezado] = await db.query(
      `
      SELECT COUNT(DISTINCT v.id) AS cantidad_ventas,
             ROUND(SUM(COALESCE(vm.monto,0)), 2) AS total_cobrado
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      WHERE v.estado='confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    // Ingresos de ventas (explícito)
    const [ingVentasRow] = await db.query(
      `
      SELECT ROUND(SUM(COALESCE(vm.monto,0)),2) AS ingresos_ventas
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      WHERE v.estado='confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    // Egresos desde movimientos (solo egresos)
    const [egresosMov] = await db.query(
      `
      SELECT 
        ROUND(SUM(CASE WHEN m.tipo='egreso' THEN COALESCE(m.monto,0) ELSE 0 END),2) AS egresos_totales
      FROM movimientos_caja m
      JOIN caja c ON c.id = m.caja_id
      WHERE c.local_id = :localId
        AND m.fecha >= :desde
        AND m.fecha <  :hasta
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    // Manuales (NO ventas) — referencia puede ser NULL/no numérica; si no mapea a venta, es manual
    const [movMan] = await db.query(
      `
      SELECT 
        ROUND(SUM(
          CASE 
            WHEN m.tipo = 'ingreso'
                 AND vm2.venta_id IS NULL
                 AND UPPER(COALESCE(m.descripcion,'')) NOT LIKE 'VENTA%'
            THEN COALESCE(m.monto,0) 
            ELSE 0 
          END
        ), 2) AS ingresos_manuales,
        ROUND(SUM(
          CASE WHEN m.tipo = 'egreso' THEN COALESCE(m.monto,0) ELSE 0 END
        ), 2) AS egresos_manuales
      FROM movimientos_caja m
      JOIN caja c ON c.id = m.caja_id
      LEFT JOIN venta_medios_pago vm2
        ON vm2.venta_id = CASE
                            WHEN m.referencia REGEXP '^[0-9]+$'
                              THEN CAST(m.referencia AS UNSIGNED)
                            ELSE NULL
                          END
      WHERE c.local_id = :localId
        AND m.fecha >= :desde
        AND m.fecha <  :hasta
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    const [recon] = await db.query(
      `
      SELECT 
        ROUND(SUM(COALESCE(vm.monto,0)),2) AS total_por_medios,
        ROUND(SUM(COALESCE(v.total,0)),2)  AS total_de_ventas
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      WHERE v.estado='confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
      `,
      { replacements: paramsRango, type: db.QueryTypes.SELECT }
    );

    // Cálculos finales
    const ingresos_ventas = Number(ingVentasRow?.ingresos_ventas || 0);
    const ingresos_manuales = Number(movMan?.ingresos_manuales || 0);
    const ingresos_totales_fix = Number(
      (ingresos_ventas + ingresos_manuales).toFixed(2)
    );
    const egresos_totales = Number(egresosMov?.egresos_totales || 0);

    const total_cobrado = Number(encabezado?.total_cobrado || 0);
    const ingresos_ventas_mas_manuales = Number(
      (total_cobrado + ingresos_manuales).toFixed(2)
    );

    return res.json({
      scope: 'rango',
      local_id: Number(local_id),
      rango: { desde: d, hasta: h },
      encabezado,
      totalesPorMedio,
      movimientosCaja: {
        ingresos_totales: ingresos_totales_fix, // ventas + manuales
        egresos_totales
      },
      movimientosManuales: {
        ingresos_manuales,
        egresos_manuales: Number(movMan?.egresos_manuales || 0)
      },
      reconciliacion: recon,
      diagnostico: {
        ingresos_por_movimientos: ingresos_totales_fix,
        ingresos_por_ventas_mas_manuales: ingresos_ventas_mas_manuales,
        diferencia: Number(
          (ingresos_totales_fix - ingresos_ventas_mas_manuales).toFixed(2)
        )
      }
    });
  } catch (err) {
    console.error('getResumenCaja error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// ============================
// GET /resumen-caja/por-dia
// Query: local_id, desde, hasta
// Devuelve por cada día:
// - cantidad_ventas, total_cobrado, desglose por medio
// - ingresos_totales, egresos_totales (TODOS los movimientos de caja)
// - ingresos_manuales, egresos_manuales (desglose manual)
// ============================
// ============================
// GET /resumen-caja/por-dia
// Query: local_id, desde, hasta, page=1, limit=30
// Devuelve:
//   - dias (paginado): por cada día -> encabezado, porMedio, movimientosCaja/Manuales
//   - page, limit, total_days
// ============================
export const getResumenPorDia = async (req, res) => {
  try {
    const { local_id, desde, hasta } = req.query;
    let { page = 1, limit = 30 } = req.query;

    if (!local_id || !desde || !hasta) {
      return res.status(400).json({ error: 'Faltan local_id, desde, hasta' });
    }
    page = Math.max(Number(page) || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 30, 1), 200);
    const offset = (page - 1) * limit;

    const buildDateRange = ({ desde, hasta }) => ({
      desde: new Date(`${desde}T00:00:00`),
      hasta: new Date(`${hasta}T00:00:00`)
    });
    const { desde: d, hasta: h } = buildDateRange({ desde, hasta });
    const paramsBase = { localId: Number(local_id), desde: d, hasta: h };

    // ---------- 1) Armar la lista total de días (sin paginar) ----------
    const diasAll = await db.query(
      `
      WITH
      ventas AS (
        SELECT DATE(v.fecha) AS dia
        FROM ventas v
        WHERE v.estado='confirmada'
          AND v.local_id = :localId
          AND v.fecha >= :desde
          AND v.fecha <  :hasta
        GROUP BY DATE(v.fecha)
      ),
      manuales AS (
        SELECT DATE(m.fecha) AS dia
        FROM movimientos_caja m
        JOIN caja c ON c.id = m.caja_id
        WHERE c.local_id = :localId
          AND m.fecha >= :desde
          AND m.fecha <  :hasta
        GROUP BY DATE(m.fecha)
      ),
      dias_union AS (
        SELECT dia FROM ventas
        UNION
        SELECT dia FROM manuales
      )
      SELECT dia
      FROM dias_union
      ORDER BY dia DESC
      `,
      { replacements: paramsBase, type: db.QueryTypes.SELECT }
    );

    const total_days = diasAll.length;
    if (total_days === 0) {
      return res.json({
        local_id: Number(local_id),
        desde: d,
        hasta: h,
        page,
        limit,
        total_days,
        dias: []
      });
    }

    // ---------- 2) Paginar la lista de días ----------
    const diasPage = diasAll.slice(offset, offset + limit).map((r) => r.dia); // array de fechas 'YYYY-MM-DD'

    // Para los IN (...) de abajo
    // MySQL acepta IN (:dias) con array si el driver lo expande; si no, iteramos.
    // Sequelize generalmente lo maneja. Asegurate de pasar { dias: diasPage }.
    const paramsDias = { ...paramsBase, dias: diasPage };

    // ---------- 3) Encabezado por día (solo de los días paginados) ----------
    const encabezado = await db.query(
      `
      SELECT 
        DATE(v.fecha) AS dia,
        COUNT(DISTINCT v.id) AS cantidad_ventas,
        ROUND(SUM(COALESCE(vm.monto,0)), 2) AS total_cobrado
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      WHERE v.estado = 'confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
        AND DATE(v.fecha) IN (:dias)
      GROUP BY DATE(v.fecha)
      `,
      { replacements: paramsDias, type: db.QueryTypes.SELECT }
    );

    // ---------- 4) Por medio (solo de los días paginados) ----------
    const porMedio = await db.query(
      `
      SELECT 
        DATE(v.fecha) AS dia,
        mp.id AS medio_pago_id,
        mp.nombre AS medio_pago,
        ROUND(SUM(COALESCE(vm.monto,0)),2) AS total_medio
      FROM ventas v
      JOIN venta_medios_pago vm ON vm.venta_id = v.id
      JOIN medios_pago mp ON mp.id = vm.medio_pago_id
      WHERE v.estado = 'confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
        AND DATE(v.fecha) IN (:dias)
      GROUP BY DATE(v.fecha), mp.id, mp.nombre
      ORDER BY dia, mp.orden, mp.nombre
      `,
      { replacements: paramsDias, type: db.QueryTypes.SELECT }
    );

    // ---------- 5) Movimientos por día (totales + manuales) ----------
    const movs = await db.query(
      `
      SELECT 
        DATE(m.fecha) AS dia,
        ROUND(SUM(CASE WHEN m.tipo='ingreso' THEN COALESCE(m.monto,0) ELSE 0 END), 2) AS ingresos_totales,
        ROUND(SUM(CASE WHEN m.tipo='egreso'  THEN COALESCE(m.monto,0) ELSE 0 END), 2) AS egresos_totales,
        ROUND(SUM(
          CASE 
            WHEN m.tipo = 'ingreso'
                 AND vm2.venta_id IS NULL
                 AND UPPER(COALESCE(m.descripcion,'')) NOT LIKE 'VENTA%'
            THEN COALESCE(m.monto,0) ELSE 0 END
        ), 2) AS ingresos_manuales,
        ROUND(SUM(
          CASE WHEN m.tipo = 'egreso' THEN COALESCE(m.monto,0) ELSE 0 END
        ), 2) AS egresos_manuales
      FROM movimientos_caja m
      JOIN caja c ON c.id = m.caja_id
      LEFT JOIN venta_medios_pago vm2
        ON vm2.venta_id = CASE
                            WHEN m.referencia REGEXP '^[0-9]+$'
                              THEN CAST(m.referencia AS UNSIGNED)
                            ELSE NULL
                          END
      WHERE c.local_id = :localId
        AND m.fecha >= :desde
        AND m.fecha <  :hasta
        AND DATE(m.fecha) IN (:dias)
      GROUP BY DATE(m.fecha)
      `,
      { replacements: paramsDias, type: db.QueryTypes.SELECT }
    );

    // ---------- 6) Armar salida paginada ----------
    const mapEnc = new Map(encabezado.map((e) => [String(e.dia), e]));
    const mapMov = new Map(movs.map((m) => [String(m.dia), m]));

    const grouped = {};
    for (const row of porMedio) {
      const key = String(row.dia);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        medio_pago_id: row.medio_pago_id,
        medio_pago: row.medio_pago,
        total_medio: Number(row.total_medio)
      });
    }

    // Mantener el orden (desc) de la página actual
    const diasOrdered = diasPage.slice(); // ya vienen desc por el slice de diasAll
    const result = diasOrdered.map((dia) => {
      const enc = mapEnc.get(dia);
      const mov = mapMov.get(dia);
      return {
        dia,
        encabezado: enc || { dia, cantidad_ventas: 0, total_cobrado: 0 },
        porMedio: grouped[dia] || [],
        movimientosCaja: {
          ingresos_totales: Number(mov?.ingresos_totales || 0),
          egresos_totales: Number(mov?.egresos_totales || 0)
        },
        movimientosManuales: {
          ingresos_manuales: Number(mov?.ingresos_manuales || 0),
          egresos_manuales: Number(mov?.egresos_manuales || 0)
        }
      };
    });

    return res.json({
      local_id: Number(local_id),
      desde: d,
      hasta: h,
      page,
      limit,
      total_days,
      dias: result
    });
  } catch (err) {
    console.error('getResumenPorDia error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// ============================
// GET /resumen-caja/ventas
// Query: local_id, desde, hasta, medio_pago_id (opcional), q (opcional), page, limit
// Devuelve lista de ventas + desglose por medios
// ============================
export const getVentasDetalle = async (req, res) => {
  try {
    const { local_id, desde, hasta, medio_pago_id, q } = req.query;
    let { page = 1, limit = 20 } = req.query;

    if (!local_id || !desde || !hasta) {
      return res.status(400).json({ error: 'Faltan local_id, desde, hasta' });
    }
    page = Math.max(Number(page) || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const offset = (page - 1) * limit;

    const { desde: d, hasta: h } = buildDateRange({ desde, hasta });

    // 1) IDs de ventas en el período (paginado)
    //   opcionalmente filtrar por medio_pago_id y búsqueda q (cliente/comprobante)
    const filtroMedio = medio_pago_id
      ? 'AND v.id IN (SELECT venta_id FROM venta_medios_pago WHERE medio_pago_id = :medioId)'
      : '';
    const filtroQ = q
      ? `AND (v.nro_comprobante LIKE :q OR v.tipo_comprobante LIKE :q)`
      : '';

    const ventasIds = await db.query(
      `
      SELECT v.id
      FROM ventas v
      WHERE v.estado='confirmada'
        AND v.local_id = :localId
        AND v.fecha >= :desde
        AND v.fecha <  :hasta
        ${filtroMedio}
        ${filtroQ}
      ORDER BY v.fecha DESC, v.id DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements: {
          localId: Number(local_id),
          desde: d,
          hasta: h,
          medioId: medio_pago_id ? Number(medio_pago_id) : null,
          q: q ? `%${q}%` : null,
          limit,
          offset
        },
        type: db.QueryTypes.SELECT
      }
    );

    const ids = ventasIds.map((x) => x.id);
    if (ids.length === 0) {
      return res.json({ page, limit, total: 0, ventas: [] });
    }

    // 2) Traer ventas básicas
    const ventas = await db.query(
      `
      SELECT v.id, v.fecha, v.total, v.tipo_comprobante, v.nro_comprobante,
             v.usuario_id, v.cliente_id, v.local_id
      FROM ventas v
      WHERE v.id IN (:ids)
      ORDER BY v.fecha DESC, v.id DESC
      `,
      { replacements: { ids }, type: db.QueryTypes.SELECT }
    );

    // 3) Desglose por medio para esas ventas
    const medios = await db.query(
      `
      SELECT vm.venta_id, mp.id AS medio_pago_id, mp.nombre AS medio_pago, ROUND(vm.monto,2) AS monto
      FROM venta_medios_pago vm
      JOIN medios_pago mp ON mp.id = vm.medio_pago_id
      WHERE vm.venta_id IN (:ids)
      ORDER BY mp.orden, mp.nombre
      `,
      { replacements: { ids }, type: db.QueryTypes.SELECT }
    );

    // 4) Total general para paginar (count)
    const rowsCount = await db.query(
      `
  SELECT COUNT(*) AS totalRows
  FROM ventas v
  WHERE v.estado='confirmada'
    AND v.local_id = :localId
    AND v.fecha >= :desde
    AND v.fecha <  :hasta
    ${filtroMedio}
    ${filtroQ}
  `,
      {
        replacements: {
          localId: Number(local_id),
          desde: d,
          hasta: h,
          medioId: medio_pago_id ? Number(medio_pago_id) : null,
          q: q ? `%${q}%` : null
        },
        type: db.QueryTypes.SELECT
      }
    );

    const totalRows = Number(rowsCount?.[0]?.totalRows || 0);
    // 5) Armar respuesta
    const mapMedios = medios.reduce((acc, m) => {
      const k = m.venta_id;
      if (!acc[k]) acc[k] = [];
      acc[k].push({
        medio_pago_id: m.medio_pago_id,
        medio_pago: m.medio_pago,
        monto: Number(m.monto)
      });
      return acc;
    }, {});

    const ventasOut = ventas.map((v) => ({
      ...v,
      total: Number(v.total),
      medios: mapMedios[v.id] || []
    }));

    return res.json({
      page,
      limit,
      total: totalRows,
      ventas: ventasOut
    });
  } catch (err) {
    console.error('getVentasDetalle error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};
