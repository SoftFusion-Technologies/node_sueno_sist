/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para registrar los productos vendidos dentro de un combo.
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

export const DetalleVentaCombosModel = db.define(
  'detalle_venta_combos',
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
    stock_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stock',
        key: 'id'
      }
    }
  },
  {
    timestamps: false
  }
);

export default {
  DetalleVentaCombosModel
};
