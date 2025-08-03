/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_TicketConfig.js) contiene la definición del modelo Sequelize para la tabla de configuración del ticket (ticket_config).
 *
 * Tema: Modelos - Ticket Configuración
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'ticket_config'
export const TicketConfigModel = db.define(
  'ticket_config',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    nombre_tienda: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    lema: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    direccion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    telefono: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    web: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    cuit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    logo_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    mensaje_footer: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    timestamps: true, // Para manejar createdAt y updatedAt
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    tableName: 'ticket_config'
  }
);

export default {
  TicketConfigModel
};
