/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla `proveedores`.
 * Incluye normalización de CUIT/telefonía, validaciones, índices y scopes comunes.
 *
 * Tema: Modelos - Proveedores
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Helpers de normalización
const onlyDigits = (s) => (typeof s === 'string' ? s.replace(/\D+/g, '') : s);
const trimOrNull = (s) => (typeof s === 'string' ? s.trim() || null : s);

// Definición del modelo
export const ProveedoresModel = db.define(
  'proveedores',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    razon_social: {
      type: DataTypes.STRING(160),
      allowNull: false,
      set(val) {
        this.setDataValue('razon_social', trimOrNull(val));
      }
    },

    nombre_fantasia: {
      type: DataTypes.STRING(160),
      allowNull: true,
      set(val) {
        this.setDataValue('nombre_fantasia', trimOrNull(val));
      }
    },

    cuit: {
      type: DataTypes.STRING(13), // puede venir con guiones o sin guiones
      allowNull: true,
      unique: 'uq_prov_cuit',
      set(val) {
        // Guardamos sin guiones (solo dígitos) para uniformidad
        const digits = onlyDigits(val);
        this.setDataValue('cuit', digits || null);
      },
      validate: {
        // Aceptamos 11 dígitos (CUIT/CUIL). Si viene null, ok.
        isCUIT(value) {
          if (value == null || value === '') return;
          if (!/^\d{11}$/.test(value)) {
            throw new Error('CUIT inválido: debe contener 11 dígitos.');
          }
          // (Opcional) Validador de dígito verificador
          const dvCalc = (nums) => {
            const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
            const s = pesos.reduce(
              (acc, p, i) => acc + p * parseInt(nums[i], 10),
              0
            );
            const mod = s % 11;
            const dv = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
            return dv;
          };
          const dvOk = dvCalc(value) === parseInt(value[10], 10);
          if (!dvOk)
            throw new Error('CUIT inválido: dígito verificador incorrecto.');
        }
      }
    },

    condicion_iva: {
      type: DataTypes.ENUM(
        'RI',
        'Monotributo',
        'Exento',
        'CF',
        'MT',
        'NoResidente'
      ),
      allowNull: false,
      defaultValue: 'RI'
    },

    iibb: {
      type: DataTypes.STRING(40),
      allowNull: true,
      set(val) {
        this.setDataValue('iibb', trimOrNull(val));
      }
    },

    tipo_persona: {
      type: DataTypes.ENUM('Física', 'Jurídica'),
      allowNull: false,
      defaultValue: 'Jurídica'
    },

    dni: {
      type: DataTypes.STRING(12),
      allowNull: true,
      set(val) {
        const digits = onlyDigits(val);
        this.setDataValue('dni', digits || null);
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
          // validación simple de email
          const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
          if (!ok) throw new Error('Email inválido.');
        }
      }
    },

    telefono: {
      type: DataTypes.STRING(40),
      allowNull: true,
      set(val) {
        // guardamos solo dígitos; si querés conservar +, adaptá acá
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

    web: {
      type: DataTypes.STRING(160),
      allowNull: true,
      set(val) {
        this.setDataValue('web', trimOrNull(val));
      },
      validate: {
        isUrlishOrNull(value) {
          if (value == null || value === '') return;
          // Permite dominios sin protocolo también
          const ok =
            /^(https?:\/\/)?([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(\/.*)?$/.test(value);
          if (!ok) throw new Error('URL de sitio web inválida.');
        }
      }
    },

    direccion: {
      type: DataTypes.STRING(255),
      allowNull: true,
      set(val) {
        this.setDataValue('direccion', trimOrNull(val));
      }
    },

    localidad: {
      type: DataTypes.STRING(120),
      allowNull: true,
      set(val) {
        this.setDataValue('localidad', trimOrNull(val));
      }
    },

    provincia: {
      type: DataTypes.STRING(120),
      allowNull: true,
      set(val) {
        this.setDataValue('provincia', trimOrNull(val));
      }
    },

    cp: {
      type: DataTypes.STRING(12),
      allowNull: true,
      set(val) {
        this.setDataValue('cp', trimOrNull(val));
      }
    },

    dias_credito: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },

    limite_credito: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0
    },

    estado: {
      type: DataTypes.ENUM('activo', 'inactivo'),
      allowNull: false,
      defaultValue: 'activo'
    },

    notas: {
      type: DataTypes.STRING(500),
      allowNull: true,
      set(val) {
        this.setDataValue('notas', trimOrNull(val));
      }
    },

    fecha_alta: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },

    fecha_ultima_compra: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'proveedores',
    timestamps: false, // la tabla no tiene updated_at
    indexes: [
      { name: 'uq_prov_cuit', unique: true, fields: ['cuit'] },
      { name: 'idx_prov_rs', fields: ['razon_social'] },
      { name: 'idx_prov_estado', fields: ['estado'] }
    ],
    defaultScope: {
      // por defecto, mostrar activos primero
      order: [
        ['estado', 'ASC'],
        ['razon_social', 'ASC']
      ]
    },
    scopes: {
      activos: { where: { estado: 'activo' } },
      inactivos: { where: { estado: 'inactivo' } },
      conCredito: { where: db.where(db.col('limite_credito'), '>', 0) }
    },
    hooks: {
      beforeValidate: (prov) => {
        // Normalizamos algunos campos repetidos
        if (prov?.telefono) prov.telefono = onlyDigits(prov.telefono);
        if (prov?.whatsapp) prov.whatsapp = onlyDigits(prov.whatsapp);
        if (prov?.dni) prov.dni = onlyDigits(prov.dni);
        if (prov?.cuit) prov.cuit = onlyDigits(prov.cuit);
      }
    }
  }
);

// (Placeholder) Relacionar cuando agregues tablas (Compras, Ordenes, Facturas, etc.)
// Ejemplo:
// ProveedoresModel.hasMany(ComprasModel, { foreignKey: 'proveedor_id' });
// ComprasModel.belongsTo(ProveedoresModel, { foreignKey: 'proveedor_id' });

export default {
  ProveedoresModel
};
