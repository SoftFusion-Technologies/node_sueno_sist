/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 31 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para `producto_proveedor_historial_costos`.
 * - Listar por producto_proveedor_id (con filtros por fecha)
 * - Obtener por id
 * - Crear registro (opcional: aplicar cambios al PP)
 * - Eliminar registro
 * - Obtener último historial
 *
 * Tema: Controladores - Proveedores (Historial de costos)
 * Capa: Backend
 */

import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';

// Modelos
import { ProductoProveedorHistorialCostosModel } from '../../Models/Proveedores/MD_TB_ProductoProveedorHistorialCostos.js';
import { ProductoProveedorModel } from '../../Models/Proveedores/MD_TB_ProductoProveedor.js';

const show = (v) =>
  v === null || v === undefined || v === '' ? '-' : String(v);

/* ============================================================
   LISTAR POR producto_proveedor_id (+ rango de fechas)
   GET /producto-proveedor/:ppId/historial?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&page=1&pageSize=50
   ============================================================ */
export const OBRS_PPH_CTS = async (req, res) => {
  try {
    const { ppId } = req.params;
    const { desde, hasta, page = 1, pageSize = 50 } = req.query;

    if (!ppId)
      return res
        .status(400)
        .json({ mensajeError: 'Falta producto_proveedor_id' });

    const where = { producto_proveedor_id: ppId };

    if (desde || hasta) {
      where.fecha = {
        ...(desde ? { [Op.gte]: new Date(desde) } : {}),
        ...(hasta ? { [Op.lte]: new Date(hasta) } : {})
      };
    }

    const limit = Math.max(1, parseInt(pageSize));
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const { rows, count } =
      await ProductoProveedorHistorialCostosModel.findAndCountAll({
        where,
        order: [
          ['fecha', 'DESC'],
          ['id', 'DESC']
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
   GET /producto-proveedor/historial/:id
   =================================== */
export const OBR_PPH_CTS = async (req, res) => {
  try {
    const item = await ProductoProveedorHistorialCostosModel.findByPk(
      req.params.id
    );
    if (!item)
      return res.status(404).json({ mensajeError: 'Historial no encontrado' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   CREAR
   POST /producto-proveedor/:ppId/historial
   Body:
   {
     costo_neto: number,
     moneda?: 'ARS'|'USD'|'EUR'|'Otro',
     alicuota_iva?: number,
     descuento_porcentaje?: number,
     motivo?: string,
     observaciones?: string,
     aplicar_en_pp?: boolean  // si true, sincroniza campos en producto_proveedor
     usuario_log_id?: number
   }
   ======================= */
export const CR_PPH_CTS = async (req, res) => {
  const { ppId } = req.params;
  const {
    costo_neto,
    moneda = 'ARS',
    alicuota_iva = 21.0,
    descuento_porcentaje = 0.0,
    motivo = 'Actualización manual',
    observaciones = null,
    aplicar_en_pp = false,
    usuario_log_id
  } = req.body || {};

  if (ppId == null)
    return res
      .status(400)
      .json({ mensajeError: 'Falta producto_proveedor_id' });
  if (costo_neto == null)
    return res.status(400).json({ mensajeError: 'Falta costo_neto' });

  try {
    let nuevo;

    await db.transaction(async (t) => {
      // 1) Crear historial
      nuevo = await ProductoProveedorHistorialCostosModel.create(
        {
          producto_proveedor_id: ppId,
          costo_neto,
          moneda,
          alicuota_iva,
          descuento_porcentaje,
          motivo,
          observaciones
        },
        { transaction: t }
      );

      // 2) (Opcional) Aplicar al PP
      if (aplicar_en_pp) {
        const pp = await ProductoProveedorModel.findByPk(ppId, {
          transaction: t
        });
        if (!pp) throw new Error('Relación producto_proveedor no encontrada');

        await pp.update(
          {
            costo_neto,
            moneda,
            alicuota_iva,
            descuento_porcentaje
          },
          { transaction: t }
        );
      }
    });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'producto_proveedor_historial_costos',
        'crear',
        `agregó historial a PP #${show(ppId)} · costo=${show(
          costo_neto
        )} ${show(moneda)} · IVA=${show(alicuota_iva)}% · desc=${show(
          descuento_porcentaje
        )}% · aplicar_en_pp=${aplicar_en_pp ? 'sí' : 'no'} · motivo=${show(
          motivo
        )}`,
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog PPH crear] no crítico:', e.message);
    }

    res.json({ message: 'Historial creado correctamente', historial: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   ELIMINAR
   DELETE /producto-proveedor/historial/:id
   ======================= */
export const ER_PPH_CTS = async (req, res) => {
  const { id } = req.params;
  const usuario_log_id = req.body?.usuario_log_id || req.get('x-user-id');

  try {
    const previo = await ProductoProveedorHistorialCostosModel.findByPk(id);
    if (!previo)
      return res.status(404).json({ mensajeError: 'Historial no encontrado' });

    await ProductoProveedorHistorialCostosModel.destroy({ where: { id } });

    // LOG (no crítico)
    try {
      await registrarLog(
        req,
        'producto_proveedor_historial_costos',
        'eliminar',
        `eliminó historial #${id} de PP #${show(
          previo.producto_proveedor_id
        )} · costo=${show(previo.costo_neto)} ${show(
          previo.moneda
        )} · IVA=${show(previo.alicuota_iva)}% · desc=${show(
          previo.descuento_porcentaje
        )}%`,
        usuario_log_id
      );
    } catch (e) {
      console.warn('[registrarLog PPH eliminar] no crítico:', e.message);
    }

    res.json({ message: 'Historial eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =======================
   ÚLTIMO REGISTRO
   GET /producto-proveedor/:ppId/historial/ultimo
   ======================= */
export const OBR_PPH_Ultimo_CTS = async (req, res) => {
  try {
    const { ppId } = req.params;
    const ultimo = await ProductoProveedorHistorialCostosModel.findOne({
      where: { producto_proveedor_id: ppId },
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    });

    if (!ultimo)
      return res
        .status(404)
        .json({ mensajeError: 'Sin historial para este PP' });

    res.json(ultimo);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
