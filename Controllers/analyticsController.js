// controllers/analyticsController.js
import db from '../DataBase/db.js';
import { QueryTypes } from 'sequelize';

export const obtenerVentasPorMes = async (req, res) => {
  try {
    const resultados = await db.query(
      `
      SELECT 
        DATE_FORMAT(fecha, '%Y-%m') AS mes,
        SUM(total) AS total_ventas,
        COUNT(*) AS cantidad_ventas
      FROM ventas
      WHERE estado = 'confirmada'
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12;
    `,
      { type: QueryTypes.SELECT }
    );

    res.json(resultados);
  } catch (error) {
    console.error('Error al obtener ventas por mes:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const obtenerVentasPorMedioPago = async (req, res) => {
  try {
    const resultados = await db.query(
      `
      SELECT mp.nombre AS medio_pago, SUM(vmp.monto) AS total
      FROM venta_medios_pago vmp
      JOIN medios_pago mp ON vmp.medio_pago_id = mp.id
      JOIN ventas v ON vmp.venta_id = v.id
      WHERE v.estado = 'confirmada'
      GROUP BY medio_pago
      ORDER BY total DESC;
      `,
      { type: QueryTypes.SELECT }
    );

    res.json(resultados);
  } catch (error) {
    console.error('Error al obtener ventas por medio de pago:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const obtenerProductosMasVendidos = async (req, res) => {
  try {
    const resultados = await db.query(
      `
      SELECT p.nombre AS producto, SUM(dv.cantidad) AS cantidad_total, SUM(dv.precio_unitario * dv.cantidad) AS total_facturado
      FROM detalle_venta dv
      JOIN stock s ON dv.stock_id = s.id
      JOIN productos p ON s.producto_id = p.id
      GROUP BY producto
      ORDER BY cantidad_total DESC
      LIMIT 10;
      `,
      { type: QueryTypes.SELECT }
    );

    res.json(resultados);
  } catch (error) {
    console.error('Error al obtener productos más vendidos:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const obtenerVentasPorLocal = async (req, res) => {
  try {
    const resultados = await db.query(
      `
      SELECT l.nombre AS local, COUNT(*) AS cantidad_ventas, SUM(v.total) AS total_ventas
      FROM ventas v
      JOIN locales l ON v.local_id = l.id
      WHERE v.estado = 'confirmada'
      GROUP BY local
      ORDER BY total_ventas DESC;
      `,
      { type: QueryTypes.SELECT }
    );

    res.json(resultados);
  } catch (error) {
    console.error('Error al obtener ventas por local:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const obtenerResumenDescuentos = async (req, res) => {
  try {
    const resultados = await db.query(
      `
      SELECT 
        COUNT(DISTINCT venta_id) AS ventas_con_descuento,
        SUM(monto) AS total_descuentos
      FROM venta_descuentos;
      `,
      { type: QueryTypes.SELECT }
    );

    res.json(resultados[0]);
  } catch (error) {
    console.error('Error al obtener resumen de descuentos:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
