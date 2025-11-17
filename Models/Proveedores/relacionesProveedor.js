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

export async function onCompraConfirmada_Proveedor(compra, options = {}) {
  const { transaction } = options;
  const {
    id: compraId,
    proveedor_id,
    fecha,
    total,
    moneda,
    detalles = []
  } = compra;

  if (!proveedor_id) return;

  // 1) Metadata del proveedor
  try {
    await ProveedoresModel.update(
      {
        fecha_ultima_compra: fecha,
        monto_ultima_compra: total // en la moneda de la compra (moneda campo aparte)
        // compras_acumuladas: db.literal('COALESCE(compras_acumuladas,0) + 1') // si algún día lo agregás
      },
      { where: { id: proveedor_id }, transaction }
    );
  } catch (e) {
    console.warn('[onCompraConfirmada_Proveedor] meta proveedor:', e.message);
  }

  // 2) Vincular productos ↔ proveedor + historial de costos (queda igual que antes)
  for (const d of detalles) {
    if (!d.producto_id) continue;

    const costoNeto = Number(d.costo_unit_neto ?? 0);
    const monedaLinea = moneda || 'ARS';
    const alicuotaIva = d.alicuota_iva ?? 21;
    const descPct = d.descuento_porcentaje ?? 0;

    const [pp] = await ProductoProveedorModel.findOrCreate({
      where: { producto_id: d.producto_id, proveedor_id },
      defaults: {
        producto_id: d.producto_id,
        proveedor_id,
        costo_neto: costoNeto,
        moneda: monedaLinea,
        alicuota_iva: alicuotaIva,
        descuento_porcentaje: descPct,
        vigente: true
      },
      transaction
    });

    const costoAnterior = Number(pp.costo_neto ?? 0);
    const changed =
      costoNeto !== costoAnterior ||
      pp.moneda !== monedaLinea ||
      Number(pp.alicuota_iva ?? 0) !== Number(alicuotaIva ?? 0) ||
      Number(pp.descuento_porcentaje ?? 0) !== Number(descPct ?? 0);

    if (!changed) continue;

    pp.costo_neto = costoNeto;
    pp.moneda = monedaLinea;
    pp.alicuota_iva = alicuotaIva;
    pp.descuento_porcentaje = descPct;
    pp.vigente = true;

    await pp.save({ transaction });

    await ProductoProveedorHistorialCostosModel.create(
      {
        producto_proveedor_id: pp.id,
        costo_neto: costoNeto,
        moneda: monedaLinea,
        alicuota_iva: alicuotaIva,
        descuento_porcentaje: descPct,
        motivo: 'Actualización por compra confirmada',
        observaciones: `Compra ID=${compraId}`
      },
      { transaction }
    );
  }
}
