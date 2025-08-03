/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones CRUD sobre la tabla combo_productos_permitidos.
 *
 * Tema: Controladores - Combos
 * Capa: Backend
 */

// Importar modelo
import { ComboProductosPermitidosModel } from '../../Models/Combos/MD_TB_ComboProductosPermitidos.js';
import { CombosModel } from '../../Models/Combos/MD_TB_Combos.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { CategoriasModel } from '../../Models/Stock/MD_TB_Categorias.js';

import { Op } from 'sequelize';

// Obtener todos los productos/categorías permitidas de un combo
export const OBRS_ComboProductosPermitidos_CTS = async (req, res) => {
  try {
    const registros = await ComboProductosPermitidosModel.findAll({
      include: [
        {
          model: CombosModel,
          as: 'combo'
        },
        {
          model: ProductosModel,
          as: 'producto'
        },
        {
          model: CategoriasModel,
          as: 'categoria'
        }
      ],
      order: [['id', 'DESC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener registros por combo_id
export const OBRS_PermitidosPorCombo_CTS = async (req, res) => {
  const { combo_id } = req.params;

  try {
    const registros = await ComboProductosPermitidosModel.findAll({
      where: { combo_id },
      include: [
        { model: ProductosModel, as: 'producto' },
        { model: CategoriasModel, as: 'categoria' }
      ],
      order: [['id', 'ASC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear nuevo registro
export const CR_ComboProductoPermitido_CTS = async (req, res) => {
  const { combo_id, producto_id, categoria_id } = req.body;

  if (!combo_id || (!producto_id && !categoria_id)) {
    return res.status(400).json({
      mensajeError:
        'Debe proporcionar combo_id y al menos producto_id o categoria_id'
    });
  }

  try {
    const nuevo = await ComboProductosPermitidosModel.create({
      combo_id,
      producto_id: producto_id || null,
      categoria_id: categoria_id || null
    });

    res.json({ message: 'Registro creado correctamente', registro: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar registro
export const ER_ComboProductoPermitido_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const eliminado = await ComboProductosPermitidosModel.destroy({
      where: { id }
    });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });
    }

    res.json({ message: 'Registro eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar registro
export const UR_ComboProductoPermitido_CTS = async (req, res) => {
  const { id } = req.params;
  const { producto_id, categoria_id } = req.body;

  try {
    const [updated] = await ComboProductosPermitidosModel.update(
      {
        producto_id: producto_id || null,
        categoria_id: categoria_id || null
      },
      { where: { id } }
    );

    if (updated === 1) {
      const actualizado = await ComboProductosPermitidosModel.findByPk(id);
      res.json({ message: 'Registro actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Registro no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
