/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_DetalleVenta.js) contiene la definición del modelo Sequelize para la tabla detalle_venta.
 *
 * Tema: Modelos - Detalle de Venta
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// Importar modelos relacionados si los vas a usar para relaciones
// import { VentasModel } from './MD_TB_Ventas.js';
// import { StockModel } from './Stock/MD_TB_Stock.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'detalle_venta'
export const DetalleVentaModel = db.define(
  'detalle_venta',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    venta_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    stock_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    cantidad: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    precio_unitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    descuento: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    descuento_porcentaje: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    precio_unitario_con_descuento: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true
    }
  },
  {
    timestamps: false
  }
);

export default {
  DetalleVentaModel
};
