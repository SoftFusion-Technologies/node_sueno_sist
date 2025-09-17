// controllers/stock/categoriasController.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 23 / 06 / 2025
 * Versión: 1.1  (24 / 06 / 2025)
 *
 * Cambios v1.1:
 *   • OBRS_Categorias_CTS: agrega cantidadProductos
 *   • OBR_Categoria_CTS  : agrega cantidadProductos
 *   • ER_Categoria_CTS   : bloquea/forza eliminación si hay productos
 */
import db from '../../DataBase/db.js';
import { Op, fn, col, Transaction, literal } from 'sequelize';

import { CategoriasModel } from '../../Models/Stock/MD_TB_Categorias.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js'; // ⬅️ tu modelo de productos
import { registrarLog } from '../../Helpers/registrarLog.js';
import { ComboProductosPermitidosModel } from '../../Models/Combos/MD_TB_ComboProductosPermitidos.js';
/* =========================================================================
 * 1) Obtener TODAS las categorías + cantidad de productos
 *    GET /categorias
 * =======================================================================*/
export const OBRS_Categorias_CTS = async (req, res) => {
  try {
    const { page, limit, q, estado, orderBy, orderDir } = req.query || {};

    // Detectar si realmente mandaron parámetros (retrocompat ON cuando no)
    const hasParams =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'limit') ||
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'estado') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderBy') ||
      Object.prototype.hasOwnProperty.call(req.query, 'orderDir');

    // Tablas y FK (ajustá si tu FK es distinta)
    const catTable = CategoriasModel.getTableName(); // normalmente 'categorias'
    const prodTable = ProductosModel.getTableName(); // normalmente 'productos'
    const fk = 'categoria_id'; // ajustá si tu FK se llama distinto

    // Subquery correlacionado para contar productos por categoría
    const countLiteral = literal(`(
      SELECT COUNT(*)
      FROM \`${prodTable}\` AS p
      WHERE p.\`${fk}\` = \`${catTable}\`.id
    )`);

    // WHERE de filtros
    const where = {};
    if (q && q.trim() !== '') {
      const like = { [Op.like]: `%${q.trim()}%` };
      where[Op.or] = [{ nombre: like }, { descripcion: like }];
    }
    if (estado && ['activo', 'inactivo'].includes(estado)) {
      where.estado = estado;
    }

    // Orden
    const validColumns = [
      'id',
      'nombre',
      'descripcion',
      'estado',
      'created_at',
      'updated_at',
      'cantidadProductos'
    ];
    const colName = validColumns.includes(orderBy || '') ? orderBy : 'id';
    const dirName = ['ASC', 'DESC'].includes(
      String(orderDir || '').toUpperCase()
    )
      ? String(orderDir).toUpperCase()
      : 'ASC';

    // 🔁 SIN params -> array plano (retrocompat)
    if (!hasParams) {
      const filas = await CategoriasModel.findAll({
        where,
        attributes: {
          include: [[countLiteral, 'cantidadProductos']]
        },
        order:
          colName === 'cantidadProductos'
            ? [[countLiteral, dirName]]
            : [[colName, dirName]]
      });
      return res.json(filas);
    }

    // ✅ CON params -> paginado
    const pageNum = Math.max(parseInt(page || '1', 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const total = await CategoriasModel.count({ where });

    const rows = await CategoriasModel.findAll({
      where,
      attributes: {
        include: [[countLiteral, 'cantidadProductos']]
      },
      order:
        colName === 'cantidadProductos'
          ? [[countLiteral, dirName]]
          : [[colName, dirName]],
      limit: limitNum,
      offset
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
        orderDir: dirName,
        q: q || '',
        estado: estado || ''
      }
    });
  } catch (error) {
    console.error('OBRS_Categorias_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
/* =========================================================================
 * 2) Obtener UNA categoría por ID + cantidad de productos
 *    GET /categorias/:id
 * =======================================================================*/
export const OBR_Categoria_CTS = async (req, res) => {
  try {
    const categoria = await CategoriasModel.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: ProductosModel,
          as: 'productos',
          attributes: [] // solo necesitamos el conteo
        }
      ],
      attributes: {
        include: [[fn('COUNT', col('productos.id')), 'cantidadProductos']]
      },
      group: ['CategoriasModel.id']
    });

    if (!categoria) {
      return res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }

    res.json(categoria);
  } catch (error) {
    console.error('OBR_Categoria_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 3) Crear nueva categoría (sin cambios)
 * =======================================================================*/
export const CR_Categoria_CTS = async (req, res) => {
  const { nombre, descripcion, estado, usuario_log_id } = req.body;
  try {
    const nueva = await CategoriasModel.create({
      nombre,
      descripcion,
      estado: estado || 'activo'
    });

    const descripcion2 = `creó una nueva categoría llamada "${nombre}"`;

    await registrarLog(
      req,
      'categorias',
      'crear',
      descripcion2,
      usuario_log_id
    );

    res.json({ message: 'Categoría creada correctamente', categoria: nueva });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 4) Actualizar categoría (sin cambios relevantes)
 * =======================================================================*/
export const UR_Categoria_CTS = async (req, res) => {
  const { id } = req.params;
  const { usuario_log_id } = req.body;

  try {
    const categoriaAnterior = await CategoriasModel.findByPk(id);
    if (!categoriaAnterior) {
      return res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }

    const camposAuditar = ['nombre', 'descripcion', 'estado', 'color'];
    const cambios = [];

    for (const key of camposAuditar) {
      if (
        req.body[key] !== undefined &&
        req.body[key]?.toString() !== categoriaAnterior[key]?.toString()
      ) {
        cambios.push(
          `cambió el campo "${key}" de "${categoriaAnterior[key]}" a "${req.body[key]}"`
        );
      }
    }

    const [updated] = await CategoriasModel.update(req.body, { where: { id } });

    if (updated === 1) {
      const actualizado = await CategoriasModel.findByPk(id);

      const descripcion =
        cambios.length > 0
          ? `actualizó la categoría "${
              categoriaAnterior.nombre
            }" y ${cambios.join(', ')}`
          : `actualizó la categoría "${categoriaAnterior.nombre}" sin cambios relevantes`;

      await registrarLog(
        req,
        'categorias',
        'editar',
        descripcion,
        usuario_log_id
      );

      res.json({ message: 'Categoría actualizada correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }
  } catch (error) {
    console.error('UR_Categoria_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Eliminar categoría con protección FORZAR
 *    DELETE /categorias/:id?forzar=true
 * =======================================================================*/
// Eliminar una categoría (con chequeo de FK en productos y combos + forzado + log)
// Eliminar categoría con manejo de dependencias (productos y combos) y sin reusar tx tras rollback
export const ER_Categoria_CTS = async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const usuario_log_id =
    body.usuario_log_id ?? req.query.usuario_log_id ?? null;

  // Aceptar forzado desde body o query
  const rawForzado = body.forzado ?? body.forzar ?? req.query.forzar ?? 'false';
  const forzado =
    rawForzado === true ||
    rawForzado === 'true' ||
    rawForzado === 1 ||
    rawForzado === '1';

  try {
    const categoria = await CategoriasModel.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }

    // 1) Chequeos SIN transacción
    const [countProd, countCPP] = await Promise.all([
      ProductosModel.count({ where: { categoria_id: id } }),
      ComboProductosPermitidosModel.count({ where: { categoria_id: id } })
    ]);

    if ((countProd > 0 || countCPP > 0) && !forzado) {
      // Aviso específico según la causa
      const partes = [];
      if (countProd > 0) partes.push('tiene productos asociados');
      if (countCPP > 0) partes.push('está usada en uno o más combos');
      const detalle = partes.join(' y ');
      return res.status(409).json({
        mensajeError: `Esta CATEGORÍA ${detalle}. ¿Desea eliminarla de todas formas?`
      });
    }

    // 2) Camino sin referencias => delete directo (sin transacción)
    if (countProd === 0 && countCPP === 0) {
      await CategoriasModel.destroy({ where: { id } });
    } else {
      // 3) Camino forzado => abrir transacción SOLO acá
      const t = await db.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
      });
      try {
        // Quitarla de combos permitidos si existe
        if (countCPP > 0) {
          await ComboProductosPermitidosModel.destroy({
            where: { categoria_id: id },
            transaction: t
          });
        }

        // Desvincular productos si corresponde
        if (countProd > 0) {
          await ProductosModel.update(
            { categoria_id: null },
            { where: { categoria_id: id }, transaction: t }
          );
        }

        // Borrar la categoría
        await CategoriasModel.destroy({ where: { id }, transaction: t });

        await t.commit();
      } catch (err) {
        try {
          await t.rollback();
        } catch {}
        throw err;
      }
    }

    // 4) Log FUERA de transacción (no debe afectar la respuesta)
    try {
      if (usuario_log_id) {
        const partes = [];
        if (countProd > 0)
          partes.push(`${countProd} producto(s) desvinculados`);
        if (countCPP > 0) partes.push(`removida de ${countCPP} combo(s)`);
        const sufijo = partes.length ? ` (${partes.join(', ')})` : '';
        await registrarLog(
          req,
          'categorias',
          'eliminar',
          `eliminó la categoría "${categoria.nombre}"${sufijo}`,
          usuario_log_id
        );
      }
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({
      message:
        countProd > 0 || countCPP > 0
          ? 'Categoría eliminada (se removieron referencias).'
          : 'Categoría eliminada correctamente.'
    });
  } catch (error) {
    console.error('ER_Categoria_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};
