/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores CRUD para el catálogo de impuestos (impuestos_config).
 * - Listar, obtener por id / por código, crear, actualizar, activar/desactivar y baja lógica.
 * - Valida fracción en `alicuota` (ej.: 0.2100 = 21%).
 * - `codigo` único, normalizado a MAYÚSCULAS y trim.
 * - No se elimina físicamente; se usa `activo = 0` como baja lógica.
 *
 * Tema: Controladores - Compras / Fiscal
 * Capa: Backend
 */

import { Op } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

import { ImpuestoConfigModel } from '../../Models/Compras/MD_TB_ImpuestosConfig.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = ImpuestoConfigModel.sequelize;

const TIPOS = new Set(['IVA', 'Percepcion', 'Retencion', 'Otro']);

// Helpers
const normCodigo = (s) => (s ? String(s).trim().toUpperCase() : null);
const toNum = (x) => Number(x ?? 0) || 0;
const isFracOk = (v) => v >= 0 && v <= 1; // 0..1 == 0%..100%

/* =============================================
 * GET /impuestos-config
 * Parámetros: tipo, activo, q (busca en codigo/descripcion/jurisdiccion), page, pageSize
 * ============================================= */
export const OBRS_ImpuestosConfig_CTS = async (req, res) => {
  try {
    const { tipo, activo, q, page = 1, pageSize = 20 } = req.query || {};

    const where = {};
    if (tipo) where.tipo = tipo;
    if (typeof activo !== 'undefined')
      where.activo = ['1', 'true', 1, true].includes(activo);
    if (q && String(q).trim()) {
      const s = String(q).trim();
      where[Op.or] = [
        { codigo: { [Op.like]: `%${s}%` } },
        { descripcion: { [Op.like]: `%${s}%` } },
        { jurisdiccion: { [Op.like]: `%${s}%` } }
      ];
    }

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await ImpuestoConfigModel.findAndCountAll({
      where,
      limit: Number(pageSize),
      offset,
      order: [
        ['tipo', 'ASC'],
        ['codigo', 'ASC']
      ]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { total: count, page: Number(page), pageSize: Number(pageSize) }
    });
  } catch (err) {
    console.error('[OBRS_ImpuestosConfig_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando impuestos' });
  }
};

/* =============================================
 * GET /impuestos-config/:id
 * ============================================= */
export const OBR_ImpuestoConfig_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await ImpuestoConfigModel.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Impuesto no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_ImpuestoConfig_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo impuesto' });
  }
};

/* =============================================
 * GET /impuestos-config/by-codigo/:codigo
 * ============================================= */
export const OBR_ImpuestoConfig_ByCodigo_CTS = async (req, res) => {
  try {
    const codigo = normCodigo(req.params.codigo);
    const row = await ImpuestoConfigModel.findOne({ where: { codigo } });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Impuesto no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_ImpuestoConfig_ByCodigo_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo por código' });
  }
};

/* =============================================
 * POST /impuestos-config
 * Body: { tipo, codigo, descripcion?, alicuota, jurisdiccion?, activo? }
 * ============================================= */
