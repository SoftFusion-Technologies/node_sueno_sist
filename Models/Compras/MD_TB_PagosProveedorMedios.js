/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'pagos_proveedor_medios' (desglose multi-medios).
 * - Campos completos según DDL.
 * - FKs: pago_id, medio_pago_id, banco_cuenta_id, cheque_id, movimiento_caja_id.
 * - Índices: pago_id, tipo_origen, cheque_id, banco_cuenta_id.
 * - Validaciones: monto > 0; coherencia de vínculos según tipo_origen.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const PagoProveedorMedioModel = db.define(
  'pagos_proveedor_medios',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Cabecera de pago
    pago_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'pagos_proveedor', key: 'id' }
    },

    // Tipo de origen del medio
    tipo_origen: {
      type: DataTypes.ENUM(
        'EFECTIVO',
        'TRANSFERENCIA',
        'DEPOSITO',
        'CHEQUE_RECIBIDO',
        'CHEQUE_EMITIDO',
        'AJUSTE',
        'OTRO'
      ),
      allowNull: false
    },

    // Catálogo (icono/config/ajuste). Opcional
    medio_pago_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'medios_pago', key: 'id' }
    },

    // Vínculo bancario para transfer/depósito
    banco_cuenta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'banco_cuentas', key: 'id' }
    },

    // Vínculo a cheque (recibido o emitido)
    cheque_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'cheques', key: 'id' }
    },

    // Movimiento de caja (efectivo)
    movimiento_caja_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'movimientos_caja', key: 'id' }
    },

    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0.01 } // DDL: CHECK (monto > 0)
    },

    observaciones: {
      type: DataTypes.STRING(300),
      allowNull: true
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'pagos_proveedor_medios',
    timestamps: false, // sólo created_at en DDL
    defaultScope: {
      order: [['id', 'ASC']]
    },
    indexes: [
      // ===== Índices del DDL =====
      { name: 'idx_ppm_pago', fields: ['pago_id'] },
      { name: 'idx_ppm_tipo', fields: ['tipo_origen'] },
      { name: 'idx_ppm_cheque', fields: ['cheque_id'] },
      { name: 'idx_ppm_banco', fields: ['banco_cuenta_id'] }
    ],
    validate: {
      // Guardrails de coherencia según tipo_origen
      coherenciaSegunTipo() {
        const tipo = this.tipo_origen;
        if (tipo === 'EFECTIVO' && this.movimiento_caja_id == null) {
          throw new Error(
            'Para tipo EFECTIVO, movimiento_caja_id es requerido.'
          );
        }
        if (
          (tipo === 'TRANSFERENCIA' || tipo === 'DEPOSITO') &&
          this.banco_cuenta_id == null
        ) {
          throw new Error(`Para tipo ${tipo}, banco_cuenta_id es requerido.`);
        }
        if (
          (tipo === 'CHEQUE_RECIBIDO' || tipo === 'CHEQUE_EMITIDO') &&
          this.cheque_id == null
        ) {
          throw new Error(`Para tipo ${tipo}, cheque_id es requerido.`);
        }
      }
    },
    hooks: {
      beforeValidate(instance) {
        if (typeof instance.observaciones === 'string') {
          instance.observaciones = instance.observaciones.trim() || null;
        }
      }
    }
  }
);

export default { PagoProveedorMedioModel };
