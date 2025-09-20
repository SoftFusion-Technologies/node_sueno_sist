/*
 * Eventos de archivo: upload/delete/download (auditoría liviana).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeImagenEventoModel = db.define(
  'cheque_imagen_eventos',
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
    cheque_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'cheques', key: 'id' }
    },
    evento: {
      type: DataTypes.ENUM('upload', 'delete', 'download'),
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    ip_addr: {
      type: DataTypes.BLOB, // VARBINARY(16) en DDL; BLOB ok para Sequelize
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    detalle: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'cheque_imagen_eventos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { name: 'idx_imagen', fields: ['imagen_id'] },
      { name: 'idx_cheque', fields: ['cheque_id'] },
      { name: 'idx_evento', fields: ['evento', 'created_at'] }
    ]
  }
);

export default { ChequeImagenEventoModel };
