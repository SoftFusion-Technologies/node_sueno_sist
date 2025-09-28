/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Movimientos de cuentas bancarias (débito/crédito), referenciables a cheques u otros.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const BancoMovimientoModel = db.define(
  'banco_movimientos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    banco_cuenta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'banco_cuentas', key: 'id' }
    },
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    debito: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },
    credito: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0.0
    },
    referencia_tipo: {
      type: DataTypes.ENUM(
        'cheque',
        'transferencia',
        'venta',
        'compra',
        'pago',
        'deposito',
        'conciliacion',
        'otro'
      ),
      allowNull: false,
      defaultValue: 'cheque'
    },
    referencia_id: {
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
    tableName: 'banco_movimientos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { name: 'idx_cuenta_fecha', fields: ['banco_cuenta_id', 'fecha'] },
      { name: 'idx_ref', fields: ['referencia_tipo', 'referencia_id'] }
    ],
    validate: {
      noDebitoYCredito() {
        const deb = Number(this.debito ?? 0);
        const cre = Number(this.credito ?? 0);
        if (deb > 0 && cre > 0) {
          throw new Error(
            'No puede haber débito y crédito > 0 en el mismo movimiento'
          );
        }
        if (deb <= 0 && cre <= 0) {
          throw new Error('Debe consignar un débito o un crédito mayor a 0');
        }
      }
    }
  }
);

export default { BancoMovimientoModel };
