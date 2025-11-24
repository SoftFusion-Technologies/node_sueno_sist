/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para `compras_impuestos` (líneas de impuestos por compra).
 * - Listar/obtener, crear, actualizar y eliminar líneas de impuesto.
 * - Valida edición sólo en compras en estado 'borrador' (si existe el campo).
 * - Integra con catálogo `impuestos_config` (opcional por `codigo`).
 * - Recalcula totales de la compra de forma segura (si existen los campos en `compras`).
 *
 * Tema: Controladores - Compras / Fiscal
 * Capa: Backend
 */

import { Op } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { CompraDetalleModel } from '../../Models/Compras/MD_TB_ComprasDetalle.js';
import { CompraImpuestoModel } from '../../Models/Compras/MD_TB_ComprasImpuestos.js';
import { ImpuestoConfigModel } from '../../Models/Compras/MD_TB_ImpuestosConfig.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = CompraImpuestoModel.sequelize;

const TIPOS = new Set(['IVA', 'Percepcion', 'Retencion', 'Otro']);

const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;
const normCodigo = (s) => (s ? String(s).trim().toUpperCase() : null);
const hasAttr = (model, attr) => !!model?.rawAttributes?.[attr];

async function assertCompraEditable(compra_id, t) {
  const c = await CompraModel.findByPk(compra_id, {
    transaction: t,
    lock: t?.LOCK?.UPDATE
  });
  if (!c) throw new Error('Compra no encontrada');
  if (hasAttr(CompraModel, 'estado')) {
    const estado = String(c.estado || '').toLowerCase();
    if (estado && estado !== 'borrador')
      throw new Error('La compra no está en estado borrador');
  }
  return c;
}

async function safeRecalcularTotalesCompra(compra_id, t) {
  // Suma detalles e impuestos y actualiza columnas si existen
  try {
    const subtotal =
      (await CompraDetalleModel.sum('total_linea', {
        where: { compra_id },
        transaction: t
      })) || 0;
    const impTotal =
      (await CompraImpuestoModel.sum('monto', {
        where: { compra_id },
        transaction: t
      })) || 0;

    const patch = {};
    if (hasAttr(CompraModel, 'subtotal_neto'))
      patch.subtotal_neto = round2(subtotal);
    if (hasAttr(CompraModel, 'total_impuestos'))
      patch.total_impuestos = round2(impTotal);

    const total = round2(subtotal + impTotal);
    if (hasAttr(CompraModel, 'total_compra')) patch.total_compra = total;
    if (hasAttr(CompraModel, 'total')) patch.total = total;

    if (Object.keys(patch).length) {
      await CompraModel.update(patch, {
        where: { id: compra_id },
        transaction: t
      });
    }

    return { subtotal: round2(subtotal), impuestos: round2(impTotal), total };
  } catch (e) {
    // No romper si alguna columna no existe
    return { subtotal: null, impuestos: null, total: null };
  }
}

/* =====================================================
 * GET /compras/:compra_id/impuestos  (o /compras-impuestos?compra_id=)
 * Filtros opcionales: tipo, codigo
 * ===================================================== */
export const OBRS_ComprasImpuestos_CTS = async (req, res) => {
  try {
    const compra_id = req.params?.compra_id || req.query?.compra_id;
    const {
      tipo,
      codigo,
      fecha_desde,
      fecha_hasta,
      q_proveedor,
      estado,
      page = 1,
      pageSize = 50
    } = req.query || {};

    const whereImp = {};
    if (compra_id) whereImp.compra_id = compra_id;
    if (tipo) whereImp.tipo = tipo;
    if (codigo) whereImp.codigo = normCodigo(codigo);

    // ---------- Filtros sobre CABECERA ----------
    const whereCompra = {};
    if (fecha_desde || fecha_hasta) {
      whereCompra.fecha = {};
      if (fecha_desde) {
        whereCompra.fecha[Op.gte] = `${fecha_desde} 00:00:00`;
      }
      if (fecha_hasta) {
        whereCompra.fecha[Op.lte] = `${fecha_hasta} 23:59:59`;
      }
    }

    if (estado) {
      whereCompra.estado = estado; // confirmada, borrador, anulada, etc.
    }

    // ---------- Filtro PROVEEDOR ----------
    const whereProveedor = {};
    const tieneFiltroProveedor =
      q_proveedor && String(q_proveedor).trim().length > 0;

    if (tieneFiltroProveedor) {
      const v = `%${String(q_proveedor).trim()}%`;
      whereProveedor[Op.or] = [
        { razon_social: { [Op.like]: v } },
        { nombre_fantasia: { [Op.like]: v } },
        { cuit: { [Op.like]: v } }
      ];
    }

    const limit = Number(pageSize) || 50;
    const offset = (Number(page) - 1) * limit;

    const { rows, count } = await CompraImpuestoModel.findAndCountAll({
      where: whereImp,
      limit,
      offset,
      order: [['id', 'ASC']],
      include: [
        {
          association: 'compra',
          required: true,
          where: Object.keys(whereCompra).length ? whereCompra : undefined,
          include: [
            {
              association: 'proveedor',
              // 🔑 ACA ESTÁ LA CLAVE:
              // - si NO hay filtro → LEFT JOIN (required:false)
              // - si HAY filtro → INNER JOIN (required:true)
              required: tieneFiltroProveedor,
              where: tieneFiltroProveedor ? whereProveedor : undefined
            }
          ]
        }
      ]
    });

    res.json({
      ok: true,
      data: rows,
      meta: {
        total: count,
        page: Number(page),
        pageSize: limit
      }
    });
  } catch (err) {
    console.error('[OBRS_ComprasImpuestos_CTS] error:', err);
    res.status(500).json({
      ok: false,
      error: 'Error listando impuestos de la compra'
    });
  }
};



