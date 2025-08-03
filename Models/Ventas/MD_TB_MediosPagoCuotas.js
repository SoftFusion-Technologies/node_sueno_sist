/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 06 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Modelo Sequelize para la tabla de recargos por cuotas de medios de pago.
 *
 * Tema: Modelos - Medios de Pago Cuotas
 * Capa: Backend
 */

import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';
import { MediosPagoModel } from './MD_TB_MediosPago.js';

export const MediosPagoCuotasModel = db.define(
  'medios_pago_cuotas',
  {
    medio_pago_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: MediosPagoModel,
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    cuotas: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    porcentaje_recargo: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
  },
  {
    timestamps: false,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

// Asociación
MediosPagoModel.hasMany(MediosPagoCuotasModel, {
  foreignKey: 'medio_pago_id',
  as: 'cuotas'
});
MediosPagoCuotasModel.belongsTo(MediosPagoModel, {
  foreignKey: 'medio_pago_id',
  as: 'medio_pago'
});
