/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 31 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores CRUD para `proveedores_bancarias`,
 * incluye manejo de cuenta predeterminada única por proveedor.
 *
 * Tema: Controladores - Proveedores (Cuentas Bancarias)
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';
import { ValidationError } from 'sequelize';

// Modelos
import { ProveedorCuentasBancariasModel } from '../../Models/Proveedores/MD_TB_ProveedorCuentasBancarias.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';

// Helper
const show = (v) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

/* ======================================================
   LISTAR CUENTAS DE UN PROVEEDOR
   GET /proveedores/:proveedorId/cuentas
   ====================================================== */
export const OBRS_ProveedorCuentas_CTS = async (req, res) => {
  try {
    const { proveedorId } = req.params;
    const cuentas = await ProveedorCuentasBancariasModel.findAll({
      where: { proveedor_id: proveedorId },
      order: [
        ['es_predeterminada', 'DESC'],
        ['banco', 'ASC']
      ]
    });
    res.json(cuentas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   OBTENER UNA CUENTA POR ID
   GET /proveedores/cuentas/:id
   ====================================================== */
export const OBR_ProveedorCuenta_CTS = async (req, res) => {
  try {
    const cuenta = await ProveedorCuentasBancariasModel.findByPk(
      req.params.id,
      {
        include: [{ model: ProveedoresModel, as: 'proveedor' }]
      }
    );
    if (!cuenta)
      return res.status(404).json({ mensajeError: 'Cuenta no encontrada' });
    res.json(cuenta);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   CREAR UNA CUENTA
   POST /proveedores/:proveedorId/cuentas
   ====================================================== */
export const CR_ProveedorCuenta_CTS = async (req, res) => {
  const { proveedorId } = req.params;
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  if (!body.banco) {
    return res
      .status(400)
      .json({ mensajeError: 'Falta el campo obligatorio: banco' });
  }

  try {
    const nueva = await ProveedorCuentasBancariasModel.create({
      proveedor_id: proveedorId,
      banco: body.banco,
      tipo_cuenta: body.tipo_cuenta || 'CA',
      numero_cuenta: body.numero_cuenta,
      cbu: body.cbu,
      alias_cbu: body.alias_cbu,
      titular: body.titular,
      cuit_titular: body.cuit_titular,
      es_predeterminada: body.es_predeterminada || false
    });

    // LOG ...
    // ...

    return res.json({
      message: 'Cuenta bancaria creada correctamente',
      cuenta: nueva
    });
  } catch (error) {
    console.error('❌ Error en CR_ProveedorCuenta_CTS:', error);

    // 👉 Caso 1: error de validación de Sequelize
    if (
      error instanceof ValidationError ||
      error.name === 'SequelizeValidationError'
    ) {
      return res.status(400).json({
        mensajeError:
          error.errors?.[0]?.message ||
          'Datos inválidos para la cuenta bancaria.'
      });
    }

    // 👉 Caso genérico
    return res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   ACTUALIZAR UNA CUENTA
   PUT /proveedores/cuentas/:id
   ====================================================== */
export const UR_ProveedorCuenta_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const usuario_log_id = body?.usuario_log_id;

  try {
    const anterior = await ProveedorCuentasBancariasModel.findByPk(id);
    if (!anterior)
      return res.status(404).json({ mensajeError: 'Cuenta no encontrada' });

    const [updated] = await ProveedorCuentasBancariasModel.update(body, {
      where: { id }
    });

    if (updated !== 1)
      return res.status(404).json({ mensajeError: 'Cuenta no encontrada' });

    const actualizada = await ProveedorCuentasBancariasModel.findByPk(id);

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(anterior.proveedor_id);
      const cambios = [];
      const camposAuditables = [
        'banco',
        'tipo_cuenta',
        'numero_cuenta',
        'cbu',
        'alias_cbu',
        'titular',
        'cuit_titular',
        'es_predeterminada'
      ];

      for (const campo of camposAuditables) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          const prev = anterior[campo];
          const next = actualizada[campo];
          if (`${show(prev)}` !== `${show(next)}`) {
            cambios.push(
              `cambió "${campo}" de "${show(prev)}" a "${show(next)}"`
            );
          }
        }
      }

      const parts = [
        `actualizó la cuenta "${show(actualizada.banco)}" del proveedor "${show(
          proveedor?.razon_social
        )}"`,
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
      console.warn('[registrarLog cuentas actualizar] no crítico:', e.message);
    }

    res.json({
      message: 'Cuenta bancaria actualizada correctamente',
      cuenta: actualizada
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   ELIMINAR UNA CUENTA
   DELETE /proveedores/cuentas/:id
   ====================================================== */
export const ER_ProveedorCuenta_CTS = async (req, res) => {
  const { id } = req.params;
  const usuario_log_id = req.body?.usuario_log_id;

  try {
    const cuenta = await ProveedorCuentasBancariasModel.findByPk(id);
    if (!cuenta)
      return res.status(404).json({ mensajeError: 'Cuenta no encontrada' });

    await ProveedorCuentasBancariasModel.destroy({ where: { id } });

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(cuenta.proveedor_id);
      const parts = [
        `eliminó la cuenta "${show(cuenta.banco)}" del proveedor "${show(
          proveedor?.razon_social
        )}"`,
        cuenta.alias_cbu ? `Alias: ${show(cuenta.alias_cbu)}` : '',
        cuenta.cbu ? `CBU: ${show(cuenta.cbu)}` : ''
      ].filter(Boolean);

      await registrarLog(
        req,
        'proveedores',
        'eliminar',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog cuentas eliminar] no crítico:', e.message);
    }

    res.json({ message: 'Cuenta bancaria eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   MARCAR CUENTA COMO PREDETERMINADA
   PATCH /proveedores/cuentas/:id/predeterminada
   ====================================================== */
export const SetPredeterminada_ProveedorCuenta_CTS = async (req, res) => {
  const { id } = req.params;
  const usuario_log_id = req.body?.usuario_log_id;

  try {
    const cuenta = await ProveedorCuentasBancariasModel.findByPk(id);
    if (!cuenta)
      return res.status(404).json({ mensajeError: 'Cuenta no encontrada' });

    // Usamos transacción para asegurar integridad
    await db.transaction(async (t) => {
      await ProveedorCuentasBancariasModel.update(
        { es_predeterminada: false },
        { where: { proveedor_id: cuenta.proveedor_id }, transaction: t }
      );
      await cuenta.update({ es_predeterminada: true }, { transaction: t });
    });

    // LOG (no crítico)
    try {
      const proveedor = await ProveedoresModel.findByPk(cuenta.proveedor_id);
      await registrarLog(
        req,
        'proveedores',
        'predeterminada',
        `marcó como predeterminada la cuenta "${show(
          cuenta.banco
        )}" del proveedor "${show(proveedor?.razon_social)}"`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn(
        '[registrarLog cuentas predeterminada] no crítico:',
        e.message
      );
    }

    res.json({
      message: 'Cuenta bancaria marcada como predeterminada',
      cuenta
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* ======================================================
   BÚSQUEDA RÁPIDA DE CUENTAS
   GET /proveedores/cuentas/search?q=...
   ====================================================== */
export const SEARCH_ProveedorCuentas_CTS = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const s = q.trim();
    const sDigits = s.replace(/\D+/g, '');

    const where = /^\d+$/.test(sDigits)
      ? {
          [Op.or]: [
            { cbu: { [Op.like]: `%${sDigits}%` } },
            { numero_cuenta: { [Op.like]: `%${sDigits}%` } }
          ]
        }
      : {
          [Op.or]: [
            { banco: { [Op.like]: `%${s}%` } },
            { alias_cbu: { [Op.like]: `%${s}%` } },
            { titular: { [Op.like]: `%${s}%` } }
          ]
        };

    const resultados = await ProveedorCuentasBancariasModel.findAll({
      where,
      limit: 20,
      order: [
        ['es_predeterminada', 'DESC'],
        ['banco', 'ASC']
      ]
    });

    if (resultados.length === 0)
      return res.status(404).json({ mensajeError: 'Sin resultados' });

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
