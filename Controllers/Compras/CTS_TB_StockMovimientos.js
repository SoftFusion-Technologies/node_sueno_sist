/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el libro mayor de stock (stock_movimientos) y ajuste de saldos en `stock`.
 * - Listar / obtener movimientos con filtros por producto/local/lugar/estado/tipo/rango fecha/ref.
 * - Crear movimiento (delta ≠ 0) y actualizar saldo del stock (uk: producto+local+lugar+estado).
 * - Actualizar SOLO notas de un movimiento (la cantidad se corrige con reversa, no editando).
 * - Revertir un movimiento generando otro inverso (tipo = 'AJUSTE', ref a movimiento original).
 * - (Seguridad) No se permite borrar físicamente movimientos que impactaron stock; usar reversa.
 *
 * Invariantes:
 * - `stock.cantidad` nunca negativa (valida antes de guardar; DB tiene CHECK >= 0).
 * - Concurrencia: `SELECT ... FOR UPDATE` sobre fila de `stock` para evitar race conditions.
 * - Reversa única: si ya existe un movimiento con ref_tabla='stock_movimientos' y ref_id=:id, no duplica.
 *
 * Tema: Controladores - Stock
 * Capa: Backend
 */

import { Op, fn, col, literal, where } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

// ===== Modelos =====
import { StockMovimientoModel } from '../../Models/Compras/MD_TB_StockMovimientos.js';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { LugaresModel } from '../../Models/Stock/MD_TB_Lugares.js';
import { EstadosModel } from '../../Models/Stock/MD_TB_Estados.js';
import { UserModel } from '../../Models/MD_TB_Users.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = StockMovimientoModel.sequelize;

const ALLOWED_TIPOS = new Set([
  'COMPRA',
  'VENTA',
  'DEVOLUCION_PROVEEDOR',
  'DEVOLUCION_CLIENTE',
  'AJUSTE',
  'TRANSFERENCIA',
  'RECEPCION_OC'
]);

const toInt = (x) => parseInt(x, 10) || 0;
const toNum = (x) => Number(x ?? 0) || 0;
const round4 = (n) => Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;

async function getOrCreateStockRow(
  { producto_id, local_id, lugar_id, estado_id },
  t
) {
  // Intentar lock sobre fila existente
  let row = await StockModel.findOne({
    where: { producto_id, local_id, lugar_id, estado_id },
    transaction: t,
    lock: t.LOCK.UPDATE
  });
  if (row) return row;
  // Si no existe, crear con cantidad 0 (respetando uk_stock)
  row = await StockModel.create(
    { producto_id, local_id, lugar_id, estado_id, cantidad: 0 },
    { transaction: t }
  );
  // Lock después del create por coherencia
  row = await StockModel.findByPk(row.id, {
    transaction: t,
    lock: t.LOCK.UPDATE
  });
  return row;
}

async function aplicarDeltaStock(
  { producto_id, local_id, lugar_id, estado_id, delta },
  t
) {
  const stock = await getOrCreateStockRow(
    { producto_id, local_id, lugar_id, estado_id },
    t
  );
  const nueva = toInt(stock.cantidad) + toInt(delta);
  if (nueva < 0) {
    throw new Error(
      `Stock insuficiente: saldo actual ${stock.cantidad}, delta ${delta}`
    );
  }
  stock.cantidad = nueva;
  await stock.save({ transaction: t });
  return stock;
}

/* =====================================================
 * GET /stock-movimientos
 * Filtros: producto_id, local_id, lugar_id, estado_id, tipo, ref_tabla, ref_id,
 *          desde (YYYY-MM-DD), hasta (YYYY-MM-DD)
 * Paginación: page, pageSize
 * ===================================================== */
