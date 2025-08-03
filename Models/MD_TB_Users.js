/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Users.js) contiene la definición del modelo Sequelize para la tabla de usuarios.
 *
 * Tema: Modelos - Usuarios
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../DataBase/db.js';
import { DataTypes } from 'sequelize';
import { LocalesModel } from './Stock/MD_TB_Locales.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'usuarios'
export const UserModel = db.define(
  'usuarios',
  {
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    rol: {
      type: DataTypes.ENUM('admin', 'empleado', 'vendedor'),
      defaultValue: 'empleado'
    },
    local_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    }
  },
  {
    timestamps: false,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

// Relación con locales
UserModel.belongsTo(LocalesModel, { foreignKey: 'local_id' });

export default {
  UserModel
};
