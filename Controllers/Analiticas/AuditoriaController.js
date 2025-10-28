// controllers/AuditoriaController.js
import db from '../../DataBase/db.js'; // instancia Sequelize

export const getVentasDesbalanceadas = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: 'Faltan desde, hasta' });
    }

    const d = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T00:00:00`);

    const rows = await db.query(
      `
      SELECT 
        t.id,
        t.total_venta,
        t.suma_medios,
        ROUND(ABS(t.suma_medios - t.total_venta), 2) AS diferencia
      FROM (
        SELECT
          v.id,
          ROUND(v.total, 2) AS total_venta,
          ROUND(COALESCE(SUM(vm.monto), 0), 2) AS suma_medios
        FROM ventas v
        LEFT JOIN venta_medios_pago vm ON vm.venta_id = v.id
        WHERE v.estado = 'confirmada'
          AND v.fecha >= :desde
          AND v.fecha <  :hasta
        GROUP BY v.id, v.total
      ) AS t
      WHERE ABS(t.suma_medios - t.total_venta) > 0.01
      ORDER BY diferencia DESC, t.id ASC
      `,
      {
        replacements: { desde: d, hasta: h },
        type: db.QueryTypes.SELECT
      }
    );

    return res.json({ desbalanceadas: rows });
  } catch (err) {
    console.error('getVentasDesbalanceadas error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