export const OBRS_StockMov_CTS = async (req, res) => {
  try {
    const {
      producto_id,
      local_id,
      lugar_id,
      estado_id,
      tipo,
      ref_tabla,
      ref_id,
      desde,
      hasta,
      page = 1,
      pageSize = 20
    } = req.query || {};

    const where = {};
    if (producto_id) where.producto_id = producto_id;
    if (local_id) where.local_id = local_id;
    if (lugar_id) where.lugar_id = lugar_id;
    if (estado_id) where.estado_id = estado_id;
    if (tipo) where.tipo = tipo;
    if (ref_tabla) where.ref_tabla = ref_tabla;
    if (ref_id) where.ref_id = ref_id;
    if (desde || hasta) {
      where.created_at = {};
      if (desde) where.created_at[Op.gte] = new Date(`${desde} 00:00:00`);
      if (hasta) where.created_at[Op.lte] = new Date(`${hasta} 23:59:59`);
    }

    const include = [
      {
        model: ProductosModel,
        as: 'producto',
        attributes: ['id', 'nombre', 'codigo_sku']
      },
      { model: LocalesModel, as: 'local', attributes: ['id', 'nombre'] },
      { model: LugaresModel, as: 'lugar', attributes: ['id', 'nombre'] },
      { model: EstadosModel, as: 'estado', attributes: ['id', 'nombre'] },
      { model: UserModel, as: 'usuario', attributes: ['id', 'name'] }
    ];

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await StockMovimientoModel.findAndCountAll({
      where,
      include,
      limit: Number(pageSize),
      offset,
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC']
      ]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { total: count, page: Number(page), pageSize: Number(pageSize) }
    });
  } catch (err) {
    console.error('[OBRS_StockMov_CTS] error:', err);
    res
      .status(500)
      .json({ ok: false, error: 'Error listando movimientos de stock' });
  }
};

/* =====================================================
 * GET /stock-movimientos/:id
 * ===================================================== */
export const OBR_StockMov_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await StockMovimientoModel.findByPk(id, {
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'codigo_sku']
        },
        { model: LocalesModel, as: 'local', attributes: ['id', 'nombre'] },
        { model: LugaresModel, as: 'lugar', attributes: ['id', 'nombre'] },
        { model: EstadosModel, as: 'estado', attributes: ['id', 'nombre'] },
        { model: UserModel, as: 'usuario', attributes: ['id', 'name'] }
      ]
    });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Movimiento no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_StockMov_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo movimiento' });
  }
};

/* =====================================================
 * POST /stock-movimientos
 * Body requerido: { producto_id, local_id, lugar_id, estado_id, tipo, delta,
 *                   costo_unit_neto?, moneda?, ref_tabla?, ref_id?, notas? }
 * Impacta saldo en `stock` con lock y valida no-negativo.
 * ===================================================== */
export const CR_StockMov_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const {
      producto_id,
      local_id = null,
      lugar_id = null,
      estado_id = null,
      tipo,
      delta,
      costo_unit_neto = null,
      moneda = 'ARS',
      ref_tabla = null,
      ref_id = null,
      notas = null
    } = req.body || {};

    if (!producto_id || !tipo || !delta)
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan producto_id/tipo/delta' });

    if (!ALLOWED_TIPOS.has(String(tipo)))
      return res
        .status(400)
        .json({ ok: false, error: `Tipo inválido: ${tipo}` });

    const d = toInt(delta);
    if (!d || d === 0)
      return res
        .status(400)
        .json({ ok: false, error: 'delta debe ser un entero distinto de 0' });

    // 1) Aplicar delta a saldo de stock (lock)
    const saldo = await aplicarDeltaStock(
      { producto_id, local_id, lugar_id, estado_id, delta: d },
      t
    );

    // 2) Registrar movimiento
    const mov = await StockMovimientoModel.create(
      {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        tipo,
        delta: d,
        costo_unit_neto:
          costo_unit_neto != null ? round4(costo_unit_neto) : null,
        moneda,
        ref_tabla,
        ref_id,
        usuario_id,
        notas
      },
      { transaction: t }
    );

    await registrarLog(
      req,
      'stock_movimientos',
      'crear',
      'movimiento',
      `producto_id=${producto_id} delta=${d} tipo=${tipo} saldo=${saldo.cantidad}`,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const withIncludes = await StockMovimientoModel.findByPk(mov.id, {
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'codigo_sku']
        },
        { model: LocalesModel, as: 'local', attributes: ['id', 'nombre'] },
        { model: LugaresModel, as: 'lugar', attributes: ['id', 'nombre'] },
        { model: EstadosModel, as: 'estado', attributes: ['id', 'nombre'] },
        { model: UserModel, as: 'usuario', attributes: ['id', 'name'] }
      ]
    });

    res.json({
      ok: true,
      data: withIncludes,
      saldo: {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        cantidad: saldo.cantidad
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[CR_StockMov_Crear_CTS] error:', err);
    res
      .status(500)
      .json({
        ok: false,
        error: err?.message || 'Error creando movimiento de stock'
      });
  }
};

/* =====================================================
 * PUT /stock-movimientos/:id
 * Solo permite actualizar `notas`. Para corregir cantidades, usar `/revertir`.
 * ===================================================== */
export const UR_StockMov_ActualizarNotas_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { notas } = req.body || {};
    const mov = await StockMovimientoModel.findByPk(id);
    if (!mov)
      return res
        .status(404)
        .json({ ok: false, error: 'Movimiento no encontrado' });

    mov.notas = (notas ?? null) && String(notas).trim();
    await mov.save();

    res.json({ ok: true, data: mov });
  } catch (err) {
    console.error('[UR_StockMov_ActualizarNotas_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando notas' });
  }
};

