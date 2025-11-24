/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'pagos_proveedor'.
 * - Campos completos según DDL (incluye auditoría).
 * - FKs a proveedores, medios_pago, banco_cuentas, cheques y movimientos_caja.
 * - Índices: proveedor+fecha, por medio, cheque, banco y caja.
 * - Validaciones: monto_total > 0.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const PagoProveedorModel = db.define(
  'pagos_proveedor',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    proveedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'proveedores', key: 'id' }
    },

    canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: false,
      defaultValue: 'C1'
    },

    fecha: {
      type: DataTypes.DATE, // DATETIME
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    // Referencia al medio principal (si se usa modelo single-medium)
    medio_pago_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'medios_pago', key: 'id' }
    },

    // Si el medio fue banco / transferencia
    banco_cuenta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'banco_cuentas', key: 'id' }
    },

    // Si el medio fue cheque (recibido/emitido)
    cheque_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'cheques', key: 'id' }
    },

    // Si el medio fue caja
    movimiento_caja_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'movimientos_caja', key: 'id' }
    },

    monto_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0.01 } // DDL: CHECK (monto_total > 0)
    },
    estado: {
      type: DataTypes.ENUM('confirmado', 'anulado'),
      allowNull: false,
      defaultValue: 'confirmado'
    },

    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    tableName: 'pagos_proveedor',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    defaultScope: {
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    },
    scopes: {
      porProveedor(proveedorId) {
        return { where: { proveedor_id: proveedorId } };
      }
    },

    indexes: [
      // ===== Índices del DDL =====
      { name: 'idx_pp_prov_fecha', fields: ['proveedor_id', 'fecha'] },
      { name: 'idx_pp_medio', fields: ['medio_pago_id'] },
      { name: 'idx_pp_cheque', fields: ['cheque_id'] },
      { name: 'idx_pp_banco', fields: ['banco_cuenta_id'] },
      { name: 'idx_pp_caja', fields: ['movimiento_caja_id'] }
    ],

    validate: {
      montoPositivo() {
        const mt = Number(this.monto_total ?? 0);
        if (!(mt > 0)) {
          throw new Error('monto_total debe ser > 0');
        }
      }
      // Nota: si más adelante migrás a pagos_proveedor_medios (multi-medios),
      // no fuerces aquí que alguno de banco/cheque/caja esté presente: este
      // registro puede representar sólo la cabecera y los medios ir en la tabla hija.
    },

    hooks: {
      beforeValidate(instance) {
        if (typeof instance.observaciones === 'string') {
          instance.observaciones = instance.observaciones.trim() || null;
        }
        if (!instance.canal) instance.canal = 'C1';
      }
    }
  }
);

export default { PagoProveedorModel };
