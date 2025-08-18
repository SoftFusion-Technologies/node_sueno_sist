/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 06 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Stock.js) contiene controladores para manejar operaciones CRUD sobre la tabla de stock.
 *
 * Tema: Controladores - Stock
 * Capa: Backend
 */

// Importaciones de modelos
import MD_TB_Stock from '../../Models/Stock/MD_TB_Stock.js';
import { ProductosModel } from '../../Models/Stock/MD_TB_Productos.js';
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
import { LugaresModel } from '../../Models/Stock/MD_TB_Lugares.js';
import { EstadosModel } from '../../Models/Stock/MD_TB_Estados.js';
import { DetalleVentaModel } from '../../Models/Ventas/MD_TB_DetalleVenta.js';
import db from '../../DataBase/db.js'; // Esta es tu instancia Sequelize
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';
import { Transaction } from 'sequelize';

// Función para limpiar nombres (similar al front)
export function slugify(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/['"]/g, '') // saca comillas
    .replace(/\((.*?)\)/g, '$1') // quita paréntesis (deja el contenido)
    .replace(/[^a-z0-9]+/g, '-') // cualquier cosa no alfanumérica -> '-'
    .replace(/^-+|-+$/g, ''); // recorta guiones al inicio/fin
}

export function buildSku({
  productoNombre,
  localNombre,
  lugarNombre,
  // opcional: si querés incluirlo en el SKU, pasalo y se agrega
  estadoNombre,
  maxLen = 150
}) {
  const parts = [
    slugify(productoNombre),
    slugify(localNombre),
    slugify(lugarNombre),
    slugify(estadoNombre) // solo se agrega si viene (queda limpio)
  ].filter(Boolean); // evita segmentos vacíos

  let sku = parts.join('-').replace(/-+/g, '-'); // colapsa dobles
  if (!sku) sku = 'sku'; // fallback mínimo
  return sku.slice(0, maxLen);
}

async function ensureUniqueSku(
  baseSku,
  localId,
  excludeId = null,
  transaction
) {
  let candidate = baseSku;
  let i = 1;
  while (true) {
    const exists = await StockModel.findOne({
      where: {
        codigo_sku: candidate,
        local_id: localId,
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
      },
      transaction
    });
    if (!exists) return candidate;
    i += 1;
    const suffix = `-${i}`;
    candidate = `${baseSku.slice(0, 150 - suffix.length)}${suffix}`;
  }
}

const ensureUniqueProductSku = async (
  baseSku,
  { excludeProductId = null, transaction = null } = {}
) => {
  let candidate = baseSku,
    i = 1;
  while (true) {
    const exists = await ProductosModel.findOne({
      where: {
        codigo_sku: candidate,
        ...(excludeProductId ? { id: { [Op.ne]: excludeProductId } } : {})
      },
      transaction // <- usa la transacción si viene; Sequelize la ignora si es null
    });
    if (!exists) return candidate;
    i += 1;
    const suffix = `-${i}`;
    candidate = `${baseSku.slice(0, 150 - suffix.length)}${suffix}`;
  }
};

const StockModel = MD_TB_Stock.StockModel;

// Obtener todos los registros de stock con sus relaciones
export const OBRS_Stock_CTS = async (req, res) => {
  try {
    const stock = await StockModel.findAll({
      include: [
        { model: ProductosModel },
        { model: LocalesModel },
        { model: LugaresModel },
        { model: EstadosModel }
      ]
    });
    res.json(stock);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo registro de stock por ID
export const OBR_Stock_CTS = async (req, res) => {
  try {
    const registro = await StockModel.findByPk(req.params.id, {
      include: [
        { model: ProductosModel },
        { model: LocalesModel },
        { model: LugaresModel },
        { model: EstadosModel }
      ]
    });
    if (!registro)
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });

    res.json(registro);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear nuevo registro de stock
export const CR_Stock_CTS = async (req, res) => {
  try {
    const { producto_id, local_id, lugar_id, estado_id, usuario_log_id } =
      req.body;

    // Obtener los datos necesarios para descripción
    const producto = await ProductosModel.findByPk(producto_id);
    const local = await LocalesModel.findByPk(local_id);
    const lugar = await LugaresModel.findByPk(lugar_id);
    const estado = await EstadosModel.findByPk(estado_id);

    const codigo_sku = producto?.codigo_sku || `SKU-${producto_id}`;

    // Crear el stock
    const nuevo = await StockModel.create({ ...req.body, codigo_sku });

    // Descripción para el log
    const descripcion = `creó un nuevo stock para el producto "${producto?.nombre}" en el local "${local?.nombre}" (lugar: "${lugar?.nombre}", estado: "${estado?.nombre}")`;

    // Registrar log
    await registrarLog(req, 'stock', 'crear', descripcion, usuario_log_id);

    res.json({ message: 'Stock creado correctamente', stock: nuevo });
  } catch (error) {
    console.error('CR_Stock_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar registro de stock
export const ER_Stock_CTS = async (req, res) => {
  const stockId = req.params.id;
  const { usuario_log_id } = req.body;

  try {
    const stock = await StockModel.findByPk(stockId);
    if (!stock) {
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });
    }

    // Obtener info asociada para el log
    const producto = await ProductosModel.findByPk(stock.producto_id);
    const local = await LocalesModel.findByPk(stock.local_id);
    const lugar = await LugaresModel.findByPk(stock.lugar_id);
    const estado = await EstadosModel.findByPk(stock.estado_id);

    const descripcionContexto = `para el producto "${producto?.nombre}" en el local "${local?.nombre}" (lugar: "${lugar?.nombre}", estado: "${estado?.nombre}")`;

    // 1. Buscá si hay ventas asociadas a este stock
    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockId }
    });

    if (ventaAsociada) {
      // Si hay ventas, NO eliminar. Solo actualizar cantidad a 0.
      await StockModel.update({ cantidad: 0 }, { where: { id: stockId } });

      if (usuario_log_id) {
        await registrarLog(
          req,
          'stock',
          'editar',
          `intentó eliminar un stock ${descripcionContexto}, pero estaba vinculado a ventas, por lo que se actualizó la cantidad a 0`,
          usuario_log_id
        );
      }

      return res.status(200).json({
        message:
          'Este stock está vinculado a ventas. Se actualizó la cantidad a 0 en vez de eliminar.'
      });
    }

    // 2. Si NO hay ventas, eliminar normalmente
    const eliminado = await StockModel.destroy({ where: { id: stockId } });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });

    if (usuario_log_id) {
      await registrarLog(
        req,
        'stock',
        'eliminar',
        `eliminó un stock ${descripcionContexto}`,
        usuario_log_id
      );
    }

    res.json({ message: 'Stock eliminado correctamente' });
  } catch (error) {
    console.error('ER_Stock_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar registro de stock y fusionar si existe la combinación
export const UR_Stock_CTS = async (req, res) => {
  const {
    producto_id,
    local_id,
    lugar_id,
    estado_id,
    cantidad,
    en_exhibicion,
    observaciones,
    usuario_log_id
  } = req.body;

  const id = req.params.id;
  const cantidadNum = Number(cantidad);
  if (isNaN(cantidadNum)) {
    return res.status(400).json({ mensajeError: 'Cantidad inválida' });
  }

  try {
    const producto = await ProductosModel.findByPk(producto_id);
    const codigo_sku = producto?.codigo_sku || `SKU-${producto_id}`;

    const stockActual = await StockModel.findByPk(id);
    if (!stockActual) {
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });
    }

    const existente = await StockModel.findOne({
      where: {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        id: { [Op.ne]: id }
      }
    });

    // Si hay un stock duplicado → fusionar cantidades
    if (existente) {
      const cantidadOriginal = existente.cantidad;
      const nuevoStock = await existente.update({
        cantidad: existente.cantidad + cantidadNum,
        en_exhibicion: en_exhibicion ?? existente.en_exhibicion
      });

      await StockModel.destroy({ where: { id } });

      if (usuario_log_id) {
        const local = await LocalesModel.findByPk(local_id);
        const lugar = await LugaresModel.findByPk(lugar_id);
        const estado = await EstadosModel.findByPk(estado_id);

        await registrarLog(
          req,
          'stock',
          'editar',
          `fusionó el stock del producto "${producto?.nombre}" en el local "${local?.nombre}" (lugar: "${lugar?.nombre}", estado: "${estado?.nombre}"). Se sumaron ${cantidadNum} unidades a un stock existente (de ${cantidadOriginal} a ${nuevoStock.cantidad}) y se eliminó el stock original`,
          usuario_log_id
        );
      }

      return res.json({ message: 'Stock fusionado', actualizado: nuevoStock });
    }

    // Auditar cambios campo a campo
    const camposAuditar = [
      'producto_id',
      'local_id',
      'lugar_id',
      'estado_id',
      'cantidad',
      'en_exhibicion',
      'observaciones'
    ];

    const cambios = [];

    for (const campo of camposAuditar) {
      if (
        req.body[campo] !== undefined &&
        req.body[campo]?.toString() !== stockActual[campo]?.toString()
      ) {
        cambios.push(
          `cambió el campo "${campo}" de "${stockActual[campo]}" a "${req.body[campo]}"`
        );
      }
    }

    const [updated] = await StockModel.update(
      {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        cantidad: cantidadNum,
        en_exhibicion,
        observaciones,
        codigo_sku
      },
      { where: { id } }
    );

    if (updated === 1) {
      const actualizado = await StockModel.findByPk(id);

      if (usuario_log_id) {
        const descripcion =
          cambios.length > 0
            ? `actualizó el stock del producto "${
                producto?.nombre
              }" y ${cambios.join(', ')}`
            : `actualizó el stock del producto "${producto?.nombre}" sin cambios relevantes`;

        await registrarLog(req, 'stock', 'editar', descripcion, usuario_log_id);
      }

      return res.json({ message: 'Stock actualizado', actualizado });
    } else {
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });
    }
  } catch (error) {
    console.error('UR_Stock_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

export const ER_StockPorProducto = async (req, res) => {
  try {
    await StockModel.destroy({ where: { producto_id: req.params.id } });
    res.json({ message: 'Stock eliminado' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

export const DISTRIBUIR_Stock_CTS = async (req, res) => {
  const {
    producto_id,
    local_id,
    lugar_id,
    estado_id,
    cantidad,
    en_exhibicion = false,
    observaciones = null
  } = req.body;

  const cantidadNum = Number(cantidad);
  if (
    !producto_id ||
    !local_id ||
    !lugar_id ||
    !estado_id ||
    isNaN(cantidadNum) ||
    cantidadNum < 0
  ) {
    return res.status(400).json({ mensajeError: 'Datos inválidos.' });
  }

  const transaction = await db.transaction();
  try {
    const producto = await ProductosModel.findByPk(producto_id);
    const codigo_sku = producto?.codigo_sku || `SKU-${producto_id}`;

    const stockExistente = await StockModel.findOne({
      where: {
        producto_id,
        local_id,
        lugar_id,
        estado_id
      },
      transaction
    });

    if (stockExistente) {
      await stockExistente.update(
        { cantidad: cantidadNum, en_exhibicion, observaciones, codigo_sku },
        { transaction }
      );
    } else {
      await StockModel.create(
        {
          producto_id,
          local_id,
          lugar_id,
          estado_id,
          cantidad: cantidadNum,
          en_exhibicion,
          observaciones,
          codigo_sku
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.json({ message: 'Stock distribuido correctamente.' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ mensajeError: error.message });
  }
};

// Transferir stock (actualizado con código SKU)
export const TRANSFERIR_Stock_CTS = async (req, res) => {
  const { grupoOriginal, nuevoGrupo, cantidad } = req.body;
  const cantidadNum = Number(cantidad);

  if (!grupoOriginal || !nuevoGrupo || isNaN(cantidadNum) || cantidadNum <= 0) {
    return res
      .status(400)
      .json({ mensajeError: 'Datos inválidos para transferir stock.' });
  }

  const transaction = await db.transaction();
  try {
    const stockOrigen = await StockModel.findOne({
      where: {
        producto_id: grupoOriginal.producto_id,
        local_id: grupoOriginal.local_id,
        lugar_id: grupoOriginal.lugar_id,
        estado_id: grupoOriginal.estado_id
      },
      transaction
    });

    if (!stockOrigen || stockOrigen.cantidad < cantidadNum) {
      throw new Error('No hay suficiente stock en el grupo original.');
    }

    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockOrigen.id }
    });
    if (ventaAsociada) {
      throw new Error(
        'El stock original tiene ventas asociadas y no puede transferirse.'
      );
    }

    const nuevaCantidadOrigen = stockOrigen.cantidad - cantidadNum;
    if (nuevaCantidadOrigen <= 0) {
      await stockOrigen.destroy({ transaction });
    } else {
      await stockOrigen.update(
        { cantidad: nuevaCantidadOrigen },
        { transaction }
      );
    }

    const producto = await ProductosModel.findByPk(nuevoGrupo.producto_id);
    const codigo_sku = producto?.codigo_sku || `SKU-${nuevoGrupo.producto_id}`;

    const stockDestino = await StockModel.findOne({
      where: {
        producto_id: nuevoGrupo.producto_id,
        local_id: nuevoGrupo.local_id,
        lugar_id: nuevoGrupo.lugar_id,
        estado_id: nuevoGrupo.estado_id
      },
      transaction
    });

    if (stockDestino) {
      await stockDestino.update(
        {
          cantidad: stockDestino.cantidad + cantidadNum,
          en_exhibicion: nuevoGrupo.en_exhibicion,
          codigo_sku
        },
        { transaction }
      );
    } else {
      await StockModel.create(
        {
          producto_id: nuevoGrupo.producto_id,
          local_id: nuevoGrupo.local_id,
          lugar_id: nuevoGrupo.lugar_id,
          estado_id: nuevoGrupo.estado_id,
          cantidad: cantidadNum,
          en_exhibicion: nuevoGrupo.en_exhibicion,
          observaciones: nuevoGrupo.observaciones || null,
          codigo_sku
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.json({ message: 'Stock transferido correctamente.' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ mensajeError: error.message });
  }
};

// Elimina TODO el stock del grupo
export const ER_StockPorGrupo = async (req, res) => {
  const { producto_id, local_id, lugar_id, estado_id, usuario_log_id } =
    req.body;

  if (!producto_id || !local_id || !lugar_id || !estado_id || !usuario_log_id) {
    return res.status(400).json({ mensajeError: 'Datos incompletos.' });
  }

  try {
    // 1. Buscar stock del grupo
    const stocksGrupo = await StockModel.findAll({
      where: { producto_id, local_id, lugar_id, estado_id },
      attributes: ['id', 'cantidad']
    });

    if (!stocksGrupo.length) {
      return res
        .status(404)
        .json({ mensajeError: 'No existe ningún stock en ese grupo.' });
    }

    const stockIds = stocksGrupo.map((s) => s.id);

    // 2. Verificar si alguna está asociada a ventas
    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockIds }
    });

    if (ventaAsociada) {
      return res.status(409).json({
        mensajeError:
          'No se puede eliminar este grupo de stock porque está vinculado a ventas.'
      });
    }

    // 3. Verificar si hay stock positivo
    const hayStock = stocksGrupo.some((s) => Number(s.cantidad) > 0);
    if (hayStock) {
      return res.status(409).json({
        mensajeError:
          'No se puede eliminar: aún hay stock disponible en el grupo.'
      });
    }

    // 4. Traer nombres descriptivos
    const [producto, local, lugar, estado] = await Promise.all([
      ProductosModel.findByPk(producto_id, { attributes: ['nombre'] }),
      LocalesModel.findByPk(local_id, { attributes: ['nombre'] }),
      LugaresModel.findByPk(lugar_id, { attributes: ['nombre'] }),
      EstadosModel.findByPk(estado_id, { attributes: ['nombre'] })
    ]);

    // 5. Eliminar registros
    const eliminados = await StockModel.destroy({
      where: { producto_id, local_id, lugar_id, estado_id }
    });

    // 6. Log más descriptivo
    const descripcionLog = `eliminó todo el stock del grupo: Producto "${producto?.nombre}", Local "${local?.nombre}", Lugar "${lugar?.nombre}", Estado "${estado?.nombre}". Se eliminaron ${eliminados} registros.`;

    await registrarLog(
      req,
      'stock',
      'eliminar',
      descripcionLog,
      usuario_log_id
    );

    return res.json({ message: 'Grupo de stock eliminado exitosamente.' });
  } catch (error) {
    let mensaje = 'Error interno. ';
    if (
      error?.name === 'SequelizeForeignKeyConstraintError' ||
      (error?.parent && error.parent.code === 'ER_ROW_IS_REFERENCED_2')
    ) {
      mensaje =
        'No se puede eliminar este grupo de stock porque tiene registros relacionados (ventas u otros movimientos).';
    }
    return res
      .status(500)
      .json({ mensajeError: mensaje + (error.message || '') });
  }
};

export const DUPLICAR_Producto_CTS = async (req, res) => {
  const sourceId = Number(req.params.id);
  let {
    nuevoNombre,
    duplicarStock = true,
    copiarCantidad = false,
    locales, // puede venir array o string "1,3,6"
    generarSku = true
  } = req.body || {};

  if (!sourceId || !nuevoNombre?.trim()) {
    return res
      .status(400)
      .json({ mensajeError: 'Falta sourceId o nuevoNombre válido.' });
  }

  // ← opcional: normalizar locales
  if (typeof locales === 'string') {
    locales = locales
      .split(',')
      .map((x) => Number(x))
      .filter(Boolean);
  } else if (Array.isArray(locales)) {
    locales = [...new Set(locales.map(Number).filter(Boolean))];
  }

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  const ensureUniqueSku = async (baseSku, localId, excludeId = null) => {
    let candidate = baseSku,
      i = 1;
    while (true) {
      const exists = await StockModel.findOne({
        where: {
          codigo_sku: candidate,
          local_id: localId,
          ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
        },
        transaction: t
      });
      if (!exists) return candidate;
      i += 1;
      const suffix = `-${i}`;
      candidate = `${baseSku.slice(0, 150 - suffix.length)}${suffix}`;
    }
  };

  try {
    const prod = await ProductosModel.findByPk(sourceId, { transaction: t });
    if (!prod) {
      await t.rollback();
      return res
        .status(404)
        .json({ mensajeError: 'Producto origen no encontrado.' });
    }

    const precioNum = prod.precio ? Number(prod.precio) : 0;
    const descNum = prod.descuento_porcentaje
      ? Number(prod.descuento_porcentaje)
      : 0;
    const precioConDesc =
      descNum > 0
        ? Number((precioNum - precioNum * (descNum / 100)).toFixed(2))
        : precioNum;

    // Base: copiar el SKU del producto origen si existe; si no, usar slug del nombre
    const baseSkuProducto = prod.codigo_sku || slugify(prod.nombre);
    // Asegurar unicidad a nivel productos
    const nuevoCodigoSkuProducto = await ensureUniqueProductSku(
      baseSkuProducto,
      { transaction: t }
    );
    
    const nuevoProducto = await ProductosModel.create(
      {
        nombre: nuevoNombre.trim(),
        descripcion: prod.descripcion,
        categoria_id: prod.categoria_id,
        precio: precioNum,
        descuento_porcentaje: descNum > 0 ? descNum : null,
        precio_con_descuento: precioConDesc,
        imagen_url: prod.imagen_url,
        estado: prod.estado,

        // 👇 **CLAVE**: SKU del producto nuevo (copiado/normalizado)
        codigo_sku: nuevoCodigoSkuProducto
      },
      { transaction: t }
    );

    let filasStockCreadas = 0;

    if (duplicarStock) {
      const whereStock = { producto_id: sourceId };

      // ← opcional: validar y aplicar filtro de locales si viene
      if (Array.isArray(locales) && locales.length > 0) {
        // validar existencia de locales
        const filasLocales = await LocalesModel.findAll({
          where: { id: { [Op.in]: locales } },
          attributes: ['id'],
          transaction: t
        });
        const existentes = new Set(filasLocales.map((l) => l.id));
        const invalidos = locales.filter((id) => !existentes.has(id));
        if (invalidos.length === locales.length) {
          await t.rollback();
          return res.status(400).json({
            mensajeError: `Ninguno de los locales existe: ${invalidos.join(
              ', '
            )}`
          });
        }
        // usar solo los válidos
        const localesValidos = locales.filter((id) => existentes.has(id));
        whereStock.local_id = { [Op.in]: localesValidos };
      }

      const stockOrigen = await StockModel.findAll({
        where: whereStock,
        attributes: [
          'local_id',
          'lugar_id',
          'estado_id',
          'cantidad',
          'en_exhibicion'
        ],
        transaction: t
      });

      if (stockOrigen.length === 0) {
        await t.commit();
        return res.json({
          message:
            'Producto duplicado (sin stock copiado por filtro de locales).',
          nuevo_producto_id: nuevoProducto.id,
          duplicoStock: false,
          filasStockCreadas: 0
        });
      }

      // insertamos con codigo_sku NULL y después generamos
      const filas = stockOrigen.map((s) => ({
        producto_id: nuevoProducto.id,
        local_id: s.local_id,
        lugar_id: s.lugar_id,
        estado_id: s.estado_id,
        cantidad: copiarCantidad ? Number(s.cantidad || 0) : 0,
        en_exhibicion: !!s.en_exhibicion,
        codigo_sku: null
      }));

      await StockModel.bulkCreate(filas, {
        transaction: t,
        ignoreDuplicates: true
      });
      filasStockCreadas = filas.length;

      if (generarSku) {
        const nuevos = await StockModel.findAll({
          where: { producto_id: nuevoProducto.id },
          include: [
            { model: LocalesModel, as: 'locale', attributes: ['nombre'] },
            { model: LugaresModel, as: 'lugare', attributes: ['nombre'] },
            { model: EstadosModel, as: 'estado', attributes: ['nombre'] } // opcional
          ],
          transaction: t
        });

        for (const s of nuevos) {
          const base = buildSku({
            productoNombre: nuevoProducto.nombre,
            localNombre: s.locale?.nombre,
            lugarNombre: s.lugare?.nombre,
            estadoNombre: s.estado?.nombre // opcional
          });
          const unique = await ensureUniqueSku(base, s.local_id, s.id);
          if (s.codigo_sku !== unique) {
            await s.update({ codigo_sku: unique }, { transaction: t });
          }
        }
      }
    }

    await t.commit();
    return res.json({
      message: 'Producto duplicado correctamente',
      nuevo_producto_id: nuevoProducto.id,
      duplicoStock: !!duplicarStock,
      filasStockCreadas
    });
  } catch (err) {
    await t.rollback();
    console.error('❌ Error DUPLICAR_Producto_CTS:', err);
    return res.status(500).json({ mensajeError: err.message });
  }
};
