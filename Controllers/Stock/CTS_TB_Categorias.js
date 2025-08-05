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

import { fn, col } from 'sequelize';
import { CategoriasModel } from '../../Models/Stock/MD_TB_Categorias.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js'; // ⬅️ tu modelo de productos
import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================================================================
 * 1) Obtener TODAS las categorías + cantidad de productos
 *    GET /categorias
 * =======================================================================*/
export const OBRS_Categorias_CTS = async (_req, res) => {
  try {
    const categorias = await CategoriasModel.findAll({
      include: [
        {
          model: ProductosModel,
          as: 'productos',
          attributes: [] // no necesitamos columnas de producto
        }
      ],
      attributes: {
        include: [[fn('COUNT', col('productos.id')), 'cantidadProductos']]
      },
      group: ['categorias.id']
    });

    res.json(categorias);
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
export const ER_Categoria_CTS = async (req, res) => {
  const { id } = req.params;
  const { forzar } = req.query;
  const { usuario_log_id } = req.body;

  console.log('usuariooo', usuario_log_id);
  try {
    const categoria = await CategoriasModel.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }

    const tieneProductos = await ProductosModel.findOne({
      where: { categoria_id: id }
    });

    // Si tiene productos y NO se fuerza, abortamos
    if (tieneProductos && !forzar) {
      return res.status(409).json({
        mensajeError:
          'Esta CATEGORÍA tiene productos asociados. ¿Desea eliminarla de todas formas?'
      });
    }

    // Si tiene productos y se fuerza, desvinculamos
    if (tieneProductos && forzar) {
      await ProductosModel.update(
        { categoria_id: null },
        { where: { categoria_id: id } }
      );
    }

    const eliminado = await CategoriasModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Categoría no encontrada' });
    }

    // Log de auditoría (solo si hay usuario_log_id)
    if (usuario_log_id) {
      const descripcion = tieneProductos
        ? `eliminó la categoría "${categoria.nombre}" y desvinculó productos asociados`
        : `eliminó la categoría "${categoria.nombre}"`;

      await registrarLog(
        req,
        'categorias',
        'eliminar',
        descripcion,
        usuario_log_id
      );
    }

    res.json({
      message: tieneProductos
        ? 'Categoría eliminada y productos desvinculados.'
        : 'Categoría eliminada correctamente.'
    });
  } catch (error) {
    console.error('ER_Categoria_CTS - Error interno:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
