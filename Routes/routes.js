/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 /06 /2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (routes.js) define las rutas HTTP para operaciones CRUD en la tabla 'locales'
 * Tema: Rutas - Locales
 *
 * Capa: Backend
 */

import express from 'express'; // Importa la librería Express
const router = express.Router(); // Inicializa el router
import { authenticateToken } from '../Security/auth.js'; // Importa las funciones del archivo auth.js

// Importar controladores de locales
import {
  OBRS_Locales_CTS,
  OBR_Local_CTS,
  CR_Local_CTS,
  ER_Local_CTS,
  UR_Local_CTS
} from '../Controllers/Stock/CTS_TB_Locales.js';
// Importar controladores de locales

// Importar controladores de productos

import {
  OBRS_Productos_CTS,
  OBR_Producto_CTS,
  CR_Producto_CTS,
  ER_Producto_CTS,
  UR_Producto_CTS,
  AUM_Productos_Porcentaje_CTS,
  DESH_DeshacerAjustePrecios_CTS,
  AUM_Productos_Descuento_CTS,
  DESH_DeshacerDescuento_CTS
} from '../Controllers/Stock/CTS_TB_Productos.js';
// Importar controladores de productos

// Importar controladores de lugares
import {
  OBRS_Lugares_CTS,
  OBR_Lugar_CTS,
  CR_Lugar_CTS,
  ER_Lugar_CTS,
  UR_Lugar_CTS
} from '../Controllers/Stock/CTS_TB_Lugares.js';
// Importar controladores de lugares

// Importar controladores de estados
import {
  OBRS_Estados_CTS,
  OBR_Estado_CTS,
  CR_Estado_CTS,
  ER_Estado_CTS,
  UR_Estado_CTS
} from '../Controllers/Stock/CTS_TB_Estados.js';
// Importar controladores de estados

// Importar controladores de stock
import {
  OBRS_Stock_CTS,
  OBR_Stock_CTS,
  CR_Stock_CTS,
  ER_Stock_CTS,
  PUT_Stock_ById,
  ER_StockPorProducto,
  DISTRIBUIR_Stock_CTS,
  TRANSFERIR_Stock_CTS,
  ER_StockPorGrupo,
  DUPLICAR_Producto_CTS
} from '../Controllers/Stock/CTS_TB_Stock.js';

// Importar controladores de usuarios
import {
  OBRS_Usuarios_CTS,
  OBR_Usuario_CTS,
  CR_Usuario_CTS,
  ER_Usuario_CTS,
  UR_Usuario_CTS
} from '../Controllers/CTS_TB_Users.js';
// Importar controladores de usuarios

// Importar controladores de clientes
import {
  OBRS_Clientes_CTS,
  OBR_Cliente_CTS,
  CR_Cliente_CTS,
  ER_Cliente_CTS,
  UR_Cliente_CTS,
  SEARCH_Clientes_CTS,
  OBR_HistorialComprasCliente_CTS,
  OBRS_ClientesInactivos_CTS
} from '../Controllers/CTS_TB_Clientes.js';
// Importar controladores de categorias
import {
  OBRS_Categorias_CTS,
  OBR_Categoria_CTS,
  CR_Categoria_CTS,
  ER_Categoria_CTS,
  UR_Categoria_CTS
} from '../Controllers/Stock/CTS_TB_Categorias.js';
// Importar controladores de categorias

import importRouter from './importRouter.js'; // 🆕 CARGA MASIVA

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'locales'
// ----------------------------------------------------------------

// Obtener todos los locales
router.get('/locales', OBRS_Locales_CTS);

// Obtener un solo local por ID
router.get('/locales/:id', OBR_Local_CTS);

// Crear un nuevo local
router.post('/locales', CR_Local_CTS);

// Eliminar un local por ID
router.delete('/locales/:id', ER_Local_CTS);

