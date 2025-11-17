/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Proyección de flujo de fondos (ingresos/egresos) por origen y fecha.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const TesoFlujoModel = db.define(
  'teso_flujo',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    origen_tipo: {
      type: DataTypes.ENUM(
        'compra',
        'venta',
        'cheque',
        'transferencia',
        'efectivo',
        'otro'
      ),
      allowNull: false,
      defaultValue: 'cheque'
    },
    origen_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    signo: {
      type: DataTypes.ENUM('ingreso', 'egreso'),
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'teso_flujo',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { name: 'idx_fecha', fields: ['fecha', 'signo'] },
      { name: 'idx_origen', fields: ['origen_tipo', 'origen_id'] }
    ],
    validate: {
      montoPositivo() {
        const m = Number(this.monto ?? 0);
        if (!(m > 0)) throw new Error('El monto debe ser mayor a 0');
      }
    }
  }
);

export default { TesoFlujoModel };
