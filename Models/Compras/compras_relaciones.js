/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Relaciones del Módulo de COMPRAS y sus dependencias (CxP, Pagos, StockMovimientos, Impuestos).
 * Las FKs están garantizadas a nivel DB; acá cableamos las asociaciones para ORM.
 */

// ====== MODELOS COMPRAS ======
import { CompraModel } from './MD_TB_Compras.js';
import { CompraDetalleModel } from './MD_TB_ComprasDetalle.js';
import { CxpProveedorModel } from './MD_TB_CuentasPagarProveedores.js';
import { PagoProveedorModel } from './MD_TB_PagosProveedor.js';
import { PagoProveedorDetalleModel } from './MD_TB_PagoProveedorDetalle.js';
import { PagoProveedorMedioModel } from './MD_TB_PagosProveedorMedios.js';
import { CompraImpuestoModel } from './MD_TB_ComprasImpuestos.js';
import { ImpuestoConfigModel } from './MD_TB_ImpuestosConfig.js';

// ====== MODELOS DE STOCK AUX ======
import { StockMovimientoModel } from './MD_TB_StockMovimientos.js';
import { StockModel } from '../Stock/MD_TB_Stock.js';

// ====== MODELOS CORE RELACIONADOS ======
import { ProductosModel } from '../Stock/MD_TB_Productos.js';
import { ProductoProveedorModel } from '../Proveedores/MD_TB_ProductoProveedor.js';
import { LocalesModel } from '../Stock/MD_TB_Locales.js';
import { LugaresModel } from '../Stock/MD_TB_Lugares.js';
import { EstadosModel } from '../Stock/MD_TB_Estados.js';
import { ProveedoresModel } from '../Proveedores/MD_TB_Proveedores.js';
import { MediosPagoModel } from '../Ventas/MD_TB_MediosPago.js';
import { BancoCuentaModel } from '../Bancos/MD_TB_BancoCuentas.js';
import { ChequeModel } from '../Cheques/MD_TB_Cheques.js';
import { MovimientosCajaModel } from '../Ventas/MD_TB_MovimientosCaja.js';
import { UserModel } from '../MD_TB_Users.js';
// ====== MODELOS CORE RELACIONADOS ======

// ====== MODELOS NUEVOS - ORDEN DE COMPRA 24-11-2025 BENJAMIN ORELLANA ======
import { OrdenCompraModel } from './MD_TB_OrdenesCompra.js';
import { OrdenCompraDetalleModel } from './MD_TB_OrdenesCompraDetalle.js';
// ====== MODELOS NUEVOS - ORDEN DE COMPRA 24-11-2025 BENJAMIN ORELLANA ======

// ===================================================
// COMPRAS ↔ PROVEEDORES / LOCALES
// ===================================================
CompraModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});
ProveedoresModel.hasMany(CompraModel, {
  foreignKey: 'proveedor_id',
  as: 'compras'
});

CompraModel.belongsTo(LocalesModel, { foreignKey: 'local_id', as: 'local' });
LocalesModel.hasMany(CompraModel, { foreignKey: 'local_id', as: 'compras' });

// ===================================================
// COMPRAS ↔ DETALLE
// ===================================================
CompraModel.hasMany(CompraDetalleModel, {
  foreignKey: 'compra_id',
  as: 'detalles'
});
CompraDetalleModel.belongsTo(CompraModel, {
  foreignKey: 'compra_id',
  as: 'compra'
});

// Detalle ↔ Producto / Producto-Proveedor
CompraDetalleModel.belongsTo(ProductosModel, {
  foreignKey: 'producto_id',
  as: 'producto'
});
ProductosModel.hasMany(CompraDetalleModel, {
  foreignKey: 'producto_id',
  as: 'compras_detalle'
});

CompraDetalleModel.belongsTo(ProductoProveedorModel, {
  foreignKey: 'producto_proveedor_id',
  as: 'productoProveedor'
});
ProductoProveedorModel.hasMany(CompraDetalleModel, {
  foreignKey: 'producto_proveedor_id',
  as: 'usos_en_compras'
});

// ===================================================
// COMPRAS ↔ IMPUESTOS (cabecera)
// ===================================================
CompraModel.hasMany(CompraImpuestoModel, {
  foreignKey: 'compra_id',
  as: 'impuestos'
});
CompraImpuestoModel.belongsTo(CompraModel, {
  foreignKey: 'compra_id',
  as: 'compra'
});

// Impuesto de compra ↔ Config (join por 'codigo')
ImpuestoConfigModel.hasMany(CompraImpuestoModel, {
  foreignKey: 'codigo',
  sourceKey: 'codigo',
  as: 'usos'
});
CompraImpuestoModel.belongsTo(ImpuestoConfigModel, {
  foreignKey: 'codigo',
  targetKey: 'codigo',
  as: 'config'
});

// ===================================================
// CUENTAS POR PAGAR (CxP) ↔ COMPRAS / PROVEEDORES
// ===================================================
CompraModel.hasOne(CxpProveedorModel, { foreignKey: 'compra_id', as: 'cxp' });
CxpProveedorModel.belongsTo(CompraModel, {
  foreignKey: 'compra_id',
  as: 'compra'
});

CxpProveedorModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});
ProveedoresModel.hasMany(CxpProveedorModel, {
  foreignKey: 'proveedor_id',
  as: 'cuentas_pagar'
});

// ===================================================
// PAGOS A PROVEEDOR (cabecera)
// ===================================================
PagoProveedorModel.belongsTo(ProveedoresModel, {
  foreignKey: 'proveedor_id',
  as: 'proveedor'
});
ProveedoresModel.hasMany(PagoProveedorModel, {
  foreignKey: 'proveedor_id',
  as: 'pagos_proveedor'
});

// Medios “single” en cabecera (opcional multi-medios)
PagoProveedorModel.belongsTo(MediosPagoModel, {
  foreignKey: 'medio_pago_id',
  as: 'medioPago'
});
PagoProveedorModel.belongsTo(BancoCuentaModel, {
  foreignKey: 'banco_cuenta_id',
  as: 'bancoCuenta'
});
PagoProveedorModel.belongsTo(ChequeModel, {
  foreignKey: 'cheque_id',
  as: 'cheque'
});
PagoProveedorModel.belongsTo(MovimientosCajaModel, {
  foreignKey: 'movimiento_caja_id',
  as: 'movimientoCaja'
});

// ===================================================
// PAGOS A PROVEEDOR (detalle de imputación)
// ===================================================
PagoProveedorModel.hasMany(PagoProveedorDetalleModel, {
  foreignKey: 'pago_id',
  as: 'aplicaciones'
});
PagoProveedorDetalleModel.belongsTo(PagoProveedorModel, {
  foreignKey: 'pago_id',
  as: 'pago'
});

PagoProveedorDetalleModel.belongsTo(CompraModel, {
  foreignKey: 'compra_id',
  as: 'compra'
});
CompraModel.hasMany(PagoProveedorDetalleModel, {
  foreignKey: 'compra_id',
  as: 'pagos_aplicados'
});

// ===================================================
// PAGOS A PROVEEDOR (multi-medios)
// ===================================================
PagoProveedorModel.hasMany(PagoProveedorMedioModel, {
  foreignKey: 'pago_id',
  as: 'medios'
});
PagoProveedorMedioModel.belongsTo(PagoProveedorModel, {
  foreignKey: 'pago_id',
  as: 'pago'
});

PagoProveedorMedioModel.belongsTo(MediosPagoModel, {
  foreignKey: 'medio_pago_id',
  as: 'medioPago'
});
PagoProveedorMedioModel.belongsTo(BancoCuentaModel, {
  foreignKey: 'banco_cuenta_id',
  as: 'bancoCuenta'
});
PagoProveedorMedioModel.belongsTo(ChequeModel, {
  foreignKey: 'cheque_id',
  as: 'cheque'
});
PagoProveedorMedioModel.belongsTo(MovimientosCajaModel, {
  foreignKey: 'movimiento_caja_id',
  as: 'movimientoCaja'
});

// ===================================================
// STOCK MOVIMIENTOS (libro mayor de stock)
// ===================================================
StockMovimientoModel.belongsTo(ProductosModel, {
  foreignKey: 'producto_id',
  as: 'producto'
});
ProductosModel.hasMany(StockMovimientoModel, {
  foreignKey: 'producto_id',
  as: 'movimientos_stock'
});

StockMovimientoModel.belongsTo(LocalesModel, {
  foreignKey: 'local_id',
  as: 'local'
});
LocalesModel.hasMany(StockMovimientoModel, {
  foreignKey: 'local_id',
  as: 'movimientos_stock'
});

StockMovimientoModel.belongsTo(LugaresModel, {
  foreignKey: 'lugar_id',
  as: 'lugar'
});
LugaresModel.hasMany(StockMovimientoModel, {
  foreignKey: 'lugar_id',
  as: 'movimientos_stock'
});

StockMovimientoModel.belongsTo(EstadosModel, {
  foreignKey: 'estado_id',
  as: 'estado'
});
EstadosModel.hasMany(StockMovimientoModel, {
  foreignKey: 'estado_id',
  as: 'movimientos_stock'
});

StockMovimientoModel.belongsTo(UserModel, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});
UserModel.hasMany(StockMovimientoModel, {
  foreignKey: 'usuario_id',
  as: 'movimientos_stock'
});

// ====== MODELOS NUEVOS - ORDEN DE COMPRA 24-11-2025 BENJAMIN ORELLANA ======
OrdenCompraModel.belongsTo(ProveedoresModel, {
  as: 'proveedor',
  foreignKey: 'proveedor_id'
});

OrdenCompraModel.belongsTo(LocalesModel, {
  as: 'local',
  foreignKey: 'local_id'
});

OrdenCompraModel.hasMany(OrdenCompraDetalleModel, {
  as: 'detalles',
  foreignKey: 'orden_compra_id'
});

OrdenCompraDetalleModel.belongsTo(OrdenCompraModel, {
  as: 'orden',
  foreignKey: 'orden_compra_id'
});
// ====== MODELOS NUEVOS - ORDEN DE COMPRA 24-11-2025 BENJAMIN ORELLANA ======