/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla `proveedor_contactos`.
 * Incluye normalización de telefonía, validaciones de email,
 * scopes y lógica para mantener un único "es_principal" por proveedor.
 *
 * Tema: Modelos - Proveedores (Contactos)
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes, Op } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Helpers de normalización
const onlyDigits = (s) => (typeof s === 'string' ? s.replace(/\D+/g, '') : s);
const trimOrNull = (s) => (typeof s === 'string' ? s.trim() || null : s);

export const ProveedorContactosModel = db.define(
  'proveedor_contactos',
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

    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false,
      set(val) {
        this.setDataValue('nombre', trimOrNull(val));
      }
    },

    cargo: {
      type: DataTypes.STRING(120),
      allowNull: true,
      set(val) {
        this.setDataValue('cargo', trimOrNull(val));
      }
    },

    email: {
      type: DataTypes.STRING(120),
      allowNull: true,
      set(val) {
        this.setDataValue('email', trimOrNull(val)?.toLowerCase() ?? null);
      },
      validate: {
        isEmailOrNull(value) {
          if (value == null || value === '') return;
          const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
          if (!ok) throw new Error('Email inválido.');
        }
      }
    },

    telefono: {
      type: DataTypes.STRING(40),
      allowNull: true,
      set(val) {
        const digits = onlyDigits(val);
        this.setDataValue('telefono', digits || null);
      }
    },

    whatsapp: {
      type: DataTypes.STRING(40),
      allowNull: true,
      set(val) {
        const digits = onlyDigits(val);
        this.setDataValue('whatsapp', digits || null);
      }
    },

    notas: {
      type: DataTypes.STRING(300),
      allowNull: true,
      set(val) {
        this.setDataValue('notas', trimOrNull(val));
      }
    },

    es_principal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    tableName: 'proveedor_contactos',
    timestamps: false,
    indexes: [
      { name: 'idx_pc_proveedor', fields: ['proveedor_id'] },
      { name: 'idx_pc_principal', fields: ['proveedor_id', 'es_principal'] }
    ],
    defaultScope: {
      order: [
        ['es_principal', 'DESC'],
        ['nombre', 'ASC']
      ]
    },
    scopes: {
      porProveedor: (proveedorId) => ({ where: { proveedor_id: proveedorId } }),
      principales: { where: { es_principal: true } },
      secundarios: { where: { es_principal: false } }
    },
    hooks: {
      // Normalización redundante por si se saltea setters en bulk ops
      beforeValidate: (row) => {
        if (row?.telefono) row.telefono = onlyDigits(row.telefono);
        if (row?.whatsapp) row.whatsapp = onlyDigits(row.whatsapp);
        if (row?.email)
          row.email = trimOrNull(row.email)?.toLowerCase() ?? null;
        if (row?.nombre) row.nombre = trimOrNull(row.nombre);
        if (row?.cargo) row.cargo = trimOrNull(row.cargo);
        if (row?.notas) row.notas = trimOrNull(row.notas);
      },

      // Asegura un único contacto principal por proveedor
      // Si este contacto es principal=true, desmarca al resto
      afterCreate: async (row, options) => {
        if (row.es_principal) {
          await ProveedorContactosModel.update(
            { es_principal: false },
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
        // Solo si cambió a principal=true
        if (row.changed('es_principal') && row.es_principal === true) {
          await ProveedorContactosModel.update(
            { es_principal: false },
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
  ProveedorContactosModel
};
