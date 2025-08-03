/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_MovimientosCaja.js) contiene la definición del modelo Sequelize para la tabla movimientos_caja.
 *
 * Tema: Modelos - Movimientos de Caja
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'movimientos_caja'
export const MovimientosCajaModel = db.define(
  'movimientos_caja',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    caja_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    tipo: {
      type: DataTypes.ENUM('ingreso', 'egreso'),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    referencia: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  },
  {
    timestamps: false
  }
);


export default {
  MovimientosCajaModel
};
