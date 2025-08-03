/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_VentaMediosPago.js) contiene la definición del modelo Sequelize para la tabla venta_medios_pago.
 *
 * Tema: Modelos - Venta Medios de Pago
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

// import { VentasModel } from './MD_TB_Ventas.js';
// import { MediosPagoModel } from './MD_TB_MediosPago.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'venta_medios_pago'
export const VentaMediosPagoModel = db.define(
  'venta_medios_pago',
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
    medio_pago_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  },
  {
    timestamps: false
  }
);

// (Opcional) Relaciones en relaciones.js:
// VentaMediosPagoModel.belongsTo(VentasModel, { foreignKey: 'venta_id' });
// VentaMediosPagoModel.belongsTo(MediosPagoModel, { foreignKey: 'medio_pago_id' });

export default {
  VentaMediosPagoModel
};
