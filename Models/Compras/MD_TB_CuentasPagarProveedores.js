/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'cuentas_pagar_proveedores' (CxP).
 * - Incluye todos los campos del DDL provisto.
 * - FKs: compra_id -> compras.id (CASCADE), proveedor_id -> proveedores.id (RESTRICT).
 * - Índices: proveedor+estado, fecha_vencimiento, estado.
 * - Validaciones: importes >= 0, saldo ≤ monto_total, estado ↔ saldo coherentes,
 *   fecha_vencimiento >= fecha_emision.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const CxpProveedorModel = db.define(
  'cuentas_pagar_proveedores',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Relación a la compra (una CxP por compra, sugerido a nivel negocio)
    compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'compras', key: 'id' }
    },

    // Proveedor titular de la deuda
    proveedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'proveedores', key: 'id' }
    },

    // Copia del canal de la compra
    canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: false,
      defaultValue: 'C1'
    },

    // Fechas
    fecha_emision: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },

    // Importes
    monto_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    saldo: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0 }
    },

    // Estado de la CxP
    estado: {
      type: DataTypes.ENUM('pendiente', 'parcial', 'cancelado'),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    // Auditoría
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
    tableName: 'cuentas_pagar_proveedores',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    defaultScope: {
      order: [['fecha_vencimiento', 'ASC']]
    },
    scopes: {
      abiertas: { where: { estado: ['pendiente', 'parcial'] } },
      canceladas: { where: { estado: 'cancelado' } }
    },

    indexes: [
      // ====== Índices del DDL ======
      { name: 'idx_cxp_proveedor', fields: ['proveedor_id', 'estado'] },
      { name: 'idx_cxp_venc', fields: ['fecha_vencimiento'] },
      { name: 'idx_cxp_estado', fields: ['estado'] }
      // (Opcional negocio) UNIQUE por compra_id, si se define en DB:
      // { name: 'uq_cxp_compra', unique: true, fields: ['compra_id'] }
    ],

    validate: {
      importesNoNegativos() {
        const mt = Number(this.monto_total ?? 0);
        const sd = Number(this.saldo ?? 0);
        if ([mt, sd].some((n) => Number.isNaN(n) || n < 0)) {
          throw new Error(
            'Importes inválidos: monto_total y saldo deben ser >= 0.'
          );
        }
      },

      saldoNoExcedeTotal() {
        const mt = Number(this.monto_total ?? 0);
        const sd = Number(this.saldo ?? 0);
        if (sd > mt) {
          throw new Error('El saldo no puede superar el monto_total.');
        }
      },

      estadoConsistenteConSaldo() {
        const sd = Number(this.saldo ?? 0);
        if (this.estado === 'cancelado' && sd !== 0) {
          throw new Error(
            'Una CxP en estado "cancelado" debe tener saldo = 0.'
          );
        }
        if (sd === 0 && this.estado !== 'cancelado') {
          throw new Error('Si el saldo es 0, el estado debe ser "cancelado".');
        }
        if (
          this.estado === 'pendiente' &&
          sd !== Number(this.monto_total ?? 0)
        ) {
          // Estricto: pendiente => sin imputaciones, saldo igual al total
          throw new Error(
            'Estado "pendiente" requiere saldo igual a monto_total.'
          );
        }
        if (
          this.estado === 'parcial' &&
          (sd <= 0 || sd >= Number(this.monto_total ?? 0))
        ) {
          throw new Error('Estado "parcial" requiere 0 < saldo < monto_total.');
        }
      },

      fechasCoherentes() {
        if (this.fecha_emision && this.fecha_vencimiento) {
          const em = new Date(this.fecha_emision);
          const ve = new Date(this.fecha_vencimiento);
          if (ve < em) {
            throw new Error(
              'fecha_vencimiento no puede ser anterior a fecha_emision.'
            );
          }
        }
      }
    },

    hooks: {
      beforeValidate(instance) {
        // No toques valores de negocio, pero asegurá tipos básicos
        if (instance.canal == null) instance.canal = 'C1';
      }
    }
  }
);

export default { CxpProveedorModel };
