/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.1
 *
 * Descripción:
 * Controladores para manejar operaciones CRUD y flujos del módulo de COMPRAS.
 * Cubre: crear borrador, actualizar, listar, obtener, confirmar (impacta CxP + StockMovimientos),
 * anular (con validaciones), y eliminar borrador. Incluye cálculo de totales server-side
 * y buenas prácticas transaccionales con Sequelize v6.
 *
 * Tema: Controladores - Compras
 * Capa: Backend
 */

import { Op, QueryTypes } from 'sequelize';

import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { CompraDetalleModel } from '../../Models/Compras/MD_TB_ComprasDetalle.js';
import { CompraImpuestoModel } from '../../Models/Compras/MD_TB_ComprasImpuestos.js';
import { CxpProveedorModel } from '../../Models/Compras/MD_TB_CuentasPagarProveedores.js';
import { StockMovimientoModel } from '../../Models/Compras/MD_TB_StockMovimientos.js';
import { ImpuestoConfigModel } from '../../Models/Compras/MD_TB_ImpuestosConfig.js';

// Asociaciones centralizadas (hasMany/belongsTo)
import '../../Models/Compras/compras_relaciones.js';

// ===== MODELOS CORE (opcional/soporte) =====
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js'; // dias_credito, etc.
import { TesoFlujoModel } from '../../Models/Tesoreria/MD_TB_TesoFlujo.js'; // proyección de egreso

import MD_TB_Stock from '../../Models/Stock/MD_TB_Stock.js';
const { StockModel } = MD_TB_Stock;

import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { LugaresModel } from '../../Models/Stock/MD_TB_Lugares.js';
import { EstadosModel } from '../../Models/Stock/MD_TB_Estados.js';

import { onCompraConfirmada_Proveedor } from '../../Models/Proveedores/relacionesProveedor.js';

// Logs helper
import { registrarLog } from '../../Helpers/registrarLog.js';

const toNum = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

const round4 = (n) => Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;
// Instancia de sequelize
const sequelize = CompraModel.sequelize;

const getUsuarioId = (req) =>
  Number(
    req.body?.usuario_log_id ??
      req.query?.usuario_log_id ??
      req.user?.id ??
      null
  ) || null;
/* ------------------------------------------------------
 * Helpers de cálculo
 * ------------------------------------------------------ */
function calcularTotalLinea({
  cantidad,
  costo_unit_neto,
  alicuota_iva = 21,
  inc_iva = 0,
  descuento_porcentaje = 0,
  otros_impuestos = 0
}) {
  const qty = Math.max(1, parseInt(cantidad, 10));
  const costo = toNum(costo_unit_neto);
  const desc = toNum(descuento_porcentaje);
  const base = qty * costo * (1 - desc / 100);
  const iva = inc_iva ? 0 : base * (toNum(alicuota_iva) / 100);
  const otros = toNum(otros_impuestos);
  return round2(base + iva + otros);
}

// ------------------------------------------------------
// Helper: recomputarTotales(detalles, impuestos)
//  - Detalles: calcula neto + IVA + otros_impuestos de cada línea
//  - Impuestos: usa compras_impuestos (IVA config / percep / retenc)
// ------------------------------------------------------
const recomputarTotales = (detalles = [], impuestos = [], opciones = {}) => {
  const {
    percepciones_manual = 0, // para modo legacy sin compras_impuestos
    retenciones_manual = 0
  } = opciones || {};

  let subtotal_neto = 0;
  let iva_total = 0;
  let otros_det_impuestos = 0; // suma de otros_impuestos por línea

  // ===== 1) Recorrer DETALLES =====
  for (const d of detalles) {
    const cant = toNum(d.cantidad, 0);
    const aliIva = toNum(d.alicuota_iva, 0); // ej: 21
    const descPct = toNum(d.descuento_porcentaje, 0); // ej: 10
    const otrosImpLinea = toNum(d.otros_impuestos, 0); // total por línea
    const incIva = !!d.inc_iva; // boolean
    const costoUnit = toNum(d.costo_unit_neto, 0); // valor que viene del form

    if (cant <= 0 || costoUnit < 0) continue;

    let netoUnit = 0;
    let ivaUnit = 0;

    // 1a) Separar neto / IVA según inc_iva (igual que en el modal)
    if (incIva && aliIva > 0) {
      const factor = 1 + aliIva / 100;
      netoUnit = costoUnit / factor;
      ivaUnit = costoUnit - netoUnit;
    } else {
      netoUnit = costoUnit;
      ivaUnit = (costoUnit * aliIva) / 100;
    }

    // 1b) Aplicar descuento proporcional
    if (descPct > 0 && descPct < 100) {
      const factorDesc = (100 - descPct) / 100;
      netoUnit *= factorDesc;
      ivaUnit *= factorDesc;
    }

    // 1c) Acumular por línea
    const netoLinea = netoUnit * cant;
    const ivaLinea = ivaUnit * cant;

    subtotal_neto += netoLinea;
    iva_total += ivaLinea;
    otros_det_impuestos += otrosImpLinea;

    // Si tu detalle tiene columna total_linea, la dejamos seteada
    d.total_linea = round2(netoLinea + ivaLinea + otrosImpLinea);
  }

  // Total de las líneas (lo mismo que s.total_detalles en el modal)
  const total_detalles = subtotal_neto + iva_total + otros_det_impuestos;

  // ===== 2) IMPUESTOS DE CABECERA (compras_impuestos) =====
  let percepciones_total = 0;
  let retenciones_total = 0;
  let otros_impuestos_config = 0; // IVA105, otros impuestos “globales”

  if (Array.isArray(impuestos) && impuestos.length) {
    for (const imp of impuestos) {
      const tipo = String(imp.tipo || '').toLowerCase();
      const monto = toNum(imp.monto, 0);

      if (tipo === 'percepcion') {
        percepciones_total += monto;
      } else if (tipo === 'retencion') {
        retenciones_total += monto;
      } else if (tipo === 'iva' || tipo === 'otro') {
        // IVA configurado (IVA105, etc) u otros impuestos globales
        otros_impuestos_config += monto;
      }
    }
  } else {
    // MODO LEGACY:
    // si todavía no mandás array de impuestos, usa lo que venga en el body
    percepciones_total = toNum(percepciones_manual, 0);
    retenciones_total = toNum(retenciones_manual, 0);
  }

  // ===== 3) Total de la COMPRA (exactamente como el modal) =====
  // total = total_detalles + otros_impuestos_config + percepciones - retenciones
  const total =
    total_detalles +
    otros_impuestos_config +
    percepciones_total -
    retenciones_total;

  return {
    subtotal_neto: round2(subtotal_neto),
    iva_total: round2(iva_total),
    percepciones_total: round2(percepciones_total),
    retenciones_total: round2(retenciones_total),
    total: round2(total)
  };
};

