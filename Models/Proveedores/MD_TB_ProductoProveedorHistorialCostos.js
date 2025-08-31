/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para `producto_proveedor_historial_costos`.
 * Registra cambios de costo/moneda/iva/descuento por cada producto_proveedor.
 *
 * Tema: Modelos - Proveedores / Productos (Historial de costos)
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes, Op } from 'sequelize';
import { ProductoProveedorModel } from './MD_TB_ProductoProveedor.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const trimOrNull = (s) => (typeof s === 'string' ? s.trim() || null : s);
const assertPct = (v, field, max = 100) => {
  if (v == null) return;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > max) {
    throw new Error(`${field} debe estar entre 0 y ${max}.`);
  }
};

export const ProductoProveedorHistorialCostosModel = db.define(
  'producto_proveedor_historial_costos',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    producto_proveedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'producto_proveedor', key: 'id' }
    },

    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    costo_neto: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      validate: { min: 0 }
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

    motivo: {
      type: DataTypes.STRING(160),
      allowNull: true,
      set(val) {
        this.setDataValue('motivo', trimOrNull(val));
      }
    },

    observaciones: {
      type: DataTypes.STRING(300),
      allowNull: true,
      set(val) {
        this.setDataValue('observaciones', trimOrNull(val));
      }
    }
  },
  {
    tableName: 'producto_proveedor_historial_costos',
    timestamps: false,
    indexes: [
      { name: 'idx_pph_pp', fields: ['producto_proveedor_id', 'fecha'] }
    ],
    defaultScope: {
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    },
    scopes: {
      porPP: (ppId) => ({ where: { producto_proveedor_id: ppId } }),
      desdeHasta: (desde, hasta) => ({
        where: {
          fecha: {
            ...(desde ? { [Op.gte]: desde } : {}),
            ...(hasta ? { [Op.lte]: hasta } : {})
          }
        }
      }),
      ultimo: (ppId) => ({
        where: { producto_proveedor_id: ppId },
        limit: 1,
        order: [
          ['fecha', 'DESC'],
          ['id', 'DESC']
        ]
      })
    },
    getterMethods: {
      // costo neto con descuento aplicado (sin IVA)
      costoNetoConDescuento() {
        const base = parseFloat(this.getDataValue('costo_neto') ?? 0);
        const desc = parseFloat(this.getDataValue('descuento_porcentaje') ?? 0);
        return +(base * (1 - desc / 100)).toFixed(4);
      },
      // costo final con IVA (el historial no guarda inc_iva; asumimos suma de IVA)
      costoFinal() {
        const baseDesc = this.costoNetoConDescuento;
        const iva = parseFloat(this.getDataValue('alicuota_iva') ?? 0);
        return +(baseDesc * (1 + iva / 100)).toFixed(4);
      }
    }
  }
);

export default {
  ProductoProveedorHistorialCostosModel
};

/* =======================================================================
   Helper opcional: registrar historial automático al cambiar el PP
   Uso:
     import { attachPPHistoryHooks } from './MD_TB_ProductoProveedorHistorialCostos.js'
     attachPPHistoryHooks(ProductoProveedorModel)
   ======================================================================= */
export function attachPPHistoryHooks(
  ProductoProveedorModelRef = ProductoProveedorModel
) {
  // Campos que disparan historial
  const FIELDS = [
    'costo_neto',
    'moneda',
    'alicuota_iva',
    'descuento_porcentaje'
  ];

  const shouldLog = (instance) => FIELDS.some((f) => instance.changed(f));

  const buildPayload = (pp) => ({
    producto_proveedor_id: pp.id,
    costo_neto: pp.costo_neto,
    moneda: pp.moneda,
    alicuota_iva: pp.alicuota_iva,
    descuento_porcentaje: pp.descuento_porcentaje,
    motivo: 'Actualización de parámetros de costo',
    observaciones: null
  });

  ProductoProveedorModelRef.addHook('afterCreate', async (pp, options) => {
    // Al crear, registramos snapshot inicial
    await ProductoProveedorHistorialCostosModel.create(buildPayload(pp), {
      transaction: options?.transaction
    });
  });

  ProductoProveedorModelRef.addHook('afterUpdate', async (pp, options) => {
    if (!shouldLog(pp)) return;
    await ProductoProveedorHistorialCostosModel.create(buildPayload(pp), {
      transaction: options?.transaction
    });
  });
}