/* =====================================================
 * GET /compras-impuestos/:id
 * ===================================================== */
export const OBR_CompraImpuesto_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await CompraImpuestoModel.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Línea de impuesto no encontrada' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_CompraImpuesto_CTS] error:', err);
    res
      .status(500)
      .json({ ok: false, error: 'Error obteniendo línea de impuesto' });
  }
};

/* =====================================================
 * POST /compras/:compra_id/impuestos
 * Body: { tipo, codigo?, base, alicuota?, monto? }
 * Reglas:
 * - `tipo` válido.
 * - `base >= 0`.
 * - `alicuota` como fracción 0..1 (si falta y hay `codigo`, lee de `impuestos_config`).
 * - `monto` = base * alicuota si no se envía.
 * - Sólo editable en compras 'borrador'.
 * ===================================================== */
export const CR_CompraImpuesto_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const compra_id = req.params?.compra_id || req.body?.compra_id;
    let {
      tipo,
      codigo = null,
      base,
      alicuota = null,
      monto = null
    } = req.body || {};

    if (!compra_id || !tipo || base == null)
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan compra_id/tipo/base' });

    if (!TIPOS.has(String(tipo)))
      return res
        .status(400)
        .json({
          ok: false,
          error: `Tipo inválido. Use uno de: ${[...TIPOS].join(', ')}`
        });

    // 1) Compra editable
    await assertCompraEditable(compra_id, t);

    // 2) Enriquecer por catálogo si se pasa `codigo`
    let cod = normCodigo(codigo);
    if (cod) {
      const impCfg = await ImpuestoConfigModel.findOne({
        where: { codigo: cod, activo: true },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!impCfg)
        return res
          .status(404)
          .json({
            ok: false,
            error: 'Código de impuesto no encontrado/activo'
          });
      if (!alicuota && impCfg.alicuota != null) alicuota = impCfg.alicuota;
      if (!tipo) tipo = impCfg.tipo; // por si en el futuro permitís omitir tipo
    }

    base = round2(base);
    if (base < 0)
      return res.status(400).json({ ok: false, error: 'base debe ser >= 0' });

    if (alicuota == null) alicuota = 0;
    alicuota = round4(alicuota);
    if (alicuota < 0 || alicuota > 1)
      return res
        .status(400)
        .json({
          ok: false,
          error: 'alicuota debe ser fracción entre 0 y 1 (ej.: 0.2100 = 21%)'
        });

    if (monto == null) monto = round2(base * alicuota);
    monto = round2(monto);
    if (monto < 0)
      return res.status(400).json({ ok: false, error: 'monto debe ser >= 0' });

    const created = await CompraImpuestoModel.create(
      { compra_id, tipo, codigo: cod, base, alicuota, monto },
      { transaction: t }
    );

    const tot = await safeRecalcularTotalesCompra(compra_id, t);

    await registrarLog(
      req,
      'compras_impuestos',
      'crear',
      'alta',
      `compra_id=${compra_id} tipo=${tipo} codigo=${
        cod || ''
      } base=${base} ali=${alicuota} monto=${monto}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: created, totales: tot });
  } catch (err) {
    await t.rollback();
    console.error('[CR_CompraImpuesto_Crear_CTS] error:', err);
    res
      .status(500)
      .json({
        ok: false,
        error: err?.message || 'Error creando impuesto de compra'
      });
  }
};

/* =====================================================
 * PUT /compras-impuestos/:id
 * Body: { tipo?, codigo?, base?, alicuota?, monto? }
 * - Si cambia `codigo` y alícuota no se manda, se toma del catálogo.
 * - Recalcula totales de la compra.
 * ===================================================== */
export const UR_CompraImpuesto_Actualizar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const row = await CompraImpuestoModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Línea de impuesto no encontrada' });

    // Compra editable
    await assertCompraEditable(row.compra_id, t);

    const patch = {};

    if (typeof req.body.tipo !== 'undefined') {
      if (!TIPOS.has(String(req.body.tipo)))
        return res
          .status(400)
          .json({
            ok: false,
            error: `Tipo inválido. Use uno de: ${[...TIPOS].join(', ')}`
          });
      patch.tipo = req.body.tipo;
    }

    let cod = null;
    if (typeof req.body.codigo !== 'undefined') {
      cod = normCodigo(req.body.codigo);
      patch.codigo = cod;
    }

    if (typeof req.body.base !== 'undefined') {
      const base = round2(req.body.base);
      if (base < 0)
        return res.status(400).json({ ok: false, error: 'base debe ser >= 0' });
      patch.base = base;
    }

    let ali = null;
    if (typeof req.body.alicuota !== 'undefined') {
      ali = round4(req.body.alicuota);
      if (ali < 0 || ali > 1)
        return res
          .status(400)
          .json({ ok: false, error: 'alicuota debe ser fracción entre 0 y 1' });
      patch.alicuota = ali;
    }

    // Si cambia código y no enviaron alícuota, intentar catálogo
    if (cod && ali == null) {
      const impCfg = await ImpuestoConfigModel.findOne({
        where: { codigo: cod, activo: true },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!impCfg)
        return res
          .status(404)
          .json({
            ok: false,
            error: 'Código de impuesto no encontrado/activo'
          });
      patch.alicuota = round4(impCfg.alicuota ?? 0);
    }

    // Si no mandan monto, recalcular en base a base * alicuota
    let monto = null;
    if (typeof req.body.monto !== 'undefined') {
      monto = round2(req.body.monto);
      if (monto < 0)
        return res
          .status(400)
          .json({ ok: false, error: 'monto debe ser >= 0' });
      patch.monto = monto;
    } else {
      const baseVal = patch.base != null ? patch.base : row.base;
      const aliVal = patch.alicuota != null ? patch.alicuota : row.alicuota;
      patch.monto = round2(baseVal * aliVal);
    }

    await row.update(patch, { transaction: t });

    const tot = await safeRecalcularTotalesCompra(row.compra_id, t);

    await registrarLog(
      req,
      'compras_impuestos',
      'actualizar',
      'edicion',
      `id=${id} patch=${JSON.stringify(patch)}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: row, totales: tot });
  } catch (err) {
    await t.rollback();
    console.error('[UR_CompraImpuesto_Actualizar_CTS] error:', err);
    res
      .status(500)
      .json({
        ok: false,
        error: err?.message || 'Error actualizando impuesto de compra'
      });
  }
};

/* =====================================================
 * DELETE /compras-impuestos/:id
 * ===================================================== */
export const ER_CompraImpuesto_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const row = await CompraImpuestoModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Línea de impuesto no encontrada' });

    // Compra editable
    await assertCompraEditable(row.compra_id, t);

    const compra_id = row.compra_id;
    await row.destroy({ transaction: t });

    const tot = await safeRecalcularTotalesCompra(compra_id, t);

    await registrarLog(
      req,
      'compras_impuestos',
      'eliminar',
      'baja',
      `id=${id} compra_id=${compra_id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, totales: tot });
  } catch (err) {
    await t.rollback();
    console.error('[ER_CompraImpuesto_Borrar_CTS] error:', err);
    res
      .status(500)
      .json({
        ok: false,
        error: err?.message || 'Error eliminando impuesto de compra'
      });
  }
};

export default {
  OBRS_ComprasImpuestos_CTS,
  OBR_CompraImpuesto_CTS,
  CR_CompraImpuesto_Crear_CTS,
  UR_CompraImpuesto_Actualizar_CTS,
  ER_CompraImpuesto_Borrar_CTS
};