// Construye un SKU para la combinación producto+local+lugar+estado
const buildSkuForCompraStock = async (
  producto_id,
  local_id,
  lugar_id,
  estado_id,
  transaction
) => {
  const producto = await ProductosModel.findByPk(producto_id, { transaction });

  const baseSku = (producto?.codigo_sku || '').trim() || `SKU-${producto_id}`;

  const [local, lugar, estado] = await Promise.all([
    LocalesModel.findByPk(local_id, {
      attributes: ['codigo', 'nombre'],
      transaction
    }),
    LugaresModel.findByPk(lugar_id, { attributes: ['nombre'], transaction }),
    EstadosModel.findByPk(estado_id, { attributes: ['nombre'], transaction })
  ]);

  const parts = [baseSku];

  if (local?.codigo) parts.push(local.codigo);
  else if (local?.nombre) parts.push(local.nombre);

  if (lugar?.nombre) parts.push(lugar.nombre);
  if (estado?.nombre) parts.push(estado.nombre);

  return parts.join('-').replace(/\s+/g, '').toUpperCase().slice(0, 60); // por si acaso
};

/* ------------------------------------------------------
 * Listar / Obtener compras
 * ------------------------------------------------------ */
export const OBRS_Compras_CTS = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      q,
      proveedor_id,
      estado,
      desde, // YYYY-MM-DD
      hasta, // YYYY-MM-DD
      orderBy = 'created_at',
      orderDir = 'DESC'
    } = req.query;

    const whereCompra = {};
    if (proveedor_id) whereCompra.proveedor_id = proveedor_id;
    if (estado) whereCompra.estado = estado;
    if (desde || hasta) {
      whereCompra.created_at = {};
      if (desde) whereCompra.created_at[Op.gte] = new Date(`${desde}T00:00:00`);
      if (hasta) whereCompra.created_at[Op.lte] = new Date(`${hasta}T23:59:59`);
    }

    if (q) {
      whereCompra[Op.or] = [
        { observaciones: { [Op.like]: `%${q}%` } },
        { nro_comprobante: { [Op.like]: `%${q}%` } }
      ];
    }

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await CompraModel.findAndCountAll({
      where: whereCompra,
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor',
          attributes: ['id', 'razon_social', 'nombre_fantasia', 'cuit'],
          required: false // no filtra si el proveedor no existe
        },
        {
          model: CompraDetalleModel,
          as: 'detalles',
          attributes: ['id', 'producto_id', 'cantidad', 'total_linea']
        },
        {
          model: CompraImpuestoModel,
          as: 'impuestos',
          attributes: ['id', 'tipo', 'codigo', 'monto']
        },
        { model: CxpProveedorModel, as: 'cxp' }
      ],
      limit: Number(pageSize),
      offset,
      order: [[orderBy, orderDir]]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { page: Number(page), pageSize: Number(pageSize), total: count }
    });
  } catch (err) {
    console.error('[OBRS_Compras_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando compras' });
  }
};

export const OBR_Compra_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await CompraModel.findByPk(id, {
      include: [
        { model: CompraDetalleModel, as: 'detalles' },
        { model: CompraImpuestoModel, as: 'impuestos' },
        { model: CxpProveedorModel, as: 'cxp' }
      ]
    });
    if (!row)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    res.json({ ok: true, data: row });
  } catch (err) {
    console.error('[OBR_Compra_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo compra' });
  }
};

/* ------------------------------------------------------
 * Crear / Actualizar BORRADOR (totales server-side)
 * ------------------------------------------------------ */
