/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 29 / 10 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'cheques_usos'.
 * Registra acciones sobre cheques (depositar, aplicar a compra, acreditar, etc.)
 * con snapshots para auditoría y trazabilidad, sin modificar 'cheques'.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeUsoModel = db.define(
  'cheques_usos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    cheque_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },

    // Acción efectuada y estado resultante
    accion: {
      type: DataTypes.ENUM(
        'aplicar_a_compra',
        'depositar',
        'acreditar',
        'entregar',
        'compensar',
        'rechazar',
        'anular'
      ),
      allowNull: false
    },
    resultado_estado: {
      type: DataTypes.ENUM(
        'registrado',
        'en_cartera',
        'aplicado_a_compra',
        'endosado',
        'depositado',
        'acreditado',
        'rechazado',
        'anulado',
        'entregado',
        'compensado'
      ),
      allowNull: true
    },

    // Económicos y contrapartes
    monto_usado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    proveedor_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    compra_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    venta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    caja_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    movimiento_caja_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    banco_cuenta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

    // Fechas / obs / auditoría
    fecha_operacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW // default CURRENT_TIMESTAMP
    },
    fecha_valor: {
      type: DataTypes.DATEONLY, // ej: fecha de depósito o acreditación
      allowNull: true
    },
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

    // Idempotencia (UUID recomendado)
    idempotency_key: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      unique: true
    },

    // Snapshots del cheque (para reportes históricos sin joins)
    cheque_numero: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    cheque_formato: {
      type: DataTypes.ENUM('fisico', 'echeq'),
      allowNull: true
    },
    cheque_monto: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    cheque_fecha_emision: { type: DataTypes.DATEONLY, allowNull: true },
    cheque_fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
    cheque_banco_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    cheque_tipo: {
      type: DataTypes.ENUM('recibido', 'emitido'),
      allowNull: true
    },
    cheque_canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: true
    }
  },
  {
    tableName: 'cheques_usos',
    timestamps: false, // usamos fecha_operacion manual
    indexes: [
      {
        name: 'ix_cu_cheque_accion_fecha',
        fields: ['cheque_id', 'accion', 'fecha_operacion']
      },
      { name: 'ix_cu_estado', fields: ['resultado_estado'] },
      { name: 'ix_cu_proveedor', fields: ['proveedor_id'] },
      { name: 'ix_cu_caja', fields: ['caja_id'] }
    ]
  }
);

export default { ChequeUsoModel };
