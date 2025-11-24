/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para Pagos a Proveedores (cabecera + medios + aplicaciones a CxP).
 * - Crear pago con uno o múltiples medios (tabla pagos_proveedor_medios).
 * - Aplicar el pago a una o varias compras (pago_proveedor_detalle) validando saldos de CxP.
 * - Listar / obtener pagos con includes (proveedor, medios, aplicaciones).
 * - Anular / borrar con reglas (no permite si ya tiene aplicaciones; primero desaplicar).
 * - Proyección a Tesorería (teso_flujo: egreso) por cada medio.
 *
 * Invariantes clave:
 * - pago.monto_total > 0.
 * - Sum(medios.monto) == pago.monto_total (si se usa multi-medios) o se registra un medio único desde cabecera.
 * - Sum(aplicaciones.monto_aplicado) ≤ pago.monto_total y ≤ saldo de cada CxP involucrada.
 * - Al aplicar, se actualiza saldo/estado de CxP: saldo = max(total - aplicado, 0); estado ∈ {pendiente, parcial, cancelado}.
 *
 * Tema: Controladores - Compras/Tesorería
 * Capa: Backend
 */

import { Op, fn, col } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

// ===== Modelos =====
import { PagoProveedorModel } from '../../Models/Compras/MD_TB_PagosProveedor.js';
import { PagoProveedorDetalleModel } from '../../Models/Compras/MD_TB_PagoProveedorDetalle.js';
import { PagoProveedorMedioModel } from '../../Models/Compras/MD_TB_PagosProveedorMedios.js';

import { CxpProveedorModel } from '../../Models/Compras/MD_TB_CuentasPagarProveedores.js';
import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';
import { MediosPagoModel } from '../../Models/Ventas/MD_TB_MediosPago.js';
import { TesoFlujoModel } from '../../Models/Tesoreria/MD_TB_TesoFlujo.js';

import { CajaModel } from '../../Models/Ventas/MD_TB_Caja.js';
import { MovimientosCajaModel } from '../../Models/Ventas/MD_TB_MovimientosCaja.js';

import { registrarLog } from '../../Helpers/registrarLog.js';
import { getUid } from '../../Utils/getUid.js';

import { BancoMovimientoModel } from '../../Models/Bancos/MD_TB_BancoMovimientos.js';

// Models de cheques
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { ChequeMovimientoModel } from '../../Models/Cheques/MD_TB_ChequeMovimientos.js';

// Helper que ya usás en cheques (ajustá ruta)
// Borrar proyección de flujo del cheque
const deleteFlujoCheque = async ({ t, chequeId }) => {
  await TesoFlujoModel.destroy({
    where: { origen_tipo: 'cheque', origen_id: chequeId },
    transaction: t
  });
};
const sequelize = PagoProveedorModel.sequelize;

// ===== Helpers numéricos =====
const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

async function getAplicadoTotalPago(pago_id, t) {
  const row = await PagoProveedorDetalleModel.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('monto_aplicado')), 0), 'aplicado']
    ],
    where: { pago_id },
    transaction: t
  });
  return toNum(row?.get?.('aplicado') ?? 0);
}

async function getAplicadoTotalCompra(compra_id, t) {
  const row = await PagoProveedorDetalleModel.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('monto_aplicado')), 0), 'aplicado']
    ],
    where: { compra_id },
    transaction: t
  });
  return toNum(row?.get?.('aplicado') ?? 0);
}

async function syncSaldoYEstadoCxP(cxp, t) {
  const aplicado = await getAplicadoTotalCompra(cxp.compra_id, t);
  const nuevoSaldo = Math.max(0, round2(toNum(cxp.monto_total) - aplicado));
  cxp.saldo = nuevoSaldo;
  cxp.estado =
    nuevoSaldo <= 0 ? 'cancelado' : aplicado > 0 ? 'parcial' : 'pendiente';
  await cxp.save({ transaction: t });
  return { aplicado, saldo: cxp.saldo, estado: cxp.estado };
}

function inferOrigenTipoMedio(m) {
  // Mapea a teso_flujo.origen_tipo por claridad de reporting
  if (m?.cheque_id) return 'cheque';
  if (m?.banco_cuenta_id) return 'transferencia';
  if (m?.movimiento_caja_id) return 'efectivo';
  return 'otro';
}

const TIPOS_VALIDOS = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'DEPOSITO',
  'CHEQUE_RECIBIDO',
  'CHEQUE_EMITIDO',
  'AJUSTE',
  'OTRO'
];

function inferTipoOrigenDesdeCampos(m = {}) {
  // Si el front no envía tipo_origen, inferimos por campos
  if (m.cheque_id) return 'CHEQUE_EMITIDO'; // o 'CHEQUE_RECIBIDO' según tu flujo
  if (m.banco_cuenta_id) return 'TRANSFERENCIA'; // o 'DEPOSITO' si usás ese caso
  if (m.movimiento_caja_id) return 'EFECTIVO';
  return 'OTRO';
}

function normalizarMedio(m) {
  const tipo = String(m?.tipo_origen ?? m?.tipo ?? '')
    .toUpperCase()
    .trim();

  const tipo_origen = TIPOS_VALIDOS.includes(tipo)
    ? tipo
    : inferTipoOrigenDesdeCampos(m);

  return {
    tipo_origen,
    medio_pago_id: m?.medio_pago_id ?? null,
    banco_cuenta_id: m?.banco_cuenta_id ?? null,
    cheque_id: m?.cheque_id ?? null,
    movimiento_caja_id: m?.movimiento_caja_id ?? null,
    monto: round2(m?.monto),
    observaciones: m?.observaciones ?? null
  };
}

