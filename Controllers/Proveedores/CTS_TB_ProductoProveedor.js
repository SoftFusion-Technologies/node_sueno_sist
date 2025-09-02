/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 31 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para la tabla `producto_proveedor` (N–N Productos ↔ Proveedores).
 * - CRUD
 * - Filtros y paginación
 * - Búsqueda rápida
 * - Forzar único "vigente" por (producto_id, proveedor_id)
 * - Registro automático en historial de costos al crear/actualizar
 *
 * Tema: Controladores - Proveedores (Producto_Proveedor)
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';

// Modelos
import { ProductoProveedorModel } from '../../Models/Proveedores/MD_TB_ProductoProveedor.js';
import { ProductoProveedorHistorialCostosModel } from '../../Models/Proveedores/MD_TB_ProductoProveedorHistorialCostos.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';
// Si tenés ProductosModel definido, podés incluirlo:
// import { ProductosModel } from '../../Models/Productos/MD_TB_Productos.js';

const show = (v) =>
  v === null || v === undefined || v === '' ? '-' : String(v);
const COST_FIELDS = [
  'costo_neto',
  'moneda',
  'alicuota_iva',
  'descuento_porcentaje',
  'inc_iva'
];

/* ============================================================
   LISTAR
   GET /producto-proveedor?producto_id=&proveedor_id=&vigente=true|false&page=1&pageSize=20&include=full|basico
   ============================================================ */
