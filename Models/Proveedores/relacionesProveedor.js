/*
 * Programador: Benjamin Orellana
 * Fecha: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Centraliza TODAS las asociaciones del módulo Proveedores.
 * Importar una sola vez desde app.js (luego de cargar los modelos).
 */

import { ProveedoresModel } from './MD_TB_Proveedores.js';
import { ProveedorContactosModel } from './MD_TB_ProveedorContactos.js';
import { ProveedorCuentasBancariasModel } from './MD_TB_ProveedorCuentasBancarias.js';
import { ProductoProveedorModel } from './MD_TB_ProductoProveedor.js';
import { ProductoProveedorHistorialCostosModel } from './MD_TB_ProductoProveedorHistorialCostos.js';

import { ProductosModel } from '../Stock/MD_TB_Productos.js';

/* =========================
   Proveedores ↔ Contactos
   ========================= */
ProveedoresModel.hasMany(ProveedorContactosModel, {
  foreignKey: 'proveedor_id',
  as: 'contactos',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});
ProveedorContactosModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});

/* ================================
   Proveedores ↔ Cuentas bancarias
   ================================ */
ProveedoresModel.hasMany(ProveedorCuentasBancariasModel, {
  foreignKey: 'proveedor_id',
  as: 'cuentasBancarias',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});
ProveedorCuentasBancariasModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});

/* ==========================================
   Productos ↔ Proveedores vía N–N (PP model)
   ========================================== */
ProveedoresModel.hasMany(ProductoProveedorModel, {
  foreignKey: 'proveedor_id',
  as: 'productos'
});
ProductoProveedorModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});

ProductosModel.hasMany(ProductoProveedorModel, {
  foreignKey: 'producto_id',
  as: 'proveedores'
});
ProductoProveedorModel.belongsTo(ProductosModel, {
  foreignKey: 'producto_id',
  as: 'producto'
});

/* ===========================================
   ProductoProveedor ↔ Historial de costos
   =========================================== */
ProductoProveedorModel.hasMany(ProductoProveedorHistorialCostosModel, {
  foreignKey: 'producto_proveedor_id',
  as: 'historialCostos',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});
ProductoProveedorHistorialCostosModel.belongsTo(ProductoProveedorModel, {
  foreignKey: 'producto_proveedor_id',
  as: 'productoProveedor'
});