/* =====================================================
 * Listar pagos
 * ===================================================== */
/* =====================================================
 * Listar pagos
 * ===================================================== */
export const OBRS_PagosProv_CTS = async (req, res) => {
  try {
    const {
      q, // proveedor RS/CUIT
      proveedor_id,
      medio_pago_id,
      desde, // YYYY-MM-DD
      hasta, // YYYY-MM-DD
      page = 1,
      pageSize = 20,
      orderBy = 'fecha',
      orderDir = 'DESC'
    } = req.query || {};

    const where = {};

    if (proveedor_id) {
      where.proveedor_id = Number(proveedor_id);
    }

    // Sólo filtra por medio_pago_id en cabecera si NO estás usando multi-medios
    if (medio_pago_id) {
      where.medio_pago_id = Number(medio_pago_id);
    }

    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = new Date(`${desde}T00:00:00`);
      if (hasta) where.fecha[Op.lte] = new Date(`${hasta}T23:59:59`);
    }

    const include = [
      {
        model: ProveedoresModel,
        as: 'proveedor',
        attributes: ['id', 'razon_social', 'cuit']
      },
      { model: PagoProveedorMedioModel, as: 'medios' },
      { model: PagoProveedorDetalleModel, as: 'aplicaciones' }
    ];

    if (q && String(q).trim()) {
      include[0].where = {
        [Op.or]: [
          { razon_social: { [Op.like]: `%${q}%` } },
          { cuit: { [Op.like]: `%${q}%` } }
        ]
      };
    }

    const pageNum = Number(page) || 1;
    const pageSizeNum = Number(pageSize) || 20;
    const offset = (pageNum - 1) * pageSizeNum;

    const { rows, count } = await PagoProveedorModel.findAndCountAll({
      where,
      include,
      limit: pageSizeNum,
      offset,
      order: [[orderBy, orderDir]]
    });

    // ===== Agregados: aplicado_total, disponible y KPIs de página =====
    const plainRows = rows.map((r) => r.toJSON());

    const data = plainRows.map((p) => {
      const aplicado_total = round2(
        (p.aplicaciones || []).reduce(
          (acc, a) => acc + toNum(a.monto_aplicado),
          0
        )
      );

      const monto_total_num = round2(toNum(p.monto_total));
      const disponible = round2(monto_total_num - aplicado_total);

      return {
        ...p,
        // numéricos “amigables” para el front
        monto_total_num,
        aplicado_total,
        disponible
      };
    });

    const totalPagadoPagina = round2(
      data.reduce((acc, p) => acc + toNum(p.monto_total_num), 0)
    );

    const totalDisponiblePagina = round2(
      data.reduce((acc, p) => acc + toNum(p.disponible), 0)
    );

    return res.json({
      ok: true,
      data,
      meta: {
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPagadoPagina,
        totalDisponiblePagina
      }
    });
  } catch (err) {
    console.error('[OBRS_PagosProv_CTS] error:', err);
    return res.status(500).json({ ok: false, error: 'Error listando pagos' });
  }
};

/* =====================================================
 * Obtener pago por id
 * ===================================================== */
export const OBR_PagoProv_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const pago = await PagoProveedorModel.findByPk(id, {
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor',
          attributes: ['id', 'razon_social', 'cuit']
        },
        { model: PagoProveedorMedioModel, as: 'medios' },
        {
          model: PagoProveedorDetalleModel,
          as: 'aplicaciones',
          include: [
            {
              model: CompraModel,
              as: 'compra',
              attributes: [
                'id',
                'tipo_comprobante',
                'punto_venta',
                'nro_comprobante',
                'fecha'
              ]
            }
          ]
        }
      ]
    });
    if (!pago)
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });
    res.json({ ok: true, data: pago });
  } catch (err) {
    console.error('[OBR_PagoProv_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo pago' });
  }
};

/* =====================================================
 * Crear pago (con multi-medios y/o aplicaciones)
 * Body esperado:
 * {
 *   proveedor_id, canal?, fecha?, monto_total, observaciones?,
 *   medio_pago_id?, banco_cuenta_id?, cheque_id?, movimiento_caja_id?, // modo cabecera simple
 *   medios?: [{ medio_pago_id, monto, banco_cuenta_id?, cheque_id?, movimiento_caja_id? }],
 *   aplicaciones?: [{ compra_id, monto_aplicado }]
 * }
 * ===================================================== */

