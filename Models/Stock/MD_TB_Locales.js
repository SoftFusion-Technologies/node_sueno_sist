/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Locales.js) contiene la definición del modelo Sequelize para la tabla de sucursales (locales).
 *
 * Tema: Modelos - Locales
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'locales'
export const LocalesModel = db.define(
  'locales',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    direccion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  },
  {
    timestamps: false,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default {
  LocalesModel
};
