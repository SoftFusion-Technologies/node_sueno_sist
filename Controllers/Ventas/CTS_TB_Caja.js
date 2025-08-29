/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Caja.js) contiene controladores para manejar operaciones CRUD sobre la tabla caja.
 *
 * Tema: Controladores - Caja
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Caja from '../../Models/Ventas/MD_TB_Caja.js';
const CajaModel = MD_TB_Caja.CajaModel;
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { UserModel } from '../../Models/MD_TB_Users.js';
import { MovimientosCajaModel } from '../../Models/Ventas/MD_TB_MovimientosCaja.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const fmtARS = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  })
    .format(Number(n || 0))
    .replace(/\s+/g, '');

// Obtener todas las cajas
export const OBRS_Caja_CTS = async (req, res) => {
  try {
    const cajas = await CajaModel.findAll({
      order: [['id', 'DESC']]
      // include: [{ model: LocalesModel }, { model: UserModel }]
    });
    res.json(cajas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener una caja por ID
export const OBR_Caja_CTS = async (req, res) => {
  try {
    const caja = await CajaModel.findByPk(req.params.id);
    if (!caja)
      return res.status(404).json({ mensajeError: 'Caja no encontrada' });
    res.json(caja);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear (abrir) una nueva caja
// ========================= CREAR (ABRIR) =========================
export const CR_Caja_CTS = async (req, res) => {
  const { local_id, usuario_id, saldo_inicial } = req.body;

  if (!local_id || !usuario_id || saldo_inicial === undefined) {
    return res.status(400).json({
      mensajeError:
        'Faltan campos obligatorios: local_id, usuario_id, saldo_inicial'
    });
  }

  try {
    const nuevaCaja = await CajaModel.create({
      local_id,
      usuario_id,
      saldo_inicial
    });

    // ---- LOG (fuera de try/catch principal; si falla no rompe respuesta) ----
    try {
      const [local, usuario] = await Promise.all([
        LocalesModel.findByPk(local_id, { attributes: ['id', 'nombre'] }),
        UserModel.findByPk(usuario_id, { attributes: ['id', 'nombre'] })
      ]);

      const parts = [
        `abrió la caja #${nuevaCaja.id}`,
        `en ${
          local?.nombre ? `local "${local.nombre}"` : `local #${local_id}`
        }`,
        `con saldo inicial ${fmtARS(saldo_inicial)}`
      ];
      await registrarLog(req, 'caja', 'crear', parts.join(' · '), usuario_id);
    } catch (e) {
      console.warn('[registrarLog abrir caja] no crítico:', e.message);
    }
    // ------------------------------------------------------------------------

    res.json({ message: 'Caja abierta correctamente', caja: nuevaCaja });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar una caja
// ========================= ELIMINAR =========================
export const ER_Caja_CTS = async (req, res) => {
  try {
    const id = req.params.id;

    // Traigo antes (para el log)
    const cajaPrev = await CajaModel.findByPk(id);

    const eliminado = await CajaModel.destroy({ where: { id } });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Caja no encontrada' });

    // ---- LOG ----
    try {
      const usuario_log_id =
        req.body?.usuario_id ?? cajaPrev?.usuario_id ?? null;
      const [local, usuario] = await Promise.all([
        LocalesModel.findByPk(cajaPrev?.local_id, {
          attributes: ['id', 'nombre']
        }),
        usuario_log_id
          ? UserModel.findByPk(usuario_log_id, { attributes: ['id', 'nombre'] })
          : null
      ]);

      const parts = [
        `eliminó la caja #${id}`,
        cajaPrev?.local_id
          ? `de ${
              local?.nombre
                ? `local "${local.nombre}"`
                : `local #${cajaPrev.local_id}`
            }`
          : ''
      ].filter(Boolean);

      await registrarLog(
        req,
        'caja',
        'eliminar',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog eliminar caja] no crítico:', e.message);
    }
    // ----------

    res.json({ message: 'Caja eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar/cerrar una caja
// ========================= ACTUALIZAR / CERRAR =========================
export const UR_Caja_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await CajaModel.update(req.body, { where: { id } });

    if (updated === 1) {
      const actualizada = await CajaModel.findByPk(id);

      // ---- LOG ----
      try {
        const usuario_log_id =
          req.body?.usuario_id ?? actualizada?.usuario_id ?? null;
        const [local, usuario] = await Promise.all([
          LocalesModel.findByPk(actualizada?.local_id, {
            attributes: ['id', 'nombre']
          }),
          usuario_log_id
            ? UserModel.findByPk(usuario_log_id, {
                attributes: ['id', 'nombre']
              })
            : null
        ]);

        const esCierre =
          Object.prototype.hasOwnProperty.call(req.body, 'fecha_cierre') &&
          req.body.fecha_cierre !== null;

        // Campos útiles si vinieron en el body
        const saldoInicialTxt = Object.prototype.hasOwnProperty.call(
          req.body,
          'saldo_inicial'
        )
          ? `saldo inicial ${fmtARS(req.body.saldo_inicial)}`
          : null;

        const saldoFinalTxt = Object.prototype.hasOwnProperty.call(
          req.body,
          'saldo_final'
        )
          ? `saldo final ${fmtARS(req.body.saldo_final)}`
          : null;

        const otroTxt = (() => {
          // Lista breve de claves cambiadas (sin valores)
          const keys = Object.keys(req.body || {}).filter(
            (k) => !['usuario_id'].includes(k)
          );
          return keys.length ? `campos: ${keys.join(', ')}` : null;
        })();

        const parts = [
          esCierre ? `cerró la caja #${id}` : `actualizó la caja #${id}`,
          actualizada?.local_id
            ? `en ${
                local?.nombre
                  ? `local "${local.nombre}""`
                  : `local #${actualizada.local_id}`
              }`
            : '',
          saldoInicialTxt,
          saldoFinalTxt,
          otroTxt
        ].filter(Boolean);

        await registrarLog(
          req,
          'caja',
          esCierre ? 'cerrar' : 'actualizar',
          parts.join(' · '),
          usuario_log_id || undefined
        );
      } catch (e) {
        console.warn(
          '[registrarLog actualizar/cerrar caja] no crítico:',
          e.message
        );
      }
      // ----------

      res.json({ message: 'Caja actualizada correctamente', actualizada });
    } else {
      res.status(404).json({ mensajeError: 'Caja no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener todas las cajas de un local específico
export const OBRS_CajaByLocal_CTS = async (req, res) => {
  const { id } = req.params;
  try {
    const cajas = await CajaModel.findAll({
      where: { local_id: id },
      order: [['fecha_apertura', 'DESC']]
    });
    res.json(cajas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// controllers/CTS_TB_Caja.js
export const OBRS_CajasAbiertas_CTS = async (req, res) => {
  try {
    const abiertas = await CajaModel.findAll({
      where: { fecha_cierre: null },
      include: [
        { model: LocalesModel }, // para traer info del local
        { model: UserModel } // para saber quién la abrió
      ]
    });

    res.json(abiertas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

export const getSaldoActualCaja = async (req, res) => {
  const { caja_id } = req.params;

  try {
    const caja = await CajaModel.findByPk(caja_id);
    if (!caja)
      return res.status(404).json({ mensajeError: 'Caja no encontrada' });

    const movimientos = await MovimientosCajaModel.findAll({
      where: { caja_id }
    });

    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const mov of movimientos) {
      if (mov.tipo === 'ingreso') totalIngresos += Number(mov.monto);
      else if (mov.tipo === 'egreso') totalEgresos += Number(mov.monto);
    }

    const saldo_actual =
      Number(caja.saldo_inicial) + totalIngresos - totalEgresos;

    res.json({ saldo_actual });
  } catch (error) {
    console.error('Error al calcular saldo actual de caja', error);
    res.status(500).json({ mensajeError: 'Error al calcular saldo actual' });
  }
};
