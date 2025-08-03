/*
 * Programador: Benjamin Orellana
 * Fecha: 03 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controlador para visualizar logs de auditoría del sistema.
 * Permite listar todos los logs o buscar por filtros opcionales (usuario, módulo, etc.)
 */

import { LogModel } from '../Models/Seguridad/MD_TB_Logs.js';
import { UserModel } from '../Models/MD_TB_Users.js';
import { Op } from 'sequelize';

// Obtener todos los logs (con filtros opcionales)
export const OBRS_Logs_CTS = async (req, res) => {
  const { usuario_id, modulo, accion, fecha_inicio, fecha_fin, q } = req.query;

  try {
    const where = {};

    if (usuario_id) where.usuario_id = usuario_id;
    if (modulo) where.modulo = modulo;
    if (accion) where.accion = accion;
    if (fecha_inicio || fecha_fin) {
      where.fecha_hora = {};
      if (fecha_inicio) where.fecha_hora[Op.gte] = new Date(fecha_inicio);
      if (fecha_fin)
        where.fecha_hora[Op.lte] = new Date(fecha_fin + 'T23:59:59');
    }

    const logs = await LogModel.findAll({
      where, // ✅ aplicar filtros
      include: [
        {
          model: UserModel,
          as: 'usuario',
          attributes: ['id', 'nombre', 'email'],
          where: q ? { nombre: { [Op.like]: `%${q}%` } } : undefined // 🔍 filtro por nombre del usuario
        }
      ],
      order: [['fecha_hora', 'DESC']]
    });

    res.json(logs);
  } catch (error) {
    console.error('Error al obtener logs:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un log por ID
export const OBR_Log_CTS = async (req, res) => {
  try {
    const log = await LogModel.findByPk(req.params.id, {
      include: [{ model: UserModel, attributes: ['nombre', 'email'] }]
    });

    if (!log)
      return res.status(404).json({ mensajeError: 'Log no encontrado' });

    res.json(log);
  } catch (error) {
    console.error('Error al obtener log:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
