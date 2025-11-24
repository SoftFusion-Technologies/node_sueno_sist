/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 03 / 11 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para Cuentas por Pagar a Proveedores (CxP).
 * - Listar con filtros, obtener detalle.
 * - Crear manual (excepcional), actualizar vencimiento, recalcular saldo/estado desde pagos.
 * - Borrado solo si no tiene aplicaciones de pago.
 * - Invariantes: saldo = max(monto_total - sum(aplicado), 0). estado en {pendiente, parcial, cancelado}.
 *
 * Tema: Controladores - Compras / Tesorería
 * Capa: Backend
 */

import { Op, fn, col, literal } from 'sequelize';
import '../../Models/Compras/compras_relaciones.js';

import { CxpProveedorModel } from '../../Models/Compras/MD_TB_CuentasPagarProveedores.js';
import { CompraModel } from '../../Models/Compras/MD_TB_Compras.js';
import { PagoProveedorDetalleModel } from '../../Models/Compras/MD_TB_PagoProveedorDetalle.js';
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

const sequelize = CxpProveedorModel.sequelize;

const getUsuarioId = (req) =>
  Number(
    req.body?.usuario_log_id ??
      req.query?.usuario_log_id ??
      req.user?.id ??
      null
  ) || null;
/* ----------------------------------------------
 * Helpers
 * ---------------------------------------------- */
const toNum = (x) => Number(x ?? 0) || 0;
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

async function getAplicadoTotalByCompra(compra_id, t) {
  const row = await PagoProveedorDetalleModel.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('monto_aplicado')), 0), 'aplicado']
    ],
    where: { compra_id },
    transaction: t
  });
  return toNum(row?.get?.('aplicado') ?? 0);
}

async function syncSaldoYEstado(cxp, t) {
  const aplicado = await getAplicadoTotalByCompra(cxp.compra_id, t);
  const nuevoSaldo = Math.max(0, round2(toNum(cxp.monto_total) - aplicado));
  cxp.saldo = nuevoSaldo;
  cxp.estado =
    nuevoSaldo <= 0 ? 'cancelado' : aplicado > 0 ? 'parcial' : 'pendiente';
  await cxp.save({ transaction: t });
  return { aplicado, saldo: cxp.saldo, estado: cxp.estado };
}

/* ----------------------------------------------
 * Listar CxP
 * ---------------------------------------------- */
export const OBRS_Cxp_CTS = async (req, res) => {
  try {
    const {
      q, // búsqueda por proveedor
      proveedor_id,
      estado, // pendiente | parcial | cancelado
      desde_venc, // YYYY-MM-DD
      hasta_venc, // YYYY-MM-DD
      page = 1,
      pageSize = 20,
      orderBy = 'fecha_vencimiento',
      orderDir = 'ASC'
    } = req.query || {};

    const where = {};
    if (proveedor_id) where.proveedor_id = proveedor_id;
    if (estado) where.estado = estado;
    if (desde_venc || hasta_venc) {
      where.fecha_vencimiento = {};
      if (desde_venc) where.fecha_vencimiento[Op.gte] = desde_venc;
      if (hasta_venc) where.fecha_vencimiento[Op.lte] = hasta_venc;
    }

    const include = [
      {
        model: ProveedoresModel,
        as: 'proveedor',
        attributes: ['id', 'razon_social', 'cuit']
      },
      {
        model: CompraModel,
        as: 'compra',
        attributes: [
          'id',
          'canal',
          'tipo_comprobante',
          'punto_venta',
          'nro_comprobante',
          'fecha'
        ]
      }
    ];

    if (q && String(q).trim()) {
      include[0].where = {
        [Op.or]: [
          { razon_social: { [Op.like]: `%${q}%` } },
          { cuit: { [Op.like]: `%${q}%` } }
        ]
      };
    }

    const offset = (Number(page) - 1) * Number(pageSize);

    const { rows, count } = await CxpProveedorModel.findAndCountAll({
      where,
      include,
      limit: Number(pageSize),
      offset,
      order: [[orderBy, orderDir]]
    });

    res.json({
      ok: true,
      data: rows,
      meta: { total: count, page: Number(page), pageSize: Number(pageSize) }
    });
  } catch (err) {
    console.error('[OBRS_Cxp_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error listando CxP' });
  }
};

