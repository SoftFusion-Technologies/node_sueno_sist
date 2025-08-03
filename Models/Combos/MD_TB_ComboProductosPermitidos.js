/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla de productos y categorías habilitados en un combo.
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

export const ComboProductosPermitidosModel = db.define(
  'combo_productos_permitidos',
  {
    combo_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'combos',
        key: 'id'
      }
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'productos',
        key: 'id'
      }
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categorias',
        key: 'id'
      }
    }
  },
  {
    timestamps: false
  }
);

export default {
  ComboProductosPermitidosModel
};
