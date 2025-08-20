/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 02 / 08 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Combos.js) contiene controladores para manejar operaciones CRUD sobre la tabla de combos.
 *
 * Tema: Controladores - Combos
 * Capa: Backend
 */

import { CombosModel } from '../../Models/Combos/MD_TB_Combos.js';
import db from '../../DataBase/db.js';
import { Op } from 'sequelize';
import { registrarLog } from '../../Helpers/registrarLog.js';
import { ComboProductosPermitidosModel } from '../../Models/Combos/MD_TB_ComboProductosPermitidos.js';

// Obtener todos los combos
export const OBRS_Combos_CTS = async (req, res) => {
  try {
    const combos = await CombosModel.findAll({
      order: [['id', 'DESC']]
    });
    res.json(combos);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo combo por ID
export const OBR_Combo_CTS = async (req, res) => {
  try {
    const combo = await CombosModel.findByPk(req.params.id);
    if (!combo)
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    res.json(combo);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Crear un nuevo combo (con log)
export const CR_Combo_CTS = async (req, res) => {
  const {
    nombre,
    descripcion,
    precio_fijo,
    cantidad_items,
    estado,
    usuario_log_id // ← quién realizó la acción
  } = req.body || {};

  if (!nombre || precio_fijo == null || cantidad_items == null) {
    return res.status(400).json({
      mensajeError:
        'Faltan campos obligatorios: nombre, precio_fijo o cantidad_items'
    });
  }

  try {
    const nuevoCombo = await CombosModel.create({
      nombre: String(nombre).trim(),
      descripcion: descripcion ?? null,
      precio_fijo: Number(precio_fijo),
      cantidad_items: Number(cantidad_items),
      estado: estado || 'activo'
    });

    // Log no-bloqueante
    try {
      const descLog =
        `creó el combo "${nuevoCombo.nombre}" (ID ${nuevoCombo.id}) ` +
        `con un precio fijo de $${nuevoCombo.precio_fijo}, ` +
        `cantidad maxima de items${nuevoCombo.cantidad_items}, ` +
        `estado: ${nuevoCombo.estado}`;
      await registrarLog(req, 'combos', 'crear', descLog, usuario_log_id);
    } catch (logErr) {
      console.warn(
        'registrarLog (crear combo) falló:',
        logErr?.message || logErr
      );
    }

    return res.json({
      message: 'Combo creado correctamente',
      combo: nuevoCombo
    });
  } catch (error) {
    return res.status(500).json({ mensajeError: error.message });
  }
};

// Actualizar un combo
// Actualizar un combo (con log detallado de cambios)
export const UR_Combo_CTS = async (req, res) => {
  const { id } = req.params;
  const {
    usuario_log_id, // ← quién realizó la acción
    ...payload
  } = req.body || {};

  try {
    const antes = await CombosModel.findByPk(id);
    if (!antes) {
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    }

    // Normalizar valores numéricos si vienen
    if (payload.precio_fijo != null)
      payload.precio_fijo = Number(payload.precio_fijo);
    if (payload.cantidad_items != null)
      payload.cantidad_items = Number(payload.cantidad_items);

    const [updated] = await CombosModel.update(payload, { where: { id } });
    if (updated !== 1) {
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    }

    const despues = await CombosModel.findByPk(id);

    // Armar diff legible
    const campos = [
      'nombre',
      'descripcion',
      'precio_fijo',
      'cantidad_items',
      'estado'
    ];
    const cambios = campos
      .map((c) => ({ campo: c, de: antes[c], a: despues[c] }))
      .filter((x) => String(x.de ?? '') !== String(x.a ?? ''));

    // Log no-bloqueante
    try {
      if (cambios.length > 0) {
        const partes = cambios.map(
          (c) => `${c.campo}: "${c.de ?? ''}" -> "${c.a ?? ''}"`
        );
        const descLog = `actualizó el combo "${despues.nombre}" (ID ${
          despues.id
        }). Cambios: ${partes.join(', ')}`;
        await registrarLog(
          req,
          'combos',
          'editar',
          descLog,
          usuario_log_id
        );
      } else {
        const descLog = `actualizó el combo "${despues.nombre}" (ID ${despues.id}) sin cambios efectivos.`;
        await registrarLog(
          req,
          'combos',
          'actualizar',
          descLog,
          usuario_log_id
        );
      }
    } catch (logErr) {
      console.warn(
        'registrarLog (actualizar combo) falló:',
        logErr?.message || logErr
      );
    }

    return res.json({
      message: 'Combo actualizado correctamente',
      actualizado: despues
    });
  } catch (error) {
    return res.status(500).json({ mensajeError: error.message });
  }
};

// Eliminar un combo
export const ER_Combo_CTS = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const usuario_log_id = body.usuario_log_id ?? null;
  const forzado = !!body.forzado;

  const tx = await db.transaction();
  try {
    const combo = await CombosModel.findByPk(id, { transaction: tx });
    if (!combo) {
      await tx.rollback();
      return res.status(404).json({ mensajeError: 'Combo no encontrado' });
    }

    // 1) ¿Tiene productos/categorías asignados?
    const countItems = await ComboProductosPermitidosModel.count({
      where: { combo_id: id },
      transaction: tx
    });

    if (countItems > 0 && !forzado) {
      await tx.rollback();
      return res.status(409).json({
        mensajeError:
          'No es posible borrar el combo porque tiene productos/categorías asignados. ' +
          'Primero elimínalos del combo o elegí “Eliminar combo con sus ítems”.',
        reason: 'HAS_ITEMS',
        items_count: countItems
      });
    }

    // 2) Si es forzado, borro primero los ítems
    if (countItems > 0 && forzado) {
      await ComboProductosPermitidosModel.destroy({
        where: { combo_id: id },
        transaction: tx
      });
    }

    // 3) Borrar el combo
    await CombosModel.destroy({ where: { id }, transaction: tx });

    await tx.commit();

    // ---- Log fuera de la tx (no romper si falla) ----
    try {
      let quien = `Usuario ${usuario_log_id ?? 'desconocido'}`;
      try {
        const u = usuario_log_id
          ? await UsuariosModel.findByPk(usuario_log_id)
          : null;
        if (u?.nombre) quien = u.nombre;
      } catch {}

      const descripcionLog = `${quien} eliminó el combo "${combo.nombre}"${
        countItems > 0 ? ' (tenía ítems asignados)' : ''
      }`;

      await registrarLog(
        req,
        'combos',
        'eliminar',
        descripcionLog,
        usuario_log_id
      );
    } catch (logErr) {
      console.warn('registrarLog (combos) falló:', logErr?.message || logErr);
    }

    return res.json({ message: 'Combo eliminado correctamente' });
  } catch (error) {
    // Si pese a todo pega FK, devolvemos mensaje claro
    if (
      error?.parent?.code === 'ER_ROW_IS_REFERENCED_2' ||
      error?.original?.code === 'ER_ROW_IS_REFERENCED_2'
    ) {
      return res.status(409).json({
        mensajeError:
          'No es posible borrar el combo porque tiene productos/categorías asignados. ' +
          'Primero elimínalos del combo o elegí “Eliminar combo con sus ítems”.',
        reason: 'HAS_ITEMS'
      });
    }
    try {
      await tx.rollback();
    } catch {}
    console.error('❌ Error en ER_Combo_CTS:', error);
    return res.status(500).json({ mensajeError: error.message });
  }
};
// Buscar combos por nombre (autosuggest)
export const SEARCH_Combos_CTS = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) return res.json([]);

    const combos = await CombosModel.findAll({
      where: {
        nombre: { [Op.like]: `%${query.trim()}%` }
      },
      order: [['nombre', 'ASC']]
    });

    if (combos.length > 0) return res.json(combos);
    return res
      .status(404)
      .json({ mensajeError: 'No se encontraron resultados' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};
