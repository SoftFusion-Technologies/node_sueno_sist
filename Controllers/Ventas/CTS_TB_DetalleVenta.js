/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_DetalleVenta.js) contiene controladores para manejar operaciones CRUD sobre la tabla detalle_venta.
 *
 * Tema: Controladores - Detalle de Venta
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_DetalleVenta from '../../Models/Ventas/MD_TB_DetalleVenta.js';
const DetalleVentaModel = MD_TB_DetalleVenta.DetalleVentaModel;

// Obtener todos los detalles de venta
export const OBRS_DetalleVenta_CTS = async (req, res) => {
  try {
    const detalles = await DetalleVentaModel.findAll({
      order: [['id', 'DESC']]
      // include: [{ model: VentasModel }, { model: StockModel }]
    });
    res.json(detalles);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un detalle de venta por ID
export const OBR_DetalleVenta_CTS = async (req, res) => {
  try {
    const detalle = await DetalleVentaModel.findByPk(req.params.id);
    if (!detalle)
      return res
        .status(404)
        .json({ mensajeError: 'Detalle de venta no encontrado' });
    res.json(detalle);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo detalle de venta
export const CR_DetalleVenta_CTS = async (req, res) => {
  const { venta_id, stock_id, cantidad, precio_unitario, descuento } = req.body;

  if (!venta_id || !stock_id || !cantidad || !precio_unitario) {
    return res.status(400).json({
      mensajeError:
        'Faltan campos obligatorios: venta_id, stock_id, cantidad, precio_unitario'
    });
  }

  try {
    const nuevo = await DetalleVentaModel.create({
      venta_id,
      stock_id,
      cantidad,
      precio_unitario,
      descuento: descuento || 0
    });
    res.json({
      message: 'Detalle de venta creado correctamente',
      detalle: nuevo
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un detalle de venta
export const ER_DetalleVenta_CTS = async (req, res) => {
  try {
    const eliminado = await DetalleVentaModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado)
      return res
        .status(404)
        .json({ mensajeError: 'Detalle de venta no encontrado' });

    res.json({ message: 'Detalle de venta eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un detalle de venta
export const UR_DetalleVenta_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await DetalleVentaModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await DetalleVentaModel.findByPk(id);
      res.json({
        message: 'Detalle de venta actualizado correctamente',
        actualizado
      });
    } else {
      res.status(404).json({ mensajeError: 'Detalle de venta no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
