/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla `producto_proveedor` (relación N–N).
 * Mantiene un único registro vigente por (producto_id, proveedor_id),
 * valida porcentajes y provee getters para costos con IVA/descuentos.
 *
 * Tema: Modelos - Proveedores / Productos (N–N)
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes, Op } from 'sequelize';
import { ProveedoresModel } from './MD_TB_Proveedores.js';
// Si ya tenés el modelo de productos, descomentalo/ajustá la ruta:
// import { ProductosModel } from './MD_TB_Productos.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const trimOrNull = (s) => (typeof s === 'string' ? s.trim() || null : s);

// Helpers de validación
const assertPct = (v, field, max = 100) => {
  if (v == null) return;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > max) {
    throw new Error(`${field} debe estar entre 0 y ${max}.`);
  }
};

export const ProductoProveedorModel = db.define(
  'producto_proveedor',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'productos', key: 'id' }
    },

    proveedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'proveedores', key: 'id' }
    },

    sku_proveedor: {
      type: DataTypes.STRING(100),
      allowNull: true,
      set(val) {
        this.setDataValue('sku_proveedor', trimOrNull(val));
      }
    },

    nombre_en_proveedor: {
      type: DataTypes.STRING(160),
      allowNull: true,
      set(val) {
        this.setDataValue('nombre_en_proveedor', trimOrNull(val));
      }
    },

    costo_neto: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      validate: {
        min: 0
      }
    },

    moneda: {
      type: DataTypes.ENUM('ARS', 'USD', 'EUR', 'Otro'),
      allowNull: false,
      defaultValue: 'ARS'
    },

    alicuota_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 21.0,
      validate: {
        rango(v) {
          assertPct(v, 'alicuota_iva', 100);
        }
      }
    },

    inc_iva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },

    descuento_porcentaje: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        rango(v) {
          assertPct(v, 'descuento_porcentaje', 100);
        }
      }
    },

    plazo_entrega_dias: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 }
    },

    minimo_compra: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 }
    },

    vigente: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },

    fecha_ultima_compra: {
      type: DataTypes.DATE,
      allowNull: true
    },

    observaciones: {
      type: DataTypes.STRING(300),
      allowNull: true,
      set(val) {
        this.setDataValue('observaciones', trimOrNull(val));
      }
    },

    // timestamps mapeados
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'producto_proveedor',
    timestamps: true,
    indexes: [
      // OJO con el UNIQUE del schema; ver nota al final
      { name: 'idx_pp_producto', fields: ['producto_id'] },
      { name: 'idx_pp_proveedor', fields: ['proveedor_id'] }
    ],
    defaultScope: {
      order: [
        ['vigente', 'DESC'],
        ['updated_at', 'DESC']
      ]
    },
    scopes: {
      porProducto: (productoId) => ({ where: { producto_id: productoId } }),
      porProveedor: (proveedorId) => ({ where: { proveedor_id: proveedorId } }),
      vigentes: { where: { vigente: true } },
      historicos: { where: { vigente: false } }
    },
    hooks: {
      // Garantiza un solo 'vigente=true' por (producto_id, proveedor_id)
      afterCreate: async (row, options) => {
        if (row.vigente) {
          await ProductoProveedorModel.update(
            { vigente: false },
            {
              where: {
                producto_id: row.producto_id,
                proveedor_id: row.proveedor_id,
                id: { [Op.ne]: row.id }
              },
              transaction: options.transaction
            }
          );
        }
      },
      afterUpdate: async (row, options) => {
        if (row.changed('vigente') && row.vigente === true) {
          await ProductoProveedorModel.update(
            { vigente: false },
            {
              where: {
                producto_id: row.producto_id,
                proveedor_id: row.proveedor_id,
                id: { [Op.ne]: row.id }
              },
              transaction: options.transaction
            }
          );
        }
      }
    },
    // Getters virtuales útiles para cálculos en app
    getterMethods: {
      // costo base con descuento (sin IVA)
      costoNetoConDescuento() {
        const base = parseFloat(this.getDataValue('costo_neto') ?? 0);
        const desc = parseFloat(this.getDataValue('descuento_porcentaje') ?? 0);
        return +(base * (1 - desc / 100)).toFixed(4);
      },
      // costo final con IVA incluido (según inc_iva)
      costoFinal() {
        const baseDesc = this.costoNetoConDescuento;
        const incIva = !!this.getDataValue('inc_iva');
        const iva = parseFloat(this.getDataValue('alicuota_iva') ?? 0);
        const mult = incIva ? 1 : 1 + iva / 100;
        return +(baseDesc * mult).toFixed(4);
      }
    }
  }
);


export default {
  ProductoProveedorModel
};
