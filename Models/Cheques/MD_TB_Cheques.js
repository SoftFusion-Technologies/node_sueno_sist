/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.1
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'cheques' (recibidos de clientes / emitidos a proveedores).
 * Incorpora el campo 'formato' para distinguir físico vs eCheq.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ChequeModel = db.define(
  'cheques',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    tipo: {
      type: DataTypes.ENUM('recibido', 'emitido'),
      allowNull: false
    },
    canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: false,
      defaultValue: 'C1'
    },

    // ⬇️ Nuevo campo
    formato: {
      type: DataTypes.ENUM('fisico', 'echeq'),
      allowNull: false,
      defaultValue: 'fisico'
    },

    banco_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'bancos', key: 'id' }
    },
    chequera_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true, // requerido sólo si tipo='emitido' y formato='fisico'
      references: { model: 'chequeras', key: 'id' }
    },
    numero: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    fecha_emision: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    fecha_cobro_prevista: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // Referencias blandas (sin FK para desacoplar de otros módulos)
    cliente_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    proveedor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    venta_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    beneficiario_nombre: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    estado: {
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
      allowNull: false,
      defaultValue: 'registrado'
    },
    motivo_estado: {
      type: DataTypes.STRING(250),
      allowNull: true
    },
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
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
    tableName: 'cheques',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'idx_tipo_estado', fields: ['tipo', 'estado'] },
      {
        name: 'uq_banco_numero_formato',
        fields: ['banco_id', 'numero', 'formato'],
        unique: true
      },
      { name: 'idx_fecha_cobro_prevista', fields: ['fecha_cobro_prevista'] },
      { name: 'idx_chequera', fields: ['chequera_id'] },
      { name: 'idx_estado', fields: ['estado'] },
      { name: 'idx_cheques_formato', fields: ['formato'] } // útil para filtros
    ],
    validate: {
      chequeraRequeridaParaEmitidos() {
        // Requerido sólo para cheques emitidos físicos
        if (
          this.tipo === 'emitido' &&
          this.formato === 'fisico' &&
          this.chequera_id == null
        ) {
          throw new Error(
            'chequera_id es requerido cuando tipo = emitido y formato = fisico'
          );
        }
        // Si es eCheq, no exigimos chequera. Opcionalmente, podés forzar que sea null:
        // if (this.formato === 'echeq' && this.chequera_id != null) {
        //   throw new Error('chequera_id debe ser NULL cuando formato = echeq');
        // }
      }
    }
  }
);

export default { ChequeModel };