/* =====================================================
 * POST /stock-movimientos/:id/revertir
 * Crea movimiento inverso (tipo 'AJUSTE', delta = -delta original).
 * Previene doble reversa usando ref_tabla/ref_id.
 * ===================================================== */
export const CR_StockMov_Revertir_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const original = await StockMovimientoModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!original)
      return res
        .status(404)
        .json({ ok: false, error: 'Movimiento original no encontrado' });

    // ¿Ya fue revertido?
    const ya = await StockMovimientoModel.findOne({
      where: { ref_tabla: 'stock_movimientos', ref_id: original.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (ya)
      return res
        .status(409)
        .json({
          ok: false,
          error: 'El movimiento ya tiene una reversa registrada'
        });

    const inversoDelta = -toInt(original.delta);

    // 1) Aplicar delta inverso al saldo
    const saldo = await aplicarDeltaStock(
      {
        producto_id: original.producto_id,
        local_id: original.local_id,
        lugar_id: original.lugar_id,
        estado_id: original.estado_id,
        delta: inversoDelta
      },
      t
    );

    // 2) Registrar movimiento inverso
    const rev = await StockMovimientoModel.create(
      {
        producto_id: original.producto_id,
        local_id: original.local_id,
        lugar_id: original.lugar_id,
        estado_id: original.estado_id,
        tipo: 'AJUSTE',
        delta: inversoDelta,
        costo_unit_neto: original.costo_unit_neto,
        moneda: original.moneda,
        ref_tabla: 'stock_movimientos',
        ref_id: original.id,
        usuario_id,
        notas: `Reversa de movimiento ${original.id}`
      },
      { transaction: t }
    );

    await registrarLog(
      req,
      'stock_movimientos',
      'crear',
      'reversa',
      `original_id=${original.id} delta=${inversoDelta} saldo=${saldo.cantidad}`,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const withIncludes = await StockMovimientoModel.findByPk(rev.id, {
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'codigo_sku']
        },
        { model: LocalesModel, as: 'local', attributes: ['id', 'nombre'] },
        { model: LugaresModel, as: 'lugar', attributes: ['id', 'nombre'] },
        { model: EstadosModel, as: 'estado', attributes: ['id', 'nombre'] },
        { model: UserModel, as: 'usuario', attributes: ['id', 'name'] }
      ]
    });

    res.json({
      ok: true,
      data: withIncludes,
      saldo: {
        producto_id: original.producto_id,
        local_id: original.local_id,
        lugar_id: original.lugar_id,
        estado_id: original.estado_id,
        cantidad: saldo.cantidad
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[CR_StockMov_Revertir_CTS] error:', err);
    res
      .status(500)
      .json({
        ok: false,
        error: err?.message || 'Error revirtiendo movimiento'
      });
  }
};

/* =====================================================
 * DELETE /stock-movimientos/:id
 * Política: no borrar; orientar a usar reversa. Dejar opción soft: bloquear siempre con 405.
 * ===================================================== */
export const ER_StockMov_Borrar_CTS = async (req, res) => {
  return res
    .status(405)
    .json({
      ok: false,
      error: 'No se permite borrar movimientos de stock. Use /:id/revertir.'
    });
};

export default {
  OBRS_StockMov_CTS,
  OBR_StockMov_CTS,
  CR_StockMov_Crear_CTS,
  UR_StockMov_ActualizarNotas_CTS,
  CR_StockMov_Revertir_CTS,
  ER_StockMov_Borrar_CTS
};
