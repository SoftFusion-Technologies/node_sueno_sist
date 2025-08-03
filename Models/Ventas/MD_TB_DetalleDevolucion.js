import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

export const DetalleDevolucionModel = db.define(
  'detalle_devolucion',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    devolucion_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    detalle_venta_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'detalle_venta',
        key: 'id'
      }
    },
    stock_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    cantidad: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    precio_unitario: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    }
  },
  {
    timestamps: false
  }
);