export const CR_Compra_CrearBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const {
      canal = 'C1',
      proveedor_id,
      local_id = null,
      fecha = new Date(),
      condicion_compra = 'cuenta_corriente',
      fecha_vencimiento = null,
      moneda = 'ARS',
      tipo_comprobante = 'FA',
      punto_venta = null,
      nro_comprobante = null,
      observaciones = null,
      detalles = [],
      impuestos = [],
      // nuevos (por si viene del formulario viejo sin tabla de impuestos)
      percepciones_total: percepManual = 0,
      retenciones_total: retManual = 0
    } = req.body || {};

    // === Validación MANUAL de punto_venta antes de tocar Sequelize ===
    let pv = punto_venta;
    if (pv !== null && pv !== undefined && String(pv).trim() !== '') {
      const rawPv = String(pv).replace(/\D/g, ''); // solo dígitos

      if (rawPv.length === 0) {
        // todo eran caracteres no numéricos → lo tomamos como null
        pv = null;
      } else if (rawPv.length > 4) {
        await t.rollback();

        // 🔊 LOG CLARO EN BACKEND
        console.warn(
          '[CR_Compra_CrearBorrador_CTS] Punto de venta fuera de rango',
          {
            valor_recibido: punto_venta,
            rawPv,
            proveedor_id,
            tipo_comprobante
          }
        );

        return res.status(400).json({
          ok: false,
          error: 'Punto de venta inválido.',
          detalle:
            'El punto de venta debe tener como máximo 4 dígitos (por ejemplo 1, 12, 101, 1200).',
          valor_recibido: punto_venta
        });
      } else {
        pv = Number(rawPv);
      }
    } else {
      pv = null;
    }

    // === Validación / normalización opcional de nro_comprobante ===
    let nro = nro_comprobante;
    if (nro !== null && nro !== undefined && String(nro).trim() !== '') {
      const rawNro = String(nro).replace(/\D/g, '');
      if (rawNro.length === 0) {
        nro = null;
      } else if (rawNro.length > 13) {
        await t.rollback();

        console.warn(
          '[CR_Compra_CrearBorrador_CTS] Número de comprobante fuera de rango',
          {
            valor_recibido: nro_comprobante,
            rawNro,
            proveedor_id,
            tipo_comprobante
          }
        );

        return res.status(400).json({
          ok: false,
          error: 'Número de comprobante inválido.',
          detalle: 'El número de comprobante es demasiado largo.',
          valor_recibido: nro_comprobante
        });
      } else {
        nro = Number(rawNro);
      }
    } else {
      nro = null;
    }

    // Validaciones de negocio básicas
    if (!proveedor_id)
      return res.status(400).json({ ok: false, error: 'Falta proveedor_id' });
    if (!Array.isArray(detalles) || detalles.length === 0)
      return res.status(400).json({ ok: false, error: 'Faltan detalles' });

    const tot = recomputarTotales(detalles, impuestos, {
      percepciones_manual: percepManual,
      retenciones_manual: retManual
    });

    const compra = await CompraModel.create(
      {
        canal,
        proveedor_id,
        local_id,
        fecha,
        condicion_compra,
        fecha_vencimiento,
        moneda,
        tipo_comprobante,
        punto_venta: pv, // ya normalizado
        nro_comprobante: nro, // ya normalizado
        subtotal_neto: tot.subtotal_neto,
        iva_total: tot.iva_total,
        percepciones_total: tot.percepciones_total,
        retenciones_total: tot.retenciones_total,
        total: tot.total,
        observaciones,
        estado: 'borrador',
        created_by: usuario_id
      },
      { transaction: t }
    );

    for (const d of detalles) d.compra_id = compra.id;
    for (const i of impuestos) i.compra_id = compra.id;

    if (detalles?.length)
      await CompraDetalleModel.bulkCreate(detalles, { transaction: t });
    if (impuestos?.length)
      await CompraImpuestoModel.bulkCreate(impuestos, { transaction: t });

    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: moneda || 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const pvLog =
      pv != null && pv !== undefined ? String(pv).padStart(4, '0') : 'S/PV';

    const nroLog =
      nro != null && nro !== undefined ? String(nro).padStart(8, '0') : 'S/NRO';

    const logDescripcion = [
      'creó un borrador de compra',
      `ID=${compra.id}`,
      `ProveedorID=${proveedor_id}`,
      `Canal=${canal}`,
      `Condición=${condicion_compra}`,
      `Comprobante=${tipo_comprobante} ${pvLog}-${nroLog}`,
      `Total=${formatCurrency(tot.total)}`,
      `Ítems=${detalles?.length || 0}`,
      `Impuestos=${impuestos?.length || 0}`
    ].join(' | ');

    await registrarLog(req, 'compras', 'crear', logDescripcion, usuario_id);

    await t.commit();
    return res.json({ ok: true, compra });
  } catch (err) {
    // por las dudas, si la transacción sigue abierta, la cerramos
    if (!t.finished) {
      await t.rollback();
    }

    if (err.name === 'SequelizeValidationError') {
      const detalles = err.errors?.map((e) => ({
        campo: e.path,
        mensaje: e.message,
        valor: e.value
      }));

      console.warn(
        '[CR_Compra_CrearBorrador_CTS] Validación de compra:',
        JSON.stringify(detalles)
      );

      return res.status(400).json({
        ok: false,
        error: 'Validación de datos de la compra.',
        detalles,
        sugerencia:
          'Revisá los campos marcados: algunos valores no son válidos (punto de venta, importes, etc.).'
      });
    }

    if (err?.original?.code === 'ER_DUP_ENTRY') {
      console.warn(
        '[CR_Compra_CrearBorrador_CTS] Documento duplicado:',
        err?.original?.sqlMessage
      );
      return res.status(409).json({
        ok: false,
        error: 'Documento de compra duplicado para ese proveedor (tipo/pv/nro)',
        sugerencia:
          'Revisá que el tipo, punto de venta y número no estén ya cargados para este proveedor.'
      });
    }

    console.error(
      '[CR_Compra_CrearBorrador_CTS] Error inesperado:',
      err?.message
    );
    return res.status(500).json({
      ok: false,
      error: 'Error creando compra. Intentalo nuevamente.'
    });
  }
};

