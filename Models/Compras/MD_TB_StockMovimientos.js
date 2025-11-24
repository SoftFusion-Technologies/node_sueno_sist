/*
 * Programador: Benjamin Orellana (con soporte por ChatGPT)
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'stock_movimientos'.
 * - Campos y FKs completos según DDL.
 * - Índices: producto+fecha, local+producto, ref_tabla+ref_id.
 * - Validaciones: delta != 0, costo_unit_neto >= 0 cuando se informa,
 *   coherencia (si hay ref_id debe haber ref_tabla),
 *   y guardrails de signo por tipo (estrictos sólo para COMPRA/VENTA/DEVOLUCIONES/RECEPCION_OC).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const StockMovimientoModel = db.define(
  'stock_movimientos',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Referencias de ubicación y estado
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'productos', key: 'id' }
    },
    local_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'locales', key: 'id' }
    },
    lugar_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'lugares', key: 'id' }
    },
    estado_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'estados', key: 'id' }
    },

    // Naturaleza del movimiento
    tipo: {
      type: DataTypes.ENUM(
        'COMPRA',
        'VENTA',
        'DEVOLUCION_PROVEEDOR',
        'DEVOLUCION_CLIENTE',
        'AJUSTE',
        'TRANSFERENCIA',
        'RECEPCION_OC'
      ),
      allowNull: false
    },

    // Cantidad: >0 entra | <0 sale
    delta: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    // Valuación (cuando corresponde)
    costo_unit_neto: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: true // puede ser NULL, p.ej. en ajustes informativos
    },

    moneda: {
      type: DataTypes.ENUM('ARS', 'USD', 'EUR', 'Otro'),
      allowNull: true,
      defaultValue: 'ARS'
    },

    // Trazabilidad con documento origen
    ref_tabla: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    ref_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },

    // Auditoría blanda
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notas: {
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
    tableName: 'stock_movimientos',
    timestamps: false, // sólo created_at en el DDL
    defaultScope: {
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC']
      ]
    },
    indexes: [
      // ===== Índices del DDL =====
      { name: 'idx_sm_producto_fecha', fields: ['producto_id', 'created_at'] },
      { name: 'idx_sm_local_producto', fields: ['local_id', 'producto_id'] },
      { name: 'idx_sm_ref', fields: ['ref_tabla', 'ref_id'] }
    ],
    validate: {
      deltaNoCero() {
        // DDL: CHECK (delta <> 0)
        const d = Number(this.delta ?? 0);
        if (!Number.isInteger(d) || d === 0) {
          throw new Error('delta debe ser un entero distinto de 0');
        }
      },
      costoNoNegativoCuandoSeInforma() {
        if (this.costo_unit_neto != null) {
          const c = Number(this.costo_unit_neto);
          if (Number.isNaN(c) || c < 0) {
            throw new Error('costo_unit_neto debe ser >= 0 cuando se informa');
          }
        }
      },
      refCoherente() {
        // Si hay ref_id, debe haber ref_tabla (p.ej. 'compras', 'ventas', 'recepciones')
        if (
          this.ref_id != null &&
          (!this.ref_tabla || !String(this.ref_tabla).trim())
        ) {
          throw new Error(
            'ref_tabla es obligatoria cuando ref_id está informado'
          );
        }
      },
      guardrailsDeSignoPorTipo() {
        // Estrictos para tipos típicos; AJUSTE/TRANSFERENCIA pueden ser +/-.
        const d = Number(this.delta ?? 0);
        if (
          this.tipo === 'COMPRA' ||
          this.tipo === 'DEVOLUCION_CLIENTE' ||
          this.tipo === 'RECEPCION_OC'
        ) {
          if (!(d > 0))
            throw new Error(`Para tipo ${this.tipo}, delta debe ser > 0`);
        }
        if (this.tipo === 'VENTA' || this.tipo === 'DEVOLUCION_PROVEEDOR') {
          if (!(d < 0))
            throw new Error(`Para tipo ${this.tipo}, delta debe ser < 0`);
        }
      }
    },
    hooks: {
      beforeValidate(instance) {
        // Normalizar strings
        if (typeof instance.ref_tabla === 'string') {
          instance.ref_tabla = instance.ref_tabla.trim() || null;
        }
        if (typeof instance.notas === 'string') {
          instance.notas = instance.notas.trim() || null;
        }
        if (instance.moneda == null) instance.moneda = 'ARS';
      }
    }
  }
);

export default { StockMovimientoModel };
