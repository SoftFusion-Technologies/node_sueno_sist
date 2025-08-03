/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 28 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_RecaptacionCampanas.js) contiene controladores para manejar operaciones CRUD sobre la tabla de campañas de recaptación.
 *
 * Tema: Controladores - Recaptación
 * Capa: Backend
 */

import { RecaptacionCampanasModel } from '../../Models/Recaptacion/MD_TB_RecaptacionCampanas.js';

// Obtener todas las campañas
export const OBRS_RecaptacionCampanas_CTS = async (req, res) => {
  try {
    const campanas = await RecaptacionCampanasModel.findAll({
      order: [['id', 'DESC']]
    });
    res.json(campanas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener una campaña por ID
export const OBR_RecaptacionCampana_CTS = async (req, res) => {
  try {
    const campana = await RecaptacionCampanasModel.findByPk(req.params.id);
    if (!campana)
      return res.status(404).json({ mensajeError: 'Campaña no encontrada' });
    res.json(campana);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear una nueva campaña
export const CR_RecaptacionCampana_CTS = async (req, res) => {
  const { nombre, descripcion, fecha_inicio, fecha_fin, medio_envio, mensaje } =
    req.body;

  if (!nombre || !fecha_inicio || !fecha_fin || !medio_envio || !mensaje) {
    return res.status(400).json({ mensajeError: 'Faltan campos obligatorios' });
  }

  try {
    const nueva = await RecaptacionCampanasModel.create({
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      medio_envio,
      mensaje
    });
    res.json({ message: 'Campaña creada correctamente', campana: nueva });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar campaña
export const UR_RecaptacionCampana_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await RecaptacionCampanasModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizada = await RecaptacionCampanasModel.findByPk(id);
      res.json({ message: 'Campaña actualizada correctamente', actualizada });
    } else {
      res.status(404).json({ mensajeError: 'Campaña no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar campaña
export const ER_RecaptacionCampana_CTS = async (req, res) => {
  try {
    const eliminado = await RecaptacionCampanasModel.destroy({
      where: { id: req.params.id }
    });
    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Campaña no encontrada' });

    res.json({ message: 'Campaña eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