// ------------------------------------------------------
// Helper: aplicar cheques usados en un pago a proveedor
// ------------------------------------------------------
const aplicarChequesDePagoAProveedor = async ({
  req,
  pago,
  medios,
  proveedor_id,
  aplicaciones,
  transaction,
  usuario_id
}) => {
  if (!Array.isArray(medios) || medios.length === 0) return;

  // Solo medios que sean cheques
  const chequesMedios = medios.filter((m) =>
    ['CHEQUE_RECIBIDO', 'CHEQUE_EMITIDO'].includes(m.tipo_origen)
  );
  if (chequesMedios.length === 0) return;

  // Si hay exactamente una compra aplicada, la usamos como "principal" para el cheque
  const compraPrincipalId =
    Array.isArray(aplicaciones) && aplicaciones.length === 1
      ? aplicaciones[0].compra_id
      : null;

  const fechaMov = pago.fecha || new Date();

  for (const m of chequesMedios) {
    const chequeId = m.cheque_id;
    if (!chequeId) continue;

    const cheque = await ChequeModel.findByPk(chequeId, { transaction });
    if (!cheque) {
      throw new Error(`Cheque ${chequeId} no encontrado para el pago.`);
    }

    // Si ya está aplicado / anulado / etc, no lo tocamos (evitamos error 409)
    if (!['registrado', 'en_cartera'].includes(cheque.estado)) {
      continue;
    }

    if (cheque.tipo === 'recibido') {
      // CASO A: Cheque RECIBIDO → endoso a proveedor
      await ChequeModel.update(
        {
          estado: 'aplicado_a_compra',
          proveedor_id: proveedor_id,
          // guardamos la compra principal si vino en la request
          compra_id: compraPrincipalId ?? cheque.compra_id
        },
        { where: { id: chequeId }, transaction }
      );

      await ChequeMovimientoModel.create(
        {
          cheque_id: chequeId,
          tipo_mov: 'aplicacion',
          fecha_mov: fechaMov,
          referencia_tipo: 'pago',
          referencia_id: pago.id, // referenciamos al pago
          notas: `Endoso a proveedor_id=${proveedor_id} (pago_id=${pago.id})`
        },
        { transaction }
      );

      // Este cheque ya no va a ingresar como depósito a banco → borramos flujo de ingreso proyectado
      await deleteFlujoCheque({ t: transaction, chequeId });
    } else if (cheque.tipo === 'emitido') {
      // CASO B: Cheque EMITIDO → pago con cheque propio
      const provId = Number(proveedor_id || cheque.proveedor_id || 0);
      if (!provId) {
        throw new Error(
          `proveedor_id faltante para cheque emitido #${cheque.numero}`
        );
      }

      await ChequeModel.update(
        {
          estado: 'aplicado_a_compra',
          proveedor_id: provId,
          compra_id: compraPrincipalId ?? cheque.compra_id
        },
        { where: { id: chequeId }, transaction }
      );

      await ChequeMovimientoModel.create(
        {
          cheque_id: chequeId,
          tipo_mov: 'aplicacion',
          fecha_mov: fechaMov,
          referencia_tipo: 'pago',
          referencia_id: pago.id,
          notas: `Pago a proveedor_id=${provId} (pago_id=${pago.id})`
        },
        { transaction }
      );
      // Emitidos no tenían flujo de ingreso → no hay deleteFlujoCheque
    }
  }

  // Log “suave” de cheques aplicados (no rompe si falla)
  try {
    const chequesIds = chequesMedios
      .map((m) => m.cheque_id)
      .filter(Boolean)
      .join(', ');
    await registrarLog(
      req,
      'cheques',
      'editar',
      `aplicó cheques [${chequesIds}] al pago_proveedor #${pago.id} (proveedor_id=${proveedor_id})`,
      usuario_id
    );
  } catch (e) {
    console.warn('Log cheques aplicados falló:', e.message);
  }
};

