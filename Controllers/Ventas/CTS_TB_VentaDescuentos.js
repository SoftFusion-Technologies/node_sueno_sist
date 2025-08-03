/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 06 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_VentaDescuentos.js) contiene controladores para manejar operaciones CRUD sobre la tabla venta_descuentos.
 *
 * Tema: Controladores - VentaDescuentos
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_VentaDescuentos from '../../Models/Ventas/MD_TB_VentaDescuentos.js';
const VentaDescuentosModel = MD_TB_VentaDescuentos.VentaDescuentosModel;

// Obtener todos los descuentos de una venta
export const OBRS_VentaDescuentos_CTS = async (req, res) => {
  try {
    const { venta_id } = req.query;
    const where = venta_id ? { venta_id } : {};
    const descuentos = await VentaDescuentosModel.findAll({
      where,
      order: [['id', 'ASC']]
    });
    res.json(descuentos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un descuento por ID
export const OBR_VentaDescuento_CTS = async (req, res) => {
  try {
    const descuento = await VentaDescuentosModel.findByPk(req.params.id);
    if (!descuento)
      return res.status(404).json({ mensajeError: 'Descuento no encontrado' });
    res.json(descuento);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo descuento (uno por vez)
export const CR_VentaDescuento_CTS = async (req, res) => {
  const { venta_id, tipo, referencia_id, detalle, porcentaje, monto } =
    req.body;

  if (!venta_id || !tipo) {
    return res
      .status(400)
      .json({ mensajeError: 'venta_id y tipo son obligatorios.' });
  }

  try {
    const nuevoDescuento = await VentaDescuentosModel.create({
      venta_id,
      tipo,
      referencia_id,
      detalle,
      porcentaje,
      monto
    });
    res.json({
      message: 'Descuento registrado correctamente',
      descuento: nuevoDescuento
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un descuento
export const ER_VentaDescuento_CTS = async (req, res) => {
  try {
    const eliminado = await VentaDescuentosModel.destroy({
      where: { id: req.params.id }
    });
    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Descuento no encontrado' });

    res.json({ message: 'Descuento eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un descuento
export const UR_VentaDescuento_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await VentaDescuentosModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await VentaDescuentosModel.findByPk(id);
      res.json({ message: 'Descuento actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Descuento no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
