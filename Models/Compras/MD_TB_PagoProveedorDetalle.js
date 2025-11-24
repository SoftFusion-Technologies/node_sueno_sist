/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'pago_proveedor_detalle'.
 * - Incluye todos los campos del DDL.
 * - FKs: pago_id -> pagos_proveedor.id (CASCADE), compra_id -> compras.id (RESTRICT).
 * - Índices: UNIQUE (pago_id, compra_id) y idx_ppd_compra (compra_id).
 * - Validación: monto_aplicado > 0.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const PagoProveedorDetalleModel = db.define(
  'pago_proveedor_detalle',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'pagos_proveedor', key: 'id' }
    },

    compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'compras', key: 'id' }
    },

    monto_aplicado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0.01 } // DDL: CHECK (monto_aplicado > 0)
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'pago_proveedor_detalle',
    timestamps: false, // sólo created_at en el DDL
    indexes: [
      // UNIQUE del DDL
      {
        name: 'uq_pago_compra',
        unique: true,
        fields: ['pago_id', 'compra_id']
      },
      // Índice adicional del DDL
      { name: 'idx_ppd_compra', fields: ['compra_id'] }
    ],
    validate: {
      montoPositivo() {
        const m = Number(this.monto_aplicado ?? 0);
        if (!(m > 0)) {
          throw new Error('monto_aplicado debe ser > 0');
        }
      }
    }
  }
);

export default { PagoProveedorDetalleModel };
