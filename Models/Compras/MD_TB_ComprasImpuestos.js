/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'compras_impuestos'.
 * - FKs: compra_id -> compras.id (CASCADE), codigo -> impuestos_config.codigo (SET NULL).
 * - Índices: idx_ci_compra (compra_id), idx_ci_tipo (tipo, codigo).
 * - Validaciones: base/monto >= 0; alicuota en [0..1]; normalización de 'codigo' a upper-case.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const CompraImpuestoModel = db.define(
  'compras_impuestos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // FK a compras (CASCADE)
    compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'compras', key: 'id' }
    },

    // Tipo de impuesto
    tipo: {
      type: DataTypes.ENUM('IVA', 'Percepcion', 'Retencion', 'Otro'),
      allowNull: false
    },

    // Opcional: referencia a impuestos_config.codigo (UNIQUE)
    codigo: {
      type: DataTypes.STRING(40),
      allowNull: true,
      references: { model: 'impuestos_config', key: 'codigo' }
    },

    base: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },

    alicuota: {
      type: DataTypes.DECIMAL(7, 4),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0, max: 1 } // 1 = 100%
    },

    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'compras_impuestos',
    timestamps: false, // sólo created_at en DDL
    defaultScope: {
      order: [['id', 'ASC']]
    },
    indexes: [
      { name: 'idx_ci_compra', fields: ['compra_id'] },
      { name: 'idx_ci_tipo', fields: ['tipo', 'codigo'] }
    ],
    hooks: {
      beforeValidate(instance) {
        if (typeof instance.codigo === 'string') {
          instance.codigo = instance.codigo.trim().toUpperCase() || null;
        }
      }
    }
  }
);

export default { CompraImpuestoModel };
