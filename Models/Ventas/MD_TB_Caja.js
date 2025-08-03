/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Caja.js) contiene la definición del modelo Sequelize para la tabla caja.
 *
 * Tema: Modelos - Caja
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'caja'
export const CajaModel = db.define(
  'caja',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    local_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    usuario_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    fecha_apertura: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    fecha_cierre: {
      type: DataTypes.DATE,
      allowNull: true
    },
    saldo_inicial: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    saldo_final: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    }
  },
  {
    timestamps: false
  }
);

export default {
  CajaModel
};
