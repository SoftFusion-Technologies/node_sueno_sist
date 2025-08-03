/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para registrar cada combo vendido con su precio.
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

export const ComboVentaLogModel = db.define(
  'combo_venta_log',
  {
    venta_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ventas',
        key: 'id'
      }
    },
    combo_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'combos',
        key: 'id'
      }
    },
    precio_combo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    cantidad: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  },
  {
    timestamps: false
  }
);

export default {
  ComboVentaLogModel
};
