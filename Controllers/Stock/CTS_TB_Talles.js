/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Talles.js) contiene controladores para manejar operaciones CRUD sobre la tabla de talles.
 *
 * Tema: Controladores - Talles
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Talles from '../../Models/Stock/MD_TB_Talles.js';
const TallesModel = MD_TB_Talles.TallesModel;
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js'; // Asegurate de tenerlo

// Obtener todos los talles
export const OBRS_Talles_CTS = async (req, res) => {
  try {
    const talles = await TallesModel.findAll();
    res.json(talles);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo talle por ID
export const OBR_Talle_CTS = async (req, res) => {
  try {
    const talle = await TallesModel.findByPk(req.params.id);
    if (!talle) {
      return res.status(404).json({ mensajeError: 'Talle no encontrado' });
    }
    res.json(talle);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo talle
export const CR_Talle_CTS = async (req, res) => {
  const { nombre, descripcion, tipo_categoria } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del talle es obligatorio' });
  }

  try {
    const nuevo = await TallesModel.create({
      nombre,
      descripcion: descripcion || '',
      tipo_categoria: tipo_categoria || 'ropa'
    });

    res.json({ message: 'Talle creado correctamente', talle: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un talle
export const ER_Talle_CTS = async (req, res) => {
  const { id } = req.params;
  const forzar = req.query.forzar === 'true'; // Detectamos si se fuerza la eliminación

  try {
    // 1) ¿Existe algún registro de stock que use este talle?
    const tieneStock = await StockModel.findOne({ where: { talle_id: id } });

    // 2) Si hay stock relacionado y NO se solicitó "forzar", devolvemos conflicto (409)
    if (tieneStock && !forzar) {
      return res.status(409).json({
        mensajeError:
          'Este TALLE está asociado a productos en stock. ¿Desea eliminarlo de todas formas?'
      });
    }

    // 3) Si hay stock y SÍ se pidió "forzar", desvinculamos el talle antes de borrarlo
    if (tieneStock && forzar) {
      await StockModel.update({ talle_id: null }, { where: { talle_id: id } });
    }

    // 4) Eliminamos el talle
    const eliminado = await TallesModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Talle no encontrado' });
    }

    // 5) Respuesta final
    res.json({
      message: tieneStock
        ? 'Talle eliminado y stock desvinculado.'
        : 'Talle eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error en ER_Talle_CTS:', error);
    res.status(500).json({
      mensajeError: 'Error del servidor',
      detalle: error.message
    });
  }
};

// Actualizar un talle
export const UR_Talle_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await TallesModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await TallesModel.findByPk(id);
      res.json({ message: 'Talle actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Talle no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