/* ----------------------------------------------
 * Obtener CxP por id (incluye compra y proveedor)
 * ---------------------------------------------- */
export const OBR_Cxp_CTS = async (req, res) => {
  try {
    const { id } = req.params;
    const cxp = await CxpProveedorModel.findByPk(id, {
      include: [
        {
          model: ProveedoresModel,
          as: 'proveedor',
          attributes: ['id', 'razon_social', 'cuit', 'dias_credito']
        },
        {
          model: CompraModel,
          as: 'compra',
          attributes: [
            'id',
            'fecha',
            'canal',
            'tipo_comprobante',
            'punto_venta',
            'nro_comprobante',
            'total'
          ]
        }
      ]
    });
    if (!cxp)
      return res.status(404).json({ ok: false, error: 'CxP no encontrada' });

    // Traer aplicado actual para UI
    const aplicado = await getAplicadoTotalByCompra(cxp.compra_id);

    res.json({ ok: true, data: cxp, aplicado });
  } catch (err) {
    console.error('[OBR_Cxp_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo CxP' });
  }
};

/* ----------------------------------------------
 * Crear CxP manual (excepcional)
 * Nota: normalmente se crea al confirmar la compra.
 * ---------------------------------------------- */
export const CR_Cxp_CrearManual_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const {
      compra_id,
      proveedor_id,
      canal = 'C1',
      fecha_emision,
      fecha_vencimiento,
      monto_total
    } = req.body || {};

    if (
      !compra_id ||
      !proveedor_id ||
      !fecha_emision ||
      !fecha_vencimiento ||
      !monto_total
    )
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan campos obligatorios' });

    const compra = await CompraModel.findByPk(compra_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!compra)
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });

    // Evitar duplicado de CxP por compra
    const dup = await CxpProveedorModel.findOne({
      where: { compra_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (dup)
      return res
        .status(400)
        .json({ ok: false, error: 'Ya existe CxP para esta compra' });

    const cxp = await CxpProveedorModel.create(
      {
        compra_id,
        proveedor_id,
        canal,
        fecha_emision,
        fecha_vencimiento,
        monto_total,
        saldo: monto_total,
        estado: 'pendiente'
      },
      { transaction: t }
    );

    await registrarLog(
      req,
      'cuentas_pagar_proveedores',
      'crear',
      `cxp_id=${cxp.id} compra_id=${compra_id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: cxp });
  } catch (err) {
    await t.rollback();
    console.error('[CR_Cxp_CrearManual_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error creando CxP' });
  }
};

/* ----------------------------------------------
 * Actualizar vencimiento (o emision) de CxP
 * ---------------------------------------------- */
export const UR_Cxp_ActualizarFechas_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;
    const { fecha_emision, fecha_vencimiento } = req.body || {};

    const cxp = await CxpProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp)
      return res.status(404).json({ ok: false, error: 'CxP no encontrada' });

    if (fecha_emision) cxp.fecha_emision = fecha_emision;
    if (fecha_vencimiento) cxp.fecha_vencimiento = fecha_vencimiento;

    await cxp.save({ transaction: t });

    await registrarLog(
      req,
      'cuentas_pagar_proveedores',
      'actualizar',
      `cxp_id=${id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: cxp });
  } catch (err) {
    await t.rollback();
    console.error('[UR_Cxp_ActualizarFechas_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando CxP' });
  }
};

/* ----------------------------------------------
 * Recalcular saldo/estado desde pagos aplicados
 * ---------------------------------------------- */
