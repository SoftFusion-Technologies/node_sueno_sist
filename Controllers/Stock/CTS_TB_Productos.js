/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 2.0
 *
 * Descripción:
 * Este archivo contiene controladores CRUD para productos,
 * ahora con categoría relacionada por FK.
 */

// Importar modelo de productos y categoría
import MD_TB_Productos from '../../Models/Stock/MD_TB_Productos.js';
const ProductosModel = MD_TB_Productos.ProductosModel;

import { CategoriasModel } from '../../Models/Stock/MD_TB_Categorias.js';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import db from '../../DataBase/db.js';
import axios from 'axios';

// Obtener todos los productos con categoría incluida
export const OBRS_Productos_CTS = async (req, res) => {
  try {
    const productos = await ProductosModel.findAll({
      include: {
        model: CategoriasModel,
        as: 'categoria',
        attributes: ['id', 'nombre']
      }
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo producto por ID con su categoría
export const OBR_Producto_CTS = async (req, res) => {
  try {
    const producto = await ProductosModel.findByPk(req.params.id, {
      include: {
        model: CategoriasModel,
        as: 'categoria',
        attributes: ['id', 'nombre']
      }
    });

    if (!producto) {
      return res.status(404).json({ mensajeError: 'Producto no encontrado' });
    }

    res.json(producto);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo producto
export const CR_Producto_CTS = async (req, res) => {
  const {
    nombre,
    descripcion,
    categoria_id,
    precio,
    descuento_porcentaje,
    imagen_url,
    estado
  } = req.body;

  try {
    const precioNum = precio ? parseFloat(precio) : 0;
    const descuentoNum = descuento_porcentaje
      ? parseFloat(descuento_porcentaje)
      : 0;
    const precioConDescuento =
      descuentoNum > 0
        ? parseFloat((precioNum - precioNum * (descuentoNum / 100)).toFixed(2))
        : precioNum;

    const nuevo = await ProductosModel.create({
      nombre,
      descripcion,
      categoria_id,
      precio: precioNum,
      descuento_porcentaje: descuentoNum > 0 ? descuentoNum : null,
      precio_con_descuento: precioConDescuento,
      imagen_url,
      estado
    });

    res.json({ message: 'Producto creado correctamente', producto: nuevo });
  } catch (error) {
    console.error('❌ Error en CR_Producto_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un producto si no tiene stock
export const ER_Producto_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const tieneStock = await StockModel.findOne({ where: { producto_id: id } });

    if (tieneStock) {
      return res.status(409).json({
        mensajeError:
          'Este PRODUCTO tiene stock asociado. ¿Desea eliminarlo de todas formas incluyendo el stock?'
      });
    }

    const eliminado = await ProductosModel.destroy({ where: { id } });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un producto

export const UR_Producto_CTS = async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    descripcion,
    categoria_id,
    precio,
    descuento_porcentaje,
    imagen_url,
    estado
  } = req.body;

  try {
    const precioNum = precio ? parseFloat(precio) : 0;
    const descuentoNum = descuento_porcentaje
      ? parseFloat(descuento_porcentaje)
      : 0;
    const precioConDescuento =
      descuentoNum > 0
        ? parseFloat((precioNum - precioNum * (descuentoNum / 100)).toFixed(2))
        : precioNum;

    await ProductosModel.update(
      {
        nombre,
        descripcion,
        categoria_id,
        precio: precioNum,
        descuento_porcentaje: descuentoNum > 0 ? descuentoNum : null,
        precio_con_descuento: precioConDescuento,
        imagen_url,
        estado
      },
      { where: { id } }
    );

    res.json({ message: 'Producto actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error en UP_Producto_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};
// Aumentar o disminuir precios por porcentaje (global o por categoría)
export const AUM_Productos_Porcentaje_CTS = async (req, res) => {
  const { porcentaje, categorias, usarInflacion } = req.body;

  try {
    let porcentajeNum;

    if (usarInflacion) {
      // 👉 Obtener inflación del mes actual
      const response = await axios.get(
        'https://api.argentinadatos.com/v1/finanzas/indices/inflacion'
      );

      const inflaciones = response.data;
      const hoy = new Date();
      const mesActual = hoy.getMonth() + 1;
      const anioActual = hoy.getFullYear();

      const inflacionActual = inflaciones.find((i) => {
        const fecha = new Date(i.fecha);
        return (
          fecha.getMonth() + 1 === mesActual &&
          fecha.getFullYear() === anioActual
        );
      });

      if (!inflacionActual) {
        return res.status(404).json({
          mensajeError: 'No se encontró el valor de inflación del mes actual.'
        });
      }

      porcentajeNum = parseFloat(inflacionActual.valor);
    } else {
      porcentajeNum = parseFloat(porcentaje);
      if (isNaN(porcentajeNum)) {
        return res
          .status(400)
          .json({ mensajeError: 'Porcentaje inválido o faltante.' });
      }
    }

    const factor = 1 + porcentajeNum / 100;

    if (factor <= 0) {
      return res.status(400).json({
        mensajeError:
          'El porcentaje es demasiado bajo. El precio resultante sería negativo o cero.'
      });
    }

    const whereClause = categorias?.length ? { categoria_id: categorias } : {};

    const productos = await ProductosModel.findAll({ where: whereClause });

    const actualizados = [];

    for (const p of productos) {
      const nuevoPrecio = parseFloat((p.precio * factor).toFixed(2));
      const nuevoPrecioConDescuento =
        p.descuento_porcentaje && p.descuento_porcentaje > 0
          ? parseFloat(
              (
                nuevoPrecio -
                nuevoPrecio * (p.descuento_porcentaje / 100)
              ).toFixed(2)
            )
          : nuevoPrecio;

      await ProductosModel.update(
        {
          precio: nuevoPrecio,
          precio_con_descuento: nuevoPrecioConDescuento
        },
        { where: { id: p.id } }
      );

      actualizados.push({
        id: p.id,
        nombre: p.nombre,
        precio_anterior: parseFloat(p.precio),
        precio_nuevo: nuevoPrecio,
        descuento_porcentaje: p.descuento_porcentaje ?? 0
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await db.query(
      `INSERT INTO ajustes_precios_temp (productos, expires_at) VALUES (:productos, :expires_at)`,
      {
        replacements: {
          productos: JSON.stringify(actualizados),
          expires_at: expiresAt
        }
      }
    );

    const [ajusteRow] = await db.query(`SELECT LAST_INSERT_ID() as ajuste_id`);
    const ajuste_id = ajusteRow[0].ajuste_id;

    return res.json({
      message: `Se actualizaron ${actualizados.length} productos usando un ajuste del ${porcentajeNum}%.`,
      actualizados,
      ajuste_id,
      porcentaje_aplicado: porcentajeNum,
      origen: usarInflacion ? 'inflacion' : 'manual'
    });
  } catch (error) {
    console.error('❌ Error en AUM_Productos_Porcentaje_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};

export const DESH_DeshacerAjustePrecios_CTS = async (req, res) => {
  const { ajuste_id } = req.body;

  try {
    const [rows] = await db.query(
      `SELECT * FROM ajustes_precios_temp WHERE id = :ajuste_id`,
      {
        replacements: { ajuste_id }
      }
    );

    const ajuste = rows[0];

    if (!ajuste) {
      return res.status(404).json({ mensajeError: 'Ajuste no encontrado.' });
    }

    // Forzamos a usar horario de Buenos Aires para comparar
    const ahora = new Date(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires'
      })
    );

    const expiresAt = new Date(ajuste.expires_at);

    console.log('⏱️ Ahora:', ahora.toISOString());
    console.log('⏳ Expires at:', expiresAt.toISOString());

    if (expiresAt < ahora) {
      return res.status(410).json({
        mensajeError: 'Ya no se puede deshacer este ajuste.'
      });
    }
    // cuando se quiera probar esta parte se debe descomentar

    const productos =
      typeof ajuste.productos === 'string'
        ? JSON.parse(ajuste.productos)
        : ajuste.productos;

    for (const p of productos) {
      await ProductosModel.update(
        {
          precio: p.precio_anterior,
          precio_con_descuento: p.descuento_porcentaje
            ? parseFloat(
                (
                  p.precio_anterior -
                  p.precio_anterior * (p.descuento_porcentaje / 100)
                ).toFixed(2)
              )
            : p.precio_anterior
        },
        { where: { id: p.id } }
      );
    }

    await db.query(`DELETE FROM ajustes_precios_temp WHERE id = :ajuste_id`, {
      replacements: { ajuste_id }
    });

    res.json({ message: 'Ajuste revertido correctamente.' });
  } catch (error) {
    console.error('❌ Error al deshacer ajuste:', error);
    res.status(500).json({
      mensajeError: 'Error al deshacer ajuste.',
      detalle: error.message,
      stack: error.stack
    });
  }
};

// POST /aplicar-descuento
export const AUM_Productos_Descuento_CTS = async (req, res) => {
  const { descuento, categorias } = req.body;

  try {
    const porcentajeNum = parseFloat(descuento);

    if (isNaN(porcentajeNum) || porcentajeNum < 0 || porcentajeNum > 100) {
      return res.status(400).json({
        mensajeError: 'Descuento inválido. Debe ser un número entre 0 y 100.'
      });
    }

    const whereClause = categorias?.length ? { categoria_id: categorias } : {};

    const productos = await ProductosModel.findAll({ where: whereClause });

    const actualizados = [];

    for (const p of productos) {
      const precioOriginal = parseFloat(p.precio);
      const nuevoPrecioConDescuento = parseFloat(
        (precioOriginal - precioOriginal * (porcentajeNum / 100)).toFixed(2)
      );

      await ProductosModel.update(
        {
          descuento_porcentaje: porcentajeNum,
          precio_con_descuento: nuevoPrecioConDescuento
        },
        { where: { id: p.id } }
      );

      actualizados.push({
        id: p.id,
        nombre: p.nombre,
        precio_original: precioOriginal,
        precio_con_descuento: nuevoPrecioConDescuento,
        descuento_anterior: p.descuento_porcentaje ?? 0
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutos

    // Guardamos para poder deshacer
    await db.query(
      `INSERT INTO ajustes_precios_temp (productos, expires_at) VALUES (:productos, :expires_at)`,
      {
        replacements: {
          productos: JSON.stringify(actualizados),
          expires_at: expiresAt
        }
      }
    );

    const [ajusteRow] = await db.query(`SELECT LAST_INSERT_ID() as ajuste_id`);
    const ajuste_id = ajusteRow[0].ajuste_id;

    return res.json({
      message: `✅ Se aplicó un ${porcentajeNum}% de descuento a ${actualizados.length} productos.`,
      actualizados,
      ajuste_id
    });
  } catch (error) {
    console.error('❌ Error en AUM_Productos_Descuento_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const DESH_DeshacerDescuento_CTS = async (req, res) => {
  const { ajuste_id } = req.body;

  try {
    const [rows] = await db.query(
      `SELECT * FROM ajustes_precios_temp WHERE id = :ajuste_id`,
      {
        replacements: { ajuste_id }
      }
    );

    const ajuste = rows[0];

    if (!ajuste) {
      return res.status(404).json({ mensajeError: 'Descuento no encontrado.' });
    }

    // Forzamos a usar horario de Buenos Aires
    const ahora = new Date(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires'
      })
    );

    const expiresAt = new Date(ajuste.expires_at);

    console.log('⏱️ Ahora:', ahora.toISOString());
    console.log('⏳ Expires at:', expiresAt.toISOString());

    if (expiresAt < ahora) {
      return res.status(410).json({
        mensajeError: 'Ya no se puede deshacer este descuento.'
      });
    }

    const productos =
      typeof ajuste.productos === 'string'
        ? JSON.parse(ajuste.productos)
        : ajuste.productos;

    for (const p of productos) {
      await ProductosModel.update(
        {
          descuento_porcentaje: null,
          precio_con_descuento: null,
          precio: p.precio_original // restauramos precio original
        },
        { where: { id: p.id } }
      );
    }

    await db.query(`DELETE FROM ajustes_precios_temp WHERE id = :ajuste_id`, {
      replacements: { ajuste_id }
    });

    return res.json({
      message: '✅ Descuento deshecho correctamente',
      restaurados: productos.length
    });
  } catch (error) {
    console.error('❌ Error al deshacer descuento:', error);
    return res.status(500).json({
      mensajeError: 'Error al deshacer descuento.',
      detalle: error.message,
      stack: error.stack
    });
  }
};
