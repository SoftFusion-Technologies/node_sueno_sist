/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'bancos' (catálogo de bancos).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const BancoModel = db.define(
  'bancos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: 'uq_banco_nombre',
      validate: { len: [1, 120] }
    },
    cuit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    alias: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    activo: {
      type: DataTypes.BOOLEAN, // TINYINT(1)
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
    tableName: 'bancos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ name: 'uq_banco_nombre', unique: true, fields: ['nombre'] }],
    underscored: false
  }
);

export default { BancoModel };
