/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores CRUD y utilitarios para la tabla `proveedores`.
 *
 * Tema: Controladores - Proveedores
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';

// Modelos
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';
import { ProveedorContactosModel } from '../../Models/Proveedores/MD_TB_ProveedorContactos.js';
import { ProveedorCuentasBancariasModel } from '../../Models/Proveedores/MD_TB_ProveedorCuentasBancarias.js';
import { ProductoProveedorModel } from '../../Models/Proveedores/MD_TB_ProductoProveedor.js';
import { ProductoProveedorHistorialCostosModel } from '../../Models/Proveedores/MD_TB_ProductoProveedorHistorialCostos.js';

// Error HTTP con metadata (para validar en front)
class HttpValidationError extends Error {
  constructor(
    message,
    code = 'VALIDATION_ERROR',
    status = 400,
    meta = undefined
  ) {
    super(message);
    this.name = 'HttpValidationError';
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

const cleanCUIT = (v) => (typeof v === 'string' ? v.replace(/\D+/g, '') : v);

const cuitDV = (first10) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * w[i], 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv;
};

const formatCUIT = (digits11) =>
  digits11 && digits11.length === 11
    ? `${digits11.slice(0, 2)}-${digits11.slice(2, 10)}-${digits11.slice(10)}`
    : digits11;

/**
 * Devuelve: '###########' (11 dígitos) o null.
 * Lanza HttpValidationError con code/meta si es inválido.
 */
const assertValidCUITorNull = (raw, { verbose = true } = {}) => {
  if (raw === null || raw === undefined || raw === '') return null; // tratar vacío como null

  const s = cleanCUIT(String(raw));
  if (s.length === 0) return null; // vacío tras limpiar => null

  if (s.length !== 11) {
    throw new HttpValidationError(
      `CUIT inválido: debe tener 11 dígitos.`,
      'CUIT_LENGTH',
      400,
      { normalized: s, length: s.length }
    );
  }

  const base10 = s.slice(0, 10);
  const expected = cuitDV(base10);
  const provided = Number(s.slice(-1));

  if (expected !== provided) {
    const suggested = base10 + String(expected);
    throw new HttpValidationError(
      verbose
        ? `CUIT inválido: dígito verificador incorrecto (esperado ${expected} para ${formatCUIT(
            base10 + '•'
          )}, recibido ${provided}). Sugerido: ${formatCUIT(suggested)}.`
        : `CUIT inválido: dígito verificador incorrecto.`,
      'CUIT_DV',
      400,
      {
        normalized: s,
        base10,
        expectedDV: expected,
        providedDV: provided,
        suggested, // '###########'
        suggestedFormatted: formatCUIT(suggested)
      }
    );
  }

  return s;
};

// Helpers
const show = (v) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

const AUDITABLES = [
  'razon_social',
  'nombre_fantasia',
  'cuit',
  'condicion_iva',
  'iibb',
  'tipo_persona',
  'dni',
  'email',
  'telefono',
  'whatsapp',
  'web',
  'direccion',
  'localidad',
  'provincia',
  'cp',
  'dias_credito',
  'limite_credito',
  'estado',
  'notas'
];

/* ============================================================
   LISTAR (con filtros + paginación + includes opcionales)
   GET /proveedores?estado=activo&q=foo&page=1&pageSize=20&include=basico|full
   ============================================================ */
export const OBRS_Proveedores_CTS = async (req, res) => {
  try {
    const {
      estado, // 'activo' | 'inactivo' | undefined
      q, // búsqueda libre por rs/cuit/email/teléfonos/localidad/provincia
      page = 1,
      pageSize = 20,
      include // 'basico' | 'full' | undefined
    } = req.query;

    const where = {};

    if (estado === 'activo' || estado === 'inactivo') {
      where.estado = estado;
    }

    if (q && q.trim().length >= 2) {
      const s = q.trim();
      const sDigits = s.replace(/\D+/g, '');
      where[Op.or] = [
        { razon_social: { [Op.like]: `%${s}%` } },
        { nombre_fantasia: { [Op.like]: `%${s}%` } },
        { email: { [Op.like]: `%${s}%` } },
        { localidad: { [Op.like]: `%${s}%` } },
        { provincia: { [Op.like]: `%${s}%` } },
        ...(sDigits
          ? [
              { cuit: { [Op.like]: `%${sDigits}%` } },
              { telefono: { [Op.like]: `%${sDigits}%` } },
              { whatsapp: { [Op.like]: `%${sDigits}%` } },
              { dni: { [Op.like]: `%${sDigits}%` } }
            ]
          : [])
      ];
    }

    // Includes (opcional)
    const includeArr =
      include === 'full'
        ? [
            { model: ProveedorContactosModel, as: 'contactos' },
            { model: ProveedorCuentasBancariasModel, as: 'cuentasBancarias' },
            {
              model: ProductoProveedorModel,
              as: 'productos',
              include: [
                {
                  model: ProductoProveedorHistorialCostosModel,
                  as: 'historialCostos'
                }
              ]
            }
          ]
        : include === 'basico'
        ? [
            { model: ProveedorContactosModel, as: 'contactos' },
            { model: ProveedorCuentasBancariasModel, as: 'cuentasBancarias' }
          ]
        : [];

    const limit = Math.max(1, parseInt(pageSize));
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const { rows, count } = await ProveedoresModel.findAndCountAll({
      where,
      include: includeArr,
      order: [['id', 'DESC']],
      limit,
      offset
    });

    res.json({
      page: Number(page),
      pageSize: limit,
      total: count,
      data: rows
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ===================================
   OBTENER POR ID (detalle opcional)
   GET /proveedores/:id?include=full
   =================================== */
export const OBR_Proveedor_CTS = async (req, res) => {
  try {
    const { include } = req.query;

    const includeArr =
      include === 'full'
        ? [
            { model: ProveedorContactosModel, as: 'contactos' },
            { model: ProveedorCuentasBancariasModel, as: 'cuentasBancarias' },
            {
              model: ProductoProveedorModel,
              as: 'productos',
              include: [
                {
                  model: ProductoProveedorHistorialCostosModel,
                  as: 'historialCostos'
                }
              ]
            }
          ]
        : include === 'basico'
        ? [
            { model: ProveedorContactosModel, as: 'contactos' },
            { model: ProveedorCuentasBancariasModel, as: 'cuentasBancarias' }
          ]
        : [];

    const prov = await ProveedoresModel.findByPk(req.params.id, {
      include: includeArr
    });

    if (!prov)
      return res.status(404).json({ mensajeError: 'Proveedor no encontrado' });

    res.json(prov);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   CREAR
   POST /proveedores
   ======================= */
export const CR_Proveedor_CTS = async (req, res) => {
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  if (!body.razon_social) {
    return res
      .status(400)
      .json({ mensajeError: 'Falta el campo obligatorio: razon_social' });
  }

  // Validación opcional: CUIT único “amigable”
  if (body.cuit) {
    const cuitDigits = String(body.cuit).replace(/\D+/g, '');
    const exists = await ProveedoresModel.findOne({
      where: { cuit: cuitDigits }
    });
    if (exists) {
      return res
        .status(409)
        .json({ mensajeError: 'Ya existe un proveedor con ese CUIT.' });
    }
    body.cuit = cuitDigits;
  }

  try {
    // Normalizo CUIT (acepta null)
    let cuitNormalizado = null;
    try {
      cuitNormalizado = assertValidCUITorNull(req.body.cuit);
    } catch (e) {
      return res.status(400).json({ mensajeError: e.message });
    }

    const nuevo = await ProveedoresModel.create({
      ...req.body,
      cuit: cuitNormalizado // guarda limpio (11 dígitos) o null
    });

    // LOG (no crítico)
    try {
      const parts = [
        `creó el proveedor "${show(nuevo.razon_social)}" (ID #${nuevo.id})`,
        body.cuit ? `CUIT: ${show(nuevo.cuit)}` : '',
        body.condicion_iva ? `IVA: ${show(nuevo.condicion_iva)}` : ''
      ].filter(Boolean);
      await registrarLog(
        req,
        'proveedores',
        'crear',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog proveedores crear] no crítico:', e.message);
    }

    res.json({ message: 'Proveedor creado correctamente', proveedor: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   ACTUALIZAR
   PUT /proveedores/:id
   ======================= */
export const UR_Proveedor_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  try {
    // 1) existe?
    const anterior = await ProveedoresModel.findByPk(id);
    if (!anterior) {
      return res.status(404).json({ mensajeError: 'Proveedor no encontrado' });
    }

    // 2) armar payload y normalizar CUIT SOLO si vino
    const payload = { ...body };
    const prevCuitClean = anterior.cuit ? cleanCUIT(anterior.cuit) : '';

    if (Object.prototype.hasOwnProperty.call(body, 'cuit')) {
      const raw = body.cuit;

      if (raw === '' || raw === null) {
        payload.cuit = null; // borrado explícito
      } else {
        const newClean = cleanCUIT(String(raw));
        if (newClean === prevCuitClean) {
          delete payload.cuit; // no cambió → no tocar
        } else {
          try {
            payload.cuit = assertValidCUITorNull(newClean, { verbose: true });
          } catch (e) {
            const status = e.status || 400;
            return res.status(status).json({
              mensajeError: e.message,
              code: e.code || 'VALIDATION_ERROR',
              ...(e.meta ? { meta: e.meta } : {})
            });
          }
          // duplicado
          const existe = await ProveedoresModel.findOne({
            where: { cuit: payload.cuit, id: { [Op.ne]: id } }
          });
          if (existe) {
            return res
              .status(409)
              .json({ mensajeError: 'Ya existe otro proveedor con ese CUIT.' });
          }
        }
      }
    }

    // 3) limpiar payload: quitar undefined e id/usuario_log_id
    const payloadClean = Object.fromEntries(
      Object.entries(payload).filter(
        ([k, v]) => v !== undefined && k !== 'id' && k !== 'usuario_log_id' // no es columna
      )
    );

    // si no hay nada para actualizar → devolver sin cambios
    if (Object.keys(payloadClean).length === 0) {
      return res.json({
        message: 'Proveedor actualizado (sin cambios)',
        proveedor: anterior
      });
    }

    // 4) ejecutar update (si updated === 0, igual existe, puede ser "mismos valores")
    const [updated] = await ProveedoresModel.update(payloadClean, {
      where: { id }
    });

    // 5) traer final y responder OK siempre (ya confirmamos existencia)
    const actualizado = await ProveedoresModel.findByPk(id);

    // ---- LOG (no crítico) ----
    try {
      const cambios = [];
      for (const campo of AUDITABLES) {
        if (Object.prototype.hasOwnProperty.call(payloadClean, campo)) {
          const prev = anterior[campo];
          const next = actualizado[campo];
          if (`${show(prev)}` !== `${show(next)}`) {
            cambios.push(
              `cambió "${campo}" de "${show(prev)}" a "${show(next)}"`
            );
          }
        }
      }
      const parts = [
        `actualizó el proveedor "${show(
          actualizado.razon_social || anterior.razon_social
        )}" (ID #${id})`,
        cambios.length ? cambios.join(' · ') : 'sin cambios relevantes'
      ];
      await registrarLog(
        req,
        'proveedores',
        'editar',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn(
        '[registrarLog proveedores actualizar] no crítico:',
        e.message
      );
    }
    // ---------------------------

    return res.json({
      message:
        updated > 0
          ? 'Proveedor actualizado correctamente'
          : 'Proveedor actualizado (sin cambios)',
      proveedor: actualizado
    });
  } catch (error) {
    return res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   ELIMINAR
   DELETE /proveedores/:id
   ======================= */
export const ER_Proveedor_CTS = async (req, res) => {
  const proveedorId = req.params.id;
  const usuario_log_id = req.body?.usuario_log_id;

  try {
    // Verificamos si tiene relaciones N–N (producto_proveedor) para dar error amigable
    const tienePP = await ProductoProveedorModel.findOne({
      where: { proveedor_id: proveedorId },
      attributes: ['id']
    });

    if (tienePP) {
      return res.status(409).json({
        mensajeError:
          'No se puede eliminar el proveedor porque tiene productos asociados. Elimine o desasocie primero.'
      });
    }

    // Guardamos datos previos para log
    const previo = await ProveedoresModel.findByPk(proveedorId);

    const eliminado = await ProveedoresModel.destroy({
      where: { id: proveedorId }
    });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Proveedor no encontrado' });

    // LOG (no crítico)
    try {
      const parts = [
        `eliminó el proveedor "${show(
          previo?.razon_social
        )}" (ID #${proveedorId})`,
        `CUIT: ${show(previo?.cuit)}`
      ];
      await registrarLog(
        req,
        'proveedores',
        'eliminar',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn(
        '[registrarLog proveedores eliminar] no crítico:',
        e.message
      );
    }

    res.json({ message: 'Proveedor eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   BÚSQUEDA RÁPIDA (autosuggest): nombre/cuit/email/tel
   GET /proveedores/search?query=...
   ====================================================== */
export const SEARCH_Proveedores_CTS = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) return res.json([]);

    const s = query.trim();
    const sDigits = s.replace(/\D+/g, '');

    const where =
      /^\d+$/.test(sDigits) && sDigits.length >= 7 // si parece CUIT/telefono/dni
        ? {
            [Op.or]: [
              { cuit: { [Op.like]: `%${sDigits}%` } },
              { telefono: { [Op.like]: `%${sDigits}%` } },
              { whatsapp: { [Op.like]: `%${sDigits}%` } },
              { dni: { [Op.like]: `%${sDigits}%` } }
            ]
          }
        : {
            [Op.or]: [
              { razon_social: { [Op.like]: `%${s}%` } },
              { nombre_fantasia: { [Op.like]: `%${s}%` } },
              { email: { [Op.like]: `%${s}%` } }
            ]
          };

    const resultados = await ProveedoresModel.findAll({
      where,
      limit: 20,
      order: [['razon_social', 'ASC']]
    });

    if (resultados.length === 0)
      return res.status(404).json({ mensajeError: 'Sin resultados' });

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   INACTIVOS por días sin comprar
   GET /proveedores/inactivos?dias=60
   (usa fecha_ultima_compra)
   ====================================================== */
export const OBRS_ProveedoresInactivos_CTS = async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 60;

    const proveedores = await ProveedoresModel.findAll({
      where: {
        [Op.or]: [
          { fecha_ultima_compra: null },
          db.literal(`fecha_ultima_compra < NOW() - INTERVAL ${dias} DAY`)
        ]
      },
      order: [['fecha_ultima_compra', 'ASC']]
    });

    res.json(proveedores);
  } catch (error) {
    console.error('Error al buscar proveedores inactivos:', error);
    res
      .status(500)
      .json({ mensajeError: 'Error al obtener proveedores inactivos' });
  }
};

/* ======================================================
   CAMBIAR ESTADO rápido
   PATCH /proveedores/:id/estado  { estado: 'activo'|'inactivo' }
   ====================================================== */
export const Estado_Proveedor_CTS = async (req, res) => {
  const { id } = req.params;
  const { estado, usuario_log_id } = req.body || {};
  if (!['activo', 'inactivo'].includes(estado)) {
    return res.status(400).json({ mensajeError: 'Estado inválido' });
  }

  try {
    const prov = await ProveedoresModel.findByPk(id);
    if (!prov)
      return res.status(404).json({ mensajeError: 'Proveedor no encontrado' });

    await ProveedoresModel.update({ estado }, { where: { id } });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'proveedores',
        'cambiar_estado',
        `cambió estado de "${show(
          prov.razon_social
        )}" (ID #${id}) a "${estado}"`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog proveedores estado] no crítico:', e.message);
    }

    res.json({ message: 'Estado actualizado', estado });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
