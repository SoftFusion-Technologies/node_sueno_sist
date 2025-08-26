/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 25 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para manejar operaciones sobre la tabla 'Pedidos Stock'
 * (transferencias entre sucursales).
 *
 * Nomenclatura:
 *   OBR_   obtenerRegistro
 *   OBRS_  obtenerRegistros
 *   CR_    crearRegistro
 *   ER_    eliminarRegistro (en este caso → cancelar)
 *   UR_    actualizarRegistro
 */

import dotenv from 'dotenv';
import { Op } from 'sequelize';
import db from '../../DataBase/db.js';
import { PedidoStockModel } from '../../Models/Stock/MD_TB_PedidoStock.js';
import MD_TB_Productos from '../../Models/Stock/MD_TB_Productos.js';
import MD_TB_Locales from '../../Models/Stock/MD_TB_Locales.js';
import MD_TB_Usuarios from '../../Models/MD_TB_Users.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const ProductosModel = MD_TB_Productos.ProductosModel;
const LocalesModel = MD_TB_Locales.LocalesModel;
const UserModel = MD_TB_Usuarios.UserModel;

// Transiciones de estado permitidas
const TRANSICIONES = {
  pendiente: ['visto', 'cancelado'],
  visto: ['preparacion', 'cancelado'],
  preparacion: ['enviado', 'cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: []
};

// Emojis para logs (opcional)
const EMOJI = {
  pendiente: '🟥',
  visto: '🟨',
  preparacion: '🟦',
  enviado: '🟧',
  entregado: '🟩',
  cancelado: '⬜'
};

// ========== OBRS: Listar pedidos (con filtros básicos) ==========
export const OBRS_PedidosStock_CTS = async (req, res) => {
  try {
    const {
      estado, // ej: 'pendiente'
      local_origen_id, // ej: 1
      local_destino_id, // ej: 4
      producto_id,
      desde, // ISO date
      hasta, // ISO date
      q, // búsqueda libre (por observaciones)
      limit = 50,
      offset = 0
    } = req.query;

    const where = {};

    if (estado) where.estado = estado;
    if (local_origen_id) where.local_origen_id = Number(local_origen_id);
    if (local_destino_id) where.local_destino_id = Number(local_destino_id);
    if (producto_id) where.producto_id = Number(producto_id);

    if (desde || hasta) {
      where.created_at = {};
      if (desde) where.created_at[Op.gte] = new Date(desde);
      if (hasta) where.created_at[Op.lte] = new Date(hasta);
    }

    if (q) {
      where.observaciones = { [Op.like]: `%${q}%` };
    }

    const pedidos = await PedidoStockModel.findAll({
      where,
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'codigo_sku']
        },
        {
          model: LocalesModel,
          as: 'local_origen',
          attributes: ['id', 'nombre', 'codigo']
        },
        {
          model: LocalesModel,
          as: 'local_destino',
          attributes: ['id', 'nombre', 'codigo']
        },
        {
          model: UserModel,
          as: 'creador',
          attributes: ['id', 'nombre', 'email']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json(pedidos);
  } catch (error) {
    console.error('Error al listar pedidos:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// ========== OBR: Obtener un pedido por ID ==========
export const OBR_PedidoStock_CTS = async (req, res) => {
  try {
    const { id } = req.params;

    const pedido = await PedidoStockModel.findByPk(id, {
      include: [
        {
          model: ProductosModel,
          as: 'producto',
          attributes: ['id', 'nombre', 'codigo_sku']
        },
        {
          model: LocalesModel,
          as: 'local_origen',
          attributes: ['id', 'nombre', 'codigo', 'direccion']
        },
        {
          model: LocalesModel,
          as: 'local_destino',
          attributes: ['id', 'nombre', 'codigo', 'direccion']
        },
        {
          model: UserModel,
          as: 'creador',
          attributes: ['id', 'nombre', 'email']
        }
      ]
    });

    if (!pedido) {
      return res.status(404).json({ mensajeError: 'Pedido no encontrado' });
    }
    res.json(pedido);
  } catch (error) {
    console.error('Error al obtener pedido:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// ========== CR: Crear pedido ==========
export const CR_PedidoStock_CTS = async (req, res) => {
  const {
    producto_id,
    stock_id_origen,
    local_origen_id,
    local_destino_id,
    cantidad,
    prioridad = 'normal',
    observaciones,
    usuario_log_id
  } = req.body;

  if (!producto_id || !local_origen_id || !local_destino_id || !cantidad) {
    return res.status(400).json({ mensajeError: 'Faltan campos obligatorios' });
  }
  if (Number(local_origen_id) === Number(local_destino_id)) {
    return res
      .status(400)
      .json({ mensajeError: 'El origen y destino no pueden ser iguales' });
  }

  const t = await db.transaction();
  try {
    // 🔹 Verificar si ya existe un pedido igual (mismo producto y locales)
    const existente = await PedidoStockModel.findOne({
      where: {
        producto_id,
        local_origen_id,
        local_destino_id,
        estado: { [Op.notIn]: ['entregado', 'cancelado'] } // solo pedidos activos
      },
      include: [
        { model: ProductosModel, as: 'producto', attributes: ['id', 'nombre'] },
        { model: LocalesModel, as: 'local_origen', attributes: ['id', 'nombre'] },
        { model: LocalesModel, as: 'local_destino', attributes: ['id', 'nombre'] }
      ],
      transaction: t
    });

    if (existente) {
      await t.rollback();
      return res.status(409).json({
        mensajeError:
          `Ya existe un pedido ${existente.estado} para el producto "${existente.producto?.nombre}" ` +
          `desde "${existente.local_origen?.nombre}" ` +
          `hacia "${existente.local_destino?.nombre}". ` +
          `ID existente: ${existente.id}`
      });
    }

    // 🔹 Crear nuevo pedido
    const nuevo = await PedidoStockModel.create(
      {
        producto_id,
        stock_id_origen: stock_id_origen || null,
        local_origen_id,
        local_destino_id,
        cantidad_solicitada: Number(cantidad),
        prioridad,
        observaciones: observaciones || null,
        creado_por: usuario_log_id || null,
        estado: 'pendiente'
      },
      { transaction: t }
    );

    // Log descriptivo con nombres
    const desc = `creó el pedido #${nuevo.id} (${cantidad}u) del producto "${nuevo.producto_id}" ` +
                 `desde local ${local_origen_id} hacia local ${local_destino_id}`;
    await registrarLog(req, 'pedidos_stock', 'crear', desc, usuario_log_id, t);

    await t.commit();
    res.json({ message: 'Pedido creado correctamente', pedido_id: nuevo.id });
  } catch (error) {
    await t.rollback();
    console.error('Error al crear pedido:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};



// ========== UR: Actualizar estado del pedido ==========
export const UR_PedidoStock_Estado_CTS = async (req, res) => {
  const { id } = req.params;
  const { nuevo_estado, usuario_log_id } = req.body;

  if (!nuevo_estado) {
    return res.status(400).json({ mensajeError: 'nuevo_estado es requerido' });
  }

  try {
    const pedido = await PedidoStockModel.findByPk(id);
    if (!pedido)
      return res.status(404).json({ mensajeError: 'Pedido no encontrado' });

    const actual = pedido.estado;
    const permitidos = TRANSICIONES[actual] || [];

    if (!permitidos.includes(nuevo_estado)) {
      return res.status(400).json({
        mensajeError: `Transición inválida: ${actual} → ${nuevo_estado}`
      });
    }

    await pedido.update({ estado: nuevo_estado });

    // Log
    const desc = `cambió el estado del pedido #${pedido.id} de ${EMOJI[actual]} ${actual} a ${EMOJI[nuevo_estado]} ${nuevo_estado}`;
    await registrarLog(req, 'Pedidos Stock', 'editar', desc, usuario_log_id);

    res.json({ message: 'Estado actualizado', estado: nuevo_estado });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// ========== UR: Actualizar cantidades (preparada/enviada/recibida) ==========
export const UR_PedidoStock_Cantidades_CTS = async (req, res) => {
  const { id } = req.params;
  const {
    cantidad_preparada, // opcional
    cantidad_enviada, // opcional
    cantidad_recibida, // opcional
    usuario_log_id
  } = req.body;

  try {
    const pedido = await PedidoStockModel.findByPk(id);
    if (!pedido)
      return res.status(404).json({ mensajeError: 'Pedido no encontrado' });

    const updates = {};

    if (cantidad_preparada !== undefined) {
      const val = Number(cantidad_preparada);
      if (val < 0 || val > pedido.cantidad_solicitada) {
        return res
          .status(400)
          .json({ mensajeError: 'cantidad_preparada inválida' });
      }
      updates.cantidad_preparada = val;
    }

    if (cantidad_enviada !== undefined) {
      const val = Number(cantidad_enviada);
      const tope = updates.cantidad_preparada ?? pedido.cantidad_preparada;
      if (val < 0 || val > tope) {
        return res
          .status(400)
          .json({ mensajeError: 'cantidad_enviada inválida' });
      }
      updates.cantidad_enviada = val;
    }

    if (cantidad_recibida !== undefined) {
      const val = Number(cantidad_recibida);
      const tope = updates.cantidad_enviada ?? pedido.cantidad_enviada;
      if (val < 0 || val > tope) {
        return res
          .status(400)
          .json({ mensajeError: 'cantidad_recibida inválida' });
      }
      updates.cantidad_recibida = val;
    }

    await pedido.update(updates);

    // Log
    const cambios = Object.entries(updates)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const desc = `actualizó cantidades del pedido #${pedido.id} (${cambios})`;
    await registrarLog(req, 'Pedidos Stock', 'editar', desc, usuario_log_id);

    res.json({ message: 'Cantidades actualizadas', pedido });
  } catch (error) {
    console.error('Error al actualizar cantidades:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// ========== ER: Cancelar pedido ==========
export const ER_PedidoStock_CTS = async (req, res) => {
  const { id } = req.params;
  const { usuario_log_id, motivo } = req.body;

  try {
    const pedido = await PedidoStockModel.findByPk(id);
    if (!pedido)
      return res.status(404).json({ mensajeError: 'Pedido no encontrado' });

    if (['entregado', 'cancelado'].includes(pedido.estado)) {
      return res
        .status(400)
        .json({
          mensajeError: `No se puede cancelar un pedido en estado ${pedido.estado}`
        });
    }

    await pedido.update({
      estado: 'cancelado',
      observaciones: motivo ?? pedido.observaciones
    });

    // Log
    const desc = `canceló el pedido #${pedido.id} ⬜${
      motivo ? ` (motivo: ${motivo})` : ''
    }`;
    await registrarLog(req, 'Pedidos Stock', 'eliminar', desc, usuario_log_id);

    res.json({ message: 'Pedido cancelado correctamente' });
  } catch (error) {
    console.error('Error al cancelar pedido:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