export const UR_Compra_ActualizarBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const { id } = req.params;

    const {
      canal,
      proveedor_id,
      local_id,
      fecha,
      condicion_compra,
      fecha_vencimiento,
      moneda,
      tipo_comprobante,
      punto_venta,
      nro_comprobante,
      observaciones,
      detalles = [],
      impuestos = [],
      percepciones_total: percepManual = 0,
      retenciones_total: retManual = 0
    } = req.body || {};

    // ===== Buscar compra con lock =====
    const compra = await CompraModel.findByPk(id, {
      include: [
        { model: CompraDetalleModel, as: 'detalles' },
        { model: CompraImpuestoModel, as: 'impuestos' }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!compra) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    }

    if (compra.estado !== 'borrador') {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede editar una compra en borrador'
      });
    }

    // ===== Proveedor final (nuevo o el que ya tiene) =====
    const proveedorFinal = proveedor_id ?? compra.proveedor_id;
    if (!proveedorFinal) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Falta proveedor_id' });
    }

    // ===== Validación detalles =====
    if (!Array.isArray(detalles) || detalles.length === 0) {
      await t.rollback();
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan detalles de la compra' });
    }

    // ===== Validación / normalización de punto_venta (igual que en CR) =====
    // Punto de partida: el valor actual en BD
    let pv = compra.punto_venta;

    // Solo procesamos si el campo vino en el body (permite no tocarlo si no lo mandan)
    if (Object.prototype.hasOwnProperty.call(req.body, 'punto_venta')) {
      const bodyPv = punto_venta;

      if (
        bodyPv !== null &&
        bodyPv !== undefined &&
        String(bodyPv).trim() !== ''
      ) {
        const rawPv = String(bodyPv).replace(/\D/g, ''); // solo dígitos

        if (rawPv.length === 0) {
          pv = null;
        } else if (rawPv.length > 4) {
          await t.rollback();

          console.warn(
            '[UR_Compra_ActualizarBorrador_CTS] Punto de venta fuera de rango',
            {
              valor_recibido: bodyPv,
              rawPv,
              compra_id: compra.id,
              proveedor_id: proveedorFinal,
              tipo_comprobante: tipo_comprobante ?? compra.tipo_comprobante
            }
          );

          return res.status(400).json({
            ok: false,
            error: 'Punto de venta inválido.',
            detalle:
              'El punto de venta debe tener como máximo 4 dígitos (por ejemplo 1, 12, 101, 1200).',
            valor_recibido: bodyPv
          });
        } else {
          pv = Number(rawPv);
        }
      } else {
        // Si lo mandan vacío, lo consideramos null
        pv = null;
      }
    }
    // Si NO vino en el body, pv queda igual que compra.punto_venta

    // ===== Validación / normalización de nro_comprobante (igual que en CR) =====
    let nroFinal = compra.nro_comprobante;

    if (Object.prototype.hasOwnProperty.call(req.body, 'nro_comprobante')) {
      const bodyNro = nro_comprobante;

      if (
        bodyNro !== null &&
        bodyNro !== undefined &&
        String(bodyNro).trim() !== ''
      ) {
        const rawNro = String(bodyNro).replace(/\D/g, '');

        if (rawNro.length === 0) {
          nroFinal = null;
        } else if (rawNro.length > 13) {
          await t.rollback();

          console.warn(
            '[UR_Compra_ActualizarBorrador_CTS] Número de comprobante fuera de rango',
            {
              valor_recibido: bodyNro,
              rawNro,
              compra_id: compra.id,
              proveedor_id: proveedorFinal,
              tipo_comprobante: tipo_comprobante ?? compra.tipo_comprobante
            }
          );

          return res.status(400).json({
            ok: false,
            error: 'Número de comprobante inválido.',
            detalle: 'El número de comprobante es demasiado largo.',
            valor_recibido: bodyNro
          });
        } else {
          nroFinal = Number(rawNro);
        }
      } else {
        nroFinal = null;
      }
    }

    // ===== Recalcular totales con la misma lógica que el CR =====
    const tot = recomputarTotales(detalles, impuestos, {
      percepciones_manual: percepManual,
      retenciones_manual: retManual
    });

    // ===== Actualizar cabecera =====
    Object.assign(compra, {
      canal: canal ?? compra.canal,
      proveedor_id: proveedorFinal,
      local_id: local_id ?? compra.local_id,
      fecha: fecha ?? compra.fecha,
      condicion_compra: condicion_compra ?? compra.condicion_compra,
      fecha_vencimiento: fecha_vencimiento ?? compra.fecha_vencimiento,
      moneda: moneda ?? compra.moneda,
      tipo_comprobante: tipo_comprobante ?? compra.tipo_comprobante,
      punto_venta: pv, // ⬅️ normalizado
      nro_comprobante: nroFinal, // ⬅️ normalizado
      subtotal_neto: tot.subtotal_neto,
      iva_total: tot.iva_total,
      percepciones_total: tot.percepciones_total,
      retenciones_total: tot.retenciones_total,
      total: tot.total,
      observaciones: observaciones ?? compra.observaciones,
      updated_by: usuario_id
    });

    await compra.save({ transaction: t });

    // ===== Reemplazar detalles e impuestos =====
    await CompraDetalleModel.destroy({
      where: { compra_id: compra.id },
      transaction: t
    });
    await CompraImpuestoModel.destroy({
      where: { compra_id: compra.id },
      transaction: t
    });

    for (const d of detalles) d.compra_id = compra.id;
    for (const i of impuestos) i.compra_id = compra.id;

    if (detalles?.length) {
      await CompraDetalleModel.bulkCreate(detalles, { transaction: t });
    }
    if (impuestos?.length) {
      await CompraImpuestoModel.bulkCreate(impuestos, { transaction: t });
    }

    // ===== Log más descriptivo (igual estilo que en CR) =====
    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: compra.moneda || 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const pvLog =
      compra.punto_venta != null && compra.punto_venta !== undefined
        ? String(compra.punto_venta).padStart(4, '0')
        : 'S/PV';

    const nroLog =
      compra.nro_comprobante != null && compra.nro_comprobante !== undefined
        ? String(compra.nro_comprobante).padStart(8, '0')
        : 'S/NRO';

    const logDescripcion = [
      'actualizó borrador de compra',
      `ID=${compra.id}`,
      `ProveedorID=${proveedorFinal}`,
      `Canal=${compra.canal}`,
      `Condición=${compra.condicion_compra}`,
      `Comprobante=${compra.tipo_comprobante} ${pvLog}-${nroLog}`,
      `Total=${formatCurrency(tot.total)}`,
      `Ítems=${detalles?.length || 0}`,
      `Impuestos=${impuestos?.length || 0}`
    ].join(' | ');

    await registrarLog(
      req,
      'compras',
      'actualizar',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true, compra });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }

    // Validaciones de modelo (incluye max/min de punto_venta/nro_comprobante, totales, etc.)
    if (err.name === 'SequelizeValidationError') {
      const detalles = err.errors?.map((e) => ({
        campo: e.path,
        mensaje: e.message,
        valor: e.value
      }));

      console.warn(
        '[UR_Compra_ActualizarBorrador_CTS] Validación de compra:',
        JSON.stringify(detalles)
      );

      return res.status(400).json({
        ok: false,
        error: 'Validación de datos de la compra.',
        detalles,
        sugerencia:
          'Revisá los campos marcados: algunos valores no son válidos (punto de venta, importes, etc.).'
      });
    }

    // Unique de proveedor + tipo_comprobante + punto_venta + nro_comprobante
    if (err?.original?.code === 'ER_DUP_ENTRY') {
      console.warn(
        '[UR_Compra_ActualizarBorrador_CTS] Documento duplicado:',
        err?.original?.sqlMessage
      );
      return res.status(409).json({
        ok: false,
        error: 'Documento de compra duplicado para ese proveedor (tipo/pv/nro)',
        sugerencia:
          'Revisá que el tipo de comprobante, punto de venta y número no estén ya cargados para este proveedor.'
      });
    }

    console.error(
      '[UR_Compra_ActualizarBorrador_CTS] Error inesperado:',
      err?.message
    );
    return res
      .status(500)
      .json({ ok: false, error: 'Error actualizando compra' });
  }
};

