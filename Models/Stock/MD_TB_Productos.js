/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Última Modificación: 03 / 08 / 2025
 * Versión: 2.1
 *
 * Descripción:
 * Modelo Sequelize para la tabla `productos` adaptado al sistema de ventas de muebles, colchones y accesorios de "El Sueño".
 *
 * Tema: Modelos - Productos
 * Capa: Backend
 */

import dotenv from 'dotenv';
import db from '../../DataBase/db.js';
import { DataTypes } from 'sequelize';
import { ProveedoresModel } from '../Proveedores/MD_TB_Proveedores.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const ProductosModel = db.define(
  'productos',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
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
      type: DataTypes.STRING(50),
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
      defaultValue: 0.0
    },
    precio_con_descuento: {
      type: DataTypes.DECIMAL(18, 2),
      defaultValue: 0.0
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
    },
    proveedor_preferido_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

ProductosModel.belongsTo(ProveedoresModel, {
  as: 'proveedor_preferido',
  foreignKey: 'proveedor_preferido_id',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
});

export default {
  ProductosModel
};
