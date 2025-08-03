/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Locales.js) contiene controladores para manejar operaciones CRUD sobre la tabla de locales.
 *
 * Tema: Controladores - Locales
 *
 * Capa: Backend
 *
 * Nomenclatura:
 *   OBR_  obtenerRegistro
 *   OBRS_ obtenerRegistros
 *   CR_   crearRegistro
 *   ER_   eliminarRegistro
 *   UR_   actualizarRegistro
 */

// Importar el modelo
import MD_TB_Locales from '../../Models/Stock/MD_TB_Locales.js';
const LocalesModel = MD_TB_Locales.LocalesModel;

// Obtener todos los locales
export const OBRS_Locales_CTS = async (req, res) => {
  try {
    const locales = await LocalesModel.findAll();
    res.json(locales);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo local por ID
export const OBR_Local_CTS = async (req, res) => {
  try {
    const local = await LocalesModel.findByPk(req.params.id);
    if (!local) {
      return res.status(404).json({ mensajeError: 'Local no encontrado' });
    }
    res.json(local);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo local
export const CR_Local_CTS = async (req, res) => {
  const { nombre, direccion, telefono } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del local es obligatorio' });
  }

  try {
    const nuevo = await LocalesModel.create({ nombre, direccion, telefono });
    res.json({ message: 'Local creado correctamente', local: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un local
export const ER_Local_CTS = async (req, res) => {
  try {
    const eliminado = await LocalesModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Local no encontrado' });
    }

    res.json({ message: 'Local eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un local
export const UR_Local_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await LocalesModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await LocalesModel.findByPk(id);
      res.json({ message: 'Local actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Local no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
