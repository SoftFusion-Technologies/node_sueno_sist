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
  UR_Stock_CTS,
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
router.put('/stock/:id', UR_Stock_CTS);
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
router.get('/buscar-productos-detallado', buscarItemsVentaDetallado);
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
  OBRS_MovimientosCajaByCajaId_CTS
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

export default router;
