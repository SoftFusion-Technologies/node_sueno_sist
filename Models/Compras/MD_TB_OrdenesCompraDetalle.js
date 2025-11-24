/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 24 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'ordenes_compra_detalle'.
 * Representa las líneas de cada Orden de Compra:
 * producto (opcional), descripción, cantidad y costos ESTIMADOS.
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

export const OrdenCompraDetalleModel = db.define(
  'ordenes_compra_detalle',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    orden_compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'ordenes_compra', key: 'id' }
    },

    // Puede ser NULL si es un servicio u otro concepto
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'productos', key: 'id' }
    },

    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    cantidad: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      validate: {
        min: {
          args: [1],
          msg: 'La cantidad debe ser mayor a 0.'
        }
      }
    },

    costo_unit_estimado: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      validate: {
        min: {
          args: [0],
          msg: 'El costo unitario estimado no puede ser negativo.'
        }
      }
    },

    alicuota_iva_estimado: {
      type: DataTypes.DECIMAL(5, 2), // 21.00, 10.50, etc.
      allowNull: false,
      defaultValue: 21.0,
      validate: {
        min: { args: [0], msg: 'La alícuota de IVA no puede ser negativa.' },
        max: { args: [100], msg: 'La alícuota de IVA no puede superar 100%.' }
      }
    },

    inc_iva_estimado: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },

    descuento_porcentaje: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        min: {
          args: [0],
          msg: 'El descuento estimado no puede ser negativo.'
        },
        max: {
          args: [100],
          msg: 'El descuento estimado no puede superar el 100%.'
        }
      }
    },

    otros_impuestos_estimados: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        min: {
          args: [0],
          msg: 'Otros impuestos estimados no pueden ser negativos.'
        }
      }
    },

    total_linea_estimado: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: {
        min: {
          args: [0],
          msg: 'El total estimado de la línea no puede ser negativo.'
        }
      }
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'ordenes_compra_detalle',
    timestamps: false, // solo created_at en DDL

    indexes: [
      { name: 'idx_ocd_orden', fields: ['orden_compra_id'] },
      { name: 'idx_ocd_producto', fields: ['producto_id'] }
    ],

    validate: {
      consistenciaBasicaTotalLinea() {
        const cant = Number(this.cantidad ?? 0);
        const costo = Number(this.costo_unit_estimado ?? 0);
        const otros = Number(this.otros_impuestos_estimados ?? 0);
        const tt = Number(this.total_linea_estimado ?? 0);

        if (cant <= 0) {
          throw new Error('La cantidad debe ser mayor a 0.');
        }
        if (costo < 0 || otros < 0 || tt < 0) {
          throw new Error(
            'Los importes estimados de la línea no pueden ser negativos.'
          );
        }
      }
    }
  }
);

export default { OrdenCompraDetalleModel };
