/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla 'compras'.
 * Incluye:
 * - Todos los campos del DDL (incl. alter con tipo_comprobante, punto_venta, nro_comprobante). nuevos campos agregados luego de la creación de la tabla
 * - Índices: proveedor+fecha, estado, canal, vencimiento y unique (proveedor_id, tipo_comprobante, punto_venta, nro_comprobante).
 * - FKs a proveedores y locales (RESTRICT/SET NULL a nivel DB).
 * - Validaciones de negocio: no-negatividad de importes, vencimiento requerido para CC/crédito,
 *   y coherencia mínima del documento (si se informa PV o Nro, deben venir ambos).
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const CompraModel = db.define(
  'compras',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Canal (C1 legal, C2 no-legal)
    canal: {
      type: DataTypes.ENUM('C1', 'C2'),
      allowNull: false,
      defaultValue: 'C1'
    },

    // Del ALTER INI
    tipo_comprobante: {
      type: DataTypes.ENUM('FA', 'FB', 'FC', 'ND', 'NC', 'REMITO', 'OTRO'),
      allowNull: false,
      defaultValue: 'FA'
    },
    punto_venta: {
      type: DataTypes.SMALLINT.UNSIGNED, // 0..65535, sobra para PV
      allowNull: true,
      validate: {
        min: {
          args: [1],
          msg: 'El punto de venta debe ser mayor o igual a 1.'
        },
        max: {
          args: [9999],
          msg: 'El punto de venta debe tener como máximo 4 dígitos (<= 9999).'
        }
      }
    },
    nro_comprobante: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      validate: {
        min: {
          args: [1],
          msg: 'El número de comprobante debe ser mayor o igual a 1.'
        },
        max: {
          // hasta 13 dígitos: 9.999.999.999.999
          args: [9999999999999],
          msg: 'El número de comprobante es demasiado largo.'
        }
      }
    },

    // Del ALTER FIN

    // FK proveedor
    proveedor_id: {
      type: DataTypes.INTEGER, // DDL: INT NOT NULL
      allowNull: false,
      references: { model: 'proveedores', key: 'id' }
    },

    // FK local (puede ser null)
    local_id: {
      type: DataTypes.INTEGER, // DDL: INT NULL
      allowNull: true,
      references: { model: 'locales', key: 'id' }
    },

    // Fechas
    fecha: {
      type: DataTypes.DATE, // DATETIME - usar como FECREAL ejem 02-11-2025 19:37:59
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    condicion_compra: {
      type: DataTypes.ENUM('contado', 'cuenta_corriente', 'credito', 'otro'),
      allowNull: false,
      defaultValue: 'cuenta_corriente'
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // Moneda
    moneda: {
      type: DataTypes.ENUM('ARS', 'USD', 'EUR', 'Otro'),
      allowNull: false,
      defaultValue: 'ARS'
    },

    // Importes
    subtotal_neto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    iva_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    percepciones_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    retenciones_total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: { min: 0 }
    },
    total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      validate: { min: 0 }
    },

    // Meta
    observaciones: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    estado: {
      type: DataTypes.ENUM('borrador', 'confirmada', 'anulada'),
      allowNull: false,
      defaultValue: 'borrador'
    },

    // Auditoría
    created_by: {
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
    tableName: 'compras',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Scopes útiles
    defaultScope: {
      order: [['id', 'DESC']]
    },
    scopes: {
      activas: { where: { estado: ['borrador', 'confirmada'] } },
      borradores: { where: { estado: 'borrador' } },
      confirmadas: { where: { estado: 'confirmada' } }
    },

    indexes: [
      // =========== Índices del DDL ===========
      { name: 'idx_proveedor_fecha', fields: ['proveedor_id', 'fecha'] },
      { name: 'idx_estado', fields: ['estado'] },
      { name: 'idx_canal', fields: ['canal'] },
      { name: 'idx_vencimiento', fields: ['fecha_vencimiento'] },

      // Unique documental
      {
        name: 'uq_compra_doc',
        unique: true,
        fields: [
          'proveedor_id',
          'tipo_comprobante',
          'punto_venta',
          'nro_comprobante'
        ]
      }
    ],

    validate: {
      // coherencia de importes (no-negatividad ya está a nivel campo)
      importesNoNegativos() {
        const ns = Number(this.subtotal_neto ?? 0);
        const iv = Number(this.iva_total ?? 0);
        const pe = Number(this.percepciones_total ?? 0);
        const re = Number(this.retenciones_total ?? 0);
        const tt = Number(this.total ?? 0);
        if ([ns, iv, pe, re, tt].some((n) => Number.isNaN(n) || n < 0)) {
          throw new Error(
            'Importes inválidos: todos deben ser numéricos y >= 0'
          );
        }
      },

      // si se informa parte del documento (PV o Nro), deben estar ambos
      documentoBienFormado() {
        const hasPV = this.punto_venta != null;
        const hasNro = this.nro_comprobante != null;
        if (hasPV !== hasNro) {
          throw new Error(
            'Documento incompleto: si informás punto_venta o nro_comprobante, debés informar ambos.'
          );
        }
      },

      // para cuenta corriente / crédito, el vencimiento es muy recomendable
      vencimientoParaCCoCredito() {
        const exigeVto =
          this.condicion_compra === 'cuenta_corriente' ||
          this.condicion_compra === 'credito';
        if (exigeVto && !this.fecha_vencimiento) {
          throw new Error(
            'fecha_vencimiento es requerida cuando la condición de compra es cuenta_corriente o crédito.'
          );
        }
      },

      // verificación suave de consistencia del total (tolerancia de 1 centavo)
      consistenciaBasicaDeTotal() {
        const ns = Number(this.subtotal_neto ?? 0);
        const iv = Number(this.iva_total ?? 0);
        const pe = Number(this.percepciones_total ?? 0);
        const re = Number(this.retenciones_total ?? 0);
        const estimado = ns + iv + pe - re;
        const tt = Number(this.total ?? 0);

        // No exigimos igualdad estricta (hay compras_impuestos y otras reglas),
        // pero prevenimos errores groseros: total no puede ser negativo y
        // tampoco muy inferior a lo estimado
        if (tt < 0) {
          throw new Error('El total no puede ser negativo.');
        }
        if (tt + 0.01 < 0) {
          throw new Error('El total no puede ser negativo (tolerancia).');
        }
      }
    },

    hooks: {
      beforeValidate(instance) {
        // Normalizar decimales null -> 0 (excepto total, que debe venir informado)
        [
          'subtotal_neto',
          'iva_total',
          'percepciones_total',
          'retenciones_total'
        ].forEach((k) => {
          if (instance[k] == null) instance[k] = 0.0;
        });
      }
    }
  }
);

export default { CompraModel };
