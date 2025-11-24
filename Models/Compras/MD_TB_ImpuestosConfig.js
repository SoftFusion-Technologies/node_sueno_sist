/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'impuestos_config'.
 * - Campos completos según DDL (incluye UNIQUE(codigo) e índice por (tipo, activo)).
 * - Validaciones: alicuota en rango [0..1] (p.ej. 0.1050 = 10.5%), código no vacío.
 * - Hooks de normalización: trim y upper-case para 'codigo'.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ImpuestoConfigModel = db.define(
  'impuestos_config',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    tipo: {
      type: DataTypes.ENUM('IVA', 'Percepcion', 'Retencion', 'Otro'),
      allowNull: false
    },

    // p.ej. 'IVA21','IVA105','PERC_IIBB_TUC'
    codigo: {
      type: DataTypes.STRING(40),
      allowNull: false
    },

    descripcion: {
      type: DataTypes.STRING(160),
      allowNull: true
    },

    // 0.1050, 0.0300, etc.
    alicuota: {
      type: DataTypes.DECIMAL(7, 4),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        min: 0,
        max: 1 // 1 = 100%
      }
    },

    jurisdiccion: {
      type: DataTypes.STRING(60),
      allowNull: true
    },

    // TINYINT(1)
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
    tableName: 'impuestos_config',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    defaultScope: {
      order: [
        ['tipo', 'ASC'],
        ['codigo', 'ASC']
      ]
    },
    scopes: {
      activos: { where: { activo: true } },
      porTipo(t) {
        return { where: { tipo: t } };
      }
    },

    indexes: [
      { name: 'uq_impuestos_codigo', unique: true, fields: ['codigo'] },
      { name: 'idx_impuestos_tipo', fields: ['tipo', 'activo'] }
    ],

    validate: {
      codigoNoVacio() {
        const c = (this.codigo ?? '').toString().trim();
        if (!c) throw new Error('codigo es obligatorio.');
      }
    },

    hooks: {
      beforeValidate(instance) {
        if (typeof instance.codigo === 'string') {
          instance.codigo = instance.codigo.trim().toUpperCase();
        }
        if (typeof instance.descripcion === 'string') {
          instance.descripcion = instance.descripcion.trim() || null;
        }
        if (typeof instance.jurisdiccion === 'string') {
          instance.jurisdiccion = instance.jurisdiccion.trim() || null;
        }
      }
    }
  }
);

export default { ImpuestoConfigModel };
