/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'pedidos_stock' (transferencias entre sucursales).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const PedidoStockModel = db.define(
  'pedidos_stock',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Relaciones lógicas (FKs en la base)
    producto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'productos', key: 'id' }
    },
    stock_id_origen: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'stock', key: 'id' }
    },
    local_origen_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'locales', key: 'id' }
    },
    local_destino_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'locales', key: 'id' }
    },

    // Cantidades por etapa
    cantidad_solicitada: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    cantidad_preparada: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    cantidad_enviada: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    cantidad_recibida: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },

    // Workflow de estado
    estado: {
      type: DataTypes.ENUM(
        'pendiente',
        'visto',
        'preparacion',
        'enviado',
        'entregado',
        'cancelado'
      ),
      allowNull: false,
      defaultValue: 'pendiente'
    },

    prioridad: {
      type: DataTypes.ENUM('normal', 'alta'),
      allowNull: false,
      defaultValue: 'normal'
    },

    observaciones: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    creado_por: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' }
    },

    // Timestamps
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
    tableName: 'pedidos_stock',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Validaciones de dominio (reflejan los CHECKs de MySQL)
    validate: {
      cantidadesConsistentes() {
        const s = this.cantidad_solicitada ?? 0;
        const p = this.cantidad_preparada ?? 0;
        const e = this.cantidad_enviada ?? 0;
        const r = this.cantidad_recibida ?? 0;

        if (!(s > 0)) {
          throw new Error('cantidad_solicitada debe ser > 0');
        }
        if (p < 0 || p > s) {
          throw new Error(
            'cantidad_preparada debe estar entre 0 y cantidad_solicitada'
          );
        }
        if (e < 0 || e > p) {
          throw new Error(
            'cantidad_enviada debe estar entre 0 y cantidad_preparada'
          );
        }
        if (r < 0 || r > e) {
          throw new Error(
            'cantidad_recibida debe estar entre 0 y cantidad_enviada'
          );
        }
      }
    },

    indexes: [
      {
        name: 'idx_destino_estado',
        fields: ['local_destino_id', 'estado', 'created_at']
      },
      {
        name: 'idx_origen_estado',
        fields: ['local_origen_id', 'estado', 'created_at']
      },
      { name: 'idx_producto', fields: ['producto_id'] }
    ]
  }
);

export default {
  PedidoStockModel
};
