/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones sobre la tabla detalle_venta_combos, que registra los productos vendidos como parte de un combo.
 *
 * Tema: Controladores - Combos
 * Capa: Backend
 */

// Importar modelo
import { DetalleVentaCombosModel } from '../../Models/Combos/MD_TB_DetalleVentaCombos.js';
import { CombosModel } from '../../Models/Combos/MD_TB_Combos.js';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';

import { Op } from 'sequelize';

// Obtener todos los detalles de combos vendidos
export const OBRS_DetallesVentaCombo_CTS = async (req, res) => {
  try {
    const registros = await DetalleVentaCombosModel.findAll({
      include: [
        {
          model: CombosModel,
          as: 'combo'
        },
        {
          model: StockModel,
          as: 'stock',
          include: [
            {
              model: ProductosModel,
              as: 'producto'
            }
          ]
        }
      ],
      order: [['id', 'DESC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener todos los productos de un combo vendido (por venta_id)
export const OBRS_ProductosPorVentaCombo_CTS = async (req, res) => {
  const { venta_id } = req.params;

  try {
    const registros = await DetalleVentaCombosModel.findAll({
      where: { venta_id },
      include: [
        {
          model: StockModel,
          as: 'stock',
          include: [
            {
              model: ProductosModel,
              as: 'producto'
            }
          ]
        },
        {
          model: CombosModel,
          as: 'combo'
        }
      ],
      order: [['id', 'ASC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear múltiples registros (bulk insert de productos vendidos en combo)
export const CR_DetallesVentaCombo_CTS = async (req, res) => {
  const { venta_id, combo_id, stock_ids } = req.body;

  if (
    !venta_id ||
    !combo_id ||
    !Array.isArray(stock_ids) ||
    stock_ids.length === 0
  ) {
    return res.status(400).json({
      mensajeError:
        'Faltan datos: venta_id, combo_id y al menos un stock_id son requeridos.'
    });
  }

  try {
    const registros = stock_ids.map((stock_id) => ({
      venta_id,
      combo_id,
      stock_id
    }));

    const creados = await DetalleVentaCombosModel.bulkCreate(registros);
    res.json({
      message: 'Detalle(s) del combo guardado(s) correctamente',
      registros: creados
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un registro puntual
export const ER_DetalleVentaCombo_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const eliminado = await DetalleVentaCombosModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });
    }

    res.json({ message: 'Registro eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
