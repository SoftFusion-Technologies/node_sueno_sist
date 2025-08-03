/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 06 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_VentaDescuentos.js) contiene la definición del modelo Sequelize para la tabla venta_descuentos.
 *
 * Tema: Modelos - VentaDescuentos
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';
import { VentasModel } from './MD_TB_Ventas.js';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'venta_descuentos'
export const VentaDescuentosModel = db.define(
  'venta_descuentos',
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
    tipo: {
      type: DataTypes.ENUM('producto', 'medio_pago', 'manual'),
      allowNull: false
    },
    referencia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'ID de referencia (producto, medio_pago, o NULL para manual)'
    },
    detalle: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Nombre de producto, medio de pago o texto libre'
    },
    porcentaje: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true
    },
    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'venta_descuentos',
    timestamps: false,
    createdAt: 'created_at',
    updatedAt: false
  }
);

VentaDescuentosModel.belongsTo(VentasModel, {
  foreignKey: 'venta_id'
});

export default {
  VentaDescuentosModel
};
