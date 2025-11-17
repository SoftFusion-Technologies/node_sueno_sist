/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla `proveedor_cuentas_bancarias`.
 * Normaliza campos (CBU/CUIT), valida formatos y garantiza única cuenta predeterminada por proveedor.
 *
 * Tema: Modelos - Proveedores (Cuentas Bancarias)
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes, Op } from 'sequelize';
import { ProveedoresModel } from './MD_TB_Proveedores.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Helpers
const onlyDigits = (s) => (typeof s === 'string' ? s.replace(/\D+/g, '') : s);
const trimOrNull = (s) => (typeof s === 'string' ? s.trim() || null : s);
const lowerOrNull = (s) =>
  typeof s === 'string' ? s.trim().toLowerCase() || null : s;

// Validador CUIT (11 dígitos con DV)
const isValidCUIT = (digits) => {
  if (!/^\d{11}$/.test(digits)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = pesos.reduce((acc, p, i) => acc + p * parseInt(digits[i], 10), 0);
  const mod = sum % 11;
  const dv = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return dv === parseInt(digits[10], 10);
};

// Validador CBU (22 dígitos con 2 DVs)
// Fuente: esquema estándar BCRA (8+14 con DV en pos 8 y 22)
const isValidCBU = (digits) => {
  if (!/^\d{22}$/.test(digits)) return false;
  const calcDV = (arr, pesos) => {
    const s = arr.reduce((acc, n, i) => acc + parseInt(n, 10) * pesos[i], 0);
    const mod = s % 10;
    return mod === 0 ? 0 : 10 - mod;
  };
  // Primer bloque (7 números + DV)
  const b1 = digits.slice(0, 7).split('');
  const dv1 = parseInt(digits[7], 10);
  const ok1 = calcDV(b1, [7, 1, 3, 9, 7, 1, 3]) === dv1;

  // Segundo bloque (13 números + DV final)
  const b2 = digits.slice(8, 21).split('');
  const dv2 = parseInt(digits[21], 10);
  const ok2 = calcDV(b2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === dv2;

  return ok1 && ok2;
};

export const ProveedorCuentasBancariasModel = db.define(
  'proveedor_cuentas_bancarias',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    proveedor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'proveedores',
        key: 'id'
      }
    },

    banco: {
      type: DataTypes.STRING(120),
      allowNull: false,
      set(val) {
        this.setDataValue('banco', trimOrNull(val));
      }
    },

    tipo_cuenta: {
      type: DataTypes.ENUM('CA', 'CC', 'Otro'),
      allowNull: false,
      defaultValue: 'CA'
    },

    numero_cuenta: {
      type: DataTypes.STRING(40),
      allowNull: true,
      set(val) {
        // Guardamos solo dígitos para facilitar búsquedas/igualdades
        this.setDataValue('numero_cuenta', onlyDigits(val) || null);
      }
    },

    cbu: {
      type: DataTypes.STRING(30),
      allowNull: true,
      set(val) {
        const digits = onlyDigits(val);
        this.setDataValue('cbu', digits || null);
      },
      validate: {
        isCBUorNull(value) {
          if (value == null || value === '') return;

          // 💡 En desarrollo: solo exigir 22 dígitos
          if (process.env.NODE_ENV !== 'production') {
            if (!/^\d{22}$/.test(value)) {
              throw new Error(
                'CBU inválido (en dev: deben ser 22 dígitos numéricos).'
              );
            }
            return;
          }

          // ✅ En producción: aplicar algoritmo BCRA completo
          if (!isValidCBU(value)) {
            throw new Error('CBU inválido (deben ser 22 dígitos válidos).');
          }
        }
      }
    },

    alias_cbu: {
      type: DataTypes.STRING(60),
      allowNull: true,
      set(val) {
        this.setDataValue('alias_cbu', lowerOrNull(val));
      },
      validate: {
        // Alias bancario: alfanum + .-_ (tolerante)
        isAliasOrNull(value) {
          if (value == null || value === '') return;
          if (!/^[a-z0-9._-]{6,60}$/.test(value)) {
            throw new Error(
              'Alias CBU inválido (use letras/números y . _ -, 6-60 chars).'
            );
          }
        }
      }
    },

    titular: {
      type: DataTypes.STRING(160),
      allowNull: true,
      set(val) {
        this.setDataValue('titular', trimOrNull(val));
      }
    },

    cuit_titular: {
      type: DataTypes.STRING(13),
      allowNull: true,
      set(val) {
        const digits = onlyDigits(val);
        this.setDataValue('cuit_titular', digits || null);
      },
      validate: {
        isCUITorNull(value) {
          if (value == null || value === '') return;
          if (!isValidCUIT(value)) throw new Error('CUIT de titular inválido.');
        }
      }
    },

    es_predeterminada: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    tableName: 'proveedor_cuentas_bancarias',
    timestamps: false,
    indexes: [
      { name: 'idx_pcb_proveedor', fields: ['proveedor_id'] },
      { name: 'idx_pcb_pred', fields: ['proveedor_id', 'es_predeterminada'] }
    ],
    defaultScope: {
      order: [
        ['es_predeterminada', 'DESC'],
        ['banco', 'ASC']
      ]
    },
    scopes: {
      porProveedor: (proveedorId) => ({ where: { proveedor_id: proveedorId } }),
      predeterminadas: { where: { es_predeterminada: true } }
    },
    hooks: {
      beforeValidate: (row) => {
        if (row?.numero_cuenta)
          row.numero_cuenta = onlyDigits(row.numero_cuenta);
        if (row?.cbu) row.cbu = onlyDigits(row.cbu);
        if (row?.cuit_titular) row.cuit_titular = onlyDigits(row.cuit_titular);
        if (row?.banco) row.banco = trimOrNull(row.banco);
        if (row?.titular) row.titular = trimOrNull(row.titular);
        if (row?.alias_cbu) row.alias_cbu = lowerOrNull(row.alias_cbu);
      },

      // Asegura única cuenta predeterminada por proveedor
      afterCreate: async (row, options) => {
        if (row.es_predeterminada) {
          await ProveedorCuentasBancariasModel.update(
            { es_predeterminada: false },
            {
              where: {
                proveedor_id: row.proveedor_id,
                id: { [Op.ne]: row.id }
              },
              transaction: options.transaction
            }
          );
        }
      },

      afterUpdate: async (row, options) => {
        if (
          row.changed('es_predeterminada') &&
          row.es_predeterminada === true
        ) {
          await ProveedorCuentasBancariasModel.update(
            { es_predeterminada: false },
            {
              where: {
                proveedor_id: row.proveedor_id,
                id: { [Op.ne]: row.id }
              },
              transaction: options.transaction
            }
          );
        }
      }
    }
  }
);

export default {
  ProveedorCuentasBancariasModel
};
