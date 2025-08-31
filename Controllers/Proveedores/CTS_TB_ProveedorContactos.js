/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 30 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores CRUD para `proveedor_contactos`, incluyendo búsqueda rápida
 * y manejo de contacto principal único por proveedor.
 *
 * Tema: Controladores - Proveedores (Contactos)
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';
import { getUid } from '../../Utils/getUid.js';

// Modelos
import { ProveedorContactosModel } from '../../Models/Proveedores/MD_TB_ProveedorContactos.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';

// Helper
const show = (v) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

/* ======================================================
   LISTAR CONTACTOS
   GET /proveedores/:proveedorId/contactos
   ====================================================== */
export const OBRS_ProveedorContactos_CTS = async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const contactos = await ProveedorContactosModel.findAll({
      where: { proveedor_id: proveedorId },
      order: [
        ['es_principal', 'DESC'],
        ['nombre', 'ASC']
      ]
    });
    res.json(contactos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   OBTENER UN CONTACTO POR ID
   GET /proveedores/contactos/:id
   ====================================================== */
export const OBR_ProveedorContacto_CTS = async (req, res) => {
  try {
    const contacto = await ProveedorContactosModel.findByPk(req.params.id, {
      include: [{ model: ProveedoresModel, as: 'proveedor' }]
    });
    if (!contacto)
      return res.status(404).json({ mensajeError: 'Contacto no encontrado' });
    res.json(contacto);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   CREAR CONTACTO
   POST /proveedores/:proveedorId/contactos
   ====================================================== */
export const CR_ProveedorContacto_CTS = async (req, res) => {
  const { proveedorId } = req.params;
  const body = req.body || {};
  const uid = getUid(req); // ⬅️ robusto

  if (!body.nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'Falta el campo obligatorio: nombre' });
  }

  try {
    const nuevo = await ProveedorContactosModel.create({
      proveedor_id: proveedorId,
      nombre: body.nombre,
      cargo: body.cargo,
      email: body.email,
      telefono: body.telefono,
      whatsapp: body.whatsapp,
      notas: body.notas,
      es_principal: body.es_principal || false
    });

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(proveedorId);
      const parts = [
        `agregó el contacto "${show(nuevo.nombre)}" para el proveedor "${show(
          proveedor?.razon_social
        )}"`,
        nuevo.cargo ? `Cargo: ${show(nuevo.cargo)}` : '',
        nuevo.email ? `Email: ${show(nuevo.email)}` : '',
        nuevo.telefono ? `Tel: ${show(nuevo.telefono)}` : '',
        nuevo.whatsapp ? `WhatsApp: ${show(nuevo.whatsapp)}` : ''
      ].filter(Boolean);

      await registrarLog(
        req,
        'proveedores',
        'crear',
        parts.join(' · '),
        uid || undefined
      );
    } catch (e) {
      console.warn('[registrarLog contactos crear] no crítico:', e.message);
    }

    res.json({ message: 'Contacto creado correctamente', contacto: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   ACTUALIZAR CONTACTO
   PUT /proveedores/contactos/:id
   ====================================================== */
export const UR_ProveedorContacto_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const uid = getUid(req); // ⬅️ robusto

  try {
    const anterior = await ProveedorContactosModel.findByPk(id);
    if (!anterior)
      return res.status(404).json({ mensajeError: 'Contacto no encontrado' });

    const [updated] = await ProveedorContactosModel.update(body, {
      where: { id }
    });
    if (updated !== 1)
      return res.status(404).json({ mensajeError: 'Contacto no encontrado' });

    const actualizado = await ProveedorContactosModel.findByPk(id);

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(anterior.proveedor_id);
      const cambios = [];
      const camposAuditables = [
        'nombre',
        'cargo',
        'email',
        'telefono',
        'whatsapp',
        'notas',
        'es_principal'
      ];

      for (const campo of camposAuditables) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
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
        `actualizó el contacto "${show(
          actualizado.nombre
        )}" del proveedor "${show(proveedor?.razon_social)}"`,
        cambios.length ? cambios.join(' · ') : 'sin cambios relevantes'
      ];

      await registrarLog(
        req,
        'proveedores',
        'editar',
        parts.join(' · '),
        uid || undefined
      );
    } catch (e) {
      console.warn(
        '[registrarLog contactos actualizar] no crítico:',
        e.message
      );
    }

    res.json({
      message: 'Contacto actualizado correctamente',
      contacto: actualizado
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   ELIMINAR CONTACTO
   DELETE /proveedores/contactos/:id
   ====================================================== */
export const ER_ProveedorContacto_CTS = async (req, res) => {
  const { id } = req.params;

  // Acepta user id desde distintos lugares (robusto)
  const uid =
    req.body?.usuario_log_id ??
    req.body?.userId ??
    req.query?.userId ??
    req.get('X-User-Id') ?? // headers son case-insensitive
    req.user?.id ?? // si usás auth middleware
    null;

  try {
    const contacto = await ProveedorContactosModel.findByPk(id);
    if (!contacto) {
      return res.status(404).json({ mensajeError: 'Contacto no encontrado' });
    }

    await ProveedorContactosModel.destroy({ where: { id } });

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(contacto.proveedor_id);
      const parts = [
        `eliminó el contacto "${show(contacto.nombre)}" del proveedor "${show(
          proveedor?.razon_social
        )}"`
      ];
      await registrarLog(
        req,
        'proveedores',
        'eliminar',
        parts.join(' · '),
        uid || undefined
      );
    } catch (e) {
      console.warn('[registrarLog contactos eliminar] no crítico:', e.message);
    }

    res.json({ message: 'Contacto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};


/* ======================================================
   MARCAR COMO PRINCIPAL
   PATCH /proveedores/contactos/:id/principal
   ====================================================== */
export const SetPrincipal_ProveedorContacto_CTS = async (req, res) => {
  const { id } = req.params;
  const uid = getUid(req); // ⬅️ robusto

  try {
    const contacto = await ProveedorContactosModel.findByPk(id);
    if (!contacto) {
      return res.status(404).json({ mensajeError: 'Contacto no encontrado' });
    }

    // Actualizar este como principal y el resto a false (misma transacción)
    await db.transaction(async (t) => {
      await ProveedorContactosModel.update(
        { es_principal: false },
        { where: { proveedor_id: contacto.proveedor_id }, transaction: t }
      );
      await contacto.update({ es_principal: true }, { transaction: t });
    });

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(contacto.proveedor_id);
      await registrarLog(
        req,
        'proveedores',
        'editar',
        `marcó como principal el contacto "${show(
          contacto.nombre
        )}" del proveedor "${show(proveedor?.razon_social)}"`,
        uid || undefined
      );
    } catch (e) {
      console.warn('[registrarLog contactos principal] no crítico:', e.message);
    }

    res.json({ message: 'Contacto marcado como principal', contacto });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
/* ======================================================
   BÚSQUEDA RÁPIDA DE CONTACTOS
   GET /proveedores/contactos/search?q=...
   ====================================================== */
export const SEARCH_ProveedorContactos_CTS = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const s = q.trim();
    const sDigits = s.replace(/\D+/g, '');

    const where = /^\d+$/.test(sDigits)
      ? {
          [Op.or]: [
            { telefono: { [Op.like]: `%${sDigits}%` } },
            { whatsapp: { [Op.like]: `%${sDigits}%` } }
          ]
        }
      : {
          [Op.or]: [
            { nombre: { [Op.like]: `%${s}%` } },
            { cargo: { [Op.like]: `%${s}%` } },
            { email: { [Op.like]: `%${s}%` } }
          ]
        };

    const resultados = await ProveedorContactosModel.findAll({
      where,
      limit: 20,
      order: [
        ['es_principal', 'DESC'],
        ['nombre', 'ASC']
      ]
    });

    if (resultados.length === 0)
      return res.status(404).json({ mensajeError: 'Sin resultados' });

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