export const UR_Cxp_RecalcularSaldo_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;

    const cxp = await CxpProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp)
      return res.status(404).json({ ok: false, error: 'CxP no encontrada' });

    const { aplicado, saldo, estado } = await syncSaldoYEstado(cxp, t);

    await registrarLog(
      req,
      'cuentas_pagar_proveedores',
      'actualizar',
      `cxp_id=${id} aplicado=${aplicado}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true, data: { id: cxp.id, aplicado, saldo, estado } });
  } catch (err) {
    await t.rollback();
    console.error('[UR_Cxp_RecalcularSaldo_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error recalculando CxP' });
  }
};

/* ----------------------------------------------
 * Ajustar monto_total con coherencia (saldo/estado)
 * ---------------------------------------------- */
export const UR_Cxp_AjustarMonto_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req);
    const { id } = req.params;
    const nuevoTotal = Number(req.body?.monto_total);

    if (!Number.isFinite(nuevoTotal) || nuevoTotal < 0) {
      await t.rollback();
      return res.status(400).json({ ok: false, error: 'monto_total inválido' });
    }

    const cxp = await CxpProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp) {
      await t.rollback();
      return res.status(404).json({ ok: false, error: 'CxP no encontrada' });
    }

    // 1) Cuánto ya está aplicado a la compra (preferible helper real)
    let aplicado;
    try {
      // si tu helper no recibe transaction, quitá el arg "t"
      aplicado = await getAplicadoTotalByCompra(cxp.compra_id, t);
    } catch {
      const toNum = (v) => Number(v ?? 0);
      aplicado = round2(toNum(cxp.monto_total) - toNum(cxp.saldo)); // fallback
    }

    // 2) Regla: no podés bajar el total por debajo de lo aplicado
    if (nuevoTotal < aplicado) {
      await t.rollback();
      return res.status(400).json({
        ok: false,
        error: `El nuevo total no puede ser menor al monto ya aplicado (${aplicado.toFixed(
          2
        )}).`
      });
    }

    // 3) Recalcular saldo y estado coherentes
    const nuevoSaldo = round2(nuevoTotal - aplicado);
    let nuevoEstado = 'parcial';
    if (nuevoSaldo === 0) nuevoEstado = 'cancelado';
    else if (nuevoSaldo === nuevoTotal) nuevoEstado = 'pendiente';

    // 4) Setear TODO y guardar una sola vez (pasan validaciones)
    cxp.set({
      monto_total: round2(nuevoTotal),
      saldo: nuevoSaldo,
      estado: nuevoEstado
    });
    await cxp.save({ transaction: t });

    await registrarLog(
      req,
      'cuentas_pagar_proveedores',
      'actualizar',
      `cxp_id=${id} nuevo_total=${cxp.monto_total} aplicado=${aplicado} saldo=${cxp.saldo} estado=${cxp.estado}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    return res.json({
      ok: true,
      data: {
        id: cxp.id,
        monto_total: cxp.monto_total,
        aplicado,
        saldo: cxp.saldo,
        estado: cxp.estado
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[UR_Cxp_AjustarMonto_CTS] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error ajustando monto_total' });
  }
};


/* ----------------------------------------------
 * Borrar CxP (solo sin pagos aplicados)
 * ---------------------------------------------- */
export const ER_Cxp_Borrar_CTS = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const usuario_id = getUsuarioId(req); // <-- en vez de req.user?.id
    const { id } = req.params;

    const cxp = await CxpProveedorModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cxp)
      return res.status(404).json({ ok: false, error: 'CxP no encontrada' });

    const pagosCount = await PagoProveedorDetalleModel.count({
      where: { compra_id: cxp.compra_id },
      transaction: t
    });
    if (pagosCount > 0)
      return res
        .status(400)
        .json({
          ok: false,
          error: 'No se puede borrar: tiene pagos aplicados'
        });

    await CxpProveedorModel.destroy({ where: { id }, transaction: t });

    await registrarLog(
      req,
      'cuentas_pagar_proveedores',
      'eliminar',
      `cxp_id=${id}`,
      usuario_id
    ).catch(() => {});

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    console.error('[ER_Cxp_Borrar_CTS] error:', err);
    res.status(500).json({ ok: false, error: 'Error eliminando CxP' });
  }
};

export default {
  OBRS_Cxp_CTS,
  OBR_Cxp_CTS,
  CR_Cxp_CrearManual_CTS,
  UR_Cxp_ActualizarFechas_CTS,
  UR_Cxp_RecalcularSaldo_CTS,
  UR_Cxp_AjustarMonto_CTS,
  ER_Cxp_Borrar_CTS
};
