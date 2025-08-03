/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 28 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_RecaptacionClientes.js) contiene la definición del modelo Sequelize para la tabla de clientes asignados a campañas de recaptación.
 *
 * Tema: Modelos - Recaptación
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'recaptacion_clientes'
export const RecaptacionClientesModel = db.define(
  'recaptacion_clientes',
  {
    cliente_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    campana_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    fecha_envio: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    respuesta: {
      type: DataTypes.STRING(50), // Ej: 'comprado', 'respondido', 'ignorado'
      allowNull: true
    }
  },
  {
    timestamps: false
  }
);

export default {
  RecaptacionClientesModel
};
