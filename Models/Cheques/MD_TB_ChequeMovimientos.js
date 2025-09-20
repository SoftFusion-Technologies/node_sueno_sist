/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Movimientos/bitácora de un cheque (alta, depósito, acreditación, rechazo, etc.).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeMovimientoModel = db.define(
  'cheque_movimientos',
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
    tipo_mov: {
      type: DataTypes.ENUM(
        'alta',
        'aplicacion',
        'deposito',
        'acreditacion',
        'rechazo',
        'anulacion',
        'entrega',
        'compensacion'
      ),
      allowNull: false
    },
    fecha_mov: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    referencia_tipo: {
      type: DataTypes.ENUM(
        'venta',
        'compra',
        'pago',
        'deposito',
        'conciliacion',
        'otro'
      ),
      allowNull: false,
      defaultValue: 'otro'
    },
    referencia_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    notas: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'cheque_movimientos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { name: 'idx_cheque', fields: ['cheque_id', 'tipo_mov', 'fecha_mov'] }
    ]
  }
);

export default { ChequeMovimientoModel };
