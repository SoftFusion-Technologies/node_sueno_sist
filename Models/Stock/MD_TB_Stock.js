/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Stock.js) contiene la definición del modelo Sequelize para el stock de productos.
 *
 * Tema: Modelos - Stock
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'stock'
export const StockModel = db.define(
  'stock',
  {
    producto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    talle_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    local_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    lugar_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    estado_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    cantidad: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    en_perchero: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    codigo_sku: {
      type: DataTypes.STRING(150),
      allowNull: true
    }
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default {
  StockModel
};
