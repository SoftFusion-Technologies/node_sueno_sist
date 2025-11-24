/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 24 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'ordenes_compra'.
 * Representa las Órdenes de Compra (OC), documento previo a la compra
 * definitiva. No genera CxP ni stock por sí misma; sirve para pre-aprobar
 * cantidades, precios estimados y fechas de entrega.
 *
 * Tema: Modelos - Compras (Órdenes)
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const OrdenCompraModel = db.define(
  'ordenes_compra',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Canal (C1 legal, C2 no-legal) - mismo criterio que compras
    canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: false,
      defaultValue: 'C1'
    },

    // FK proveedor
    proveedor_id: {
      type: DataTypes.INTEGER, // DDL: INT NOT NULL
      allowNull: false,
      references: { model: 'proveedores', key: 'id' }
    },

    // FK local destino (puede ser null)
    local_id: {
      type: DataTypes.INTEGER, // DDL: INT NULL
      allowNull: true,
      references: { model: 'locales', key: 'id' }
    },

    // Fechas
    fecha: {
      type: DataTypes.DATE, // DATETIME
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    fecha_estimada_entrega: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    condicion_compra: {
      type: DataTypes.ENUM('contado', 'cuenta_corriente', 'credito', 'otro'),
      allowNull: false,
      defaultValue: 'cuenta_corriente'
    },

    // Moneda
    moneda: {
      type: DataTypes.ENUM('ARS', 'USD', 'EUR', 'Otro'),
      allowNull: false,
      defaultValue: 'ARS'
    },

    // Importes ESTIMADOS (no generan contabilidad directa)
    subtotal_neto_estimado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    iva_estimado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    percepciones_estimadas: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    retenciones_estimadas: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    total_estimado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0 }
    },

    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },

    estado: {
      type: DataTypes.ENUM(
        'borrador',
        'pendiente_aprobacion',
        'aprobada',
        'rechazada',
        'cerrada'
      ),
      allowNull: false,
      defaultValue: 'borrador'
    },

    prioridad: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'urgente'),
      allowNull: false,
      defaultValue: 'media'
    },

    // Auditoría
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
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
    tableName: 'ordenes_compra',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    defaultScope: {
      order: [['id', 'DESC']]
    },
    scopes: {
      borradores: { where: { estado: 'borrador' } },
      pendientes: { where: { estado: 'pendiente_aprobacion' } },
      aprobadas: { where: { estado: 'aprobada' } },
      abiertas: {
        // todo lo que aún no está cerrado/rechazado
        where: { estado: ['borrador', 'pendiente_aprobacion', 'aprobada'] }
      }
    },

    indexes: [
      { name: 'idx_oc_proveedor_fecha', fields: ['proveedor_id', 'fecha'] },
      { name: 'idx_oc_estado', fields: ['estado'] },
      { name: 'idx_oc_local', fields: ['local_id'] },
      {
        name: 'idx_oc_venc_estimada',
        fields: ['fecha_estimada_entrega']
      }
    ],

    validate: {
      totalesEstimadosNoNegativos() {
        const ns = Number(this.subtotal_neto_estimado ?? 0);
        const iv = Number(this.iva_estimado ?? 0);
        const pe = Number(this.percepciones_estimadas ?? 0);
        const re = Number(this.retenciones_estimadas ?? 0);
        const tt = Number(this.total_estimado ?? 0);
        if ([ns, iv, pe, re, tt].some((n) => Number.isNaN(n) || n < 0)) {
          throw new Error(
            'Importes estimados inválidos: todos deben ser numéricos y >= 0'
          );
        }
      },

      // validación "soft": el total estimado no puede ser negativo
      totalEstimadoNoNegativo() {
        const tt = Number(this.total_estimado ?? 0);
        if (tt < 0) {
          throw new Error(
            'El total_estimado de la orden no puede ser negativo.'
          );
        }
      }
    },

    hooks: {
      beforeValidate(instance) {
        [
          'subtotal_neto_estimado',
          'iva_estimado',
          'percepciones_estimadas',
          'retenciones_estimadas'
        ].forEach((k) => {
          if (instance[k] == null) instance[k] = 0.0;
        });
      }
    }
  }
);

export default { OrdenCompraModel };