export const OBRS_ProductoProveedor_CTS = async (req, res) => {
  try {
    const {
      producto_id,
      proveedor_id,
      vigente, // 'true' | 'false'
      page = 1,
      pageSize = 20,
      include
    } = req.query;

    const where = {};
    if (producto_id)  where.producto_id  = Number(producto_id);
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (vigente === 'true')  where.vigente = true;
    if (vigente === 'false') where.vigente = false;

    const includeArr =
      include === 'full'
        ? [
            { model: ProveedoresModel, as: 'proveedor' },
            { model: ProductoProveedorHistorialCostosModel, as: 'historialCostos' }
          ]
        : include === 'basico'
        ? [{ model: ProveedoresModel, as: 'proveedor' }]
        : [];

    const limit = Math.max(1, parseInt(pageSize, 10));
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * limit;

    const { rows, count } = await ProductoProveedorModel.findAndCountAll({
      where,
      include: includeArr,
      distinct: true, // ← evita duplicados si un include genera filas
      order: [
        ['vigente', 'DESC'],
        ['updated_at', 'DESC']
      ],
      limit,
      offset
    });

    res.json({ page: Number(page), pageSize: limit, total: count, data: rows });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ===================================
   OBTENER POR ID
   GET /producto-proveedor/:id?include=full
   =================================== */
export const OBR_ProductoProveedor_CTS = async (req, res) => {
  try {
    const { include } = req.query;
    const includeArr =
      include === 'full'
        ? [
            { model: ProveedoresModel, as: 'proveedor' },
            {
              model: ProductoProveedorHistorialCostosModel,
              as: 'historialCostos'
            }
            // , { model: ProductosModel, as: 'producto' }
          ]
        : [];

    const pp = await ProductoProveedorModel.findByPk(req.params.id, {
      include: includeArr
    });
    if (!pp)
      return res
        .status(404)
        .json({ mensajeError: 'Relación producto-proveedor no encontrada' });

    res.json(pp);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   CREAR
   POST /producto-proveedor
   ======================= */
export const CR_ProductoProveedor_CTS = async (req, res) => {
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  if (!body.producto_id || !body.proveedor_id || body.costo_neto == null) {
    return res.status(400).json({
      mensajeError:
        'Faltan campos obligatorios: producto_id, proveedor_id, costo_neto'
    });
  }

  try {
    let nuevo;
    await db.transaction(async (t) => {
      // Crear relación
      nuevo = await ProductoProveedorModel.create(
        {
          producto_id: body.producto_id,
          proveedor_id: body.proveedor_id,
          sku_proveedor: body.sku_proveedor,
          nombre_en_proveedor: body.nombre_en_proveedor,
          costo_neto: body.costo_neto,
          moneda: body.moneda || 'ARS',
          alicuota_iva: body.alicuota_iva ?? 21.0,
          inc_iva: body.inc_iva ?? false,
          descuento_porcentaje: body.descuento_porcentaje ?? 0,
          plazo_entrega_dias: body.plazo_entrega_dias ?? 0,
          minimo_compra: body.minimo_compra ?? 0,
          vigente: body.vigente ?? true,
          fecha_ultima_compra: body.fecha_ultima_compra ?? null,
          observaciones: body.observaciones
        },
        { transaction: t }
      );

      // Si quedó vigente=true, desactivar otros del mismo par (producto, proveedor)
      if (nuevo.vigente === true) {
        await ProductoProveedorModel.update(
          { vigente: false },
          {
            where: {
              producto_id: nuevo.producto_id,
              proveedor_id: nuevo.proveedor_id,
              id: { [Op.ne]: nuevo.id }
            },
            transaction: t
          }
        );
      }

      // ✅ Registrar historial inicial SOLO si corresponde
      const registrarHistorialInicial =
        // bandera explícita desde el front
        body.registrar_historial_inicial === true ||
        // o si vino un costo > 0
        Number(body.costo_neto) > 0 ||
        // o si vino un motivo intencional
        (typeof body.motivo === 'string' && body.motivo.trim() !== '');

      if (registrarHistorialInicial) {
        await ProductoProveedorHistorialCostosModel.create(
          {
            producto_proveedor_id: nuevo.id,
            costo_neto: nuevo.costo_neto,
            moneda: nuevo.moneda,
            alicuota_iva: nuevo.alicuota_iva,
            descuento_porcentaje: nuevo.descuento_porcentaje,
            motivo: (body.motivo && body.motivo.trim()) || 'Alta relación',
            observaciones: body.observaciones_hist || null
          },
          { transaction: t }
        );
      }
    });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'proveedores',
        'crear',
        `asoció producto #${show(body.producto_id)} con proveedor #${show(
          body.proveedor_id
        )} · costo_neto=${show(body.costo_neto)} ${show(
          body.moneda || 'ARS'
        )} · vigente=${show(body.vigente ?? true)}`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog PP crear] no crítico:', e.message);
    }

    res.json({
      message: 'Relación producto-proveedor creada correctamente',
      pp: nuevo
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};


/* =======================
   ACTUALIZAR
   PUT /producto-proveedor/:id
   ======================= */
export const UR_ProductoProveedor_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  try {
    const anterior = await ProductoProveedorModel.findByPk(id);
    if (!anterior)
      return res.status(404).json({ mensajeError: 'Relación no encontrada' });

    let actualizado;

    await db.transaction(async (t) => {
      // Si piden vigente=true, desactivar otros del mismo par
      if (body.vigente === true) {
        await ProductoProveedorModel.update(
          { vigente: false },
          {
            where: {
              producto_id: anterior.producto_id,
              proveedor_id: anterior.proveedor_id,
              id: { [Op.ne]: id }
            },
            transaction: t
          }
        );
      }

      const [updated] = await ProductoProveedorModel.update(body, {
        where: { id },
        transaction: t
      });
      if (updated !== 1) throw new Error('No se pudo actualizar');

      actualizado = await ProductoProveedorModel.findByPk(id, {
        transaction: t
      });

      // Si cambiaron campos de costo/moneda/iva/desc/inc_iva → insertar historial
      const huboCambioCosto = COST_FIELDS.some(
        (f) =>
          Object.prototype.hasOwnProperty.call(body, f) &&
          `${anterior[f]}` !== `${actualizado[f]}`
      );

      if (huboCambioCosto) {
        await ProductoProveedorHistorialCostosModel.create(
          {
            producto_proveedor_id: actualizado.id,
            costo_neto: actualizado.costo_neto,
            moneda: actualizado.moneda,
            alicuota_iva: actualizado.alicuota_iva,
            descuento_porcentaje: actualizado.descuento_porcentaje,
            motivo: body.motivo || 'Actualización de parámetros de costo',
            observaciones: body.observaciones_hist || null
          },
          { transaction: t }
        );
      }
    });

    // LOG (no crítico)
    try {
      const cambios = [];
      const camposAuditables = [
        'sku_proveedor',
        'nombre_en_proveedor',
        ...COST_FIELDS,
        'plazo_entrega_dias',
        'minimo_compra',
        'vigente',
        'fecha_ultima_compra',
        'observaciones'
      ];
      for (const campo of camposAuditables) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          cambios.push(
            `${campo}: "${show(anterior[campo])}" → "${show(
              actualizado[campo]
            )}"`
          );
        }
      }
      await registrarLog(
        req,
        'proveedores',
        'editar',
        `editó PP #${id} · ${cambios.join(' · ') || 'sin cambios'}`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog PP actualizar] no crítico:', e.message);
    }

    res.json({
      message: 'Relación actualizada correctamente',
      pp: actualizado
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   ELIMINAR
   DELETE /producto-proveedor/:id
   ======================= */
export const ER_ProductoProveedor_CTS = async (req, res) => {
  const { id } = req.params;
  const usuario_log_id = req.body?.usuario_log_id;

  try {
    const previo = await ProductoProveedorModel.findByPk(id);
    if (!previo)
      return res.status(404).json({ mensajeError: 'Relación no encontrada' });

    await ProductoProveedorModel.destroy({ where: { id } });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'proveedores',
        'eliminar',
        `eliminó PP #${id} (prod #${show(previo.producto_id)} · prov #${show(
          previo.proveedor_id
        )})`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog PP eliminar] no crítico:', e.message);
    }

    res.json({ message: 'Relación eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   SETEAR COMO VIGENTE
   PATCH /producto-proveedor/:id/vigente
   ====================================================== */
export const SetVigente_ProductoProveedor_CTS = async (req, res) => {
  const { id } = req.params;
  const usuario_log_id = req.body?.usuario_log_id;

  try {
    const pp = await ProductoProveedorModel.findByPk(id);
    if (!pp)
      return res.status(404).json({ mensajeError: 'Relación no encontrada' });

    await db.transaction(async (t) => {
      await ProductoProveedorModel.update(
        { vigente: false },
        {
          where: {
            producto_id: pp.producto_id,
            proveedor_id: pp.proveedor_id,
            id: { [Op.ne]: id }
          },
          transaction: t
        }
      );
      await pp.update({ vigente: true }, { transaction: t });
    });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'proveedores',
        'vigente',
        `marcó como vigente PP #${id} (prod #${show(
          pp.producto_id
        )} · prov #${show(pp.proveedor_id)})`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog PP vigente] no crítico:', e.message);
    }

    res.json({ message: 'Relación marcada como vigente', pp });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   BÚSQUEDA RÁPIDA
   GET /producto-proveedor/search?q=...
   - Busca por sku_proveedor / nombre_en_proveedor
   - También permite filtrar por proveedor_id o producto_id
   ====================================================== */
export const SEARCH_ProductoProveedor_CTS = async (req, res) => {
  try {
    const { q, proveedor_id, producto_id, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const s = q.trim();

    const where = {
      [Op.or]: [
        { sku_proveedor: { [Op.like]: `%${s}%` } },
        { nombre_en_proveedor: { [Op.like]: `%${s}%` } }
      ],
      ...(proveedor_id ? { proveedor_id } : {}),
      ...(producto_id ? { producto_id } : {})
    };

    const resultados = await ProductoProveedorModel.findAll({
      where,
      order: [
        ['vigente', 'DESC'],
        ['updated_at', 'DESC']
      ],
      limit: Math.max(1, parseInt(limit))
    });

    if (resultados.length === 0)
      return res.status(404).json({ mensajeError: 'Sin resultados' });

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
