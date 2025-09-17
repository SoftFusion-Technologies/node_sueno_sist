/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Estados.js) contiene controladores para manejar operaciones CRUD sobre la tabla de estados.
 *
 * Tema: Controladores - Estados
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Estados from '../../Models/Stock/MD_TB_Estados.js';
const EstadosModel = MD_TB_Estados.EstadosModel;
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js'; // Asegurate de tenerlo
import { Op } from 'sequelize';

// Obtener todos los estados
export const OBRS_Estados_CTS = async (req, res) => {
  try {
    const { page, limit, q, orderBy, orderDir } = req.query || {};

    // ¿El cliente realmente mandó algún parámetro?
    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    // 🔁 SIN params => array plano (compat con StockGet y demás)
    if (!hasParams) {
      const estados = await EstadosModel.findAll({ order: [['id', 'ASC']] });
      return res.json(estados);
    }

    // 🧭 Paginado + filtros + orden
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const where = {};
    if (q && q.trim() !== '') {
      where.nombre = { [Op.like]: `%${q.trim()}%` };
    }

    const validColumns = ['id', 'nombre', 'created_at', 'updated_at'];
    const col = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dir = ['ASC', 'DESC'].includes(String(orderDir || '').toUpperCase())
      ? String(orderDir).toUpperCase()
      : 'ASC';

    const { rows, count } = await EstadosModel.findAndCountAll({
      where,
      order: [[col, dir]],
      limit: limitNum,
      offset
    });

    const totalPages = Math.max(Math.ceil(count / limitNum), 1);

    return res.json({
      data: rows,
      meta: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        orderBy: col,
        orderDir: dir,
        q: q || ''
      }
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un estado por ID
export const OBR_Estado_CTS = async (req, res) => {
  try {
    const estado = await EstadosModel.findByPk(req.params.id);
    if (!estado) {
      return res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }
    res.json(estado);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo estado
export const CR_Estado_CTS = async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del estado es obligatorio' });
  }

  try {
    const nuevo = await EstadosModel.create({ nombre });
    res.json({ message: 'Estado creado correctamente', estado: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un estado
export const ER_Estado_CTS = async (req, res) => {
  const { id } = req.params;
  const forzar = req.query.forzar === 'true'; // Detectamos si se fuerza la eliminación

  try {
    const tieneStock = await StockModel.findOne({ where: { estado_id: id } });

    if (tieneStock && !forzar) {
      return res.status(409).json({
        mensajeError:
          'Este ESTADO está asociado a productos en stock. ¿Desea eliminarlo de todas formas?'
      });
    }

    if (tieneStock && forzar) {
      // Desvincular el estado en los registros de stock
      await StockModel.update(
        { estado_id: null },
        { where: { estado_id: id } }
      );
    }

    const eliminado = await EstadosModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }

    res.json({
      message: tieneStock
        ? 'Estado eliminado y stock desvinculado.'
        : 'Estado eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error en ER_Estado_CTS:', error);
    res.status(500).json({
      mensajeError: 'Error del servidor',
      detalle: error.message
    });
  }
};
// Actualizar un estado
export const UR_Estado_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await EstadosModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await EstadosModel.findByPk(id);
      res.json({ message: 'Estado actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Estado no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
