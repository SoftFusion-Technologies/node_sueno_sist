/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'cheque_imagenes' (archivos adjuntos a cheques).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeImagenModel = db.define(
  'cheque_imagenes',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    cheque_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'cheques', key: 'id' }
    },
    tipo: {
      type: DataTypes.ENUM('frente', 'dorso', 'otro'),
      allowNull: false,
      defaultValue: 'frente'
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        esMimeValido(v) {
          const allow = ['image/jpeg', 'image/png', 'application/pdf'];
          if (!allow.includes(v))
            throw new Error('Tipo de archivo no permitido');
        }
      }
    },
    byte_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      validate: { min: 1 }
    },
    width_px: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    height_px: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    sha256: {
      type: DataTypes.CHAR(64),
      allowNull: false
    },
    storage_key: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    storage_bucket: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    storage_region: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    uploaded_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
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
    tableName: 'cheque_imagenes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'idx_cheque', fields: ['cheque_id'] },
      { name: 'idx_created', fields: ['created_at'] },
      { name: 'uq_cheque_tipo', unique: true, fields: ['cheque_id', 'tipo'] },
      { name: 'uq_sha256', unique: true, fields: ['sha256'] }
    ]
  }
);

export default { ChequeImagenModel };
    