/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'chequeras' (rango de cheques de una cuenta bancaria propia).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeraModel = db.define(
  'chequeras',
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
    descripcion: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { len: [1, 120] }
    },
    nro_desde: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    nro_hasta: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    proximo_nro: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    estado: {
      type: DataTypes.ENUM('activa', 'agotada', 'bloqueada', 'anulada'),
      allowNull: false,
      defaultValue: 'activa'
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
    tableName: 'chequeras',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ name: 'idx_cuenta', fields: ['banco_cuenta_id'] }],
    validate: {
      rangoValido() {
        const desde = BigInt(this.nro_desde ?? 0);
        const hasta = BigInt(this.nro_hasta ?? 0);
        const prox = BigInt(this.proximo_nro ?? 0);
        if (desde > hasta) {
          throw new Error('nro_desde no puede ser mayor que nro_hasta');
        }
        if (prox < desde || prox > hasta) {
          throw new Error('proximo_nro fuera del rango definido');
        }
      }
    }
  }
);

export default { ChequeraModel };
