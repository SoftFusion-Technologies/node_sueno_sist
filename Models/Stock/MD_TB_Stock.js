/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 08 / 2025
 * Versión: 2.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'stock' adaptado al sistema de "El Sueño"
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const StockModel = db.define(
  'stock',
  {
    producto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'productos',
        key: 'id'
      }
    },
    local_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'locales',
        key: 'id'
      }
    },
    lugar_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'lugares',
        key: 'id'
      }
    },
    estado_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'estados',
        key: 'id'
      }
    },
    cantidad: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    en_exhibicion: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    observaciones: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: 'stock',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'uk_stock',
        unique: true,
        fields: ['producto_id', 'local_id', 'lugar_id', 'estado_id']
      }
    ]
  }
);

export default {
  StockModel
};
