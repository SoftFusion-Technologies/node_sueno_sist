/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla de combos de productos con precio fijo.
 *
 * Tema: Modelos - Combos
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const CombosModel = db.define(
  'combos',
  {
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    precio_fijo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    cantidad_items: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    estado: {
      type: DataTypes.ENUM('activo', 'inactivo'),
      defaultValue: 'activo'
    }
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default {
  CombosModel
};
