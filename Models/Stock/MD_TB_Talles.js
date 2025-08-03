/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Talles.js) contiene la definición del modelo Sequelize para la tabla de talles.
 *
 * Tema: Modelos - Talles
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'talles'
export const TallesModel = db.define(
  'talles',
  {
    nombre: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(255),
      defaultValue: ''
    },
    tipo_categoria: {
      type: DataTypes.ENUM('ropa', 'calzado', 'accesorio'),
      defaultValue: 'ropa'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default {
  TallesModel
};
