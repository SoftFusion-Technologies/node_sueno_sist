/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo contiene la definición del modelo Sequelize para la tabla 'logs',
 * que registra todas las acciones realizadas por los usuarios para trazabilidad y auditoría.
 *
 * Tema: Modelos - Logs de Auditoría
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo 'logs'
export const LogModel = db.define(
  'logs',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    },
    modulo: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    accion: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fecha_hora: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true
    }
  },
  {
    tableName: 'logs',
    timestamps: false
  }
);

export default {
  LogModel
};
