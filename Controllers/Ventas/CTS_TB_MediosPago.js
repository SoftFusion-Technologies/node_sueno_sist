/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_MediosPago.js) contiene controladores para manejar operaciones CRUD sobre la tabla de medios de pago.
 *
 * Tema: Controladores - Medios de Pago
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_MediosPago from '../../Models/Ventas/MD_TB_MediosPago.js';
const MediosPagoModel = MD_TB_MediosPago.MediosPagoModel;

// Obtener todos los medios de pago
export const OBRS_MediosPago_CTS = async (req, res) => {
  try {
    const medios = await MediosPagoModel.findAll({
      order: [
        ['orden', 'ASC'],
        ['nombre', 'ASC']
      ]
    });
    res.json(medios);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo medio de pago por ID
export const OBR_MedioPago_CTS = async (req, res) => {
  try {
    const medio = await MediosPagoModel.findByPk(req.params.id);
    if (!medio) {
      return res
        .status(404)
        .json({ mensajeError: 'Medio de pago no encontrado' });
    }
    res.json(medio);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo medio de pago
export const CR_MedioPago_CTS = async (req, res) => {
  const { nombre, descripcion, icono, orden, ajuste_porcentual } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del medio de pago es obligatorio' });
  }

  try {
    const nuevo = await MediosPagoModel.create({
      nombre,
      descripcion: descripcion || '',
      icono: icono || '',
      orden: orden || 0,
      ajuste_porcentual: ajuste_porcentual || 0
    });

    res.json({ message: 'Medio de pago creado correctamente', medio: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un medio de pago
export const ER_MedioPago_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    // Aquí podrías controlar si hay ventas asociadas a este medio antes de eliminar
    const eliminado = await MediosPagoModel.destroy({ where: { id } });

    if (!eliminado) {
      return res
        .status(404)
        .json({ mensajeError: 'Medio de pago no encontrado' });
    }

    res.json({ message: 'Medio de pago eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({
      mensajeError: 'Error del servidor',
      detalle: error.message
    });
  }
};

// Actualizar un medio de pago
export const UR_MedioPago_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await MediosPagoModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await MediosPagoModel.findByPk(id);
      res.json({
        message: 'Medio de pago actualizado correctamente',
        actualizado
      });
    } else {
      res.status(404).json({ mensajeError: 'Medio de pago no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
