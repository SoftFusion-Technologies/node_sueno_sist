/*
 * Programador: Benjamin Orellana
 * Fecha: 03 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Función reutilizable para registrar logs en la tabla de auditoría del sistema.
 * Debe ser llamada desde cualquier acción CRUD, login, etc.
 */

import { LogModel } from '../Models/Seguridad/MD_TB_Logs.js';
import { UserModel } from '../Models/MD_TB_Users.js'; // ✅ FALTABA ESTO

export const registrarLog = async (
  req,
  modulo,
  accion,
  descripcion,
  usuarioId
) => {
  try {
    if (!usuarioId) {
      console.warn('⚠️ No se proporcionó usuarioId al registrarLog');
      return;
    }

    const usuario = await UserModel.findByPk(usuarioId);
    const nombreUsuario = usuario ? usuario.nombre : `ID ${usuarioId}`;

    const ip =
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    await LogModel.create({
      usuario_id: usuarioId,
      modulo,
      accion,
      descripcion: `El usuario "${nombreUsuario}" ${descripcion}`,
      ip
    });
  } catch (error) {
    console.error('Error al registrar log:', error.message);
  }
};