export const CR_PagoProv_Crear_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUid(req);
    const { pago_id: pagoIdParam } = req.params || {};

    // =====================================================
    // MODO 1: APLICAR A UN PAGO EXISTENTE
    // Route : POST /pagos-proveedor/:pago_id/aplicar
    // Body: { aplicaciones: [{ compra_id, monto_aplicado }] }
    // =====================================================
    if (pagoIdParam) {
      const pago = await PagoProveedorModel.findByPk(pagoIdParam, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!pago) {
        await t.rollback();
        return res
          .status(404)
          .json({ ok: false, error: `Pago ${pagoIdParam} no encontrado` });
      }

      const proveedorIdPago = pago.proveedor_id;

      let { aplicaciones = [], items = [] } = req.body || {};

      // Por si el front todavía mandara "items", lo transformamos:
      if (
        (!aplicaciones || !aplicaciones.length) &&
        Array.isArray(items) &&
        items.length > 0
      ) {
        aplicaciones = items.map((it) => ({
          compra_id: it.compra_id, // ⚠️ debe venir en el JSON
          monto_aplicado: it.monto
        }));
      }

      if (!Array.isArray(aplicaciones) || !aplicaciones.length) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: 'No se enviaron aplicaciones válidas para este pago.'
        });
      }

      // Total del pago + cuánto ya está aplicado
      const totalPago = round2(pago.monto_total || 0);

      const detallesPrevios = await PagoProveedorDetalleModel.findAll({
        where: { pago_id: pago.id },
        transaction: t
      });

      const sumPrevio = round2(
        detallesPrevios.reduce(
          (acc, d) => acc + toNum(d.monto_aplicado || d.monto || 0),
          0
        )
      );

      const disponible = round2(totalPago - sumPrevio);

      if (!(disponible > 0)) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: 'El pago no tiene saldo disponible para aplicar.'
        });
      }

      let sumAplicado = 0;
      const comprasImpactadas = new Set();

      for (const a of aplicaciones || []) {
        const compra_id = a.compra_id;
        const monto_aplicado = round2(a.monto_aplicado);

        if (!compra_id || !(monto_aplicado > 0)) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: 'aplicaciones inválidas (compra_id/monto_aplicado)'
          });
        }

        const cxp = await CxpProveedorModel.findOne({
          where: { compra_id },
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!cxp) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: `No existe CxP para compra_id=${compra_id}`
          });
        }

        if (Number(cxp.proveedor_id) !== Number(proveedorIdPago)) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: `La compra_id=${compra_id} pertenece a otro proveedor`
          });
        }

        if (toNum(cxp.saldo) < monto_aplicado) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: `Monto a aplicar (${monto_aplicado}) supera saldo (${cxp.saldo})`
          });
        }

        await PagoProveedorDetalleModel.create(
          {
            pago_id: pago.id,
            compra_id,
            monto_aplicado
          },
          { transaction: t }
        );

        sumAplicado += monto_aplicado;
        comprasImpactadas.add(compra_id);
      }

      if (sumAplicado > disponible) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: 'La suma de aplicaciones supera el saldo disponible del pago.'
        });
      }

      // Recalcular CxP impactadas
      for (const compra_id of comprasImpactadas) {
        const cxp = await CxpProveedorModel.findOne({
          where: { compra_id },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (cxp) await syncSaldoYEstadoCxP(cxp, t);
      }

      const formatCurrency = (monto) =>
        new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 2
        }).format(Number(monto || 0));

      const saldoPost = round2(disponible - sumAplicado);
      const comprasIds = Array.from(comprasImpactadas).join(', ') || '—';

      const logAplicarDesc = [
        'aplicó un pago a cuentas por pagar', // se concatena con: El usuario "X"
        `PagoID=${pago.id}`,
        `ProveedorID=${proveedorIdPago}`,
        `TotalPago=${formatCurrency(totalPago)}`,
        `AplicadoPrevio=${formatCurrency(sumPrevio)}`,
        `AplicadoNuevo=${formatCurrency(sumAplicado)}`,
        `SaldoPendientePago=${formatCurrency(saldoPost)}`,
        `CxPImpactadas=${comprasImpactadas.size}`,
        `Compras=[${comprasIds}]`
      ].join(' | ');

      await registrarLog(
        req,
        'pagos_proveedor',
        'aplicar',
        logAplicarDesc,
        usuario_id
      ).catch(() => {});

      await t.commit();

      // Devolver el pago actualizado con proveedor / medios / aplicaciones
      const updated = await PagoProveedorModel.findByPk(pago.id, {
        include: [
          {
            model: ProveedoresModel,
            as: 'proveedor',
            attributes: ['id', 'razon_social', 'cuit']
          },
          {
            model: PagoProveedorMedioModel,
            as: 'medios'
          },
          {
            model: PagoProveedorDetalleModel,
            as: 'aplicaciones'
          }
        ]
      });

      return res.json({ ok: true, data: updated });
    }

    // =====================================================
    // MODO 2: CREAR NUEVO PAGO (comportamiento original)
    // Route: POST /pagos-proveedor
    // Body: incluye medios y (opcional) aplicaciones
    // =====================================================
    let {
      proveedor_id,
      canal = 'C1',
      fecha, // opcional
      fecha_pago, // alias aceptado
      monto_total, // opcional si vienen medios
      observaciones = null,

      // modo cabecera simple (sin array medios)
      medio_pago_id = null,
      banco_cuenta_id = null,
      cheque_id = null,
      movimiento_caja_id = null,

      // multi-medios
      medios = [],

      // aplicaciones a CxP
      aplicaciones = [],
      user_local_id = null
    } = req.body || {};

    if (!proveedor_id) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'Falta proveedor_id' });
    }

    const usarMulti = Array.isArray(medios) && medios.length > 0;

    // Normalizar medios (si hay)
    const mediosNorm = usarMulti
      ? medios.filter((m) => Number(m?.monto) > 0).map(normalizarMedio)
      : [];

    // Si no hay multi, derivamos 1 medio espejo desde cabecera simple
    const mediosToCreate = usarMulti
      ? mediosNorm
      : [
          {
            tipo_origen: inferTipoOrigenDesdeCampos({
              banco_cuenta_id,
              cheque_id,
              movimiento_caja_id
            }),
            medio_pago_id,
            banco_cuenta_id,
            cheque_id,
            movimiento_caja_id,
            monto: round2(monto_total), // lo validamos debajo
            observaciones: null
          }
        ];

    // Validaciones de medios
    if (!mediosToCreate.length) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'Debes especificar al menos un medio con monto > 0'
      });
    }

    for (const m of mediosToCreate) {
      if (!TIPOS_VALIDOS.includes(m.tipo_origen)) {
        await t.rollback();
        return res
          .status(400)
          .json({ ok: false, error: `tipo_origen inválido: ${m.tipo_origen}` });
      }
      if (
        (m.tipo_origen === 'TRANSFERENCIA' || m.tipo_origen === 'DEPOSITO') &&
        !m.banco_cuenta_id
      ) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: `Falta banco_cuenta_id para ${m.tipo_origen}`
        });
      }
      if (
        (m.tipo_origen === 'CHEQUE_RECIBIDO' ||
          m.tipo_origen === 'CHEQUE_EMITIDO') &&
        !m.cheque_id
      ) {
        await t.rollback();
        return res
          .status(400)
          .json({ ok: false, error: `Falta cheque_id para ${m.tipo_origen}` });
      }
      if (!(Number(m.monto) > 0)) {
        await t.rollback();
        return res
          .status(400)
          .json({ ok: false, error: 'Cada medio debe tener monto > 0' });
      }
    }

    // Total: si no vino en body, usar suma de medios
    const totalMedios = round2(
      mediosToCreate.reduce((a, m) => a + Number(m.monto || 0), 0)
    );
    const total = round2(monto_total ?? totalMedios);

    if (!(total > 0)) {
      await t.rollback();
      return res
        .status(400)
        .json({ ok: false, error: 'monto_total debe ser > 0' });
    }

    if (monto_total != null && round2(monto_total) !== totalMedios) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'La suma de medios no coincide con monto_total'
      });
    }

    // Fecha efectiva (para pago)
    const fechaEf = fecha_pago || fecha || new Date();

    // Crear cabecera
    const pago = await PagoProveedorModel.create(
      {
        proveedor_id: Number(proveedor_id),
        canal,
        fecha: new Date(fechaEf),
        medio_pago_id: usarMulti ? null : medio_pago_id,
        banco_cuenta_id: usarMulti ? null : banco_cuenta_id,
        cheque_id: usarMulti ? null : cheque_id,
        movimiento_caja_id: usarMulti ? null : movimiento_caja_id,
        monto_total: total,
        estado: 'confirmado',
        observaciones,
        created_by: usuario_id
      },
      { transaction: t }
    );

    // ==========================
    // Crear medios hijos + caja
    // ==========================
    const userLocalId =
      req.user?.local_id ?? req.user?.localId ?? user_local_id ?? null;
    for (const m of mediosToCreate) {
      let movimientoCajaId = m.movimiento_caja_id ?? null;

      // --- Caso EFECTIVO: exige caja abierta y movimiento de caja ---
      if (m.tipo_origen === 'EFECTIVO') {
        if (!userLocalId) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: 'No se pudo determinar el local del usuario.',
            detalle:
              'Para registrar un pago en efectivo, el usuario debe tener un local asociado.'
          });
        }

        const cajaAbierta = await CajaModel.findOne({
          where: { local_id: userLocalId, fecha_cierre: null },
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!cajaAbierta) {
          await t.rollback();
          return res.status(400).json({
            ok: false,
            error: 'No hay caja abierta.',
            detalle:
              'No se puede registrar un pago en efectivo porque no hay caja abierta para tu local. Abrí la caja desde el módulo de Ventas/Caja antes de continuar.',
            local_id: userLocalId
          });
        }

        if (!movimientoCajaId) {
          const fec_real = new Date(); // fecha/hora real de registro

          const mov = await MovimientosCajaModel.create(
            {
              caja_id: cajaAbierta.id,
              tipo: 'egreso',
              descripcion: `Pago a proveedor #${proveedor_id} (pago_id=${pago.id})`,
              monto: round2(m.monto),
              fecha: fec_real,
              referencia: String(pago.id)
            },
            { transaction: t }
          );

          movimientoCajaId = mov.id;
        }
      }

      if (m.tipo_origen === 'TRANSFERENCIA' || m.tipo_origen === 'DEPOSITO') {
        // fechaEf ya la definiste arriba como:
        // const fechaEf = fecha_pago || fecha || new Date().toISOString().slice(0, 10);
        await BancoMovimientoModel.create(
          {
            banco_cuenta_id: m.banco_cuenta_id,
            fecha: fechaEf, // DATEONLY: 'YYYY-MM-DD'
            descripcion: `Pago a proveedor #${proveedor_id} (pago_id=${
              pago.id
            }) - ${m.tipo_origen.toLowerCase()}`,
            debito: round2(m.monto), // sale plata de la cuenta
            credito: 0,
            referencia_tipo: 'pago',
            referencia_id: pago.id
          },
          { transaction: t }
        );
      }

      await PagoProveedorMedioModel.create(
        {
          pago_id: pago.id,
          tipo_origen: m.tipo_origen,
          medio_pago_id: m.medio_pago_id,
          banco_cuenta_id: m.banco_cuenta_id,
          cheque_id: m.cheque_id,
          movimiento_caja_id: movimientoCajaId,
          monto: round2(m.monto),
          observaciones: m.observaciones
        },
        { transaction: t }
      );

      if (TesoFlujoModel) {
        const teso = await TesoFlujoModel.create(
          {
            origen_tipo: inferOrigenTipoMedio(m),
            origen_id:
              movimientoCajaId || m.cheque_id || m.banco_cuenta_id || pago.id,
            fecha: new Date(fechaEf),
            signo: 'egreso',
            monto: round2(m.monto),
            descripcion: `Pago a proveedor #${proveedor_id} (pago_id=${pago.id})`
          },
          { transaction: t }
        );

        const tesoLogDesc = [
          'creó proyección de tesorería para pago a proveedor',
          `PagoID=${pago.id}`,
          `ProveedorID=${proveedor_id}`,
          `Medio=${m.tipo_origen}`,
          `TesoFlujoID=${teso.id}`,
          `Fecha=${new Date(teso.fecha).toLocaleDateString('es-AR')}`,
          `Monto=${round2(m.monto)} ARS`
        ].join(' | ');

        await registrarLog(
          req,
          'teso_flujo',
          'crear',
          tesoLogDesc,
          usuario_id
        ).catch(() => {});
      }
    }

    // ==========================
    // Aplicaciones (opcionales) - CREACIÓN
    // ==========================
    let sumAplicado = 0;
    const comprasImpactadas = new Set();

    for (const a of aplicaciones || []) {
      const compra_id = a.compra_id;
      const monto_aplicado = round2(a.monto_aplicado);

      if (!compra_id || !(monto_aplicado > 0)) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: 'aplicaciones inválidas (compra_id/monto_aplicado)'
        });
      }

      const cxp = await CxpProveedorModel.findOne({
        where: { compra_id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!cxp) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: `No existe CxP para compra_id=${compra_id}`
        });
      }

      if (Number(cxp.proveedor_id) !== Number(proveedor_id)) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: `La compra_id=${compra_id} pertenece a otro proveedor`
        });
      }

      if (toNum(cxp.saldo) < monto_aplicado) {
        await t.rollback();
        return res.status(400).json({
          ok: false,
          error: `Monto a aplicar (${monto_aplicado}) supera saldo (${cxp.saldo})`
        });
      }

      await PagoProveedorDetalleModel.create(
        {
          pago_id: pago.id,
          compra_id,
          monto_aplicado
        },
        { transaction: t }
      );

      sumAplicado += monto_aplicado;
      comprasImpactadas.add(compra_id);
    }

    if (sumAplicado > total) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'La suma de aplicaciones supera el monto_total del pago'
      });
    }

    for (const compra_id of comprasImpactadas) {
      const cxp = await CxpProveedorModel.findOne({
        where: { compra_id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (cxp) await syncSaldoYEstadoCxP(cxp, t);
    }

    // ==========================
    // Aplicar cheques usados en este pago al proveedor
    // (solo si hay medios tipo CHEQUE_*)
    // ==========================
    await aplicarChequesDePagoAProveedor({
      req,
      pago,
      medios: mediosToCreate,
      proveedor_id,
      aplicaciones,
      transaction: t,
      usuario_id
    });
    
    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const mediosPorTipo = mediosToCreate.reduce((acc, m) => {
      const key = m.tipo_origen || 'OTRO';
      acc[key] = (acc[key] || 0) + round2(m.monto);
      return acc;
    }, {});

    const mediosDetalle = Object.entries(mediosPorTipo)
      .map(([tipo, monto]) => `${tipo}=${formatCurrency(monto)}`)
      .join(', ');

    const comprasIds = Array.from(comprasImpactadas).join(', ') || '—';

    const logCrearDesc = [
      'creó un pago a proveedor', // se concatena con: El usuario "X"
      `PagoID=${pago.id}`,
      `ProveedorID=${proveedor_id}`,
      `Canal=${canal}`,
      `Fecha=${new Date(fechaEf).toLocaleDateString('es-AR')}`,
      `MontoTotal=${formatCurrency(total)}`,
      `Medios=${mediosToCreate.length} (${mediosDetalle || '—'})`,
      `AplicadoCxP=${formatCurrency(sumAplicado)}/${formatCurrency(total)}`,
      `ComprasImpactadas=[${comprasIds}]`
    ].join(' | ');

    await registrarLog(
      req,
      'pagos_proveedor',
      'crear',
      logCrearDesc,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const created = await PagoProveedorModel.findByPk(pago.id, {
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor',
          attributes: ['id', 'razon_social', 'cuit']
        },
        {
          model: PagoProveedorMedioModel,
          as: 'medios'
        },
        {
          model: PagoProveedorDetalleModel,
          as: 'aplicaciones'
        }
      ],
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.json({ ok: true, data: created });
  } catch (err) {
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
        '[CR_PagoProv_Crear_CTS] Validación de pago a proveedor:',
        JSON.stringify(detalles)
      );

      return res.status(400).json({
        ok: false,
        error: 'Validación de datos del pago a proveedor.',
        detalles,
        sugerencia:
          'Revisá los medios de pago, la caja abierta y los importes ingresados.'
      });
    }

    console.error('[CR_PagoProv_Crear_CTS] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error creando/aplicando pago a proveedor.' });
  }
};

