/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (relaciones.js) define todas las relaciones entre los modelos Sequelize del sistema.
 *
 * Tema: Relaciones entre modelos
 * Capa: Backend
 */

// Importaciones de modelos
import { StockModel } from './Stock/MD_TB_Stock.js';
import { ProductosModel } from './Stock/MD_TB_Productos.js';
import { LocalesModel } from './Stock/MD_TB_Locales.js';
import { LugaresModel } from './Stock/MD_TB_Lugares.js';
import { EstadosModel } from './Stock/MD_TB_Estados.js';
import { CategoriasModel } from './Stock/MD_TB_Categorias.js';

// RELACIONES MODULO DE VENTAS
import { VentasModel } from './Ventas/MD_TB_Ventas.js';
import { UserModel } from './MD_TB_Users.js';
import { ClienteModel } from './MD_TB_Clientes.js';
import { DetalleVentaModel } from './Ventas/MD_TB_DetalleVenta.js';
import { VentaMediosPagoModel } from './Ventas/MD_TB_VentaMediosPago.js';
import { MediosPagoModel } from './Ventas/MD_TB_MediosPago.js';
import { CajaModel } from './Ventas/MD_TB_Caja.js';
import { MovimientosCajaModel } from './Ventas/MD_TB_MovimientosCaja.js';
import { VentaDescuentosModel } from './Ventas/MD_TB_VentaDescuentos.js';

import { DevolucionesModel } from './Ventas/MD_TB_Devoluciones.js';
import { DetalleDevolucionModel } from './Ventas/MD_TB_DetalleDevolucion.js';
// RELACIONES MODULO DE VENTAS

// RELACIONES MODULO DE RECAPTACION
import { RecaptacionCampanasModel } from './Recaptacion/MD_TB_RecaptacionCampanas.js';
import { RecaptacionClientesModel } from './Recaptacion/MD_TB_RecaptacionClientes.js';
// RELACIONES MODULO DE RECAPTACION

// RELACIONES MODULO DE COMBOS
import { CombosModel } from './Combos/MD_TB_Combos.js';
import { ComboProductosPermitidosModel } from './Combos/MD_TB_ComboProductosPermitidos.js';
import { DetalleVentaCombosModel } from './Combos/MD_TB_DetalleVentaCombos.js';
import { ComboVentaLogModel } from './Combos/MD_TB_ComboVentaLog.js';
// RELACIONES MODULO DE COMBOS

// RELACIONES LOGS - USUARIOS
import { LogModel } from './Seguridad/MD_TB_Logs.js';
// RELACIONES LOGS - USUARIOS

import { PedidoStockModel } from './Stock/MD_TB_PedidoStock.js';

// RELACIONES MODULO DE BANCOS - INI
import { BancoModel } from './Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from './Bancos/MD_TB_BancoCuentas.js';
import { BancoMovimientoModel } from './Bancos/MD_TB_BancoMovimientos.js';
// RELACIONES MODULO DE BANCOS - FIN

// RELACIONES MODULO DE CHEQUES - INI
import { ChequeraModel } from './Cheques/MD_TB_Chequeras.js';
import { ChequeModel } from './Cheques/MD_TB_Cheques.js';
import { ChequeMovimientoModel } from './Cheques/MD_TB_ChequeMovimientos.js';
// imagenes de cheques
import { ChequeImagenModel } from './Cheques/MD_TB_ChequeImagenes.js';
import { ChequeImagenThumbModel } from './Cheques/MD_TB_ChequeImagenThumbs.js';
import { ChequeImagenEventoModel } from './Cheques/MD_TB_ChequeImagenEventos.js';
// RELACIONES MODULO DE CHEQUES - FIN

// RELACIONES MODULO DE TESORERIA - INI
import { TesoFlujoModel } from './Tesoreria/MD_TB_TesoFlujo.js';
// RELACIONES MODULO DE TESORERIA - FIN

