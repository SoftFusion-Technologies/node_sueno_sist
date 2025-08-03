/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_TicketConfig.js) contiene controladores para manejar operaciones CRUD sobre la tabla de configuración del ticket.
 *
 * Tema: Controladores - Ticket Configuración
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_TicketConfig from '../../Models/Ventas/MD_TB_TicketConfig.js';
const TicketConfigModel = MD_TB_TicketConfig.TicketConfigModel;

// Obtener la configuración actual (asumimos 1 sola fila)
export const OBRS_TicketConfig_CTS = async (req, res) => {
  try {
    const config = await TicketConfigModel.findOne();
    if (!config)
      return res
        .status(404)
        .json({ mensajeError: 'Configuración no encontrada' });
    res.json(config);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear una nueva configuración (solo si no existe)
export const CR_TicketConfig_CTS = async (req, res) => {
  try {
    // Validar que no exista ya una configuración
    const existente = await TicketConfigModel.findOne();
    if (existente) {
      return res.status(409).json({
        mensajeError:
          'Ya existe una configuración. Edítala o elimina la actual.'
      });
    }
    const nuevo = await TicketConfigModel.create(req.body);
    res.json({ message: 'Configuración creada correctamente', config: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar la configuración (por id o la única fila existente)
export const UR_TicketConfig_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    // Si hay ID, actualiza por ID, si no, actualiza la primera fila encontrada
    const filtro = id ? { where: { id } } : {};
    const [updated] = await TicketConfigModel.update(req.body, filtro);

    if (updated === 1) {
      const actualizado = id
        ? await TicketConfigModel.findByPk(id)
        : await TicketConfigModel.findOne();
      res.json({
        message: 'Configuración actualizada correctamente',
        actualizado
      });
    } else {
      res.status(404).json({ mensajeError: 'Configuración no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar configuración (opcional, solo si permites eliminar)
export const ER_TicketConfig_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const eliminado = await TicketConfigModel.destroy({ where: { id } });

    if (!eliminado)
      return res
        .status(404)
        .json({ mensajeError: 'Configuración no encontrada' });

    res.json({ message: 'Configuración eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