export const CR_ImpuestoConfig_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    let {
      tipo,
      codigo,
      descripcion = null,
      alicuota,
      jurisdiccion = null,
      activo = true
    } = req.body || {};

    if (!tipo || !codigo || alicuota == null)
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan tipo/codigo/alicuota' });

    if (!TIPOS.has(String(tipo)))
      return res
        .status(400)
        .json({
          ok: false,
          error: `Tipo inválido. Use uno de: ${[...TIPOS].join(', ')}`
        });

    const cod = normCodigo(codigo);
    const ali = toNum(alicuota);

    if (!isFracOk(ali))
      return res
        .status(400)
        .json({
          ok: false,
          error: 'La alícuota debe ser fracción entre 0 y 1 (ej.: 0.2100 = 21%)'
        });

    // Unicidad por código
    const dup = await ImpuestoConfigModel.findOne({
      where: { codigo: cod },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (dup)
      return res
        .status(409)
        .json({ ok: false, error: 'Ya existe un impuesto con ese código' });

    const created = await ImpuestoConfigModel.create(
      {
        tipo,
        codigo: cod,
        descripcion: descripcion?.trim() || null,
        alicuota: ali,
        jurisdiccion: jurisdiccion?.trim() || null,
        activo: !!activo
      },
      { transaction: t }
    );

    await registrarLog(
      req,
      'impuestos_config',
      'crear',
      'alta',
      `codigo=${cod} tipo=${tipo} alicuota=${ali}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: created });
  } catch (err) {
    await t.rollback();
    console.error('[CR_ImpuestoConfig_Crear_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error creando impuesto' });
  }
};

/* =============================================
 * PUT /impuestos-config/:id
 * Body: { tipo?, codigo?, descripcion?, alicuota?, jurisdiccion?, activo? }
 * ============================================= */
export const UR_ImpuestoConfig_Actualizar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const row = await ImpuestoConfigModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Impuesto no encontrado' });

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

    if (typeof req.body.codigo !== 'undefined') {
      const cod = normCodigo(req.body.codigo);
      if (!cod)
        return res.status(400).json({ ok: false, error: 'Código inválido' });
      const dup = await ImpuestoConfigModel.findOne({
        where: { codigo: cod, id: { [Op.ne]: id } },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (dup)
        return res
          .status(409)
          .json({ ok: false, error: 'Ya existe otro impuesto con ese código' });
      patch.codigo = cod;
    }

    if (typeof req.body.descripcion !== 'undefined')
      patch.descripcion =
        (req.body.descripcion ?? null) && String(req.body.descripcion).trim();
    if (typeof req.body.jurisdiccion !== 'undefined')
      patch.jurisdiccion =
        (req.body.jurisdiccion ?? null) && String(req.body.jurisdiccion).trim();

    if (typeof req.body.alicuota !== 'undefined') {
      const ali = toNum(req.body.alicuota);
      if (!isFracOk(ali))
        return res
          .status(400)
          .json({
            ok: false,
            error:
              'La alícuota debe ser fracción entre 0 y 1 (ej.: 0.2100 = 21%)'
          });
      patch.alicuota = ali;
    }

    if (typeof req.body.activo !== 'undefined')
      patch.activo = !!req.body.activo;

    await row.update(patch, { transaction: t });

    await registrarLog(
      req,
      'impuestos_config',
      'actualizar',
      'edicion',
      `id=${id} patch=${JSON.stringify(patch)}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: row });
  } catch (err) {
    await t.rollback();
    console.error('[UR_ImpuestoConfig_Actualizar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando impuesto' });
  }
};

/* =============================================
 * PATCH /impuestos-config/:id/activo  Body: { activo: boolean }
 * ============================================= */
export const UR_ImpuestoConfig_SetActivo_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body || {};
    const row = await ImpuestoConfigModel.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Impuesto no encontrado' });

    row.activo = !!activo;
    await row.save();
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[UR_ImpuestoConfig_SetActivo_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error cambiando estado activo' });
  }
};

/* =============================================
 * DELETE /impuestos-config/:id  (baja lógica: activo = 0)
 * ============================================= */
export const ER_ImpuestoConfig_BajaLogica_CTS = async (req, res) => {
  try {
    const usuario_id = req.user?.id || null;
    const { id } = req.params;
    const row = await ImpuestoConfigModel.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ ok: false, error: 'Impuesto no encontrado' });

    row.activo = false;
    await row.save();

    await registrarLog(
      req,
      'impuestos_config',
      'eliminar',
      'baja-logica',
      `id=${id}`,
      usuario_id
    ).catch(() => {});

    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[ER_ImpuestoConfig_BajaLogica_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error en baja lógica' });
  }
};

export default {
  OBRS_ImpuestosConfig_CTS,
  OBR_ImpuestoConfig_CTS,
  OBR_ImpuestoConfig_ByCodigo_CTS,
  CR_ImpuestoConfig_Crear_CTS,
  UR_ImpuestoConfig_Actualizar_CTS,
  UR_ImpuestoConfig_SetActivo_CTS,
  ER_ImpuestoConfig_BajaLogica_CTS
};
