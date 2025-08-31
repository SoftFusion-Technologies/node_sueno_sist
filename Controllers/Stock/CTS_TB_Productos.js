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
import { ProveedoresModel } from '../../Models/Proveedores/MD_TB_Proveedores.js';

import { CategoriasModel } from '../../Models/Stock/MD_TB_Categorias.js';
import { StockModel } from '../../Models/Stock/MD_TB_Stock.js';
import db from '../../DataBase/db.js';
import axios from 'axios';
import { Op } from 'sequelize';
import { ComboProductosPermitidosModel } from '../../Models/Combos/MD_TB_ComboProductosPermitidos.js';
import { registrarLog } from '../../Helpers/registrarLog.js';
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

// Función utilitaria
function generarSKU({ marca, modelo, medida }) {
  const fecha = new Date();
  const fechaStr = fecha.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(100 + Math.random() * 900); // 3 dígitos aleatorios

  const partes = [
    (marca || '').substring(0, 3).toUpperCase(),
    (modelo || '').substring(0, 3).toUpperCase(),
    (medida || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 5)
      .toUpperCase(),
    fechaStr,
    random
  ];

  return partes.filter(Boolean).join('-');
}

// Crear un nuevo producto
export const CR_Producto_CTS = async (req, res) => {
  const {
    nombre,
    descripcion,
    categoria_id,
    precio,
    descuento_porcentaje,
    imagen_url,
    estado,
    marca,
    modelo,
    medida,
    codigo_sku,
    proveedor_preferido_id, // ⬅️ puede venir '', null o un id válido
    usuario_log_id
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

    const skuGenerado = codigo_sku || generarSKU({ marca, modelo, medida });

    // Normalizamos a null si viene vacío
    const provPrefId = proveedor_preferido_id
      ? Number(proveedor_preferido_id)
      : null;

    // (Opcional) validar existencia del proveedor si se envió
    if (provPrefId) {
      const prov = await ProveedoresModel.findByPk(provPrefId);
      if (!prov) {
        return res
          .status(400)
          .json({ mensajeError: 'proveedor_preferido_id inválido' });
      }
    }

    const nuevo = await ProductosModel.create({
      nombre,
      descripcion,
      categoria_id,
      precio: precioNum,
      descuento_porcentaje: descuentoNum > 0 ? descuentoNum : null,
      precio_con_descuento: precioConDescuento,
      imagen_url,
      estado,
      marca,
      modelo,
      medida,
      codigo_sku: skuGenerado,
      proveedor_preferido_id: provPrefId // ⬅️ guardamos (nullable)
    });

    await registrarLog(
      req,
      'productos',
      'crear',
      `creó el producto "${nombre}" con SKU "${skuGenerado}"`,
      usuario_log_id
    );

    res.json({ message: 'Producto creado correctamente', producto: nuevo });
  } catch (error) {
    console.error('❌ Error en CR_Producto_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un producto si no tiene stock
// Controllers/Stock/CTS_TB_Productos.js
export const ER_Producto_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const usuario_log_id = body.usuario_log_id ?? null;
  const forzado = !!body.forzado;

  const tx = await db.transaction();
  try {
    const producto = await ProductosModel.findByPk(id, { transaction: tx });
    if (!producto) {
      await tx.rollback();
      return res.status(404).json({ mensajeError: 'Producto no encontrado' });
    }

    // 1) ¿El producto está en combos?
    const countEnCombos = await ComboProductosPermitidosModel.count({
      where: { producto_id: id },
      transaction: tx
    });
    if (countEnCombos > 0) {
      await tx.rollback();
      return res.status(409).json({
        mensajeError:
          'No es posible borrar el producto porque está asignado a uno o más combos. ' +
          'Primero elimínalo de esos combos y luego podrás borrarlo.',
        reason: 'FK_COMBO',
        combos_count: countEnCombos
      });
    }

    // 2) ¿Tiene stock?
    const countStock = await StockModel.count({
      where: { producto_id: id },
      transaction: tx
    });

    if (countStock > 0 && !forzado) {
      await tx.rollback();
      return res.status(409).json({
        mensajeError:
          'Este PRODUCTO tiene stock asociado. ¿Desea eliminarlo de todas formas incluyendo el stock?',
        reason: 'HAS_STOCK',
        stock_count: countStock
      });
    }

    if (countStock > 0 && forzado) {
      await StockModel.destroy({ where: { producto_id: id }, transaction: tx });
    }

    await ProductosModel.destroy({ where: { id }, transaction: tx });
    await tx.commit();

    // ---- Log fuera de la tx ----
    try {
      let quien = `Usuario ${usuario_log_id ?? 'desconocido'}`;
      try {
        const u = usuario_log_id
          ? await UsuariosModel.findByPk(usuario_log_id)
          : null;
        if (u?.nombre) quien = u.nombre;
      } catch {}

      const teniaStock = forzado || countStock > 0;
      const descripcionLog = `${quien} eliminó el producto "${
        producto.nombre
      }" ${teniaStock ? 'que tenía stock ' : ''}(SKU "${producto.codigo_sku}")`;

      await registrarLog(
        req,
        'productos',
        'eliminar',
        descripcionLog,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    // fallback por si en el medio falla por FK:
    if (
      error?.parent?.code === 'ER_ROW_IS_REFERENCED_2' ||
      error?.original?.code === 'ER_ROW_IS_REFERENCED_2'
    ) {
      return res.status(409).json({
        mensajeError:
          'No es posible borrar el producto porque está asignado a uno o más combos. ' +
          'Primero elimínalo de esos combos y luego podrás borrarlo.',
        reason: 'FK_COMBO'
      });
    }
    try {
      await tx.rollback();
    } catch {}
    console.error('❌ Error en ER_Producto_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
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
    estado,
    marca,
    modelo,
    medida,
    codigo_sku,
    proveedor_preferido_id, // ⬅️ NUEVO
    usuario_log_id
  } = req.body;

  try {
    const productoOriginal = await ProductosModel.findByPk(id);
    if (!productoOriginal) {
      return res.status(404).json({ mensajeError: 'Producto no encontrado' });
    }

    const precioNum = precio ? parseFloat(precio) : 0;
    const descuentoNum = descuento_porcentaje
      ? parseFloat(descuento_porcentaje)
      : 0;
    const precioConDescuento =
      descuentoNum > 0
        ? parseFloat((precioNum - precioNum * (descuentoNum / 100)).toFixed(2))
        : precioNum;

    // Normalizamos a null si viene vacío
    const provPrefId = proveedor_preferido_id
      ? Number(proveedor_preferido_id)
      : null;

    // (Opcional) validar existencia del proveedor si se envió
    if (provPrefId) {
      const prov = await ProveedoresModel.findByPk(provPrefId);
      if (!prov) {
        return res
          .status(400)
          .json({ mensajeError: 'proveedor_preferido_id inválido' });
      }
    }

    const campos = {
      nombre,
      descripcion,
      categoria_id,
      precio: precioNum,
      descuento_porcentaje: descuentoNum > 0 ? descuentoNum : null,
      precio_con_descuento: precioConDescuento,
      imagen_url,
      estado,
      marca,
      modelo,
      medida,
      codigo_sku,
      proveedor_preferido_id: provPrefId // ⬅️ incluimos en update
    };

    await ProductosModel.update(campos, { where: { id } });

    // Auditoría de cambios (incluye preferido)
    const cambios = [];
    for (const key of Object.keys(campos)) {
      const original = productoOriginal[key];
      const nuevo = campos[key];
      if (`${original}` !== `${nuevo}`) {
        cambios.push(
          `- ${key} de '${original ?? 'null'}' a '${nuevo ?? 'null'}'`
        );
      }
    }

    if (cambios.length > 0) {
      await registrarLog(
        req,
        'productos',
        'editar',
        `actualizó el producto "${productoOriginal.nombre}" (ID: ${
          productoOriginal.id
        }):\n${cambios.join('\n')}`,
        usuario_log_id
      );
    }

    res.json({ message: 'Producto actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error en UR_Producto_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Aumentar o disminuir precios por porcentaje (global o por categoría)
export const AUM_Productos_Porcentaje_CTS = async (req, res) => {
  const { porcentaje, categorias, usarInflacion, usuario_log_id } = req.body;

  try {
    let porcentajeNum;
    let inflacionMeta = null;

    if (usarInflacion) {
      // --- 1) Traer datos de inflación ---
      let response;
      try {
        response = await axios.get(
          'https://api.argentinadatos.com/v1/finanzas/indices/inflacion',
          { timeout: 10000 } // 10s por si la API está lenta
        );
      } catch (e) {
        return res.status(502).json({
          mensajeError: 'No se pudo consultar la API de inflación.',
          detalle: e.message
        });
      }

      const inflaciones = Array.isArray(response.data) ? response.data : [];
      if (!inflaciones.length) {
        return res.status(502).json({
          mensajeError: 'La API de inflación no devolvió datos.'
        });
      }

      // Normalizar a objetos confiables
      const rows = inflaciones
        .map((i) => ({
          rawFecha: i.fecha,
          fecha: new Date(i.fecha), // suelen venir como fin de mes
          valor: Number(i.valor)
        }))
        .filter((r) => !isNaN(r.fecha.getTime()) && !isNaN(r.valor));

      if (!rows.length) {
        return res.status(502).json({
          mensajeError: 'No hay filas de inflación válidas.'
        });
      }

      // Utilidades
      const yyyymm = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const hoy = new Date();
      const currentYm = yyyymm(hoy);

      const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const prevYm = yyyymm(prev);

      // --- 2) Selección del mes a usar ---
      // a) Intentar mes actual
      let elegido = rows.find((r) => yyyymm(r.fecha) === currentYm);

      // b) Si no, mes anterior
      if (!elegido) {
        elegido = rows.find((r) => yyyymm(r.fecha) === prevYm);
      }

      // c) Si no, último disponible por fecha (máxima)
      if (!elegido) {
        elegido = rows.sort((a, b) => b.fecha - a.fecha)[0];
      }

      if (!elegido) {
        return res.status(502).json({
          mensajeError:
            'No fue posible determinar un valor de inflación válido.'
        });
      }

      porcentajeNum = elegido.valor;
      inflacionMeta = {
        mes_usado: yyyymm(elegido.fecha), // p.ej. "2025-07"
        fecha_origen: elegido.rawFecha, // p.ej. "2025-07-31"
        fuente: 'api.argentinadatos.com/v1/finanzas/indices/inflacion'
      };
    } else {
      // Porcentaje manual
      porcentajeNum = parseFloat(porcentaje);
      if (isNaN(porcentajeNum)) {
        return res
          .status(400)
          .json({ mensajeError: 'Porcentaje inválido o faltante.' });
      }
    }

    // --- 3) Factor multiplicador ---
    const factor = 1 + porcentajeNum / 100;
    if (factor <= 0) {
      return res.status(400).json({
        mensajeError:
          'El porcentaje es demasiado bajo. El precio resultante sería negativo o cero.'
      });
    }

    // --- 4) Filtro por categorías (si vienen) ---
    let whereClause = {};
    if (categorias?.length) {
      // Asegurar números (por si vienen como string)
      const cats = categorias.map((c) => Number(c)).filter((n) => !isNaN(n));
      if (cats.length) {
        whereClause = { categoria_id: { [Op.in]: cats } };
      }
    }

    // --- 5) Traer productos y actualizar ---
    const productos = await ProductosModel.findAll({ where: whereClause });

    const actualizados = [];
    for (const p of productos) {
      const precioActual = Number(p.precio) || 0;
      const descuentoPct = Number(p.descuento_porcentaje) || 0;

      const nuevoPrecio = parseFloat((precioActual * factor).toFixed(2));
      const nuevoPrecioConDescuento =
        descuentoPct > 0
          ? parseFloat(
              (nuevoPrecio - nuevoPrecio * (descuentoPct / 100)).toFixed(2)
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
        precio_anterior: precioActual,
        precio_nuevo: nuevoPrecio,
        descuento_porcentaje: descuentoPct,
        precio_con_descuento: nuevoPrecioConDescuento
      });
    }

    // --- 6) Guardar estado temporal para "deshacer" ---
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min

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
    const ajuste_id = Array.isArray(ajusteRow)
      ? ajusteRow[0]?.ajuste_id
      : ajusteRow?.ajuste_id;

    // --- 7) Registrar log (incluye metadato de inflación si aplica) ---
    const origenTxt = usarInflacion
      ? `inflación (${inflacionMeta?.mes_usado ?? 'N/D'})`
      : 'manual';
    const logDescripcion =
      `aplicó un ajuste de precios del ${porcentajeNum}% a ${actualizados.length} producto(s). ` +
      `Origen: ${origenTxt}.\nEjemplo de cambios:\n` +
      actualizados
        .slice(0, 5)
        .map(
          (p) =>
            `• "${p.nombre}": precio de $${p.precio_anterior} → $${p.precio_nuevo}` +
            (p.descuento_porcentaje > 0
              ? ` | con ${p.descuento_porcentaje}% OFF queda en $${p.precio_con_descuento}`
              : '')
        )
        .join('\n') +
      (actualizados.length > 5 ? '\n...y más' : '');

    await registrarLog(
      req,
      'productos',
      'ajuste de precios',
      logDescripcion,
      usuario_log_id
    );

    // --- 8) Respuesta ---
    return res.json({
      message: `Se actualizaron ${actualizados.length} productos usando un ajuste del ${porcentajeNum}%.`,
      actualizados,
      ajuste_id,
      porcentaje_aplicado: porcentajeNum,
      origen: usarInflacion ? 'inflacion' : 'manual',
      inflacion_meta: inflacionMeta
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
  const { descuento, categorias, usuario_log_id } = req.body;

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

    // ✅ REGISTRAR EN LOG
    await registrarLog(
      req,
      'productos',
      'aplicar-descuento',
      `Aplicó un ${porcentajeNum}% de descuento a ${actualizados.length} producto/s`,
      usuario_log_id
    );

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
