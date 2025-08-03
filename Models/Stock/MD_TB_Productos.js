/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Última Modificación: 03 / 08 / 2025
 * Versión: 2.0
 *
 * Descripción:
 * Este archivo (MD_TB_Productos.js) contiene la definición del modelo Sequelize para la tabla de productos,
 * adaptado al sistema de gestión de colchones, sommiers, muebles y accesorios de "El Sueño".
 *
 * Tema: Modelos - Productos
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Definición del modelo de la tabla 'productos'
export const ProductosModel = db.define(
  'productos',
  {
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    marca: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    modelo: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    medida: {
      type: DataTypes.STRING(50), // Ej: 140x190 o 2 plazas
      allowNull: true
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categorias',
        key: 'id'
      }
    },
    precio: {
      type: DataTypes.DECIMAL(18, 2),
      defaultValue: 0.0
    },
    descuento_porcentaje: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null
    },
    precio_con_descuento: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      defaultValue: null
    },
    codigo_sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    imagen_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    estado: {
      type: DataTypes.ENUM('activo', 'inactivo'),
      defaultValue: 'activo'
    }
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default {
  ProductosModel
};