// Relaciones de Stock con otras tablas
StockModel.belongsTo(ProductosModel, { foreignKey: 'producto_id' });
StockModel.belongsTo(LocalesModel, { foreignKey: 'local_id' });
StockModel.belongsTo(LugaresModel, { foreignKey: 'lugar_id' });
StockModel.belongsTo(EstadosModel, { foreignKey: 'estado_id' });

// (Opcional) Si más adelante necesitás las relaciones inversas:
ProductosModel.hasMany(StockModel, { foreignKey: 'producto_id' });
LocalesModel.hasMany(StockModel, { foreignKey: 'local_id' });
LugaresModel.hasMany(StockModel, { foreignKey: 'lugar_id' });
EstadosModel.hasMany(StockModel, { foreignKey: 'estado_id' });
// Relación Producto pertenece a Categoría
ProductosModel.belongsTo(CategoriasModel, {
  foreignKey: 'categoria_id',
  as: 'categoria'
});

// (Opcional) Si querés ver qué productos tiene una categoría
CategoriasModel.hasMany(ProductosModel, {
  foreignKey: 'categoria_id',
  as: 'productos'
});

// RELACIONES MODULO DE VENTAS
VentasModel.belongsTo(ClienteModel, { foreignKey: 'cliente_id' });
VentasModel.belongsTo(UserModel, { foreignKey: 'usuario_id' });
VentasModel.belongsTo(LocalesModel, { foreignKey: 'local_id' });

ClienteModel.hasMany(VentasModel, { foreignKey: 'cliente_id' });
UserModel.hasMany(VentasModel, { foreignKey: 'usuario_id' });
LocalesModel.hasMany(VentasModel, { foreignKey: 'local_id' });

DetalleVentaModel.belongsTo(VentasModel, { foreignKey: 'venta_id' });
DetalleVentaModel.belongsTo(StockModel, { foreignKey: 'stock_id' });

VentasModel.hasMany(DetalleVentaModel, {
  foreignKey: 'venta_id',
  as: 'detalles'
});
VentasModel.hasMany(VentaMediosPagoModel, {
  foreignKey: 'venta_id',
  as: 'venta_medios_pago' // Usa el nombre que prefieras, pero sé consistente
});

StockModel.hasMany(DetalleVentaModel, { foreignKey: 'stock_id' });

VentaMediosPagoModel.belongsTo(VentasModel, { foreignKey: 'venta_id' });
VentaMediosPagoModel.belongsTo(MediosPagoModel, {
  foreignKey: 'medio_pago_id'
});

// (Opcional) Relaciones en relaciones.js:
CajaModel.belongsTo(LocalesModel, { foreignKey: 'local_id' });
CajaModel.belongsTo(UserModel, { foreignKey: 'usuario_id' });

// (Opcional) Relaciones en relaciones.js:
MovimientosCajaModel.belongsTo(CajaModel, {
  foreignKey: 'caja_id',
  as: 'Caja'
});

// RELACIONES MODULO DE VENTAS

VentasModel.hasMany(VentaDescuentosModel, {
  foreignKey: 'venta_id',
  as: 'descuentos'
});

// Relaciones de devoluciones
DevolucionesModel.belongsTo(VentasModel, { foreignKey: 'venta_id' });
VentasModel.hasMany(DevolucionesModel, {
  foreignKey: 'venta_id',
  as: 'devoluciones'
});

DevolucionesModel.belongsTo(UserModel, { foreignKey: 'usuario_id' });
UserModel.hasMany(DevolucionesModel, { foreignKey: 'usuario_id' });

DetalleDevolucionModel.belongsTo(DevolucionesModel, {
  foreignKey: 'devolucion_id'
});
DevolucionesModel.hasMany(DetalleDevolucionModel, {
  foreignKey: 'devolucion_id',
  as: 'detalles'
});

