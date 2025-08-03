/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_MediosPago.js) contiene la definición del modelo Sequelize para la tabla de medios de pago.
 *
 * Tema: Modelos - Medios de Pago
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'medios_pago'
export const MediosPagoModel = db.define(
  'medios_pago',
  {
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(100),
      defaultValue: ''
    },
    activo: {
      type: DataTypes.TINYINT,
      defaultValue: 1
    },
    icono: {
      type: DataTypes.STRING(50),
      defaultValue: ''
    },
    orden: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    ajuste_porcentual: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
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
  MediosPagoModel
};
