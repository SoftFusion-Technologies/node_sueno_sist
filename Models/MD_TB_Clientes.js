/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (MD_TB_Clientes.js) contiene la definición del modelo Sequelize para la tabla de clientes.
 *
 * Tema: Modelos - Clientes
 * Capa: Backend
 */

// Importaciones
import dotenv from 'dotenv';
import db from '../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'clientes'
export const ClienteModel = db.define(
  'clientes',
  {
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    direccion: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    dni: {
      type: DataTypes.STRING(20),
      allowNull: true
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
    timestamps: false,
    createdAt: 'fecha_alta',
    updatedAt: false // Si querés manejar updatedAt, ponelo en true y configurá el nombre de campo.
  }
);

export default {
  ClienteModel
};