DetalleDevolucionModel.belongsTo(StockModel, { foreignKey: 'stock_id' });
StockModel.hasMany(DetalleDevolucionModel, { foreignKey: 'stock_id' });

// 🔁 Nueva relación: cada detalle de devolución está relacionado con un detalle de venta
DetalleDevolucionModel.belongsTo(DetalleVentaModel, {
  foreignKey: 'detalle_venta_id',
  as: 'detalle_venta'
});

DetalleVentaModel.hasMany(DetalleDevolucionModel, {
  foreignKey: 'detalle_venta_id',
  as: 'devoluciones'
});

DevolucionesModel.belongsTo(LocalesModel, {
  foreignKey: 'local_id',
  as: 'local'
});

LocalesModel.hasMany(DevolucionesModel, {
  foreignKey: 'local_id',
  as: 'devoluciones'
});

// RELACIONES MODULO DE RECAPTACION
ClienteModel.hasMany(RecaptacionClientesModel, { foreignKey: 'cliente_id' });
RecaptacionClientesModel.belongsTo(ClienteModel, { foreignKey: 'cliente_id' });

RecaptacionCampanasModel.hasMany(RecaptacionClientesModel, {
  foreignKey: 'campana_id'
});
RecaptacionClientesModel.belongsTo(RecaptacionCampanasModel, {
  foreignKey: 'campana_id'
});

// RELACIONES MODULO DE RECAPTACION

// RELACIONES MODULO DE COMBOS
// Combos tiene muchos productos permitidos
CombosModel.hasMany(ComboProductosPermitidosModel, {
  foreignKey: 'combo_id',
  as: 'productos_permitidos'
});
ComboProductosPermitidosModel.belongsTo(CombosModel, {
  foreignKey: 'combo_id',
  as: 'combo'
});

// Productos permitidos por producto y categoría
ComboProductosPermitidosModel.belongsTo(ProductosModel, {
  foreignKey: 'producto_id',
  as: 'producto'
});
ComboProductosPermitidosModel.belongsTo(CategoriasModel, {
  foreignKey: 'categoria_id',
  as: 'categoria'
});

// Detalle de venta combos
DetalleVentaCombosModel.belongsTo(CombosModel, {
  foreignKey: 'combo_id',
  as: 'combo'
});
DetalleVentaCombosModel.belongsTo(StockModel, {
  foreignKey: 'stock_id',
  as: 'stock'
});
DetalleVentaCombosModel.belongsTo(VentasModel, {
  foreignKey: 'venta_id',
  as: 'venta'
});

CombosModel.hasMany(DetalleVentaCombosModel, {
  foreignKey: 'combo_id',
  as: 'detalles_venta'
});
VentasModel.hasMany(DetalleVentaCombosModel, {
  foreignKey: 'venta_id',
  as: 'detalle_venta_combos'
});
StockModel.hasMany(DetalleVentaCombosModel, {
  foreignKey: 'stock_id',
  as: 'detalle_combos'
});

// ComboVentaLog
ComboVentaLogModel.belongsTo(VentasModel, {
  foreignKey: 'venta_id',
  as: 'venta'
});
ComboVentaLogModel.belongsTo(CombosModel, {
  foreignKey: 'combo_id',
  as: 'combo'
});

VentasModel.hasMany(ComboVentaLogModel, {
  foreignKey: 'venta_id',
  as: 'combos_vendidos'
});
CombosModel.hasMany(ComboVentaLogModel, {
  foreignKey: 'combo_id',
  as: 'ventas_log'
});
// RELACIONES MODULO DE COMBOS

// RELACIONES LOGS - USUARIOS
LogModel.belongsTo(UserModel, { foreignKey: 'usuario_id', as: 'usuario' });
UserModel.hasMany(LogModel, { foreignKey: 'usuario_id', as: 'logs' });

