/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 28 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_RecaptacionCampanas.js) contiene la definición del modelo Sequelize para la tabla de campañas de recaptación.
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

// Definición del modelo de la tabla 'recaptacion_campanas'
export const RecaptacionCampanasModel = db.define(
  'recaptacion_campanas',
  {
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fecha_inicio: {
      type: DataTypes.DATE,
      allowNull: false
    },
    fecha_fin: {
      type: DataTypes.DATE,
      allowNull: false
    },
    medio_envio: {
      type: DataTypes.STRING(20),
      allowNull: false // Ej: 'email', 'whatsapp', 'sms'
    },
    mensaje: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'activa'
    }
  },
  {
    timestamps: false
  }
);

export default {
  RecaptacionCampanasModel
};
