/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Lugares.js) contiene controladores para manejar operaciones CRUD sobre la tabla de lugares.
 *
 * Tema: Controladores - Lugares
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Lugares from '../../Models/Stock/MD_TB_Lugares.js';
const LugaresModel = MD_TB_Lugares.LugaresModel;
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js'; // Asegurate de tenerlo
import { Op } from 'sequelize';

// Obtener todos los lugares
export const OBRS_Lugares_CTS = async (req, res) => {
  try {
    // NO seteamos defaults acá
    const { page, limit, q, orderBy, orderDir } = req.query || {};

    // ¿El cliente realmente mandó algún parámetro?
    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    // 🔁 Retrocompat: SIN params => array plano (como antes)
    if (!hasParams) {
      const lugares = await LugaresModel.findAll({ order: [['id', 'ASC']] });
      return res.json(lugares);
    }

    // 🧭 Paginado con defaults recién acá
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

    const { rows, count } = await LugaresModel.findAndCountAll({
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
// Obtener un solo lugar por ID
export const OBR_Lugar_CTS = async (req, res) => {
  try {
    const lugar = await LugaresModel.findByPk(req.params.id);
    if (!lugar) {
      return res.status(404).json({ mensajeError: 'Lugar no encontrado' });
    }
    res.json(lugar);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo lugar
export const CR_Lugar_CTS = async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res
      .status(400)
      .json({ mensajeError: 'El nombre del lugar es obligatorio' });
  }

  try {
    const nuevo = await LugaresModel.create({ nombre });
    res.json({ message: 'Lugar creado correctamente', lugar: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

export const ER_Lugar_CTS = async (req, res) => {
  const { id } = req.params;
  const forzar = req.query.forzar === 'true'; // ← detectamos el flag

  try {
    const tieneStock = await StockModel.findOne({ where: { lugar_id: id } });

    if (tieneStock && !forzar) {
      return res.status(409).json({
        mensajeError:
          'Este lugar tiene productos en stock asociados. ¿Desea eliminarlo de todas formas?'
      });
    }

    if (tieneStock && forzar) {
      // Anular el lugar en los registros de stock
      await StockModel.update({ lugar_id: null }, { where: { lugar_id: id } });
    }

    // Eliminar el lugar
    const eliminado = await LugaresModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Lugar no encontrado' });
    }

    res.json({
      message: tieneStock
        ? 'Lugar eliminado y stock desvinculado.'
        : 'Lugar eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error en ER_Lugar_CTS:', error);
    res.status(500).json({
      mensajeError: 'Error del servidor',
      detalle: error.message
    });
  }
};

// Actualizar un lugar
export const UR_Lugar_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await LugaresModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await LugaresModel.findByPk(id);
      res.json({ message: 'Lugar actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Lugar no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
