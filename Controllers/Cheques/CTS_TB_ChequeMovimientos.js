// Controllers/Cheques/CTS_TB_ChequeMovimientos.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Bitácora de movimientos de un cheque (alta, depósito, acreditación, etc.)
 * ⚠️ Este controlador SOLO administra la BITÁCORA.
 *    Los impactos contables/estados deben hacerse con los endpoints de CTS_TB_Cheques.js.
 */

import db from '../../DataBase/db.js';
import { Op, col, literal } from 'sequelize';
import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { ChequeMovimientoModel } from '../../Models/Cheques/MD_TB_ChequeMovimientos.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

const TIPOS = new Set([
  'alta',
  'aplicacion',
  'deposito',
  'acreditacion',
  'rechazo',
  'anulacion',
  'entrega',
  'compensacion'
]);
const REFTIPOS = new Set([
  'venta',
  'compra',
  'pago',
  'deposito',
  'conciliacion',
  'otro'
]);

// GET /cheques/movimientos  (GLOBAL)
export const OBRS_AllChequeMovimientos_CTS = async (req, res) => {
  try {
    const {
      q = '',
      // aceptamos ambos nombres para comodidad del front
      tipo,                // alias de tipo_mov
      tipo_mov,            // nombre real en DB
      canal,               // viene de cheques.canal
      cheque_id,           // opcional
      desde,
      hasta,
      page = 1,
      pageSize = 20,
      order = 'fecha_mov',
      dir = 'DESC'
    } = req.query;

    // columnas ordenables
    const ORDERABLE = new Set(['id', 'fecha_mov', 'created_at']);
    const orderCol = ORDERABLE.has(String(order)) ? String(order) : 'fecha_mov';
    const orderDir = String(dir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const where = {};
    const whereCheque = {};

    if (cheque_id) where.cheque_id = Number(cheque_id);

    // filtros por tipo de movimiento
    const tipoFiltrado = tipo_mov || tipo;
    if (tipoFiltrado) where.tipo_mov = String(tipoFiltrado);

    // filtro por canal (en tabla cheques)
    if (canal) whereCheque.canal = String(canal);

    if (desde || hasta) {
      where.fecha_mov = {};
      if (desde) where.fecha_mov[Op.gte] = new Date(`${desde}T00:00:00`);
      if (hasta) where.fecha_mov[Op.lte] = new Date(`${hasta}T23:59:59`);
    }

    // búsqueda libre: sobre notas del movimiento, número del cheque y beneficiario
    const or = [];
    if (q) {
      or.push({ notas: { [Op.like]: `%${q}%` } });
      // para buscar por número del cheque via include
      // también se puede usar having con col, pero con include + where separado es más claro
      whereCheque[Op.or] = [
        { numero: { [Op.like]: `%${q}%` } },
        { beneficiario_nombre: { [Op.like]: `%${q}%` } },
      ];
    }
    if (or.length) where[Op.or] = or;

    const limit = Math.max(1, Number(pageSize));
    const pageNum = Math.max(1, Number(page));
    const offset = (pageNum - 1) * limit;

    const { rows, count } = await ChequeMovimientoModel.findAndCountAll({
      where,
      attributes: {
        // Alias para compatibilidad con el front:
        include: [
          [col('tipo_mov'), 'tipo'], // movimiento.tipo -> tipo_mov
          [col('notas'), 'observaciones'], // movimiento.observaciones -> notas
          [
            literal(
              "CONCAT(COALESCE(referencia_tipo,''),' ',COALESCE(referencia_id,''))"
            ),
            'referencia'
          ],
          [col('cheque.monto'), 'monto'], // tomar monto del cheque
          [col('cheque.canal'), 'canal'], // canal del cheque (C1/C2)
          [col('cheque.numero'), 'cheque_numero'], // útil para mostrar
          [col('cheque.estado'), 'cheque_estado'] // útil para detalle
        ]
      },
      include: [
        {
          model: ChequeModel,
          as: 'cheque',
          where: Object.keys(whereCheque).length > 0 ? whereCheque : undefined,
          required: false, // 🔹 siempre left join, así permite buscar
          attributes: [
            'id',
            'tipo',
            'canal',
            'numero',
            'monto',
            'estado',
            'banco_id',
            'chequera_id',
            'beneficiario_nombre',
            'fecha_emision',
            'fecha_vencimiento',
            'fecha_cobro_prevista'
          ]
        }
      ],
      order: [
        [orderCol, orderDir],
        ['id', 'DESC']
      ],
      limit,
      offset
    });

    return res.json({
      items: rows,
      total: count,
      page: pageNum,
      pageSize: limit
    });
  } catch (err) {
    console.error('OBRS_AllChequeMovimientos_CTS error:', err);
    return res.status(500).json({
      message: 'Fail',
      error: err?.message || 'Error interno'
    });
  }
};


/* =========================================================================
 * 1) Listar  GET /cheques/:cheque_id/movimientos
 *    query: tipo_mov?, ref_tipo?, from?, to?, page?, limit?, orderDir?
 * =======================================================================*/

// GET /cheques/:cheque_id/movimientos  (ALINEADO AL GLOBAL)
export const OBRS_ChequeMovimientos_CTS = async (req, res) => {
  try {
    const chequeId = Number(req.params.cheque_id);

    // Aceptamos nombres "amigables" como en el global
    const {
      q = '',
      tipo,              // alias de tipo_mov
      tipo_mov,          // nombre real
      canal,             // cheques.canal (C1/C2)
      // rangos compatibles
      desde, hasta,      // estilo global
      from, to,          // estilo previo
      // paginación/orden
      page = 1,
      pageSize = 20,
      limit,             // alias legacy
      order = 'fecha_mov',
      dir = 'DESC',
      orderDir           // alias legacy
    } = req.query || {};

    // === Filtros ===
    const where = { cheque_id: chequeId };
    const whereCheque = {};

    const tipoFiltrado = tipo_mov || tipo;
    if (tipoFiltrado) where.tipo_mov = String(tipoFiltrado);

    if (canal) whereCheque.canal = String(canal);

    const _desde = desde || from;
    const _hasta = hasta || to;
    if (_desde || _hasta) {
      where.fecha_mov = {};
      if (_desde) where.fecha_mov[Op.gte] = new Date(`${_desde}T00:00:00`);
      if (_hasta) where.fecha_mov[Op.lte] = new Date(`${_hasta}T23:59:59`);
    }

    // búsqueda libre (notas / número / beneficiario)
    if (q) {
      where[Op.or] = [{ notas: { [Op.like]: `%${q}%` } }];
      whereCheque[Op.or] = [
        { numero: { [Op.like]: `%${q}%` } },
        { beneficiario_nombre: { [Op.like]: `%${q}%` } }
      ];
    }

    // === Orden/paginación ===
    const ORDERABLE = new Set(['id', 'fecha_mov', 'created_at']);
    const orderCol = ORDERABLE.has(String(order)) ? String(order) : 'fecha_mov';
    const orderDirFinal = String(dir || orderDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const limitNum = Math.max(1, Number(pageSize || limit || 20));
    const pageNum = Math.max(1, Number(page || 1));
    const offset = (pageNum - 1) * limitNum;

    // === Query ===
    const { rows, count } = await ChequeMovimientoModel.findAndCountAll({
      where,
      attributes: {
        include: [
          [col('tipo_mov'), 'tipo'],
          [col('notas'), 'observaciones'],
          [literal("CONCAT(COALESCE(referencia_tipo,''),' ',COALESCE(referencia_id,''))"), 'referencia'],
          [col('cheque.monto'), 'monto'],
          [col('cheque.canal'), 'canal'],
          [col('cheque.numero'), 'cheque_numero'],
          [col('cheque.estado'), 'cheque_estado'],
        ]
      },
      include: [
        {
          model: ChequeModel,
          as: 'cheque',
          where: whereCheque,
          required: Object.keys(whereCheque).length > 0, // sólo si filtra por datos del cheque
          attributes: [
            'id',
            'tipo',
            'canal',
            'numero',
            'monto',
            'estado',
            'banco_id',
            'chequera_id',
            'beneficiario_nombre',
            'fecha_emision',
            'fecha_vencimiento',
            'fecha_cobro_prevista'
          ]
        }
      ],
      order: [
        [orderCol, orderDirFinal],
        ['id', orderDirFinal]
      ],
      limit: limitNum,
      offset
    });

    return res.json({
      items: rows,
      total: count,
      page: pageNum,
      pageSize: limitNum
    });
  } catch (error) {
    console.error('OBRS_ChequeMovimientos_CTS:', error);
    res.status(500).json({ message: 'Fail', error: error.message });
  }
};

/* =========================================================================
 * 2) Detalle  GET /cheques/:cheque_id/movimientos/:id
 * =======================================================================*/
export const OBR_ChequeMovimiento_CTS = async (req, res) => {
  try {
    const row = await ChequeMovimientoModel.findOne({
      where: {
        id: Number(req.params.id),
        cheque_id: Number(req.params.cheque_id)
      }
    });
    if (!row)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });
    res.json(row);
  } catch (error) {
    console.error('OBR_ChequeMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear  POST /cheques/:cheque_id/movimientos
 *    body: { tipo_mov, fecha_mov?, referencia_tipo?, referencia_id?, notas?, user_id?, usuario_log_id? }
 * =======================================================================*/
export const CR_ChequeMovimiento_CTS = async (req, res) => {
  const cheque_id = Number(req.params.cheque_id);
  const {
    tipo_mov,
    fecha_mov,
    referencia_tipo = 'otro',
    referencia_id = null,
    notas = null,
    user_id = null,
    usuario_log_id = null
  } = req.body || {};
  try {
    if (!TIPOS.has(tipo_mov))
      return res.status(400).json({ mensajeError: 'tipo_mov inválido' });
    if (!REFTIPOS.has(referencia_tipo))
      return res.status(400).json({ mensajeError: 'referencia_tipo inválido' });

    const existe = await ChequeModel.findByPk(cheque_id);
    if (!existe)
      return res.status(400).json({ mensajeError: 'Cheque inexistente' });

    const nuevo = await ChequeMovimientoModel.create({
      cheque_id,
      tipo_mov,
      fecha_mov: fecha_mov ?? new Date(),
      referencia_tipo,
      referencia_id,
      notas,
      user_id
    });

    try {
      await registrarLog(
        req,
        'cheque_movimientos',
        'crear',
        `registró movimiento ${tipo_mov} en cheque_id=${cheque_id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Movimiento registrado', movimiento: nuevo });
  } catch (error) {
    console.error('CR_ChequeMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar  PUT/PATCH /cheques/:cheque_id/movimientos/:id
 *    (permite editar fecha_mov, referencia_tipo/id, notas)
 * =======================================================================*/
export const UR_ChequeMovimiento_CTS = async (req, res) => {
  const { cheque_id, id } = req.params;
  const body = req.body || {};
  const { usuario_log_id } = body;
  try {
    const antes = await ChequeMovimientoModel.findOne({
      where: { id: Number(id), cheque_id: Number(cheque_id) }
    });
    if (!antes)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    if (body.tipo_mov && !TIPOS.has(body.tipo_mov)) {
      return res.status(400).json({ mensajeError: 'tipo_mov inválido' });
    }
    if (body.referencia_tipo && !REFTIPOS.has(body.referencia_tipo)) {
      return res.status(400).json({ mensajeError: 'referencia_tipo inválido' });
    }

    const [updated] = await ChequeMovimientoModel.update(
      {
        tipo_mov: body.tipo_mov ?? antes.tipo_mov,
        fecha_mov: body.fecha_mov ?? antes.fecha_mov,
        referencia_tipo: body.referencia_tipo ?? antes.referencia_tipo,
        referencia_id: body.referencia_id ?? antes.referencia_id,
        notas: body.notas ?? antes.notas,
        user_id: body.user_id ?? antes.user_id
      },
      { where: { id: Number(id), cheque_id: Number(cheque_id) } }
    );
    if (updated !== 1)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    const actualizado = await ChequeMovimientoModel.findByPk(Number(id));

    try {
      await registrarLog(
        req,
        'cheque_movimientos',
        'editar',
        `actualizó movimiento #${id} de cheque_id=${cheque_id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Movimiento actualizado', movimiento: actualizado });
  } catch (error) {
    console.error('UR_ChequeMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar  DELETE /cheques/:cheque_id/movimientos/:id
 *    ⚠️ Solo elimina la bitácora, no afecta contabilidad.
 * =======================================================================*/
export const ER_ChequeMovimiento_CTS = async (req, res) => {
  const { cheque_id, id } = req.params;
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;
  try {
    const row = await ChequeMovimientoModel.findOne({
      where: { id: Number(id), cheque_id: Number(cheque_id) }
    });
    if (!row)
      return res.status(404).json({ mensajeError: 'Movimiento no encontrado' });

    await ChequeMovimientoModel.destroy({ where: { id: Number(id) } });

    try {
      await registrarLog(
        req,
        'cheque_movimientos',
        'eliminar',
        `eliminó movimiento #${id} de cheque_id=${cheque_id}`,
        usuario_log_id
      );
    } catch {}

    res.json({ message: 'Movimiento eliminado correctamente.' });
  } catch (error) {
    console.error('ER_ChequeMovimiento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
