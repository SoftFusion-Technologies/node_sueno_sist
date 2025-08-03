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
  const { nombre, email, password, rol, local_id } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({
      mensajeError: 'Faltan campos obligatorios: nombre, email y password'
    });
  }

  try {
    // Hashear la contraseña antes de guardar
    const salt = await bcrypt.genSalt(10); // 10 es el valor estándar de rounds
    const hashedPassword = await bcrypt.hash(password, salt);

    const nuevo = await UserModel.create({
      nombre,
      email,
      password: hashedPassword, // Guardamos la password hasheada
      rol,
      local_id
    });
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
  try {
    const eliminado = await UserModel.destroy({ where: { id: req.params.id } });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Usuario no encontrado' });

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un usuario
export const UR_Usuario_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await UserModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await UserModel.findByPk(id);
      res.json({ message: 'Usuario actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Usuario no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
