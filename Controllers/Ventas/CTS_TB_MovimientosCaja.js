/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_MovimientosCaja.js) contiene controladores para manejar operaciones CRUD sobre la tabla movimientos_caja.
 *
 * Tema: Controladores - Movimientos de Caja
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_MovimientosCaja from '../../Models/Ventas/MD_TB_MovimientosCaja.js';
const MovimientosCajaModel = MD_TB_MovimientosCaja.MovimientosCajaModel;
import MD_TB_Caja from '../../Models/Ventas/MD_TB_Caja.js';
const CajaModel = MD_TB_Caja.CajaModel;
import { LocalesModel } from '../../Models/Stock/MD_TB_Locales.js';
// Obtener todos los movimientos de caja con información de la caja
export const OBRS_MovimientosCaja_CTS = async (req, res) => {
  try {
    const movimientos = await MovimientosCajaModel.findAll({
      include: [
        {
          model: CajaModel,
          as: 'Caja',
          include: [
            {
              model: LocalesModel,
              as: 'locale',
              attributes: ['id', 'nombre'] // solo lo necesario
            }
          ]
        }
      ],
      order: [['id', 'DESC']]
    });

    const resultado = movimientos.map((m) => {
      const data = m.toJSON();
      return {
        ...data,
        local_id: data.Caja?.local_id ?? null,
        local_nombre: data.Caja?.locale?.nombre ?? null
      };
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener movimientos de una caja específica
export const OBRS_MovimientosCajaByCajaId_CTS = async (req, res) => {
  const { caja_id } = req.params;
  try {
    const movimientos = await MovimientosCajaModel.findAll({
      where: { caja_id }, // 👈 FILTRO POR ID DE CAJA
      order: [['id', 'DESC']]
    });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};


// Obtener un movimiento de caja por ID
export const OBR_MovimientoCaja_CTS = async (req, res) => {
  try {
    const movimiento = await MovimientosCajaModel.findByPk(req.params.id);
    if (!movimiento)
      return res
        .status(404)
        .json({ mensajeError: 'Movimiento de caja no encontrado' });
    res.json(movimiento);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo movimiento de caja
export const CR_MovimientoCaja_CTS = async (req, res) => {
  const { caja_id, tipo, descripcion, monto, fecha, referencia } = req.body;

  if (!caja_id || !tipo || !monto) {
    return res.status(400).json({
      mensajeError: 'Faltan campos obligatorios: caja_id, tipo, monto'
    });
  }

  try {
    const nuevo = await MovimientosCajaModel.create({
      caja_id,
      tipo,
      descripcion,
      monto,
      fecha,
      referencia
    });
    res.json({
      message: 'Movimiento de caja creado correctamente',
      movimiento: nuevo
    });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un movimiento de caja
export const ER_MovimientoCaja_CTS = async (req, res) => {
  try {
    const eliminado = await MovimientosCajaModel.destroy({
      where: { id: req.params.id }
    });

    if (!eliminado)
      return res
        .status(404)
        .json({ mensajeError: 'Movimiento de caja no encontrado' });

    res.json({ message: 'Movimiento de caja eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un movimiento de caja
export const UR_MovimientoCaja_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await MovimientosCajaModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await MovimientosCajaModel.findByPk(id);
      res.json({
        message: 'Movimiento de caja actualizado correctamente',
        actualizado
      });
    } else {
      res
        .status(404)
        .json({ mensajeError: 'Movimiento de caja no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
