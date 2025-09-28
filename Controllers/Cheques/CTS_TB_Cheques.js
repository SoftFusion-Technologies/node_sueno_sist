// Controllers/Cheques/CTS_TB_Cheques.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 20 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para el módulo de Cheques.
 * Incluye:
 *  - Listado + filtros/orden + KPIs
 *  - Detalle por ID
 *  - Crear / Editar / Eliminar (con protecciones)
 *  - Transiciones de estado: depositar, acreditar, rechazar,
 *    aplicar-a-proveedor (endoso), entregar (emitidos), compensar, anular.
 */

import db from '../../DataBase/db.js';
import { Op, literal, Transaction ,fn,col} from 'sequelize';

import { BancoModel } from '../../Models/Bancos/MD_TB_Bancos.js';
import { BancoCuentaModel } from '../../Models/Bancos/MD_TB_BancoCuentas.js';
import { BancoMovimientoModel } from '../../Models/Bancos/MD_TB_BancoMovimientos.js';

import { ChequeraModel } from '../../Models/Cheques/MD_TB_Chequeras.js';
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { ChequeMovimientoModel } from '../../Models/Cheques/MD_TB_ChequeMovimientos.js';

import { TesoFlujoModel } from '../../Models/Tesoreria/MD_TB_TesoFlujo.js';

import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================================================================
 * Helpers
 * =======================================================================*/

// Upsert de flujo (1 registro por cheque)
const upsertFlujoCheque = async ({
  t,
  chequeId,
  signo,
  fecha,
  monto,
  descripcion
}) => {
  const row = await TesoFlujoModel.findOne({
    where: { origen_tipo: 'cheque', origen_id: chequeId },
    transaction: t,
    lock: t?.LOCK?.UPDATE
  });
  if (!row) {
    await TesoFlujoModel.create(
      {
        origen_tipo: 'cheque',
        origen_id: chequeId,
        fecha,
        signo,
        monto,
        descripcion
      },
      { transaction: t }
    );
  } else {
    await TesoFlujoModel.update(
      { fecha, signo, monto, descripcion },
      { where: { id: row.id }, transaction: t }
    );
  }
};

// Borrar proyección de flujo del cheque
const deleteFlujoCheque = async ({ t, chequeId }) => {
  await TesoFlujoModel.destroy({
    where: { origen_tipo: 'cheque', origen_id: chequeId },
    transaction: t
  });
};

// Obtiene banco_cuenta_id del último movimiento de depósito si existiese
const getCuentaDepositoFromMov = async ({ t, chequeId }) => {
  const mov = await ChequeMovimientoModel.findOne({
    where: { cheque_id: chequeId, tipo_mov: 'deposito' },
    order: [
      ['fecha_mov', 'DESC'],
      ['id', 'DESC']
    ],
    transaction: t
  });
  // Usamos referencia_id como banco_cuenta_id para 'deposito'
  return mov?.referencia_id ? Number(mov.referencia_id) : null;
};