PedidoStockModel.belongsTo(ProductosModel, {
  as: 'producto',
  foreignKey: 'producto_id'
});
PedidoStockModel.belongsTo(StockModel, {
  as: 'stock_origen',
  foreignKey: 'stock_id_origen'
});
PedidoStockModel.belongsTo(LocalesModel, {
  as: 'local_origen',
  foreignKey: 'local_origen_id'
});
PedidoStockModel.belongsTo(LocalesModel, {
  as: 'local_destino',
  foreignKey: 'local_destino_id'
});
PedidoStockModel.belongsTo(UserModel, {
  as: 'creador',
  foreignKey: 'creado_por'
});

// RELACIONES MODULO DE BANCOS - INI
// Bancos ↔ Cuentas (1:N)
BancoModel.hasMany(BancoCuentaModel, {
  as: 'cuentas',
  foreignKey: 'banco_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});
BancoCuentaModel.belongsTo(BancoModel, {
  as: 'banco',
  foreignKey: 'banco_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});

// Cuentas ↔ Movimientos (1:N)
BancoCuentaModel.hasMany(BancoMovimientoModel, {
  as: 'movimientos',
  foreignKey: 'banco_cuenta_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});
BancoMovimientoModel.belongsTo(BancoCuentaModel, {
  as: 'cuenta',
  foreignKey: 'banco_cuenta_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});
// RELACIONES MODULO DE BANCOS - FIN


// RELACIONES MODULO DE CHEQUES - INI
// BancoCuentas ↔ Chequeras (1:N)
BancoCuentaModel.hasMany(ChequeraModel, {
  as: 'chequeras',
  foreignKey: 'banco_cuenta_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});
ChequeraModel.belongsTo(BancoCuentaModel, {
  as: 'cuenta',
  foreignKey: 'banco_cuenta_id',
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT'
});

// Bancos ↔ Cheques (N:1)  (el banco del cheque)
BancoModel.hasMany(ChequeModel, {
  as: 'cheques',
  foreignKey: 'banco_id',
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});
ChequeModel.belongsTo(BancoModel, {
  as: 'banco',
  foreignKey: 'banco_id',
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});

// Cheques ↔ Movimientos (1:N)
ChequeModel.hasMany(ChequeMovimientoModel, {
  as: 'movimientos',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

ChequeMovimientoModel.belongsTo(ChequeModel, {
  as: 'cheque',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

// Chequeras ↔ Cheques (1:N) (solo aplica a emitidos)
ChequeraModel.hasMany(ChequeModel, {
  as: 'cheques_emitidos',
  foreignKey: 'chequera_id',
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});
ChequeModel.belongsTo(ChequeraModel, {
  as: 'chequera',
  foreignKey: 'chequera_id',
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});


// Cheques ↔ Imágenes (1:N)
ChequeModel.hasMany(ChequeImagenModel, {
  as: 'imagenes',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
ChequeImagenModel.belongsTo(ChequeModel, {
  as: 'cheque',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

// Imágenes ↔ Thumbs (1:N)
ChequeImagenModel.hasMany(ChequeImagenThumbModel, {
  as: 'thumbs',
  foreignKey: 'imagen_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
ChequeImagenThumbModel.belongsTo(ChequeImagenModel, {
  as: 'imagen',
  foreignKey: 'imagen_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});

// Imágenes/Eventos (N:1) y Cheques/Eventos (N:1)
ChequeImagenEventoModel.belongsTo(ChequeImagenModel, {
  as: 'imagen',
  foreignKey: 'imagen_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
ChequeImagenEventoModel.belongsTo(ChequeModel, {
  as: 'cheque',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
ChequeModel.hasMany(ChequeImagenEventoModel, {
  as: 'imagen_eventos',
  foreignKey: 'cheque_id',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
// RELACIONES MODULO DE CHEQUES - FIN

/* ---------------------------
   TESORERÍA
---------------------------- */
// TesoFlujo se mantiene "desacoplado": no tiene FK dura a cheques.
// (Lo consultamos por origen_tipo/origen_id desde servicios)