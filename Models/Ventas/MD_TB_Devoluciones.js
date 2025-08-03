import { DataTypes } from 'sequelize';
import db from '../../DataBase/db.js';

export const DevolucionesModel = db.define(
  'devoluciones',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    venta_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    usuario_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    local_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    monto_devuelto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0
    },
    impacta_caja: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    motivo: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    estado: {
      type: DataTypes.ENUM('pendiente', 'procesada'),
      allowNull: false,
      defaultValue: 'procesada'
    },
    total_devuelto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0.0
    }
  },
  {
    timestamps: false
  }
);