// Actualizar un local por ID
router.put('/locales/:id', UR_Local_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'productos'
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// Rutas específicas (acciones de negocio)
// ----------------------------------------------------------------
router.post('/aumentar-precio', AUM_Productos_Porcentaje_CTS);
router.post('/productos/deshacer-ajuste', DESH_DeshacerAjustePrecios_CTS);

router.post('/aplicar-descuento', AUM_Productos_Descuento_CTS);
router.post('/deshacer-descuento', DESH_DeshacerDescuento_CTS);

// ----------------------------------------------------------------
// CRUD 'productos'
// ----------------------------------------------------------------
router.get('/productos', OBRS_Productos_CTS);
router.get('/productos/:id', OBR_Producto_CTS);
router.post('/productos', CR_Producto_CTS);
router.put('/productos/:id', UR_Producto_CTS);
router.delete('/productos/:id', ER_Producto_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'Lugares'
// ----------------------------------------------------------------

router.get('/lugares', OBRS_Lugares_CTS);
router.get('/lugares/:id', OBR_Lugar_CTS);
router.post('/lugares', CR_Lugar_CTS);
router.delete('/lugares/:id', ER_Lugar_CTS);
router.put('/lugares/:id', UR_Lugar_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'Estados'
// ----------------------------------------------------------------

router.get('/estados', OBRS_Estados_CTS);
router.get('/estados/:id', OBR_Estado_CTS);
router.post('/estados', CR_Estado_CTS);
router.delete('/estados/:id', ER_Estado_CTS);
router.put('/estados/:id', UR_Estado_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'Stock'
// ----------------------------------------------------------------

router.get('/stock', OBRS_Stock_CTS);
router.get('/stock/:id', OBR_Stock_CTS);
router.post('/stock', CR_Stock_CTS);
router.delete('/stock/:id', ER_Stock_CTS);
router.put('/stock/:id', PUT_Stock_ById);
router.delete('/stock/producto/:id', ER_StockPorProducto);
// Ruta para distribuir stock por talle
router.post('/distribuir', DISTRIBUIR_Stock_CTS);
router.post('/transferir', TRANSFERIR_Stock_CTS);
router.post('/eliminar-grupo', ER_StockPorGrupo);
router.post(
  '/productos/:id/duplicar',
  /*authMiddleware,*/ DUPLICAR_Producto_CTS
);
// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'usuarios'
// ----------------------------------------------------------------

router.post('/usuarios', authenticateToken, CR_Usuario_CTS);
router.put('/usuarios/:id', authenticateToken, UR_Usuario_CTS);
router.delete('/usuarios/:id', authenticateToken, ER_Usuario_CTS);
router.get('/usuarios', authenticateToken, OBRS_Usuarios_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'clientes'
// ----------------------------------------------------------------

router.get('/clientes/search', SEARCH_Clientes_CTS); // PRIMERO
router.get('/clientes', OBRS_Clientes_CTS);
router.get('/clientes/:id', OBR_Cliente_CTS); // DESPUÉS
router.post('/clientes', CR_Cliente_CTS);
router.delete('/clientes/:id', ER_Cliente_CTS);
router.put('/clientes/:id', UR_Cliente_CTS);
router.get('/clientes/:id/ventas', OBR_HistorialComprasCliente_CTS);
router.get('/clientes-inactivos', OBRS_ClientesInactivos_CTS);

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'categorias'
// ----------------------------------------------------------------

router.get('/categorias', OBRS_Categorias_CTS);
router.get('/categorias/:id', OBR_Categoria_CTS);
router.post('/categorias', CR_Categoria_CTS);
router.delete('/categorias/:id', ER_Categoria_CTS);
router.put('/categorias/:id', UR_Categoria_CTS);

// Rutas de carga masiva
router.use('/carga-masiva', importRouter); // 🆕  (=> POST /api/import/:tabla)

// MODULO DE VENTAS
import {
  buscarItemsVenta,
  buscarItemsVentaAgrupado,
  buscarItemsVentaDetallado,
  registrarVenta,
  OBR_VentaDetalle_CTS,
  anularVenta
} from '../Controllers/Ventas/ventasControllerPOS.js';
router.get('/buscar-productos', buscarItemsVenta);
router.get('/buscar-productos-agrupados', buscarItemsVentaAgrupado);
router.get(
  '/buscar-productos-detallado',
  authenticateToken,
  buscarItemsVentaDetallado
);
router.post('/ventas/pos', registrarVenta);
router.get('/ventas/:id/detalle', OBR_VentaDetalle_CTS);
router.put('/ventas/:id/anular', anularVenta);

import {
  OBRS_MediosPago_CTS,
  OBR_MedioPago_CTS,
  CR_MedioPago_CTS,
  ER_MedioPago_CTS,
  UR_MedioPago_CTS
} from '../Controllers/Ventas/CTS_TB_MediosPago.js';
router.get('/medios-pago', OBRS_MediosPago_CTS);
router.get('/medios-pago/:id', OBR_MedioPago_CTS);
router.post('/medios-pago', CR_MedioPago_CTS);
router.delete('/medios-pago/:id', ER_MedioPago_CTS);
router.put('/medios-pago/:id', UR_MedioPago_CTS);

// Importar controladores de ventas
import {
  OBRS_Ventas_CTS,
  OBR_Venta_CTS,
  CR_Venta_CTS,
  ER_Venta_CTS,
  UR_Venta_CTS,
  OBRS_VentasPorVendedor,
  OBRS_EstadisticasGeneralesVendedores
} from '../Controllers/Ventas/CTS_TB_Ventas.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'ventas'
// ----------------------------------------------------------------

router.get('/ventas', OBRS_Ventas_CTS); // Obtener todas las ventas
router.get('/ventas/:id', OBR_Venta_CTS); // Obtener una venta por ID
router.post('/ventas', CR_Venta_CTS); // Crear nueva venta
router.delete('/ventas/:id', ER_Venta_CTS); // Eliminar venta por ID
router.put('/ventas/:id', UR_Venta_CTS); // Actualizar venta por ID
router.get('/ventas-por-vendedor', OBRS_VentasPorVendedor);
router.get('/ventas-estadisticas', OBRS_EstadisticasGeneralesVendedores);

// Importar controladores de detalle_venta
import {
  OBRS_DetalleVenta_CTS,
  OBR_DetalleVenta_CTS,
  CR_DetalleVenta_CTS,
  ER_DetalleVenta_CTS,
  UR_DetalleVenta_CTS
} from '../Controllers/Ventas/CTS_TB_DetalleVenta.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'detalle_venta'
// ----------------------------------------------------------------

router.get('/detalle_venta', OBRS_DetalleVenta_CTS); // Obtener todos los detalles
router.get('/detalle_venta/:id', OBR_DetalleVenta_CTS); // Obtener un detalle por ID
router.post('/detalle_venta', CR_DetalleVenta_CTS); // Crear nuevo detalle
router.delete('/detalle_venta/:id', ER_DetalleVenta_CTS); // Eliminar detalle por ID
router.put('/detalle_venta/:id', UR_DetalleVenta_CTS); // Actualizar detalle por ID

// Importar controladores de venta_medios_pago
import {
  OBRS_VentaMediosPago_CTS,
  OBR_VentaMediosPago_CTS,
  CR_VentaMediosPago_CTS,
  ER_VentaMediosPago_CTS,
  UR_VentaMediosPago_CTS
} from '../Controllers/Ventas/CTS_TB_VentaMediosPago.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'venta_medios_pago'
// ----------------------------------------------------------------

router.get('/venta_medios_pago', OBRS_VentaMediosPago_CTS); // Todos los registros
router.get('/venta_medios_pago/:id', OBR_VentaMediosPago_CTS); // Por ID
router.post('/venta_medios_pago', CR_VentaMediosPago_CTS); // Crear nuevo
router.delete('/venta_medios_pago/:id', ER_VentaMediosPago_CTS); // Eliminar por ID
router.put('/venta_medios_pago/:id', UR_VentaMediosPago_CTS); // Actualizar por ID

// Importar controladores de caja
import {
  OBRS_Caja_CTS,
  OBR_Caja_CTS,
  CR_Caja_CTS,
  ER_Caja_CTS,
  UR_Caja_CTS,
  OBRS_CajaByLocal_CTS,
  OBRS_CajasAbiertas_CTS,
  getSaldoActualCaja
} from '../Controllers/Ventas/CTS_TB_Caja.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'caja'
// ----------------------------------------------------------------

router.get('/caja', OBRS_Caja_CTS); // Obtener todas las cajas
router.get('/caja/:id', OBR_Caja_CTS); // Obtener una caja por ID
router.post('/caja', CR_Caja_CTS); // Abrir nueva caja
router.delete('/caja/:id', ER_Caja_CTS); // Eliminar caja por ID
router.put('/caja/:id', UR_Caja_CTS); // Actualizar/cerrar caja por ID
router.get('/caja/local/:id', OBRS_CajaByLocal_CTS);
router.get('/cajas-abiertas', OBRS_CajasAbiertas_CTS);
router.get('/caja/:caja_id/saldo-actual', getSaldoActualCaja);

// Importar controladores de movimientos_caja
import {
  OBRS_MovimientosCaja_CTS,
  OBR_MovimientoCaja_CTS,
  CR_MovimientoCaja_CTS,
  ER_MovimientoCaja_CTS,
  UR_MovimientoCaja_CTS,
  OBRS_MovimientosCajaByCajaId_CTS,
  OBRS_MovimientosCajaByCajaId_V2_CTS
} from '../Controllers/Ventas/CTS_TB_MovimientosCaja.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'movimientos_caja'
// ----------------------------------------------------------------

router.get('/movimientos_caja', OBRS_MovimientosCaja_CTS); // Obtener todos los movimientos
router.get('/movimientos_caja/:id', OBR_MovimientoCaja_CTS); // Obtener un movimiento por ID
router.post('/movimientos_caja', CR_MovimientoCaja_CTS); // Crear movimiento nuevo
router.delete('/movimientos_caja/:id', ER_MovimientoCaja_CTS); // Eliminar movimiento por ID
router.put('/movimientos_caja/:id', UR_MovimientoCaja_CTS); // Actualizar movimiento por ID
router.get('/movimientos/caja/:caja_id', OBRS_MovimientosCajaByCajaId_CTS); // Actualizar movimiento por ID
router.get('/movimientosv2/caja/:caja_id', OBRS_MovimientosCajaByCajaId_V2_CTS);

import {
  OBRS_MediosPagoCuotas_CTS,
  OBR_CuotasPorMedio_CTS,
  CR_MedioPagoCuota_CTS,
  UR_MedioPagoCuota_CTS,
  ER_MedioPagoCuota_CTS
} from '../Controllers/Ventas/CTS_TB_MediosPagoCuotas.js';

router.get('/cuotas-medios-pago', OBRS_MediosPagoCuotas_CTS);
router.get('/cuotas-medios-pago/:medio_pago_id', OBR_CuotasPorMedio_CTS);
router.post('/cuotas-medios-pago', CR_MedioPagoCuota_CTS);
router.put('/cuotas-medios-pago/:id', UR_MedioPagoCuota_CTS);
router.delete('/cuotas-medios-pago/:id', ER_MedioPagoCuota_CTS);

import { CALC_TotalFinal_CTS } from '../Controllers/Ventas/CALC_TotalFinal_CTS.js';
router.post('/calcular-total-final', CALC_TotalFinal_CTS);

import {
  OBRS_TicketConfig_CTS, // Obtener configuración (única o todas)
  CR_TicketConfig_CTS, // Crear nueva configuración
  UR_TicketConfig_CTS, // Actualizar configuración
  ER_TicketConfig_CTS // Eliminar configuración
} from '../Controllers/Ventas/CTS_TB_TicketConfig.js';

// GET - Obtener la configuración (por defecto devuelve la única)
router.get('/ticket-config', OBRS_TicketConfig_CTS);

// POST - Crear nueva configuración (sólo si no existe una)
router.post('/ticket-config', CR_TicketConfig_CTS);

// PUT - Actualizar configuración (por ID o la única existente)
// Ejemplo: PUT /api/ticket-config/1
router.put('/ticket-config/:id', UR_TicketConfig_CTS);

// DELETE - Eliminar configuración por ID (opcional)
router.delete('/ticket-config/:id', ER_TicketConfig_CTS);

import {
  OBRS_VentaDescuentos_CTS,
  OBR_VentaDescuento_CTS,
  CR_VentaDescuento_CTS,
  ER_VentaDescuento_CTS,
  UR_VentaDescuento_CTS
} from '../Controllers/Ventas/CTS_TB_VentaDescuentos.js';

router.get('/venta-descuento', OBRS_VentaDescuentos_CTS); // ?venta_id=123
router.get('/venta-descuento/:id', OBR_VentaDescuento_CTS);
router.post('/venta-descuento', CR_VentaDescuento_CTS);
router.delete('/venta-descuento/:id', ER_VentaDescuento_CTS);
router.put('/venta-descuento/:id', UR_VentaDescuento_CTS);

// Importar controladores de devoluciones
import {
  OBRS_Devoluciones_CTS,
  OBR_Devolucion_CTS,
  CR_Devolucion_CTS,
  ER_Devolucion_CTS
} from '../Controllers/Ventas/CTS_TB_Devoluciones.js';

// ----------------------------------------------------------------
// Rutas para operaciones CRUD en la tabla 'devoluciones'
// ----------------------------------------------------------------

router.get('/devoluciones', OBRS_Devoluciones_CTS); // Obtener todas las devoluciones
router.get('/devoluciones/:id', OBR_Devolucion_CTS); // Obtener una devolución por ID
router.post('/devoluciones', CR_Devolucion_CTS); // Crear nueva devolución
router.delete('/devoluciones/:id', ER_Devolucion_CTS); // Eliminar devolución por ID

import {
  obtenerVentasPorMes,
  obtenerVentasPorMedioPago,
  obtenerProductosMasVendidos,
  obtenerVentasPorLocal,
  obtenerResumenDescuentos
} from '../Controllers/analyticsController.js';

router.get('/ventas-mensuales', obtenerVentasPorMes);
router.get('/ventas-por-medio-pago', obtenerVentasPorMedioPago);
router.get('/productos-mas-vendidos', obtenerProductosMasVendidos);
router.get('/ventas-por-local', obtenerVentasPorLocal);
router.get('/resumen-descuentos', obtenerResumenDescuentos);

// Controladores Recaptación
import {
  OBRS_RecaptacionCampanas_CTS,
  OBR_RecaptacionCampana_CTS,
  CR_RecaptacionCampana_CTS,
  UR_RecaptacionCampana_CTS,
  ER_RecaptacionCampana_CTS
} from '../Controllers/Recaptacion/CTS_TB_RecaptacionCampanas.js';

import {
  OBRS_RecaptacionClientes_CTS,
  CR_RecaptacionCliente_CTS,
  UR_RespuestaRecaptacion_CTS,
  ER_RecaptacionCliente_CTS
} from '../Controllers/Recaptacion/CTS_TB_RecaptacionClientes.js';

// -------------------------
// RUTAS: CAMPAÑAS DE RECAPTACIÓN
// -------------------------
router.get('/recaptacion-campanas', OBRS_RecaptacionCampanas_CTS);
router.get('/recaptacion-campanas/:id', OBR_RecaptacionCampana_CTS);
router.post('/recaptacion-campanas', CR_RecaptacionCampana_CTS);
router.put('/recaptacion-campanas/:id', UR_RecaptacionCampana_CTS);
router.delete('/recaptacion-campanas/:id', ER_RecaptacionCampana_CTS);

// -------------------------
// RUTAS: CLIENTES ASIGNADOS A CAMPAÑAS
// -------------------------
router.get('/recaptacion-clientes', OBRS_RecaptacionClientes_CTS);
router.post('/recaptacion-clientes', CR_RecaptacionCliente_CTS);
router.put('/recaptacion-clientes/:id', UR_RespuestaRecaptacion_CTS);
router.delete('/recaptacion-clientes/:id', ER_RecaptacionCliente_CTS);

import { OBRS_EstadisticasRecaptacion_CTS } from '../Controllers/Analiticas/EstadisticasRecaptacion.js';
router.get('/recaptacion-estadisticas', OBRS_EstadisticasRecaptacion_CTS);

// -------------------- COMBOS --------------------
import {
  OBRS_Combos_CTS,
  OBR_Combo_CTS,
  CR_Combo_CTS,
  UR_Combo_CTS,
  ER_Combo_CTS,
  SEARCH_Combos_CTS
} from '../Controllers/Combos/CTS_TB_Combos.js';

router.get('/combos', OBRS_Combos_CTS); // Obtener todos los combos
router.get('/combos/:id', OBR_Combo_CTS); // Obtener combo por ID
router.post('/combos', CR_Combo_CTS); // Crear nuevo combo
router.put('/combos/:id', UR_Combo_CTS); // Actualizar combo
router.delete('/combos/:id', ER_Combo_CTS); // Eliminar combo
router.get('/combos-buscar', SEARCH_Combos_CTS); // Búsqueda por nombre

// -------------------- PRODUCTOS PERMITIDOS EN COMBOS --------------------
import {
  OBRS_ComboProductosPermitidos_CTS,
  OBRS_PermitidosPorCombo_CTS,
  CR_ComboProductoPermitido_CTS,
  UR_ComboProductoPermitido_CTS,
  ER_ComboProductoPermitido_CTS
} from '../Controllers/Combos/CTS_TB_ComboProductosPermitidos.js';

router.get('/combo-productos-permitidos', OBRS_ComboProductosPermitidos_CTS);
router.get(
  '/combo-productos-permitidos/:combo_id',
  OBRS_PermitidosPorCombo_CTS
);
router.post('/combo-productos-permitidos', CR_ComboProductoPermitido_CTS);
router.put('/combo-productos-permitidos/:id', UR_ComboProductoPermitido_CTS);
router.delete('/combo-productos-permitidos/:id', ER_ComboProductoPermitido_CTS);

// -------------------- DETALLE DE VENTA COMBOS --------------------
import {
  OBRS_DetallesVentaCombo_CTS,
  OBRS_ProductosPorVentaCombo_CTS,
  CR_DetallesVentaCombo_CTS,
  ER_DetalleVentaCombo_CTS
} from '../Controllers/Combos/CTS_TB_DetalleVentaCombos.js';

router.get('/detalle-venta-combos', OBRS_DetallesVentaCombo_CTS);
router.get('/detalle-venta-combos/:venta_id', OBRS_ProductosPorVentaCombo_CTS);
router.post('/detalle-venta-combos', CR_DetallesVentaCombo_CTS);
router.delete('/detalle-venta-combos/:id', ER_DetalleVentaCombo_CTS);

// -------------------- LOG DE VENTAS DE COMBOS --------------------
import {
  OBRS_ComboVentaLog_CTS,
  OBRS_CombosPorVenta_CTS,
  CR_ComboVentaLog_CTS,
  ER_ComboVentaLog_CTS
} from '../Controllers/Combos/CTS_TB_ComboVentaLog.js';

router.get('/combo-venta-log', OBRS_ComboVentaLog_CTS);
router.get('/combo-venta-log/:venta_id', OBRS_CombosPorVenta_CTS);
router.post('/combo-venta-log', CR_ComboVentaLog_CTS);
router.delete('/combo-venta-log/:id', ER_ComboVentaLog_CTS);

import { OBRS_Logs_CTS, OBR_Log_CTS } from '../Controllers/CTS_TB_Logs.js';

router.get('/logs', authenticateToken, OBRS_Logs_CTS);
router.get('/logs/:id', authenticateToken, OBR_Log_CTS);

import {
  imprimirEtiquetaTicketDemo,
  imprimirEtiquetasTicket
} from '../Controllers/Stock/StockLabelsTicketController.js';
// Importar controladores de productos

router.get('/stock/etiquetas/ticket/demo', imprimirEtiquetaTicketDemo);
router.get('/stock/etiquetas/ticket', imprimirEtiquetasTicket);

import {
  OBRS_PedidosStock_CTS,
  OBR_PedidoStock_CTS,
  CR_PedidoStock_CTS,
  UR_PedidoStock_Estado_CTS,
  UR_PedidoStock_Cantidades_CTS,
  ER_PedidoStock_CTS
} from '../Controllers/Stock/CTS_TB_PedidoStock.js';

router.get('/pedidos', OBRS_PedidosStock_CTS);
router.get('/pedidos/:id', OBR_PedidoStock_CTS);
router.post('/pedidos', CR_PedidoStock_CTS);
router.patch('/pedidos/:id/estado', UR_PedidoStock_Estado_CTS);
router.patch('/pedidos/:id/cantidades', UR_PedidoStock_Cantidades_CTS);
router.delete('/pedidos/:id', ER_PedidoStock_CTS); // cancelar

// MODULO DE PROVEEDORES INI
// -------------------------

import {
  OBRS_Proveedores_CTS,
  OBR_Proveedor_CTS,
  CR_Proveedor_CTS,
  UR_Proveedor_CTS,
  ER_Proveedor_CTS,
  SEARCH_Proveedores_CTS,
  OBRS_ProveedoresInactivos_CTS,
  Estado_Proveedor_CTS
} from '../Controllers/Proveedores/CTS_TB_Proveedores.js';

router.get('/proveedores', OBRS_Proveedores_CTS);
router.get('/proveedores/search', SEARCH_Proveedores_CTS);
router.get('/proveedores/inactivos', OBRS_ProveedoresInactivos_CTS);
router.get('/proveedores/:id', OBR_Proveedor_CTS);

router.post('/proveedores', CR_Proveedor_CTS);
router.put('/proveedores/:id', UR_Proveedor_CTS);
router.patch('/proveedores/:id/estado', Estado_Proveedor_CTS);
router.delete('/proveedores/:id', ER_Proveedor_CTS);

import {
  OBRS_ProveedorContactos_CTS,
  OBR_ProveedorContacto_CTS,
  CR_ProveedorContacto_CTS,
  UR_ProveedorContacto_CTS,
  ER_ProveedorContacto_CTS,
  SetPrincipal_ProveedorContacto_CTS,
  SEARCH_ProveedorContactos_CTS
} from '../Controllers/Proveedores/CTS_TB_ProveedorContactos.js';

// Listar contactos de un proveedor
router.get('/proveedores/:proveedorId/contactos', OBRS_ProveedorContactos_CTS);

// CRUD básico
router.get('/proveedores/contactos/:id', OBR_ProveedorContacto_CTS);
router.post('/proveedores/:proveedorId/contactos', CR_ProveedorContacto_CTS);
router.put('/proveedores/contactos/:id', UR_ProveedorContacto_CTS);
router.delete('/proveedores/contactos/:id', ER_ProveedorContacto_CTS);

// Contacto principal
router.patch(
  '/proveedores/contactos/:id/principal',
  SetPrincipal_ProveedorContacto_CTS
);

// Búsqueda rápida
router.get('/proveedores/contactos/search', SEARCH_ProveedorContactos_CTS);

import {
  OBRS_ProveedorCuentas_CTS,
  OBR_ProveedorCuenta_CTS,
  CR_ProveedorCuenta_CTS,
  UR_ProveedorCuenta_CTS,
  ER_ProveedorCuenta_CTS,
  SetPredeterminada_ProveedorCuenta_CTS,
  SEARCH_ProveedorCuentas_CTS
} from '../Controllers/Proveedores/CTS_TB_ProveedorCuentasBancarias.js';

// Listar cuentas de un proveedor
router.get('/proveedores/:proveedorId/cuentas', OBRS_ProveedorCuentas_CTS);

// CRUD básico
router.get('/proveedores/cuentas/:id', OBR_ProveedorCuenta_CTS);
router.post('/proveedores/:proveedorId/cuentas', CR_ProveedorCuenta_CTS);
router.put('/proveedores/cuentas/:id', UR_ProveedorCuenta_CTS);
router.delete('/proveedores/cuentas/:id', ER_ProveedorCuenta_CTS);

// Marcar cuenta predeterminada
router.patch(
  '/proveedores/cuentas/:id/predeterminada',
  SetPredeterminada_ProveedorCuenta_CTS
);

// Búsqueda rápida
router.get('/proveedores/cuentas/search', SEARCH_ProveedorCuentas_CTS);

import {
  OBRS_ProductoProveedor_CTS,
  OBR_ProductoProveedor_CTS,
  CR_ProductoProveedor_CTS,
  UR_ProductoProveedor_CTS,
  ER_ProductoProveedor_CTS,
  SetVigente_ProductoProveedor_CTS,
  SEARCH_ProductoProveedor_CTS
} from '../Controllers/Proveedores/CTS_TB_ProductoProveedor.js';

router.get('/producto-proveedor', OBRS_ProductoProveedor_CTS);
router.get('/producto-proveedor/search', SEARCH_ProductoProveedor_CTS);
router.get('/producto-proveedor/:id', OBR_ProductoProveedor_CTS);

router.post('/producto-proveedor', CR_ProductoProveedor_CTS);
router.put('/producto-proveedor/:id', UR_ProductoProveedor_CTS);
router.patch(
  '/producto-proveedor/:id/vigente',
  SetVigente_ProductoProveedor_CTS
);
router.delete('/producto-proveedor/:id', ER_ProductoProveedor_CTS);

import {
  OBRS_PPH_CTS,
  OBR_PPH_CTS,
  CR_PPH_CTS,
  ER_PPH_CTS,
  OBR_PPH_Ultimo_CTS
} from '../Controllers/Proveedores/CTS_TB_ProductoProveedorHistorialCostos.js';

// Listar historial por PP (con filtros de fecha/paginación)
router.get('/producto-proveedor/:ppId/historial', OBRS_PPH_CTS);

// Último registro de historial
router.get('/producto-proveedor/:ppId/historial/ultimo', OBR_PPH_Ultimo_CTS);

// Obtener un historial por ID
router.get('/producto-proveedor/historial/:id', OBR_PPH_CTS);

// Crear historial (opcionalmente aplicando al PP)
router.post('/producto-proveedor/:ppId/historial', CR_PPH_CTS);

// Eliminar historial
router.delete('/producto-proveedor/historial/:id', ER_PPH_CTS);

// MODULO DE PROVEDORES FIN
// -------------------------

// MODULO DE BANCOS INI - 20-09-2025 Benjamin Orellana
// -------------------------
import {
  OBRS_Bancos_CTS,
  OBR_Banco_CTS,
  CR_Banco_CTS,
  UR_Banco_CTS,
  ER_Banco_CTS
} from '../Controllers/Bancos/CTS_TB_Bancos.js';

router.get('/bancos', OBRS_Bancos_CTS);
router.get('/bancos/:id', OBR_Banco_CTS);
router.post('/bancos', CR_Banco_CTS);
router.put('/bancos/:id', UR_Banco_CTS);
router.patch('/bancos/:id', UR_Banco_CTS);
router.delete('/bancos/:id', ER_Banco_CTS);

// Banco Cuentas
import {
  OBRS_BancoCuentas_CTS,
  OBR_BancoCuenta_CTS,
  CR_BancoCuenta_CTS,
  UR_BancoCuenta_CTS,
  ER_BancoCuenta_CTS
} from '../Controllers/Bancos/CTS_TB_BancoCuentas.js';

router.get('/banco-cuentas', OBRS_BancoCuentas_CTS);
router.get('/banco-cuentas/:id', OBR_BancoCuenta_CTS);
router.post('/banco-cuentas', CR_BancoCuenta_CTS);
router.put('/banco-cuentas/:id', UR_BancoCuenta_CTS);
router.patch('/banco-cuentas/:id', UR_BancoCuenta_CTS);
router.delete('/banco-cuentas/:id', ER_BancoCuenta_CTS);

// Banco Movimientos
import {
  OBRS_BancoMovimientos_CTS,
  OBR_BancoMovimiento_CTS,
  CR_BancoMovimiento_CTS,
  UR_BancoMovimiento_CTS,
  ER_BancoMovimiento_CTS,
  // GET_SaldoCuenta_CTS,
  // GET_ResumenCuenta_CTS,
  EXP_BancoMovimientos_CSV_CTS
} from '../Controllers/Bancos/CTS_TB_BancoMovimientos.js';

router.get('/banco-movimientos', OBRS_BancoMovimientos_CTS);
router.get('/banco-movimientos/:id', OBR_BancoMovimiento_CTS);
router.post('/banco-movimientos', CR_BancoMovimiento_CTS);
router.put('/banco-movimientos/:id', UR_BancoMovimiento_CTS);
router.patch('/banco-movimientos/:id', UR_BancoMovimiento_CTS);
router.delete('/banco-movimientos/:id', ER_BancoMovimiento_CTS);

// KPIs / Reportes
// router.get('/banco-cuentas/:id/saldo', GET_SaldoCuenta_CTS);
// router.get('/banco-cuentas/:id/resumen', GET_ResumenCuenta_CTS);
router.get('/banco-movimientos/export.csv', EXP_BancoMovimientos_CSV_CTS);

import {
  GET_SaldoCuenta_CTS,
  GET_ResumenCuenta_CTS
} from '../Controllers/Bancos/CTS_TB_BancoCuentasKPIs.js';

// Endpoints
router.get('/banco-cuentas/:id/saldo', GET_SaldoCuenta_CTS);
router.get('/banco-cuentas/:id/resumen', GET_ResumenCuenta_CTS);

// MODULO DE BANCOS FIN - 20-09-2025 Benjamin Orellana
// -------------------------

// MODULO DE CHEQUES INI - 20-09-2025 Benjamin Orellana
// -------------------------
// Chequeras
import {
  OBRS_Chequeras_CTS,
  OBR_Chequera_CTS,
  CR_Chequera_CTS,
  UR_Chequera_CTS,
  ER_Chequera_CTS
} from '../Controllers/Cheques/CTS_TB_Chequeras.js';

router.get('/chequeras', OBRS_Chequeras_CTS);
router.get('/chequeras/:id', OBR_Chequera_CTS);
router.post('/chequeras', CR_Chequera_CTS);
router.put('/chequeras/:id', UR_Chequera_CTS);
router.patch('/chequeras/:id', UR_Chequera_CTS);
router.delete('/chequeras/:id', ER_Chequera_CTS);

import { OBRS_AllChequeMovimientos_CTS } from '../Controllers/Cheques/CTS_TB_ChequeMovimientos.js';
// ✅ GLOBAL (sin cheque_id) — DEBE IR ANTES
router.get('/cheques/movimientos', OBRS_AllChequeMovimientos_CTS);


import {
  OBRS_ChequesPorChequera_CTS,
  OBRS_Cheques_CTS,
  OBR_Cheque_CTS,
  CR_Cheque_CTS,
  UR_Cheque_CTS,
  ER_Cheque_CTS,
  TR_Depositar_Cheque_CTS,
  TR_Acreditar_Cheque_CTS,
  TR_Rechazar_Cheque_CTS,
  TR_AplicarProveedor_Cheque_CTS,
  TR_Entregar_Cheque_CTS,
  TR_Compensar_Cheque_CTS,
  TR_Anular_Cheque_CTS
} from '../Controllers/Cheques/CTS_TB_Cheques.js';

router.get('/chequeras/:id/cheques', OBRS_ChequesPorChequera_CTS);
router.get('/cheques', OBRS_Cheques_CTS);
router.get('/cheques/:id', OBR_Cheque_CTS);
router.post('/cheques', CR_Cheque_CTS);
router.put('/cheques/:id', UR_Cheque_CTS);
router.patch('/cheques/:id', UR_Cheque_CTS);
router.delete('/cheques/:id', ER_Cheque_CTS);

// Transiciones de estado
router.patch('/cheques/:id/depositar', TR_Depositar_Cheque_CTS);
router.patch('/cheques/:id/acreditar', TR_Acreditar_Cheque_CTS);
router.patch('/cheques/:id/rechazar', TR_Rechazar_Cheque_CTS);
router.patch(
  '/cheques/:id/aplicar-a-proveedor',
  TR_AplicarProveedor_Cheque_CTS
);
router.patch('/cheques/:id/entregar', TR_Entregar_Cheque_CTS);
router.patch('/cheques/:id/compensar', TR_Compensar_Cheque_CTS);
router.patch('/cheques/:id/anular', TR_Anular_Cheque_CTS);

import {
  uploadChequeImagenMulter,
  OBRS_ChequeImagenes_CTS,
  OBR_ChequeImagen_CTS,
  CR_ChequeImagen_CTS,
  DWN_ChequeImagen_CTS,
  UR_ChequeImagen_CTS,
  ER_ChequeImagen_CTS
} from '../Controllers/Cheques/CTS_TB_ChequeImagenes.js';


import {
  OBRS_ChequeImagenEventos_CTS,
  OBR_ChequeImagenEvento_CTS,
  CR_ChequeImagenEvento_CTS,
  ER_ChequeImagenEvento_CTS
} from '../Controllers/Cheques/CTS_TB_ChequeImagenEventos.js';

// ---------------- Rutas ----------------

// Listar imágenes
router.get('/cheques/:cheque_id/imagenes', OBRS_ChequeImagenes_CTS);

// Descargar imagen (antes que la genérica)
router.get('/cheques/:cheque_id/imagenes/:id/download', DWN_ChequeImagen_CTS);


// Eventos (antes de la genérica de :id)
router.get(
  '/cheques/:cheque_id/imagenes/eventos',
  OBRS_ChequeImagenEventos_CTS
);
router.get(
  '/cheques/:cheque_id/imagenes/eventos/:id',
  OBR_ChequeImagenEvento_CTS
);
router.post('/cheques/:cheque_id/imagenes/eventos', CR_ChequeImagenEvento_CTS);
router.delete(
  '/cheques/:cheque_id/imagenes/eventos/:id',
  ER_ChequeImagenEvento_CTS
);

// Subir (multer -> controller)
router.post(
  '/cheques/:cheque_id/imagenes',
  uploadChequeImagenMulter,
  CR_ChequeImagen_CTS
);

// --------- GENÉRICAS AL FINAL ---------

// Ver detalle
router.get('/cheques/:cheque_id/imagenes/:id', OBR_ChequeImagen_CTS);

// Editar
router.patch('/cheques/:cheque_id/imagenes/:id', UR_ChequeImagen_CTS);

// Eliminar
router.delete('/cheques/:cheque_id/imagenes/:id', ER_ChequeImagen_CTS);
import {
  OBRS_ChequeMovimientos_CTS,
  OBR_ChequeMovimiento_CTS,
  CR_ChequeMovimiento_CTS,
  UR_ChequeMovimiento_CTS,
  ER_ChequeMovimiento_CTS
} from '../Controllers/Cheques/CTS_TB_ChequeMovimientos.js';

//  ESPECÍFICAS (con cheque_id)
router.get('/cheques/:cheque_id/movimientos', OBRS_ChequeMovimientos_CTS);
router.get('/cheques/:cheque_id/movimientos/:id', OBR_ChequeMovimiento_CTS);
router.post('/cheques/:cheque_id/movimientos', CR_ChequeMovimiento_CTS);
router.put('/cheques/:cheque_id/movimientos/:id', UR_ChequeMovimiento_CTS);
router.patch('/cheques/:cheque_id/movimientos/:id', UR_ChequeMovimiento_CTS);
router.delete('/cheques/:cheque_id/movimientos/:id', ER_ChequeMovimiento_CTS);

// MODULO DE CHEQUES FIN - 20-09-2025 Benjamin Orellana
// -------------------------

// MODULO DE TESORERIA INI - 21-09-2025 Benjamin Orellana
// -------------------------

// Tesorería - Teso Flujos
import {
  OBRS_TesoFlujo_CTS,
  OBR_TesoFlujo_CTS,
  CR_TesoFlujo_CTS,
  UR_TesoFlujo_CTS,
  ER_TesoFlujo_CTS,
  GET_TesoFlujo_Proyeccion_CTS,
  EXP_TesoFlujo_CSV_CTS
} from '../Controllers/Tesoreria/CTS_TB_TesoFlujo.js';

// Proyección y export
router.get('/teso-flujo/proyeccion', GET_TesoFlujo_Proyeccion_CTS);
router.get('/teso-flujo/export.csv', EXP_TesoFlujo_CSV_CTS);

router.get('/teso-flujo', OBRS_TesoFlujo_CTS);
router.get('/teso-flujo/:id', OBR_TesoFlujo_CTS);
router.post('/teso-flujo', CR_TesoFlujo_CTS);
router.put('/teso-flujo/:id', UR_TesoFlujo_CTS);
router.patch('/teso-flujo/:id', UR_TesoFlujo_CTS);
router.delete('/teso-flujo/:id', ER_TesoFlujo_CTS);


// MODULO DE TESORERIA FIN - 21-09-2025 Benjamin Orellana
// -------------------------

export default router;