/* =====================================================
 * Agregar/editar APlicaciones para un pago existente
 * Body: { aplicaciones: [{ compra_id, monto_aplicado }] }
 * ===================================================== */
export const UR_PagoProv_Aplicaciones_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUid(req);
    const { id } = req.params; // pago_id
    const { aplicaciones = [] } = req.body || {};

    const pago = await PagoProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!pago)
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });

    // Validar suma ≤ monto_total
    const sumNueva = round2(
      aplicaciones.reduce((acc, a) => acc + toNum(a.monto_aplicado), 0)
    );
    const aplicadoPrev = await getAplicadoTotalPago(id, t);
    if (aplicadoPrev + sumNueva > toNum(pago.monto_total)) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'La suma aplicada supera el monto_total del pago'
      });
    }

    // Insertar nuevas aplicaciones
    const comprasImpactadas = new Set();
    for (const a of aplicaciones) {
      const compra_id = a.compra_id;
      const monto_aplicado = round2(a.monto_aplicado);
      if (!compra_id || !monto_aplicado || monto_aplicado <= 0)
        return res
          .status(400)
          .json({ ok: false, error: 'aplicaciones inválidas' });

      const cxp = await CxpProveedorModel.findOne({
        where: { compra_id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!cxp)
        return res.status(400).json({
          ok: false,
          error: `No existe CxP para compra_id=${compra_id}`
        });
      if (cxp.proveedor_id !== pago.proveedor_id)
        return res.status(400).json({
          ok: false,
          error: `La compra_id=${compra_id} pertenece a otro proveedor`
        });
      if (toNum(cxp.saldo) < monto_aplicado)
        return res.status(400).json({
          ok: false,
          error: `Monto a aplicar (${monto_aplicado}) supera saldo (${cxp.saldo})`
        });

      await PagoProveedorDetalleModel.create(
        { pago_id: id, compra_id, monto_aplicado },
        { transaction: t }
      );
      comprasImpactadas.add(compra_id);
    }

    for (const compra_id of comprasImpactadas) {
      const cxp = await CxpProveedorModel.findOne({
        where: { compra_id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (cxp) await syncSaldoYEstadoCxP(cxp, t);
    }


    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const totalPago = toNum(pago.monto_total);
    const aplicadoPost = round2(aplicadoPrev + sumNueva);
    const comprasIds = Array.from(comprasImpactadas).join(', ') || '—';

    const detalleAplicaciones = (aplicaciones || [])
      .map((a) => `${a.compra_id}: ${formatCurrency(toNum(a.monto_aplicado))}`)
      .join('; ');

    const logDescripcion = [
      'actualizó aplicaciones de pago a proveedor', // se concatena con: El usuario "X"
      `PagoID=${id}`,
      `ProveedorID=${pago.proveedor_id}`,
      `TotalPago=${formatCurrency(totalPago)}`,
      `AplicadoPrevio=${formatCurrency(aplicadoPrev)}`,
      `AplicadoNuevo=${formatCurrency(sumNueva)}`,
      `AplicadoTotalPost=${formatCurrency(aplicadoPost)}`,
      `CantAplicacionesNuevas=${aplicaciones.length}`,
      `ComprasImpactadas=[${comprasIds}]`,
      `DetalleAplicaciones=[${detalleAplicaciones || '—'}]`
    ].join(' | ');

    await registrarLog(
      req,
      'pagos_proveedor',
      'actualizar',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();

    const updated = await PagoProveedorModel.findByPk(id, {
      include: [
        { model: PagoProveedorDetalleModel, as: 'aplicaciones' },
        { model: PagoProveedorMedioModel, as: 'medios' }
      ]
    });
    res.json({ ok: true, data: updated });
  } catch (err) {
    await t.rollback();
    console.error('[UR_PagoProv_Aplicaciones_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error aplicando pago' });
  }
};

/* =====================================================
 * Desaplicar (borrar) una aplicación puntual
 * ===================================================== */
export const ER_PagoProv_Desaplicar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUid(req);
    const { pago_detalle_id } = req.params;

    const pd = await PagoProveedorDetalleModel.findByPk(pago_detalle_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!pd) {
      await t.rollback();
      return res
        .status(404)
        .json({ ok: false, error: 'Aplicación no encontrada' });
    }

    const compra_id = pd.compra_id;
    const pago_id = pd.pago_id;
    const montoDesaplicado = round2(pd.monto_aplicado || pd.monto || 0);

    // 1) Borrar la imputación
    await pd.destroy({ transaction: t });

    // 2) Recalcular CxP de esa compra
    const cxp = await CxpProveedorModel.findOne({
      where: { compra_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (cxp) {
      await syncSaldoYEstadoCxP(cxp, t);
    }

    // 3) Info extra del pago (total y aplicado post)
    const pago = await PagoProveedorModel.findByPk(pago_id, {
      transaction: t
    });

    const totalPago = pago ? round2(pago.monto_total || 0) : 0;
    const aplicadoPost = await getAplicadoTotalPago(pago_id, t); // helper que ya usás en otros lados

    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const cxpMsg = cxp
      ? `CxP=ID=${cxp.id}, SaldoPost=${formatCurrency(cxp.saldo)}, Estado=${
          cxp.estado
        }`
      : 'CxP=no encontrada';

    const logDescripcion = [
      'desaplicó un pago de proveedor', // se concatena con: El usuario "X"
      `PagoDetalleID=${pago_detalle_id}`,
      `PagoID=${pago_id}`,
      `CompraID=${compra_id}`,
      `MontoDesaplicado=${formatCurrency(montoDesaplicado)}`,
      `TotalPago=${formatCurrency(totalPago)}`,
      `AplicadoTotalPost=${formatCurrency(aplicadoPost)}`,
      cxpMsg
    ].join(' | ');

    // 3) Log
    await registrarLog(
      req,
      'pagos_proveedor',
      'desaplicar',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error('[ER_PagoProv_Desaplicar_CTS] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error desaplicando pago' });
  }
};

export const ER_PagoProv_Anular_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUid(req);

    // Soportar rutas tipo :id o :pago_id
    const pagoId = req.params.pago_id || req.params.id;

    if (!pagoId) {
      await t.rollback();
      return res
        .status(400)
        .json({ ok: false, error: 'Falta pagoId en la ruta.' });
    }

    const pago = await PagoProveedorModel.findByPk(pagoId, {
      include: [
        {
          model: PagoProveedorMedioModel,
          as: 'medios'
        }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!pago) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });
    }

    const ahora = new Date();

    // ============================
    // REVERSO EN CAJA (EFECTIVO)
    // ============================
    let reversosCajaCreados = 0;
    let totalEfectivoReversado = 0;

    // ============================
    // REVERSO EN BANCO (TRANSFER / DEPÓSITO)
    // ============================
    let reversosBancoCreados = 0;
    let totalBancoReversado = 0;

    for (const m of pago.medios || []) {
      // ---------- EFECTIVO: reverso en caja ----------
      if (m.tipo_origen === 'EFECTIVO' && m.movimiento_caja_id) {
        const movOriginal = await MovimientosCajaModel.findByPk(
          m.movimiento_caja_id,
          { transaction: t, lock: t.LOCK.UPDATE }
        );

        if (!movOriginal) continue;

        // 💡 Idempotencia simple: si ya hay reverso para este pago, no crees otro
        const reversoExiste = await MovimientosCajaModel.findOne({
          where: {
            tipo: 'ingreso',
            referencia: String(pago.id)
          },
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!reversoExiste) {
          await MovimientosCajaModel.create(
            {
              caja_id: movOriginal.caja_id,
              tipo: 'ingreso', // reverso
              descripcion: `Reverso pago proveedor (anulación pago_id=${pago.id}, mov_id=${movOriginal.id})`,
              monto: round2(m.monto),
              fecha: ahora,
              referencia: String(pago.id)
            },
            { transaction: t }
          );

          reversosCajaCreados += 1;
          totalEfectivoReversado += round2(m.monto || 0);
        }
      }

      // ---------- TRANSFERENCIA / DEPOSITO: reverso en banco ----------
      if (
        (m.tipo_origen === 'TRANSFERENCIA' || m.tipo_origen === 'DEPOSITO') &&
        m.banco_cuenta_id
      ) {
        // Fecha DATEONLY 'YYYY-MM-DD'
        const fechaBancoRev = ahora.toISOString().slice(0, 10);

        // Idempotencia por medio: una sola vez por medio_id
        const descReversoBanco = `Reverso pago proveedor (anulación pago_id=${pago.id}, medio_id=${m.id})`;

        const reversoBancoExiste = await BancoMovimientoModel.findOne({
          where: {
            banco_cuenta_id: m.banco_cuenta_id,
            referencia_tipo: 'pago',
            referencia_id: pago.id,
            descripcion: descReversoBanco
          },
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (!reversoBancoExiste) {
          await BancoMovimientoModel.create(
            {
              banco_cuenta_id: m.banco_cuenta_id,
              fecha: fechaBancoRev,
              descripcion: descReversoBanco,
              debito: 0,
              credito: round2(m.monto), // entra plata de vuelta a la cuenta
              referencia_tipo: 'pago',
              referencia_id: pago.id
            },
            { transaction: t }
          );

          reversosBancoCreados += 1;
          totalBancoReversado += round2(m.monto || 0);
        }
      }
    }

    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const totalPago = round2(pago.monto_total || 0);

    const mediosPorTipo = (pago.medios || []).reduce((acc, m) => {
      const key = m.tipo_origen || 'OTRO';
      acc[key] = (acc[key] || 0) + round2(m.monto || 0);
      return acc;
    }, {});

    const mediosDetalle = Object.entries(mediosPorTipo)
      .map(([tipo, monto]) => `${tipo}=${formatCurrency(monto)}`)
      .join(', ');

    const logDescripcion = [
      'anuló un pago a proveedor', // se concatena con: El usuario "X"
      `PagoID=${pago.id}`,
      `ProveedorID=${pago.proveedor_id}`,
      `MontoTotal=${formatCurrency(totalPago)}`,
      `Medios=${(pago.medios || []).length} (${mediosDetalle || '—'})`,
      `EfectivoReversado=${formatCurrency(totalEfectivoReversado)}`,
      `ReversosCajaCreados=${reversosCajaCreados}`,
      `BancoReversado=${formatCurrency(totalBancoReversado)}`,
      `ReversosBancoCreados=${reversosBancoCreados}`
    ].join(' | ');

    await registrarLog(
      req,
      'pagos_proveedor',
      'anular',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({ ok: true });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error('[ER_PagoProv_Anular_CTS] error:', err);
    return res.status(500).json({ ok: false, error: 'Error anulando pago' });
  }
};

/* =====================================================
 * Borrar pago (solo si NO tiene aplicaciones)
 * ===================================================== */
export const ER_PagoProv_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUid(req);
    const { id } = req.params;

    const pago = await PagoProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!pago) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });
    }

    const countAplic = await PagoProveedorDetalleModel.count({
      where: { pago_id: id },
      transaction: t
    });
    if (countAplic > 0) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: 'No se puede borrar: tiene aplicaciones. Desaplique primero.'
      });
    }

    // Traer medios antes de borrarlos (para loguear detalle)
    const medios = await PagoProveedorMedioModel.findAll({
      where: { pago_id: id },
      transaction: t
    });

    // Borrar medios + cabecera
    await PagoProveedorMedioModel.destroy({
      where: { pago_id: id },
      transaction: t
    });
    await PagoProveedorModel.destroy({ where: { id }, transaction: t });

    // (Opcional) revertir proyección teso_flujo asociada a este pago
    // TODO: si guardás referencia directa a pago_id en teso_flujo, borrarlas aquí y loguear.

    // ============================
    // LOG DETALLADO DE ELIMINACIÓN
    // ============================
    const formatCurrency = (monto) =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
      }).format(Number(monto || 0));

    const totalPago = Number(pago.monto_total || 0);
    const fechaPago = pago.fecha
      ? new Date(pago.fecha).toLocaleDateString('es-AR')
      : 's/fecha';

    const mediosPorTipo = (medios || []).reduce((acc, m) => {
      const key = m.tipo_origen || 'OTRO';
      acc[key] = (acc[key] || 0) + Number(m.monto || 0);
      return acc;
    }, {});

    const mediosDetalle = Object.entries(mediosPorTipo)
      .map(([tipo, monto]) => `${tipo}=${formatCurrency(monto)}`)
      .join(', ');

    const logDescripcion = [
      'eliminó un pago a proveedor (sin aplicaciones)', // se concatena con: El usuario "X"
      `PagoID=${id}`,
      `ProveedorID=${pago.proveedor_id}`,
      `Fecha=${fechaPago}`,
      `MontoTotal=${formatCurrency(totalPago)}`,
      `EstadoPrevio=${pago.estado || 's/estado'}`,
      `Medios=${(medios || []).length} (${mediosDetalle || '—'})`
    ].join(' | ');

    await registrarLog(
      req,
      'pagos_proveedor',
      'eliminar',
      logDescripcion,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error('[ER_PagoProv_Borrar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error eliminando pago' });
  }
};

export default {
  OBRS_PagosProv_CTS,
  OBR_PagoProv_CTS,
  CR_PagoProv_Crear_CTS,
  UR_PagoProv_Aplicaciones_CTS,
  ER_PagoProv_Desaplicar_CTS,
  ER_PagoProv_Borrar_CTS
};
