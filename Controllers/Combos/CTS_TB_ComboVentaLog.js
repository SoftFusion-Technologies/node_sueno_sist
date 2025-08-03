/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones sobre la tabla combo_venta_log.
 * Esta tabla registra combos vendidos por venta con su precio y cantidad.
 *
 * Tema: Controladores - Combos
 * Capa: Backend
 */

// Importar modelos
import { ComboVentaLogModel } from '../../Models/Combos/MD_TB_ComboVentaLog.js';
import { CombosModel } from '../../Models/Combos/MD_TB_Combos.js';
import { VentasModel } from '../../Models/Ventas/MD_TB_Ventas.js';

import { Op } from 'sequelize';

// Obtener todos los registros de combo_venta_log
export const OBRS_ComboVentaLog_CTS = async (req, res) => {
  try {
    const registros = await ComboVentaLogModel.findAll({
      include: [
        { model: CombosModel, as: 'combo' },
        { model: VentasModel, as: 'venta' }
      ],
      order: [['id', 'DESC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener todos los combos vendidos en una venta específica
export const OBRS_CombosPorVenta_CTS = async (req, res) => {
  const { venta_id } = req.params;

  try {
    const registros = await ComboVentaLogModel.findAll({
      where: { venta_id },
      include: [{ model: CombosModel, as: 'combo' }],
      order: [['id', 'ASC']]
    });

    res.json(registros);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear registro de combo vendido (1 o más)
export const CR_ComboVentaLog_CTS = async (req, res) => {
  const { venta_id, combo_id, precio_combo, cantidad } = req.body;

  if (!venta_id || !combo_id || !precio_combo) {
    return res.status(400).json({
      mensajeError:
        'Faltan datos: venta_id, combo_id y precio_combo son obligatorios.'
    });
  }

  try {
    const registro = await ComboVentaLogModel.create({
      venta_id,
      combo_id,
      precio_combo,
      cantidad: cantidad || 1
    });

    res.json({
      message: 'Registro de combo vendido creado correctamente',
      registro
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un registro
export const ER_ComboVentaLog_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const eliminado = await ComboVentaLogModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Registro no encontrado' });
    }

    res.json({ message: 'Registro eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
