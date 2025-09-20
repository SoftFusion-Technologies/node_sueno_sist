/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'banco_cuentas' (cuentas propias por banco).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const BancoCuentaModel = db.define(
  'banco_cuentas',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    banco_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'bancos', key: 'id' }
    },
    nombre_cuenta: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { len: [1, 120] }
    },
    moneda: {
      type: DataTypes.ENUM('ARS', 'USD', 'EUR', 'OTRA'),
      allowNull: false,
      defaultValue: 'ARS'
    },
    numero_cuenta: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    cbu: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    alias_cbu: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'banco_cuentas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ name: 'idx_banco', fields: ['banco_id'] }],
    underscored: false
  }
);

export default { BancoCuentaModel };
