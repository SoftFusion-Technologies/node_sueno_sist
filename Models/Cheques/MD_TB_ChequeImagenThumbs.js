/*
 * Miniaturas de imágenes de cheques (para performance en grillas/preview).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeImagenThumbModel = db.define(
  'cheque_imagen_thumbs',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    imagen_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'cheque_imagenes', key: 'id' }
    },
    variante: {
      type: DataTypes.ENUM('xs', 'sm', 'md'),
      allowNull: false
    },
    storage_key: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    byte_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    width_px: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    height_px: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'cheque_imagen_thumbs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { name: 'idx_imagen', fields: ['imagen_id'] },
      {
        name: 'uq_imagen_variante',
        unique: true,
        fields: ['imagen_id', 'variante']
      }
    ]
  }
);

export default { ChequeImagenThumbModel };
