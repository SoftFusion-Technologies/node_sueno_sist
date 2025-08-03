/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 28 / 07 / 2025   
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_RecaptacionClientes.js) contiene controladores para manejar operaciones CRUD sobre la tabla de asignación de clientes a campañas de recaptación.
 *
 * Tema: Controladores - Recaptación
 * Capa: Backend
 */

import { RecaptacionClientesModel } from '../../Models/Recaptacion/MD_TB_RecaptacionClientes.js';
import { ClienteModel } from '../../Models/MD_TB_Clientes.js';
import { RecaptacionCampanasModel } from '../../Models/Recaptacion/MD_TB_RecaptacionCampanas.js';

// Obtener todos los registros de recaptación (clientes asignados)
export const OBRS_RecaptacionClientes_CTS = async (req, res) => {
  try {
    const asignaciones = await RecaptacionClientesModel.findAll({
      include: [
        { model: ClienteModel, attributes: ['id', 'nombre', 'email'] },
        { model: RecaptacionCampanasModel, attributes: ['id', 'nombre'] }
      ],
      order: [['fecha_envio', 'DESC']]
    });
    res.json(asignaciones);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear asignación cliente-campaña
export const CR_RecaptacionCliente_CTS = async (req, res) => {
  const { cliente_id, campana_id, respuesta } = req.body;

  if (!cliente_id || !campana_id) {
    return res
      .status(400)
      .json({ mensajeError: 'cliente_id y campana_id son obligatorios' });
  }

  try {
    const nueva = await RecaptacionClientesModel.create({
      cliente_id,
      campana_id,
      respuesta
    });
    res.json({
      message: 'Asignación registrada correctamente',
      asignacion: nueva
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar respuesta de cliente
export const UR_RespuestaRecaptacion_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { respuesta } = req.body;

    const [updated] = await RecaptacionClientesModel.update(
      { respuesta },
      { where: { id } }
    );

    if (updated === 1) {
      const actualizado = await RecaptacionClientesModel.findByPk(id);
      res.json({ message: 'Respuesta actualizada correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Asignación no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar asignación
export const ER_RecaptacionCliente_CTS = async (req, res) => {
  try {
    const eliminado = await RecaptacionClientesModel.destroy({
      where: { id: req.params.id }
    });
    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Asignación no encontrada' });

    res.json({ message: 'Asignación eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
