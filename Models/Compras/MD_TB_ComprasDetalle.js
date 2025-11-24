/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'compras_detalle'.
 * - Incluye todos los campos del DDL provisto.
 * - FKs a compras, productos y producto_proveedor.
 * - Índices: compra_id, producto_id, producto_proveedor_id.
 * - Validaciones: cantidad > 0; importes >= 0; %descuento 0..100; alícuota IVA 0..50;
 *   y si no hay producto_id entonces la descripción es obligatoria.
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const CompraDetalleModel = db.define(
  'compras_detalle',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // FK a compras
    compra_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'compras', key: 'id' }
    },

    // Producto puede ser NULL (línea de servicio)
    producto_id: {
      type: DataTypes.INTEGER, // INT NULL
      allowNull: true,
      references: { model: 'productos', key: 'id' }
    },

    // Trazabilidad costo/IVA vigente en el proveedor
    producto_proveedor_id: {
      type: DataTypes.INTEGER, // INT NULL
      allowNull: true,
      references: { model: 'producto_proveedor', key: 'id' }
    },

    // Descripción libre cuando no hay producto
    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    cantidad: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      validate: { min: 1 }
    },

    costo_unit_neto: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      validate: { min: 0 }
    },

    alicuota_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 21.0,
      validate: { min: 0, max: 50 } // margen amplio para regímenes especiales
    },

    // 1 si el costo ya viene con IVA incluido
    inc_iva: {
      type: DataTypes.BOOLEAN, // mapea a TINYINT(1)
      allowNull: false,
      defaultValue: false
    },

    descuento_porcentaje: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0, max: 100 }
    },

    otros_impuestos: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },

    total_linea: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0 }
    },

    // Código contable opcional (sin FK por ahora)
    cuenta_contable: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'compras_detalle',
    timestamps: false, // la tabla sólo tiene created_at
    indexes: [
      { name: 'idx_compra', fields: ['compra_id'] },
      { name: 'idx_producto', fields: ['producto_id'] },
      { name: 'idx_pp', fields: ['producto_proveedor_id'] }
    ],
    validate: {
      // Si no hay producto, la descripción es obligatoria
      descripcionObligatoriaSiNoHayProducto() {
        if (
          (this.producto_id == null || this.producto_id === undefined) &&
          (!this.descripcion || !String(this.descripcion).trim())
        ) {
          throw new Error(
            'descripcion es obligatoria cuando producto_id es NULL (línea de servicio).'
          );
        }
      },
      // Guardrail de importes (además de min: 0 en cada campo)
      importesValidos() {
        const cant = Number(this.cantidad ?? 0);
        const cNeto = Number(this.costo_unit_neto ?? 0);
        const otros = Number(this.otros_impuestos ?? 0);
        const tot = Number(this.total_linea ?? 0);
        if ([cant, cNeto, otros, tot].some((n) => Number.isNaN(n) || n < 0)) {
          throw new Error(
            'Importes inválidos: cantidad/costos/impuestos/total deben ser >= 0'
          );
        }
      }
    },
    hooks: {
      beforeValidate(instance) {
        // Normalizar strings
        if (typeof instance.descripcion === 'string') {
          instance.descripcion = instance.descripcion.trim() || null;
        }
        if (typeof instance.cuenta_contable === 'string') {
          instance.cuenta_contable = instance.cuenta_contable.trim() || null;
        }
        // Defaults defensivos equivalentes al DDL
        if (instance.alicuota_iva == null) instance.alicuota_iva = 21.0;
        if (instance.otros_impuestos == null) instance.otros_impuestos = 0.0;
        if (instance.descuento_porcentaje == null)
          instance.descuento_porcentaje = 0.0;
        if (instance.inc_iva == null) instance.inc_iva = false;
      }
    }
  }
);

export default { CompraDetalleModel };
