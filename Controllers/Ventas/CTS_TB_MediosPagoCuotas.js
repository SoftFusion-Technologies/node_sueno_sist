/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 06 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones CRUD sobre la tabla de recargos por cuotas de medios de pago.
 *
 * Tema: Controladores - Medios de Pago Cuotas
 * Capa: Backend
 */

import { MediosPagoCuotasModel } from '../../Models/Ventas/MD_TB_MediosPagoCuotas.js';
import { MediosPagoModel } from '../../Models/Ventas/MD_TB_MediosPago.js';

// Obtener todas las cuotas con su medio de pago
export const OBRS_MediosPagoCuotas_CTS = async (req, res) => {
  try {
    const cuotas = await MediosPagoCuotasModel.findAll({
      include: {
        model: MediosPagoModel,
        as: 'medio_pago',
        attributes: ['id', 'nombre']
      },
      order: [
        ['medio_pago_id', 'ASC'],
        ['cuotas', 'ASC']
      ]
    });
    res.json(cuotas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener recargo por cuotas para un medio específico
export const OBR_CuotasPorMedio_CTS = async (req, res) => {
  const { medio_pago_id } = req.params;

  try {
    const cuotas = await MediosPagoCuotasModel.findAll({
      where: { medio_pago_id },
      order: [['cuotas', 'ASC']]
    });

    res.json(cuotas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo recargo por cuotas
export const CR_MedioPagoCuota_CTS = async (req, res) => {
  const { medio_pago_id, cuotas, porcentaje_recargo } = req.body;

  if (!medio_pago_id || !cuotas) {
    return res.status(400).json({
      mensajeError: 'medio_pago_id y cuotas son obligatorios'
    });
  }

  try {
    const nueva = await MediosPagoCuotasModel.create({
      medio_pago_id,
      cuotas,
      porcentaje_recargo: porcentaje_recargo || 0
    });

    res.json({ message: 'Cuota agregada correctamente', cuota: nueva });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar recargo por cuota
export const UR_MedioPagoCuota_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await MediosPagoCuotasModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await MediosPagoCuotasModel.findByPk(id);
      res.json({
        message: 'Cuota actualizada correctamente',
        actualizado
      });
    } else {
      res.status(404).json({ mensajeError: 'Cuota no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar cuota
export const ER_MedioPagoCuota_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const eliminado = await MediosPagoCuotasModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Cuota no encontrada' });
    }

    res.json({ message: 'Cuota eliminada correctamente.' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
