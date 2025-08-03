/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Estados.js) contiene controladores para manejar operaciones CRUD sobre la tabla de estados.
 *
 * Tema: Controladores - Estados
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Estados from '../../Models/Stock/MD_TB_Estados.js';
const EstadosModel = MD_TB_Estados.EstadosModel;
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js'; // Asegurate de tenerlo

// Obtener todos los estados
export const OBRS_Estados_CTS = async (req, res) => {
  try {
    const estados = await EstadosModel.findAll();
    res.json(estados);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un estado por ID
export const OBR_Estado_CTS = async (req, res) => {
  try {
    const estado = await EstadosModel.findByPk(req.params.id);
    if (!estado) {
      return res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }
    res.json(estado);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo estado
export const CR_Estado_CTS = async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del estado es obligatorio' });
  }

  try {
    const nuevo = await EstadosModel.create({ nombre });
    res.json({ message: 'Estado creado correctamente', estado: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un estado
export const ER_Estado_CTS = async (req, res) => {
  const { id } = req.params;
  const forzar = req.query.forzar === 'true'; // Detectamos si se fuerza la eliminación

  try {
    const tieneStock = await StockModel.findOne({ where: { estado_id: id } });

    if (tieneStock && !forzar) {
      return res.status(409).json({
        mensajeError:
          'Este ESTADO está asociado a productos en stock. ¿Desea eliminarlo de todas formas?'
      });
    }

    if (tieneStock && forzar) {
      // Desvincular el estado en los registros de stock
      await StockModel.update(
        { estado_id: null },
        { where: { estado_id: id } }
      );
    }

    const eliminado = await EstadosModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }

    res.json({
      message: tieneStock
        ? 'Estado eliminado y stock desvinculado.'
        : 'Estado eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error en ER_Estado_CTS:', error);
    res.status(500).json({
      mensajeError: 'Error del servidor',
      detalle: error.message
    });
  }
};
// Actualizar un estado
export const UR_Estado_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await EstadosModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await EstadosModel.findByPk(id);
      res.json({ message: 'Estado actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
