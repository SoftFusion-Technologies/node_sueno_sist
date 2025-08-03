/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_VentaMediosPago.js) contiene controladores para manejar operaciones CRUD sobre la tabla venta_medios_pago.
 *
 * Tema: Controladores - Venta Medios de Pago
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_VentaMediosPago from '../../Models/Ventas/MD_TB_VentaMediosPago.js';
const VentaMediosPagoModel = MD_TB_VentaMediosPago.VentaMediosPagoModel;

// Si querés joins en el futuro:
// import { VentasModel } from '../Models/MD_TB_Ventas.js';
// import { MediosPagoModel } from '../Models/MD_TB_MediosPago.js';

// Obtener todos los registros de venta_medios_pago
export const OBRS_VentaMediosPago_CTS = async (req, res) => {
  try {
    const registros = await VentaMediosPagoModel.findAll({
      order: [['id', 'DESC']]
      // include: [{ model: VentasModel }, { model: MediosPagoModel }]
    });
    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un registro por ID
export const OBR_VentaMediosPago_CTS = async (req, res) => {
  try {
    const registro = await VentaMediosPagoModel.findByPk(req.params.id);
    if (!registro)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });
    res.json(registro);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo registro de venta_medios_pago
export const CR_VentaMediosPago_CTS = async (req, res) => {
  const { venta_id, medio_pago_id, monto } = req.body;

  if (!venta_id || !medio_pago_id || !monto) {
    return res.status(400).json({
      mensajeError: 'Faltan campos obligatorios: venta_id, medio_pago_id, monto'
    });
  }

  try {
    const nuevo = await VentaMediosPagoModel.create({
      venta_id,
      medio_pago_id,
      monto
    });
    res.json({
      message: 'Registro de medio de pago creado correctamente',
      registro: nuevo
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un registro
export const ER_VentaMediosPago_CTS = async (req, res) => {
  try {
    const eliminado = await VentaMediosPagoModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });

    res.json({ message: 'Registro de medio de pago eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un registro
export const UR_VentaMediosPago_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await VentaMediosPagoModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await VentaMediosPagoModel.findByPk(id);
      res.json({ message: 'Registro actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Registro no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