/* ------------------------------------------------------
 * Confirmar compra (impacta CxP + StockMovimientos + opcional Stock + proyección Teso)
 * ------------------------------------------------------ */
export const CR_Compra_Confirmar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;

    // override destino de stock (opcional)
    const {
      lugar_id = null,
      estado_id = null,
      local_id: localOverride = null
    } = req.body || {};

    const compra = await CompraModel.findByPk(id, {
      include: [
        { model: CompraDetalleModel, as: 'detalles' },
        { model: CompraImpuestoModel, as: 'impuestos' }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede confirmar una compra en borrador'
      });

    // Calcular vencimiento por días de crédito si falta
    if (!compra.fecha_vencimiento && ProveedoresModel) {
      const prov = await ProveedoresModel.findByPk(compra.proveedor_id, {
        transaction: t
      });
      const dias = Number(prov?.dias_credito || 0);
      if (dias > 0) {
        const venc = new Date(compra.fecha || new Date());
        venc.setDate(venc.getDate() + dias);
        compra.fecha_vencimiento = venc;
      }
    }

    // Crear/actualizar CxP (una fila por compra)
    let cxp = await CxpProveedorModel.findOne({
      where: { compra_id: compra.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp) {
      cxp = await CxpProveedorModel.create(
        {
          compra_id: compra.id,
          proveedor_id: compra.proveedor_id,
          canal: compra.canal,
          fecha_emision: new Date(compra.fecha),
          fecha_vencimiento: compra.fecha_vencimiento || new Date(compra.fecha),
          monto_total: compra.total,
          saldo: compra.total,
          estado: 'pendiente'
        },
        { transaction: t }
      );
    } else {
      cxp.monto_total = compra.total;
      cxp.saldo = compra.total;
      cxp.fecha_vencimiento = compra.fecha_vencimiento || cxp.fecha_vencimiento;
      await cxp.save({ transaction: t });
    }

    // Impacto en StockMovimientos (+ upsert saldo si destino completo)
    const finalLocalId = localOverride ?? compra.local_id;

    let movimientos = [];
    if (finalLocalId) {
      for (const d of compra.detalles) {
        const mov = await StockMovimientoModel.create(
          {
            producto_id: d.producto_id,
            local_id: finalLocalId,
            lugar_id: lugar_id ?? null,
            estado_id: estado_id ?? null,
            tipo: 'COMPRA',
            delta: Number(d.cantidad) || 0,
            costo_unit_neto: d.costo_unit_neto,
            moneda: compra.moneda,
            ref_tabla: 'compras',
            ref_id: compra.id,
            usuario_id,
            notas: `Compra confirmada: ${compra.tipo_comprobante || 'FA'} ${
              compra.punto_venta || ''
            }-${compra.nro_comprobante || ''}`
          },
          { transaction: t }
        );
        movimientos.push(mov);

        // upsert saldo sólo si destino definido (UNIQUE incluye lugar_id, estado_id)
        // upsert saldo sólo si destino definido (UNIQUE incluye lugar_id, estado_id)
        if (
          StockModel &&
          d.producto_id &&
          lugar_id !== null &&
          estado_id !== null
        ) {
          const deltaCant = Number(d.cantidad) || 0;

          // 1) Armamos SKU para esta combinación
          const sku = await buildSkuForCompraStock(
            d.producto_id,
            finalLocalId,
            lugar_id,
            estado_id,
            t
          );

          // 2) Insert / update con SKU
          await StockModel.sequelize.query(
            `INSERT INTO stock (
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        cantidad,
        codigo_sku
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cantidad   = GREATEST(0, cantidad + VALUES(cantidad)),
       -- si ya existía registro pero sin SKU, lo completamos ahora
       codigo_sku = IF(
         codigo_sku IS NULL OR codigo_sku = '',
         VALUES(codigo_sku),
         codigo_sku
       )`,
            {
              replacements: [
                d.producto_id,
                finalLocalId,
                lugar_id,
                estado_id,
                deltaCant,
                sku
              ],
              transaction: t
            }
          );
        }
      }
    }

    compra.estado = 'confirmada';
    await compra.save({ transaction: t });

    // Proyección en Tesorería (egreso futuro)
    let tesoFlujo = null;
    if (TesoFlujoModel) {
      tesoFlujo = await TesoFlujoModel.create(
        {
          origen_tipo: 'compra',
          origen_id: compra.id,
          fecha: cxp.fecha_vencimiento,
          signo: 'egreso',
          monto: compra.total,
          descripcion: `CxP Compra ${compra.tipo_comprobante} ${
            compra.punto_venta || ''
          }-${compra.nro_comprobante || ''}`
        },
        { transaction: t }
      );

      // 🔊 LOG específico de Tesorería
      const tesoLogDesc = [
        'creó proyección de tesorería para compra',
        `CompraID=${compra.id}`,
        `TesoFlujoID=${tesoFlujo.id}`,
        `Fecha=${new Date(tesoFlujo.fecha).toLocaleDateString('es-AR')}`,
        `Signo=${tesoFlujo.signo}`,
        `Monto=${tesoFlujo.monto} ${compra.moneda || 'ARS'}`
      ].join(' | ');

      await registrarLog(
        req,
        'teso_flujo',
        'crear',
        tesoLogDesc,
        usuario_id
      ).catch(() => {});
    }

    try {
      await onCompraConfirmada_Proveedor(compra, { transaction: t });
    } catch (e) {
      console.warn(
        '[CR_Compra_Confirmar_CTS] onCompraConfirmada_Proveedor warning:',
        e.message
      );
    }
    // ============================
    // LOG DETALLADO DE CONFIRMACIÓN
    // ============================
    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: compra.moneda || 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const pvLog =
      compra.punto_venta != null && compra.punto_venta !== undefined
        ? String(compra.punto_venta).padStart(4, '0')
        : 'S/PV';

    const nroLog =
      compra.nro_comprobante != null && compra.nro_comprobante !== undefined
        ? String(compra.nro_comprobante).padStart(8, '0')
        : 'S/NRO';

    const itemsCount = compra.detalles?.length || 0;
    const totalUnidades = (compra.detalles || []).reduce(
      (acc, d) => acc + Number(d.cantidad || 0),
      0
    );
    const productosDistintos = new Set(
      (compra.detalles || []).map((d) => d.producto_id)
    ).size;

    const destinoStock = finalLocalId
      ? `Local=${finalLocalId}, Lugar=${lugar_id ?? 'S/Lugar'}, Estado=${
          estado_id ?? 'S/Estado'
        }`
      : 'Sin impacto en stock (sin local_id)';

    const stockMsg = movimientos.length
      ? `StockMovimientos=${movimientos.length}, Unidades=${totalUnidades}, ProductosDistintos=${productosDistintos}, Destino=[${destinoStock}]`
      : destinoStock;

    const cxpMsg = cxp
      ? `CxP=ID=${cxp.id}, Monto=${formatCurrency(
          cxp.monto_total
        )}, Saldo=${formatCurrency(cxp.saldo)}, Estado=${cxp.estado}`
      : 'CxP=no generado';

    let tesoMsg = 'TesoFlujo=no aplicado';
    if (tesoFlujo && tesoFlujo.fecha) {
      const f = new Date(tesoFlujo.fecha);
      tesoMsg = `TesoFlujo: egreso proyectado el ${f.toLocaleDateString(
        'es-AR'
      )} (TesoFlujoID=${tesoFlujo.id})`;
    } else if (TesoFlujoModel && cxp?.fecha_vencimiento) {
      const f = new Date(cxp.fecha_vencimiento);
      tesoMsg = `TesoFlujo: egreso proyectado el ${f.toLocaleDateString(
        'es-AR'
      )}`;
    }
    const logDescripcion = [
      'confirmó la compra', // se concatena con: El usuario "X"
      `ID=${compra.id}`,
      `ProveedorID=${compra.proveedor_id}`,
      `Canal=${compra.canal}`,
      `Condición=${compra.condicion_compra}`,
      `Comprobante=${compra.tipo_comprobante} ${pvLog}-${nroLog}`,
      `Total=${formatCurrency(compra.total)}`,
      `Ítems=${itemsCount}`,
      cxpMsg,
      stockMsg,
      tesoMsg
    ].join(' | ');

    await registrarLog(
      req,
      'compras',
      'confirmar',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({
      ok: true,
      compra,
      cxp,
      movimientos,
      aviso: !finalLocalId
        ? 'No se impactó stock (falta local_id). Se registró solo CxP.'
        : lugar_id === null || estado_id === null
        ? 'StockMovimientos creados. Upsert en stock omitido por destino incompleto (lugar/estado).'
        : undefined
    });
  } catch (err) {
    await t.rollback();
    console.error('[CR_Compra_Confirmar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error confirmando compra' });
  }
};

// ------------------------------------------------------
// Anular compra (validaciones y reversa de stock)
// ------------------------------------------------------
export const CR_Compra_Anular_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  let tesoDeleted = 0; // <-- 1) declarar fuera para usarlo en la respuesta
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;

    const compra = await CompraModel.findByPk(id, {
      include: [
        { model: CompraDetalleModel, as: 'detalles' },
        { model: CxpProveedorModel, as: 'cxp' }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!compra) {
      await t.rollback(); // <-- 3) rollback en early return
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    }
    if (compra.estado !== 'confirmada') {
      await t.rollback(); // <-- 3) rollback en early return
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede anular una compra confirmada'
      });
    }

    // Verificar pagos aplicados
    const pagosAplicados = await sequelize.query(
      `SELECT COALESCE(SUM(ppd.monto_aplicado),0) AS aplicado
       FROM pago_proveedor_detalle ppd
       JOIN pagos_proveedor pp ON pp.id = ppd.pago_id
       WHERE ppd.compra_id = ?`,
      { replacements: [compra.id], type: QueryTypes.SELECT, transaction: t }
    );
    const aplicado = toNum(pagosAplicados?.[0]?.aplicado);
    if (aplicado > 0) {
      await t.rollback(); // <-- 3) rollback en early return
      return res.status(400).json({
        ok: false,
        error:
          'La compra tiene pagos aplicados. Generar Nota de Crédito o revertir imputaciones antes de anular.'
      });
    }

    // Reversa de stock_movimientos
    const movs = await StockMovimientoModel.findAll({
      where: { ref_tabla: 'compras', ref_id: compra.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    const reversas = [];
    for (const m of movs) {
      const rev = await StockMovimientoModel.create(
        {
          producto_id: m.producto_id,
          local_id: m.local_id,
          lugar_id: m.lugar_id,
          estado_id: m.estado_id,
          tipo: 'AJUSTE',
          delta: -Math.abs(m.delta),
          costo_unit_neto: m.costo_unit_neto,
          moneda: m.moneda,
          ref_tabla: 'compras',
          ref_id: compra.id,
          usuario_id,
          notas: `Reversa por anulación de compra #${compra.id}`
        },
        { transaction: t }
      );
      reversas.push(rev);

      if (
        StockModel &&
        m.local_id &&
        m.lugar_id !== null &&
        m.estado_id !== null
      ) {
        await StockModel.sequelize.query(
          `INSERT INTO stock (producto_id, local_id, lugar_id, estado_id, cantidad, codigo_sku)
           VALUES (?, ?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE cantidad = GREATEST(0, cantidad + VALUES(cantidad))`,
          {
            replacements: [
              m.producto_id,
              m.local_id,
              m.lugar_id,
              m.estado_id,
              -Math.abs(m.delta)
            ],
            transaction: t
          }
        );
      }
    }

    compra.estado = 'anulada';
    await compra.save({ transaction: t });

    const cxp = await CxpProveedorModel.findOne({
      where: { compra_id: compra.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (cxp) {
      cxp.saldo = 0;
      cxp.estado = 'cancelado';
      await cxp.save({ transaction: t });
    }

    // Eliminar proyección de Tesorería
    if (TesoFlujoModel) {
      tesoDeleted = await TesoFlujoModel.destroy({
        where: {
          origen_id: compra.id,
          origen_tipo: { [Op.in]: ['compra', 'otro'] } // dejar solo 'compra' cuando migres
        },
        transaction: t
      });

      const tesoLogDesc = [
        'eliminó proyección de tesorería asociada a compra',
        `CompraID=${compra.id}`,
        `RegistrosEliminados=${tesoDeleted}`
      ].join(' | ');

      await registrarLog(
        req,
        'teso_flujo',
        'eliminar',
        tesoLogDesc,
        usuario_id
      ).catch(() => {});
    }

    // ============================
    // LOG DETALLADO DE ANULACIÓN
    // ============================
    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: compra.moneda || 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const pvLog =
      compra.punto_venta != null && compra.punto_venta !== undefined
        ? String(compra.punto_venta).padStart(4, '0')
        : 'S/PV';

    const nroLog =
      compra.nro_comprobante != null && compra.nro_comprobante !== undefined
        ? String(compra.nro_comprobante).padStart(8, '0')
        : 'S/NRO';

    const itemsCount = compra.detalles?.length || 0;

    // Stock: métricas de reversa
    const totalUnidadesOriginales = (movs || []).reduce(
      (acc, m) => acc + Math.abs(Number(m.delta || 0)),
      0
    );
    const totalUnidadesReversadas = (reversas || []).reduce(
      (acc, r) => acc + Math.abs(Number(r.delta || 0)),
      0
    );
    const productosAfectados = new Set((movs || []).map((m) => m.producto_id))
      .size;
    const localesAfectados = Array.from(
      new Set((movs || []).map((m) => m.local_id).filter(Boolean))
    );

    const stockMsg = movs.length
      ? `Stock: MovsOriginales=${movs.length}, Reversas=${
          reversas.length
        }, UnidadesOriginales=${totalUnidadesOriginales}, UnidadesReversadas=${totalUnidadesReversadas}, ProductosAfectados=${productosAfectados}, Locales=[${
          localesAfectados.join(', ') || 'S/Local'
        }]`
      : 'Stock: no había movimientos asociados a la compra';

    // CxP después de la anulación
    const cxpMsg = cxp
      ? `CxP=ID=${cxp.id}, MontoTotal=${formatCurrency(
          cxp.monto_total
        )}, Saldo=${formatCurrency(cxp.saldo)}, Estado=${cxp.estado}`
      : 'CxP: no existía registro asociado';

    const logDescripcion = [
      'anuló la compra confirmada', // se concatena con: El usuario "X"
      `ID=${compra.id}`,
      `ProveedorID=${compra.proveedor_id}`,
      `Comprobante=${compra.tipo_comprobante} ${pvLog}-${nroLog}`,
      `Total=${formatCurrency(compra.total)}`,
      `Ítems=${itemsCount}`,
      cxpMsg,
      stockMsg,
      `TesoreriaProyeccionesEliminadas=${tesoDeleted}`
    ].join(' | ');

    await registrarLog(
      req,
      'compras',
      'anular',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit(); // <-- commit al final, sin nada que pueda tirar error luego

    // Armar respuesta *después* del commit, usando la var segura
    return res.json({
      ok: true,
      compra,
      reversas,
      teso_flujo_deleted: tesoDeleted
    });
  } catch (err) {
    // 2) rollback solo si la transacción sigue abierta
    if (!t.finished) {
      try {
        await t.rollback();
      } catch (_) {}
    }
    console.error('[CR_Compra_Anular_CTS] error:', err);
    return res.status(500).json({ ok: false, error: 'Error anulando compra' });
  }
};

/* ------------------------------------------------------
 * Eliminar compra (solo si está en borrador)
 * ------------------------------------------------------ */
export const ER_Compra_BorrarBorrador_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;

    const compra = await CompraModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    if (compra.estado !== 'borrador')
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede eliminar una compra en borrador'
      });

    await CompraDetalleModel.destroy({
      where: { compra_id: compra.id },
      transaction: t
    });
    await CompraImpuestoModel.destroy({
      where: { compra_id: compra.id },
      transaction: t
    });
    await compra.destroy({ transaction: t });

    await registrarLog(
      req,
      'compras',
      'eliminar',
      `compra_id=${id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    console.error('[ER_Compra_BorrarBorrador_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error eliminando compra' });
  }
};

/* ------------------------------------------------------
 * Export
 * ------------------------------------------------------ */
export default {
  OBRS_Compras_CTS,
  OBR_Compra_CTS,
  CR_Compra_CrearBorrador_CTS,
  UR_Compra_ActualizarBorrador_CTS,
  CR_Compra_Confirmar_CTS,
  CR_Compra_Anular_CTS,
  ER_Compra_BorrarBorrador_CTS
};
