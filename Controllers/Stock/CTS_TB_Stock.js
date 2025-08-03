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
    const nuevo = await StockModel.create(req.body);
    res.json({ message: 'Stock creado correctamente', stock: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar registro de stock
export const ER_Stock_CTS = async (req, res) => {
  try {
    const stockId = req.params.id;

    // 1. Buscá si hay ventas asociadas a este stock
    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockId }
    });

    if (ventaAsociada) {
      // Si hay ventas, NO eliminar. Solo actualizar cantidad a 0.
      await StockModel.update({ cantidad: 0 }, { where: { id: stockId } });
      return res.status(200).json({
        message:
          'Este stock está vinculado a ventas. Se actualizó la cantidad a 0 en vez de eliminar.'
      });
    }

    // 2. Si NO hay ventas, eliminar normalmente
    const eliminado = await StockModel.destroy({
      where: { id: stockId }
    });

    if (!eliminado)
      return res.status(404).json({ mensajeError: 'Stock no encontrado' });

    res.json({ message: 'Stock eliminado correctamente' });
  } catch (error) {
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
    observaciones
  } = req.body;
  const id = req.params.id;

  try {
    const existente = await StockModel.findOne({
      where: {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        id: { [Op.ne]: id }
      }
    });

    if (existente) {
      const nuevoStock = await existente.update({
        cantidad: existente.cantidad + Number(cantidad),
        en_exhibicion: en_exhibicion ?? existente.en_exhibicion
      });
      await StockModel.destroy({ where: { id } });
      return res.json({ message: 'Stock fusionado', actualizado: nuevoStock });
    }

    const [updated] = await StockModel.update(
      {
        producto_id,
        local_id,
        lugar_id,
        estado_id,
        cantidad,
        en_exhibicion,
        observaciones
      },
      { where: { id } }
    );

    if (updated === 1) {
      const actualizado = await StockModel.findByPk(id);
      res.json({ message: 'Stock actualizado', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Stock no encontrado' });
    }
  } catch (error) {
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

  if (
    !producto_id ||
    !local_id ||
    !lugar_id ||
    !estado_id ||
    cantidad == null
  ) {
    return res.status(400).json({
      mensajeError: 'Faltan datos obligatorios.'
    });
  }

  const transaction = await db.transaction();
  try {
    const stockExistente = await StockModel.findOne({
      where: {
        producto_id,
        local_id,
        lugar_id,
        estado_id
      },
      transaction
    });

    // Generar un SKU amigable o fallback con IDs
    let codigo_sku = '';
    try {
      const [producto, local, lugar] = await Promise.all([
        ProductosModel.findByPk(producto_id),
        LocalesModel.findByPk(local_id),
        LugaresModel.findByPk(lugar_id)
      ]);
      codigo_sku = `${slugify(producto?.nombre)}-${slugify(
        local?.nombre
      )}-${slugify(lugar?.nombre)}`;
    } catch {
      codigo_sku = `${producto_id}-${local_id}-${lugar_id}`;
    }

    if (stockExistente) {
      await stockExistente.update(
        { cantidad, en_exhibicion, observaciones, codigo_sku },
        { transaction }
      );
      console.log(
        `[UPDATE] Stock actualizado: ${codigo_sku} a cantidad ${cantidad}`
      );
    } else {
      try {
        await StockModel.create(
          {
            producto_id,
            local_id,
            lugar_id,
            estado_id,
            cantidad,
            en_exhibicion,
            observaciones,
            codigo_sku
          },
          { transaction }
        );
        console.log(
          `[CREATE] Nuevo stock creado: ${codigo_sku} con cantidad ${cantidad}`
        );
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          return res.status(409).json({
            mensajeError:
              'Ya existe un stock para este producto y ubicación. Recargá y editá el stock existente.'
          });
        }
        throw err;
      }
    }

    await transaction.commit();
    res.json({ message: 'Stock distribuido correctamente.' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error en DISTRIBUIR_Stock_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};


// Función para limpiar nombres (similar al front)
function slugify(valor) {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+$/, '');
}

export const TRANSFERIR_Stock_CTS = async (req, res) => {
  const { grupoOriginal, nuevoGrupo, cantidad } = req.body;

  if (!grupoOriginal || !nuevoGrupo || cantidad == null) {
    return res
      .status(400)
      .json({ mensajeError: 'Datos incompletos para transferir stock.' });
  }

  const transaction = await db.transaction();

  try {
    // 1. Buscar y validar stock en grupo original
    const stockOrigen = await StockModel.findOne({
      where: {
        producto_id: grupoOriginal.producto_id,
        local_id: grupoOriginal.local_id,
        lugar_id: grupoOriginal.lugar_id,
        estado_id: grupoOriginal.estado_id
      },
      transaction
    });

    if (!stockOrigen || stockOrigen.cantidad < cantidad) {
      throw new Error('No hay suficiente stock en el grupo original.');
    }

    // Verificar ventas asociadas
    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockOrigen.id }
    });
    if (ventaAsociada) {
      throw new Error(
        'El stock original tiene ventas asociadas y no puede transferirse.'
      );
    }

    // Restar en origen
    const nuevaCantidadOrigen = stockOrigen.cantidad - cantidad;
    if (nuevaCantidadOrigen <= 0) {
      await stockOrigen.destroy({ transaction });
    } else {
      await stockOrigen.update(
        { cantidad: nuevaCantidadOrigen },
        { transaction }
      );
    }

    // 2. Buscar o crear stock en el nuevo grupo
    const stockDestino = await StockModel.findOne({
      where: {
        producto_id: nuevoGrupo.producto_id,
        local_id: nuevoGrupo.local_id,
        lugar_id: nuevoGrupo.lugar_id,
        estado_id: nuevoGrupo.estado_id
      },
      transaction
    });

    let nuevoSKU = '';
    try {
      const [producto, local, lugar] = await Promise.all([
        ProductosModel.findByPk(nuevoGrupo.producto_id),
        LocalesModel.findByPk(nuevoGrupo.local_id),
        LugaresModel.findByPk(nuevoGrupo.lugar_id)
      ]);
      nuevoSKU = `${slugify(producto?.nombre)}-${slugify(
        local?.nombre
      )}-${slugify(lugar?.nombre)}`;
    } catch {
      nuevoSKU = `${nuevoGrupo.producto_id}-${nuevoGrupo.local_id}-${nuevoGrupo.lugar_id}`;
    }

    if (stockDestino) {
      await stockDestino.update(
        {
          cantidad: stockDestino.cantidad + cantidad,
          en_exhibicion: nuevoGrupo.en_exhibicion
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
          cantidad,
          en_exhibicion: nuevoGrupo.en_exhibicion,
          codigo_sku: nuevoSKU
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.json({ message: 'Stock transferido correctamente.' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      mensajeError: error.message || 'Error al transferir stock.'
    });
  }
};


// Elimina TODO el stock del grupo

export const ER_StockPorGrupo = async (req, res) => {
  const { producto_id, local_id, lugar_id, estado_id } = req.body;
  if (!producto_id || !local_id || !lugar_id || !estado_id) {
    return res.status(400).json({ mensajeError: 'Datos incompletos' });
  }
  try {
    // 1. Buscar stocks del grupo
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

    // 2. Validar ventas asociadas en detalle_venta
    const ventaAsociada = await DetalleVentaModel.findOne({
      where: { stock_id: stockIds }
    });
    if (ventaAsociada) {
      return res.status(409).json({
        mensajeError:
          'No se puede eliminar este grupo de stock porque está vinculado a ventas.'
      });
    }

    // 3. Validar stock en positivo
    if (stocksGrupo.some((s) => s.cantidad > 0)) {
      return res.status(409).json({
        mensajeError:
          'No se puede eliminar: aún hay stock disponible en el grupo.'
      });
    }

    // 4. Eliminar
    await StockModel.destroy({
      where: { producto_id, local_id, lugar_id, estado_id }
    });

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