// GET /chequeras/:id/cheques
export const OBRS_ChequesPorChequera_CTS = async (req, res) => {
  const chequeraId = Number(req.params.id);
  const {
    page = 1,
    limit = 25,
    q = '',
    estado = '',
    tipo = '',
    fechaCampo = 'fecha_emision', // 'fecha_emision' | 'fecha_vencimiento' | 'fecha_cobro_prevista' | 'created_at'
    desde = '',
    hasta = '',
    orderBy = 'numero',
    orderDir = 'ASC'
  } = req.query || {};

  try {
    // Traigo la chequera (y su cuenta+banco) para cabecera
    const chequera = await ChequeraModel.findByPk(chequeraId, {
      include: [
        {
          model: BancoCuentaModel,
          as: 'cuenta',
          include: [{ model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] }]
        }
      ]
    });
    if (!chequera) {
      return res.status(404).json({ mensajeError: 'Chequera no encontrada' });
    }

    // Filtros
    const where = { chequera_id: chequeraId };
    if (q && q.trim()) {
      const like = { [Op.like]: `%${q.trim()}%` };
      // busco por número y beneficiario/observaciones
      where[Op.or] = [{ numero: isNaN(Number(q)) ? undefined : Number(q) }, { beneficiario_nombre: like }, { observaciones: like }].filter(Boolean);
    }
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo; // aunque en chequera normalmente serán "emitidos"

    const camposFecha = new Set(['fecha_emision', 'fecha_vencimiento', 'fecha_cobro_prevista', 'created_at']);
    const campo = camposFecha.has(fechaCampo) ? fechaCampo : 'fecha_emision';
    if (desde || hasta) {
      where[campo] = {};
      if (desde) where[campo][Op.gte] = desde;
      if (hasta) where[campo][Op.lte] = hasta;
    }

    // Orden seguro
    const validCols = ['id', 'numero', 'monto', 'estado', 'created_at', 'updated_at', 'fecha_emision', 'fecha_vencimiento', 'fecha_cobro_prevista'];
    const colName = validCols.includes(orderBy) ? orderBy : 'numero';
    const dirName = ['ASC', 'DESC'].includes(String(orderDir).toUpperCase()) ? String(orderDir).toUpperCase() : 'ASC';

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    // Totales/Resumen por estado
    const resumenRows = await ChequeModel.findAll({
      where: { chequera_id: chequeraId },
      attributes: [
        'estado',
        [fn('COUNT', col('id')), 'cantidad'],
        [fn('SUM', col('monto')), 'montoTotal']
      ],
      group: ['estado']
    });

    const resumen = resumenRows.reduce(
      (acc, r) => {
        const est = r.get('estado');
        const cant = Number(r.get('cantidad') || 0);
        const mon = Number(r.get('montoTotal') || 0);
        acc.porEstado[est] = { cantidad: cant, monto: mon };
        acc.totales.cantidad += cant;
        acc.totales.monto += mon;
        return acc;
      },
      { totales: { cantidad: 0, monto: 0 }, porEstado: {} }
    );

    // Conteo filtrado + data
    const total = await ChequeModel.count({ where });
    const rows = await ChequeModel.findAll({
      where,
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] },
        { model: ChequeraModel, as: 'chequera', attributes: ['id', 'descripcion', 'nro_desde', 'nro_hasta', 'proximo_nro'] }
      ],
      order: [[colName, dirName]],
      limit: limitNum,
      offset
    });

    const totalPages = Math.max(Math.ceil(total / limitNum), 1);

    // Métrica de uso del rango (sólo informativa)
    const usados = await ChequeModel.count({ where: { chequera_id: chequeraId } });
    const rango = chequera.nro_hasta - chequera.nro_desde + 1;
    const uso = rango > 0 ? Math.round((usados / rango) * 100) : 0;

    return res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        orderBy: colName,
        orderDir: dirName,
        filtros: { q, estado, tipo, fechaCampo, desde, hasta }
      },
      resumen,
      chequera: {
        id: chequera.id,
        descripcion: chequera.descripcion,
        estado: chequera.estado,
        nro_desde: chequera.nro_desde,
        nro_hasta: chequera.nro_hasta,
        proximo_nro: chequera.proximo_nro,
        cuenta: {
          id: chequera.cuenta?.id,
          nombre_cuenta: chequera.cuenta?.nombre_cuenta,
          banco: chequera.cuenta?.banco ? { id: chequera.cuenta.banco.id, nombre: chequera.cuenta.banco.nombre } : null
        },
        uso: { usados, rango, porcentaje: uso }
      }
    });
  } catch (error) {
    console.error('OBRS_ChequesPorChequera_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};
/* =========================================================================
 * 1) Listado de cheques  GET /cheques
 *    Filtros: q (numero/beneficiario), tipo, estado, canal,
 *             banco_id, chequera_id, cliente_id, proveedor_id,
 *             rangos: emision/vencimiento/cobro_prevista (from/to)
 *    Orden: [id,tipo,estado,canal,numero,monto,fecha_emision,fecha_vencimiento,
 *            fecha_cobro_prevista,created_at,updated_at,cantidadMovimientos]
 * =======================================================================*/
export const OBRS_Cheques_CTS = async (req, res) => {
  try {
    const {
      page,
      limit,
      q,
      tipo,
      estado,
      canal,
      banco_id,
      chequera_id,
      cliente_id,
      proveedor_id,
      venta_id,
      compra_id,
      emision_from,
      emision_to,
      venc_from,
      venc_to,
      cobro_from,
      cobro_to,
      orderBy,
      orderDir
    } = req.query || {};

    const hasParams = Object.keys(req.query || {}).length > 0;

    const chqTable = ChequeModel.getTableName(); // 'cheques'
    const movTable = ChequeMovimientoModel.getTableName(); // 'cheque_movimientos'

    const countMovs = literal(`(
      SELECT COUNT(*) FROM \`${movTable}\` m
      WHERE m.\`cheque_id\` = \`${chqTable}\`.id
    )`);

    const where = {};
    if (q && q.trim() !== '') {
      const s = q.trim();
      const like = { [Op.like]: `%${s}%` };
      where[Op.or] = [
        { beneficiario_nombre: like },
        db.where(literal('CAST(numero AS CHAR)'), like)
      ];
    }
    if (tipo && ['recibido', 'emitido'].includes(tipo)) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (canal && ['C1', 'C2'].includes(canal)) where.canal = canal;
    if (banco_id) where.banco_id = Number(banco_id);
    if (chequera_id) where.chequera_id = Number(chequera_id);
    if (cliente_id) where.cliente_id = Number(cliente_id);
    if (proveedor_id) where.proveedor_id = Number(proveedor_id);
    if (venta_id) where.venta_id = Number(venta_id);
    if (compra_id) where.compra_id = Number(compra_id);
    // Rangos de fechas
    const addBetween = (field, from, to) => {
      if (from || to) {
        where[field] = {};
        if (from) where[field][Op.gte] = from;
        if (to) where[field][Op.lte] = to;
      }
    };
    addBetween('fecha_emision', emision_from, emision_to);
    addBetween('fecha_vencimiento', venc_from, venc_to);
    addBetween('fecha_cobro_prevista', cobro_from, cobro_to);

    const validColumns = [
      'id',
      'tipo',
      'estado',
      'canal',
      'numero',
      'monto',
      'fecha_emision',
      'fecha_vencimiento',
      'fecha_cobro_prevista',
      'created_at',
      'updated_at',
      'cantidadMovimientos'
    ];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // SIN params → array plano
    if (!hasParams) {
      const filas = await ChequeModel.findAll({
        where,
        attributes: { include: [[countMovs, 'cantidadMovimientos']] },
        order:
          colName === 'cantidadMovimientos'
            ? [[countMovs, dirName]]
            : [[colName, dirName]],
        include: [
          { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] },
          {
            model: ChequeraModel,
            as: 'chequera',
            attributes: ['id', 'descripcion', 'banco_cuenta_id'],
            include: [
              {
                model: BancoCuentaModel,
                as: 'cuenta',
                attributes: ['id', 'nombre_cuenta']
              }
            ]
          }
        ]
      });
      return res.json(filas);
    }

    // CON params → paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await ChequeModel.count({ where });

    const rows = await ChequeModel.findAll({
      where,
      attributes: { include: [[countMovs, 'cantidadMovimientos']] },
      order:
        colName === 'cantidadMovimientos'
          ? [[countMovs, dirName]]
          : [[colName, dirName]],
      limit: limitNum,
      offset,
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] },
        {
          model: ChequeraModel,
          as: 'chequera',
          attributes: ['id', 'descripcion', 'banco_cuenta_id'],
          include: [
            {
              model: BancoCuentaModel,
              as: 'cuenta',
              attributes: ['id', 'nombre_cuenta']
            }
          ]
        }
      ]
    });

    const totalPages = Math.max(Math.ceil(total / limitNum), 1);

    return res.json({
      data: rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        orderBy: colName,
        orderDir: dirName
      }
    });
  } catch (error) {
    console.error('OBRS_Cheques_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 2) Detalle por ID  GET /cheques/:id
 * =======================================================================*/
export const OBR_Cheque_CTS = async (req, res) => {
  try {
    const cheque = await ChequeModel.findOne({
      where: { id: req.params.id },
      include: [
        { model: BancoModel, as: 'banco', attributes: ['id', 'nombre'] },
        {
          model: ChequeraModel,
          as: 'chequera',
          attributes: ['id', 'descripcion', 'banco_cuenta_id'],
          include: [
            {
              model: BancoCuentaModel,
              as: 'cuenta',
              attributes: ['id', 'nombre_cuenta']
            }
          ]
        }
      ]
    });

    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    res.json(cheque);
  } catch (error) {
    console.error('OBR_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear cheque  POST /cheques
 *    Reglas:
 *      - tipo='emitido' => requiere chequera_id (se infiere banco_id)
 *      - tipo='recibido' => banco_id requerido (banco del cheque)
 *      - upsert flujo:
 *          * recibido: ingreso (fecha_cobro_prevista si viene)
 *          * emitido : egreso (fecha_vencimiento si viene)
 * =======================================================================*/
export const CR_Cheque_CTS = async (req, res) => {
  const body = req.body || {};
  const { usuario_log_id } = body;

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    // Validaciones mínimas
    if (!['recibido', 'emitido'].includes(body.tipo)) {
      throw new Error('tipo inválido (recibido/emitido)');
    }

    // Inferencias
    let banco_id = body.banco_id ?? null;
    if (body.tipo === 'emitido') {
      if (!body.chequera_id)
        throw new Error('chequera_id es requerido para cheques emitidos');
      const chequera = await ChequeraModel.findByPk(body.chequera_id, {
        include: [
          {
            model: BancoCuentaModel,
            as: 'cuenta',
            include: [{ model: BancoModel, as: 'banco' }]
          }
        ],
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!chequera) throw new Error('Chequera inexistente');
      // banco propio
      banco_id = chequera?.cuenta?.banco?.id ?? null;
      if (!banco_id)
        throw new Error('No se pudo inferir el banco propio desde la chequera');
    } else {
      // recibido
      if (!banco_id)
        throw new Error('banco_id es requerido para cheques recibidos');
    }

    // Unicidad banco+numero
    const dup = await ChequeModel.findOne({
      where: { banco_id, numero: body.numero },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (dup) throw new Error('Ya existe un cheque con ese banco y número');

    const nuevo = await ChequeModel.create(
      {
        tipo: body.tipo,
        canal: body.canal || 'C1',
        banco_id,
        chequera_id: body.chequera_id ?? null,
        numero: body.numero,
        monto: body.monto,
        fecha_emision: body.fecha_emision ?? null,
        fecha_vencimiento: body.fecha_vencimiento ?? null,
        fecha_cobro_prevista: body.fecha_cobro_prevista ?? null,
        cliente_id: body.cliente_id ?? null,
        proveedor_id: body.proveedor_id ?? null,
        venta_id: body.venta_id ?? null,
        compra_id: body.compra_id ?? null,
        beneficiario_nombre: body.beneficiario_nombre ?? null,
        estado: body.tipo === 'recibido' ? 'en_cartera' : 'registrado',
        motivo_estado: null,
        observaciones: body.observaciones ?? null,
        created_by: body.created_by ?? usuario_log_id ?? null,
        updated_by: body.updated_by ?? usuario_log_id ?? null
      },
      { transaction: t }
    );

    // Bitácora
    await ChequeMovimientoModel.create(
      {
        cheque_id: nuevo.id,
        tipo_mov: 'alta',
        referencia_tipo: 'otro',
        referencia_id: null,
        notas: 'Alta de cheque'
      },
      { transaction: t }
    );

    // Flujo proyectado
    if (body.tipo === 'recibido' && nuevo.fecha_cobro_prevista) {
      await upsertFlujoCheque({
        t,
        chequeId: nuevo.id,
        signo: 'ingreso',
        fecha: nuevo.fecha_cobro_prevista,
        monto: nuevo.monto,
        descripcion: `Proyección cobro cheque #${nuevo.numero}`
      });
    } else if (body.tipo === 'emitido' && nuevo.fecha_vencimiento) {
      await upsertFlujoCheque({
        t,
        chequeId: nuevo.id,
        signo: 'egreso',
        fecha: nuevo.fecha_vencimiento,
        monto: nuevo.monto,
        descripcion: `Proyección egreso cheque emitido #${nuevo.numero}`
      });
    }

    await t.commit();

    try {
      await registrarLog(
        req,
        'cheques',
        'crear',
        `creó el cheque #${nuevo.numero} (${nuevo.tipo})`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Cheque creado correctamente', cheque: nuevo });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('CR_Cheque_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Editar cheque  PUT/PATCH /cheques/:id
 *    - Protege unicidad banco+numero si cambia
 *    - Recalcula proyección de flujo si cambian fechas relevantes
 * =======================================================================*/
export const UR_Cheque_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const antes = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!antes)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });

    // Unicidad banco+numero al cambiar
    const banco_id = body.banco_id ?? antes.banco_id;
    const numero = body.numero ?? antes.numero;
    if (
      Number(banco_id) !== Number(antes.banco_id) ||
      Number(numero) !== Number(antes.numero)
    ) {
      const dup = await ChequeModel.findOne({
        where: { banco_id, numero, id: { [Op.ne]: id } },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (dup) throw new Error('Ya existe un cheque con ese banco y número');
    }

    const [updated] = await ChequeModel.update(
      {
        tipo: body.tipo ?? antes.tipo,
        canal: body.canal ?? antes.canal,
        banco_id,
        chequera_id: body.chequera_id ?? antes.chequera_id,
        numero,
        monto: body.monto ?? antes.monto,
        fecha_emision: body.fecha_emision ?? antes.fecha_emision,
        fecha_vencimiento: body.fecha_vencimiento ?? antes.fecha_vencimiento,
        fecha_cobro_prevista:
          body.fecha_cobro_prevista ?? antes.fecha_cobro_prevista,
        cliente_id: body.cliente_id ?? antes.cliente_id,
        proveedor_id: body.proveedor_id ?? antes.proveedor_id,
        venta_id: body.venta_id ?? antes.venta_id,
        compra_id: body.compra_id ?? antes.compra_id,
        beneficiario_nombre:
          body.beneficiario_nombre ?? antes.beneficiario_nombre,
        observaciones: body.observaciones ?? antes.observaciones,
        updated_by: usuario_log_id ?? antes.updated_by
      },
      { where: { id }, transaction: t }
    );

    if (updated !== 1) throw new Error('No se pudo actualizar el cheque');

    // Recalcular proyección
    const despues = await ChequeModel.findByPk(id, { transaction: t });
    if (despues.tipo === 'recibido') {
      if (despues.fecha_cobro_prevista) {
        await upsertFlujoCheque({
          t,
          chequeId: id,
          signo: 'ingreso',
          fecha: despues.fecha_cobro_prevista,
          monto: despues.monto,
          descripcion: `Proyección cobro cheque #${despues.numero}`
        });
      } else {
        await deleteFlujoCheque({ t, chequeId: id });
      }
    } else {
      if (despues.fecha_vencimiento) {
        await upsertFlujoCheque({
          t,
          chequeId: id,
          signo: 'egreso',
          fecha: despues.fecha_vencimiento,
          monto: despues.monto,
          descripcion: `Proyección egreso cheque emitido #${despues.numero}`
        });
      } else {
        await deleteFlujoCheque({ t, chequeId: id });
      }
    }

    await t.commit();

    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `actualizó el cheque #${antes.numero}`,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    const actualizado = await ChequeModel.findByPk(id);
    return res.json({
      message: 'Cheque actualizado correctamente',
      cheque: actualizado
    });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('UR_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar / Anular  DELETE /cheques/:id?forzar=true
 *    - Si tiene movimientos bancarios asociados => no eliminar
 *    - Si tiene movimientos de cheque => pide ?forzar para anular
 * =======================================================================*/
export const ER_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const rawForzado = req.body?.forzado ?? req.query?.forzar ?? 'false';
  const forzado = [true, 'true', 1, '1'].includes(rawForzado);
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });

    const tieneMovBanc = await BancoMovimientoModel.count({
      where: { referencia_tipo: 'cheque', referencia_id: id },
      transaction: t
    });
    const cantMovs = await ChequeMovimientoModel.count({
      where: { cheque_id: id },
      transaction: t
    });

    if (tieneMovBanc > 0) {
      return res.status(409).json({
        mensajeError:
          'No puede eliminar: el cheque tiene movimientos bancarios asociados'
      });
    }

    if (cantMovs > 1 && !forzado) {
      return res.status(409).json({
        mensajeError:
          'El cheque tiene movimientos registrados. ¿Desea ANULARLO de todas formas?'
      });
    }

    if (cantMovs > 1 && forzado) {
      await ChequeModel.update(
        { estado: 'anulado', motivo_estado: 'Anulado por usuario' },
        { where: { id }, transaction: t }
      );
      await deleteFlujoCheque({ t, chequeId: id });
      await ChequeMovimientoModel.create(
        {
          cheque_id: id,
          tipo_mov: 'anulacion',
          referencia_tipo: 'otro',
          referencia_id: null,
          notas: 'Anulación forzada'
        },
        { transaction: t }
      );
      await t.commit();

      try {
        await registrarLog(
          req,
          'cheques',
          'editar',
          `anuló el cheque #${cheque.numero}`,
          usuario_log_id
        );
      } catch {}
      return res.json({ message: 'Cheque ANULADO (tenía movimientos).' });
    }

    // Sin dependencias => eliminación física
    await ChequeModel.destroy({ where: { id }, transaction: t });
    await deleteFlujoCheque({ t, chequeId: id });
    await t.commit();

    try {
      await registrarLog(
        req,
        'cheques',
        'eliminar',
        `eliminó el cheque #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque eliminado correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('ER_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 6) Transición: depositar (recibido)  PATCH /cheques/:id/depositar
 *    body: { banco_cuenta_id, fecha_deposito?, fecha_cobro_prevista?, usuario_log_id? }
 *    - Cambia estado a 'depositado'
 *    - Registra movimiento de cheque (referencia_id = banco_cuenta_id)
 *    - Upsert flujo ingreso (fecha_cobro_prevista)
 * =======================================================================*/
export const TR_Depositar_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const {
    banco_cuenta_id,
    fecha_deposito,
    fecha_cobro_prevista,
    usuario_log_id
  } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    if (!banco_cuenta_id) throw new Error('banco_cuenta_id es requerido');

    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    if (cheque.tipo !== 'recibido')
      return res
        .status(400)
        .json({ mensajeError: 'Solo aplica a cheques recibidos' });
    if (
      !['en_cartera', 'registrado', 'endosado', 'aplicado_a_compra'].includes(
        cheque.estado
      )
    ) {
      return res
        .status(409)
        .json({
          mensajeError: `El cheque no puede pasar a DEPOSITADO desde estado "${cheque.estado}"`
        });
    }

    const cuenta = await BancoCuentaModel.findByPk(banco_cuenta_id, {
      transaction: t
    });
    if (!cuenta)
      return res
        .status(400)
        .json({ mensajeError: 'Cuenta bancaria de depósito inexistente' });

    await ChequeModel.update(
      {
        estado: 'depositado',
        fecha_cobro_prevista:
          fecha_cobro_prevista ?? cheque.fecha_cobro_prevista
      },
      { where: { id }, transaction: t }
    );

    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'deposito',
        fecha_mov: fecha_deposito ?? new Date(),
        referencia_tipo: 'deposito',
        referencia_id: banco_cuenta_id,
        notas: `Depósito en cuenta "${cuenta.nombre_cuenta}"`
      },
      { transaction: t }
    );

    // Proyección de ingreso (si hay fecha)
    const chq = await ChequeModel.findByPk(id, { transaction: t });
    if (chq.fecha_cobro_prevista) {
      await upsertFlujoCheque({
        t,
        chequeId: id,
        signo: 'ingreso',
        fecha: chq.fecha_cobro_prevista,
        monto: chq.monto,
        descripcion: `Proyección cobro cheque #${chq.numero}`
      });
    }

    await t.commit();
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `depositó el cheque #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque depositado correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Depositar_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 7) Transición: acreditar (recibido)  PATCH /cheques/:id/acreditar
 *    body: { fecha_acreditacion?, banco_cuenta_id?, usuario_log_id? }
 *    - Cambia estado a 'acreditado'
 *    - Crea MOVIMIENTO BANCARIO (crédito)
 *    - Borra proyección de flujo
 * =======================================================================*/
export const TR_Acreditar_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { fecha_acreditacion, banco_cuenta_id, usuario_log_id } =
    req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    if (cheque.tipo !== 'recibido')
      return res
        .status(400)
        .json({ mensajeError: 'Solo aplica a cheques recibidos' });
    if (cheque.estado !== 'depositado') {
      return res
        .status(409)
        .json({
          mensajeError: `El cheque debe estar DEPOSITADO (actual: ${cheque.estado})`
        });
    }

    // Obtener cuenta para acreditar: del depósito previo o body
    let cuentaId = await getCuentaDepositoFromMov({ t, chequeId: id });
    if (!cuentaId && banco_cuenta_id) cuentaId = Number(banco_cuenta_id);
    if (!cuentaId)
      return res
        .status(400)
        .json({
          mensajeError: 'No se pudo determinar la cuenta de acreditación'
        });

    const cuenta = await BancoCuentaModel.findByPk(cuentaId, {
      transaction: t
    });
    if (!cuenta)
      return res
        .status(400)
        .json({ mensajeError: 'Cuenta bancaria inexistente' });

    await ChequeModel.update(
      { estado: 'acreditado' },
      { where: { id }, transaction: t }
    );

    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'acreditacion',
        fecha_mov: fecha_acreditacion ?? new Date(),
        referencia_tipo: 'deposito',
        referencia_id: cuentaId,
        notas: `Acreditación en cuenta "${cuenta.nombre_cuenta}"`
      },
      { transaction: t }
    );

    // Movimiento bancario (crédito)
    await BancoMovimientoModel.create(
      {
        banco_cuenta_id: cuentaId,
        fecha: fecha_acreditacion ?? new Date(),
        descripcion: `Acreditación cheque #${cheque.numero}`,
        debito: 0,
        credito: cheque.monto,
        referencia_tipo: 'cheque',
        referencia_id: id
      },
      { transaction: t }
    );

    // Limpiar proyección
    await deleteFlujoCheque({ t, chequeId: id });

    await t.commit();
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `acreditó el cheque #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque acreditado correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Acreditar_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 8) Transición: rechazar (recibido)  PATCH /cheques/:id/rechazar
 *    body: { motivo, fecha_rechazo?, usuario_log_id? }
 *    - Solo desde 'depositado'
 *    - Cambia estado a 'rechazado' (reabre situación del cliente a nivel negocio)
 *    - Borra proyección si existía (por las dudas)
 * =======================================================================*/
export const TR_Rechazar_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { motivo, fecha_rechazo, usuario_log_id } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    if (cheque.tipo !== 'recibido')
      return res
        .status(400)
        .json({ mensajeError: 'Solo aplica a cheques recibidos' });
    if (cheque.estado !== 'depositado') {
      return res
        .status(409)
        .json({
          mensajeError: `El cheque debe estar DEPOSITADO (actual: ${cheque.estado})`
        });
    }

    await ChequeModel.update(
      { estado: 'rechazado', motivo_estado: motivo ?? 'Rechazado por banco' },
      { where: { id }, transaction: t }
    );

    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'rechazo',
        fecha_mov: fecha_rechazo ?? new Date(),
        referencia_tipo: 'deposito',
        referencia_id: null,
        notas: motivo ?? 'Rechazado'
      },
      { transaction: t }
    );

    await deleteFlujoCheque({ t, chequeId: id });

    await t.commit();
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `marcó RECHAZADO el cheque #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque marcado como RECHAZADO.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Rechazar_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 9) Transición: aplicar a proveedor  PATCH /cheques/:id/aplicar-a-proveedor
 * body (genérico): { proveedor_id?, compra_id?, fecha?, usuario_log_id? }
 *
 * CASO A) Cheque RECIBIDO (endoso a proveedor):
 *   - estado actual: 'registrado' | 'en_cartera'
 *   - requiere: proveedor_id (del body)
 *   - efecto: estado = 'aplicado_a_compra', guarda proveedor_id/compra_id
 *   - movimiento: cheque_movimientos.tipo_mov = 'aplicacion' (notas: "Endoso ...")
 *   - flujo: deleteFlujoCheque (ya no ingresa por depósito)
 *
 * CASO B) Cheque EMITIDO (aplico mi propio cheque a deuda de proveedor):
 *   - estado actual: 'registrado' | 'en_cartera'
 *   - requiere: proveedor_id (si no viene en body, usa el del cheque)
 *   - efecto: estado = 'aplicado_a_compra', asegura proveedor_id/compra_id
 *   - movimiento: cheque_movimientos.tipo_mov = 'aplicacion' (notas: "Pago ...")
 *   - flujo: NO borra flujo de ingreso (no existe para emitidos)
 * =========================================================================*/
export const TR_AplicarProveedor_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { proveedor_id, compra_id, fecha, usuario_log_id } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque) {
      await t.rollback();
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    }
    if (!['registrado', 'en_cartera'].includes(cheque.estado)) {
      await t.rollback();
      return res.status(409).json({
        mensajeError: `El cheque no puede aplicarse desde estado "${cheque.estado}"`
      });
    }

    // Resolver proveedor segun tipo
    if (cheque.tipo === 'recibido') {
      if (!proveedor_id) throw new Error('proveedor_id es requerido');
      await ChequeModel.update(
        {
          estado: 'aplicado_a_compra',
          proveedor_id,
          compra_id: compra_id ?? cheque.compra_id
        },
        { where: { id }, transaction: t }
      );

      await ChequeMovimientoModel.create(
        {
          cheque_id: id,
          tipo_mov: 'aplicacion',
          fecha_mov: fecha ?? new Date(),
          referencia_tipo: 'pago',
          referencia_id: compra_id ?? null,
          notas: `Endoso a proveedor_id=${proveedor_id}`
        },
        { transaction: t }
      );

      // Quita proyección de ingreso
      await deleteFlujoCheque({ t, chequeId: id });
    } else if (cheque.tipo === 'emitido') {
      const provId = Number(proveedor_id || cheque.proveedor_id || 0);
      if (!provId) throw new Error('proveedor_id es requerido para cheques emitidos');

      await ChequeModel.update(
        {
          estado: 'aplicado_a_compra',
          proveedor_id: provId,
          compra_id: compra_id ?? cheque.compra_id
        },
        { where: { id }, transaction: t }
      );

      await ChequeMovimientoModel.create(
        {
          cheque_id: id,
          tipo_mov: 'aplicacion',
          fecha_mov: fecha ?? new Date(),
          referencia_tipo: 'pago',
          referencia_id: compra_id ?? null,
          notas: `Pago a proveedor_id=${provId}`
        },
        { transaction: t }
      );
      // NO borrar flujo: emitidos no generan ingreso
    } else {
      throw new Error('Tipo de cheque desconocido');
    }

    await t.commit();

    // Log fuera de tx
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `aplicó el cheque #${cheque.numero} (tipo: ${cheque.tipo})`,
        usuario_log_id
      );
    } catch {}

    return res.json({
      message: 'Cheque aplicado a proveedor correctamente.'
    });
  } catch (error) {
    try { await t.rollback(); } catch {}
    console.error('TR_AplicarProveedor_Cheque_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};


/* =========================================================================
 * Transición: ENTREGAR  PATCH /cheques/:id/entregar
 * body: { destinatario?, proveedor_id?, fecha?, usuario_log_id? }
 *
 * RECIBIDO:
 *   - estados permitidos: 'registrado' | 'en_cartera'
 *   - efecto: estado = 'entregado'
 *   - movimiento: tipo_mov='entrega' (notas: destinatario libre)
 *   - flujo: deleteFlujoCheque (ya no se depositará)
 *
 * EMITIDO:
 *   - estados permitidos: 'registrado' | 'en_cartera' | (opcional) 'aplicado_a_compra'
 *   - si falta proveedor_id en el cheque y viene en body, lo guarda
 *   - efecto: estado = 'entregado'
 *   - movimiento: tipo_mov='entrega' (notas: proveedor_id o destinatario)
 *   - flujo: no cambia (el movimiento bancario se hace en COMPENSAR)
 * =========================================================================*/
export const TR_Entregar_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { fecha, destinatario, proveedor_id, usuario_log_id } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque) {
      await t.rollback();
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    }

    // Estados válidos para ENTREGAR
    if (
      !['registrado', 'en_cartera', 'aplicado_a_compra'].includes(cheque.estado)
    ) {
      await t.rollback();
      return res.status(409).json({
        mensajeError: `El cheque no puede entregarse desde estado "${cheque.estado}"`
      });
    }

    const isEmitido = cheque.tipo === 'emitido';
    const provId = isEmitido
      ? Number(proveedor_id || cheque.proveedor_id || 0)
      : null;

    // Emitido => si no tiene proveedor, exigimos uno
    if (isEmitido && !provId) {
      await t.rollback();
      return res.status(400).json({
        mensajeError: 'proveedor_id es requerido para entregar cheques emitidos'
      });
    }

    // Actualizar estado a ENTREGADO (unificar)
    await ChequeModel.update(
      {
        estado: 'entregado',
        // si es emitido y viene proveedor, lo fijamos (no pisamos si ya estaba)
        proveedor_id: isEmitido
          ? provId || cheque.proveedor_id
          : cheque.proveedor_id,
        motivo_estado: destinatario
          ? `Entregado a ${destinatario}`
          : cheque.motivo_estado
      },
      { where: { id }, transaction: t }
    );

    // Movimiento: entrega
    const referencia_tipo = isEmitido ? 'pago' : 'entrega'; // <— evita el error de ENUM
    const referencia_id = isEmitido ? provId : null;

    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'entrega',
        fecha_mov: fecha ?? new Date(),
        referencia_tipo, // 'pago' (emitido) | 'entrega' (recibido)
        referencia_id, // proveedor_id | null
        notas: isEmitido
          ? `Entregado a proveedor_id=${provId}${
              destinatario ? ` (${destinatario})` : ''
            }`
          : `Entregado a tercero${destinatario ? ` (${destinatario})` : ''}`
      },
      { transaction: t }
    );

    await t.commit();

    // Log fuera de tx
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `entregó el cheque #${cheque.numero} (tipo: ${cheque.tipo})`,
        usuario_log_id
      );
    } catch {}

    return res.json({ message: 'Cheque entregado correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Entregar_Cheque_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 11) Transición: compensar (emitido)  PATCH /cheques/:id/compensar
 *     body: { fecha_compensacion?, usuario_log_id? }
 *     - Debita cuenta de la chequera asociada
 *     - Estado => 'compensado'
 *     - Elimina proyección de egreso
 * =======================================================================*/
export const TR_Compensar_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { fecha_compensacion, usuario_log_id } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [
        {
          model: ChequeraModel,
          as: 'chequera',
          attributes: ['id', 'banco_cuenta_id']
        }
      ]
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });
    if (cheque.tipo !== 'emitido')
      return res
        .status(400)
        .json({ mensajeError: 'Solo aplica a cheques emitidos' });
    if (!['entregado'].includes(cheque.estado)) {
      return res
        .status(409)
        .json({
          mensajeError: `El cheque debe estar ENTREGADO (actual: ${cheque.estado})`
        });
    }
    const cuentaId = cheque.chequera?.banco_cuenta_id;
    if (!cuentaId)
      return res
        .status(400)
        .json({ mensajeError: 'Chequera sin cuenta bancaria asociada' });

    await ChequeModel.update(
      { estado: 'compensado' },
      { where: { id }, transaction: t }
    );

    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'compensacion',
        fecha_mov: fecha_compensacion ?? new Date(),
        referencia_tipo: 'conciliacion',
        referencia_id: null,
        notas: `Compensación contra cuenta_id=${cuentaId}`
      },
      { transaction: t }
    );

    // Movimiento bancario (débito)
    await BancoMovimientoModel.create(
      {
        banco_cuenta_id: cuentaId,
        fecha: fecha_compensacion ?? new Date(),
        descripcion: `Compensación cheque emitido #${cheque.numero}`,
        debito: cheque.monto,
        credito: 0,
        referencia_tipo: 'cheque',
        referencia_id: id
      },
      { transaction: t }
    );

    // Limpiar proyección
    await deleteFlujoCheque({ t, chequeId: id });

    await t.commit();
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `compensó el cheque emitido #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque emitido COMPENSADO correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Compensar_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 12) Transición genérica: anular  PATCH /cheques/:id/anular
 *      - Empleado para cancelar cheques sin impacto bancario aún.
 * =======================================================================*/
export const TR_Anular_Cheque_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const { motivo, usuario_log_id } = req.body || {};

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    const cheque = await ChequeModel.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque)
      return res.status(404).json({ mensajeError: 'Cheque no encontrado' });

    // Estados permitidos para anular sin forzar
    const permitidos =
      cheque.tipo === 'recibido'
        ? ['registrado', 'en_cartera', 'aplicado_a_compra', 'endosado']
        : ['registrado', 'entregado'];
    if (!permitidos.includes(cheque.estado)) {
      return res
        .status(409)
        .json({
          mensajeError: `El cheque no puede ANULARSE desde "${cheque.estado}"`
        });
    }

    await ChequeModel.update(
      { estado: 'anulado', motivo_estado: motivo ?? 'Anulación por usuario' },
      { where: { id }, transaction: t }
    );
    await ChequeMovimientoModel.create(
      {
        cheque_id: id,
        tipo_mov: 'anulacion',
        referencia_tipo: 'otro',
        referencia_id: null,
        notas: motivo ?? 'Anulado'
      },
      { transaction: t }
    );
    await deleteFlujoCheque({ t, chequeId: id });

    await t.commit();
    try {
      await registrarLog(
        req,
        'cheques',
        'editar',
        `anuló el cheque #${cheque.numero}`,
        usuario_log_id
      );
    } catch {}
    return res.json({ message: 'Cheque ANULADO correctamente.' });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('TR_Anular_Cheque_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
