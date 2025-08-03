/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Combos.js) contiene controladores para manejar operaciones CRUD sobre la tabla de combos.
 *
 * Tema: Controladores - Combos
 * Capa: Backend
 */

import { CombosModel } from '../../Models/Combos/MD_TB_Combos.js';
import db from '../../DataBase/db.js';
import { Op } from 'sequelize';

// Obtener todos los combos
export const OBRS_Combos_CTS = async (req, res) => {
  try {
    const combos = await CombosModel.findAll({
      order: [['id', 'DESC']]
    });
    res.json(combos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo combo por ID
export const OBR_Combo_CTS = async (req, res) => {
  try {
    const combo = await CombosModel.findByPk(req.params.id);
    if (!combo)
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    res.json(combo);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo combo
export const CR_Combo_CTS = async (req, res) => {
  const { nombre, descripcion, precio_fijo, cantidad_items, estado } = req.body;

  if (!nombre || !precio_fijo || !cantidad_items) {
    return res.status(400).json({
      mensajeError:
        'Faltan campos obligatorios: nombre, precio_fijo o cantidad_items'
    });
  }

  try {
    const nuevoCombo = await CombosModel.create({
      nombre,
      descripcion,
      precio_fijo,
      cantidad_items,
      estado: estado || 'activo'
    });
    res.json({ message: 'Combo creado correctamente', combo: nuevoCombo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un combo
export const UR_Combo_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await CombosModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await CombosModel.findByPk(id);
      res.json({ message: 'Combo actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Combo no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un combo
export const ER_Combo_CTS = async (req, res) => {
  try {
    const eliminado = await CombosModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    }

    res.json({ message: 'Combo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Buscar combos por nombre (autosuggest)
export const SEARCH_Combos_CTS = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) return res.json([]);

    const combos = await CombosModel.findAll({
      where: {
        nombre: { [Op.like]: `%${query.trim()}%` }
      },
      order: [['nombre', 'ASC']]
    });

    if (combos.length > 0) return res.json(combos);
    return res
      .status(404)
      .json({ mensajeError: 'No se encontraron resultados' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
