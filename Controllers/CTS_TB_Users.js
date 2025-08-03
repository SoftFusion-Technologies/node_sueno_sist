/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Users.js) contiene controladores para manejar operaciones CRUD sobre la tabla de usuarios.
 *
 * Tema: Controladores - Usuarios
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Users from '../Models/MD_TB_Users.js';
import { LocalesModel } from '../Models/Stock/MD_TB_Locales.js';
import bcrypt from 'bcryptjs';
import { registrarLog } from '../Helpers/registrarLog.js';

const UserModel = MD_TB_Users.UserModel;

// Obtener todos los usuarios
export const OBRS_Usuarios_CTS = async (req, res) => {
  try {
    const usuarios = await UserModel.findAll({
      include: [{ model: LocalesModel }]
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo usuario por ID
export const OBR_Usuario_CTS = async (req, res) => {
  try {
    const usuario = await UserModel.findByPk(req.params.id, {
      include: [{ model: LocalesModel }]
    });
    if (!usuario)
      return res.status(404).json({ mensajeError: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo usuario
export const CR_Usuario_CTS = async (req, res) => {
  const { nombre, email, password, rol, local_id, usuario_log_id } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({
      mensajeError: 'Faltan campos obligatorios: nombre, email y password'
    });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const nuevo = await UserModel.create({
      nombre,
      email,
      password: hashedPassword,
      rol,
      local_id
    });

    const descripcion = `creó al usuario "${nombre}" con email "${email}" y rol "${rol}"`;

    await registrarLog(req, 'usuarios', 'crear', descripcion, usuario_log_id);

    res.json({ message: 'Usuario creado correctamente', usuario: nuevo });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      mensajeError: error.message,
      detalles: error.errors || error
    });
  }
};

// Eliminar un usuario
export const ER_Usuario_CTS = async (req, res) => {
  const { usuario_log_id } = req.body;

  try {
    const usuario = await UserModel.findByPk(req.params.id);
    if (!usuario)
      return res.status(404).json({ mensajeError: 'Usuario no encontrado' });

    await UserModel.destroy({ where: { id: req.params.id } });

    const descripcion = `eliminó al usuario "${usuario.nombre}" con email "${usuario.email}" y rol "${usuario.rol}"`;
    console.log('🧾 usuario_log_id recibido:', usuario_log_id);

    await registrarLog(
      req,
      'usuarios',
      'eliminar',
      descripcion,
      usuario_log_id
    );

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un usuario
export const UR_Usuario_CTS = async (req, res) => {
  const { id } = req.params;
  const { usuario_log_id } = req.body;

  try {
    const usuarioAnterior = await UserModel.findByPk(id);
    if (!usuarioAnterior) {
      return res.status(404).json({ mensajeError: 'Usuario no encontrado' });
    }

    // Guardamos antes de actualizar
    const cambios = [];
    for (const key of ['nombre', 'email', 'rol', 'local_id']) {
      if (req.body[key] && req.body[key] !== usuarioAnterior[key]?.toString()) {
        cambios.push(
          `cambió el campo "${key}" de "${usuarioAnterior[key]}" a "${req.body[key]}"`
        );
      }
    }

    const [updated] = await UserModel.update(req.body, { where: { id } });

    if (updated === 1) {
      const actualizado = await UserModel.findByPk(id);

      const descripcion =
        cambios.length > 0
          ? `actualizó el usuario "${usuarioAnterior.nombre}" (${
              usuarioAnterior.email
            }) y ${cambios.join(', ')}`
          : `actualizó el usuario "${usuarioAnterior.nombre}" sin cambios relevantes`;

      await registrarLog(
        req,
        'usuarios',
        'editar',
        descripcion,
        usuario_log_id
      );

      res.json({ message: 'Usuario actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Usuario no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
