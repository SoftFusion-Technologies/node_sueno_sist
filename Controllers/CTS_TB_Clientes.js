/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 01 / 07 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Este archivo (CTS_TB_Clientes.js) contiene controladores para manejar operaciones CRUD sobre la tabla de clientes.
 *
 * Tema: Controladores - Clientes
 * Capa: Backend
 */

// Importar el modelo
import MD_TB_Clientes from '../Models/MD_TB_Clientes.js';
import { VentasModel } from '../Models/Ventas/MD_TB_Ventas.js';
import { DetalleVentaModel } from '../Models/Ventas/MD_TB_DetalleVenta.js';
import db from '../DataBase/db.js'
const ClienteModel = MD_TB_Clientes.ClienteModel;
import { Op } from 'sequelize';

// Helper de logs
import { registrarLog } from '../Helpers/registrarLog.js';

// Helpers de texto
const show = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
const fieldLabel = {
  nombre: 'nombre',
  telefono: 'teléfono',
  email: 'email',
  direccion: 'dirección',
  dni: 'DNI',
};
// Obtener todos los clientes
export const OBRS_Clientes_CTS = async (req, res) => {
  try {
    const clientes = await ClienteModel.findAll({
      order: [['id', 'DESC']]
    });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener un solo cliente por ID
export const OBR_Cliente_CTS = async (req, res) => {
  try {
    const cliente = await ClienteModel.findByPk(req.params.id);
    if (!cliente)
      return res.status(404).json({ mensajeError: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// ======================= Crear =======================
export const CR_Cliente_CTS = async (req, res) => {
  const { nombre, telefono, email, direccion, dni, usuario_log_id } = req.body;

  if (!nombre) {
    return res.status(400).json({
      mensajeError: 'Falta el campo obligatorio: nombre'
    });
  }

  try {
    const nuevo = await ClienteModel.create({
      nombre,
      telefono,
      email,
      direccion,
      dni
    });

    // ---- LOG (no crítico) ----
    try {
      const parts = [
        `creó el cliente "${show(nuevo.nombre)}" (ID #${nuevo.id})`,
        `DNI: ${show(nuevo.dni)}`,
        show(nuevo.telefono) !== '-' ? `Tel: ${show(nuevo.telefono)}` : '',
        show(nuevo.email) !== '-' ? `Email: ${show(nuevo.email)}` : '',
        show(nuevo.direccion) !== '-' ? `Dir: ${show(nuevo.direccion)}` : ''
      ].filter(Boolean);

      await registrarLog(
        req,
        'clientes',
        'crear',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog clientes crear] no crítico:', e.message);
    }
    // ---------------------------

    res.json({ message: 'Cliente creado correctamente', cliente: nuevo });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// ======================= Eliminar =======================
export const ER_Cliente_CTS = async (req, res) => {
  const clienteId = req.params.id;

  try {
    const ventasCliente = await VentasModel.findAll({
      where: { cliente_id: clienteId },
      attributes: ['id']
    });

    if (ventasCliente.length > 0) {
      const ventaIds = ventasCliente.map((v) => v.id);
      const detalleRelacionado = await DetalleVentaModel.findOne({
        where: { venta_id: { [Op.in]: ventaIds } }
      });

      if (detalleRelacionado) {
        return res.status(409).json({
          mensajeError:
            'No se puede eliminar el cliente porque tiene ventas asociadas.'
        });
      }
    }

    // Traigo antes para log
    const previo = await ClienteModel.findByPk(clienteId);

    const eliminado = await ClienteModel.destroy({
      where: { id: clienteId }
    });

    if (!eliminado) {
      return res.status(404).json({ mensajeError: 'Cliente no encontrado' });
    }

    // ---- LOG (no crítico) ----
    try {
      const usuario_log_id = req.body?.usuario_log_id;
      const parts = [
        `eliminó el cliente "${show(previo?.nombre)}" (ID #${clienteId})`,
        `DNI: ${show(previo?.dni)}`
      ];
      await registrarLog(
        req,
        'clientes',
        'eliminar',
        parts.join(' · '),
        usuario_log_id || undefined
      );
    } catch (e) {
      console.warn('[registrarLog clientes eliminar] no crítico:', e.message);
    }
    // ---------------------------

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// ======================= Actualizar =======================
export const UR_Cliente_CTS = async (req, res) => {
  const { id } = req.params;

  try {
    const anterior = await ClienteModel.findByPk(id);
    if (!anterior) {
      return res.status(404).json({ mensajeError: 'Cliente no encontrado' });
    }

    const [updated] = await ClienteModel.update(req.body, {
      where: { id }
    });

    if (updated === 1) {
      const actualizado = await ClienteModel.findByPk(id);

      // ---- LOG (no crítico) ----
      try {
        const usuario_log_id = req.body?.usuario_log_id;

        // Campos auditables
        const campos = ['nombre', 'telefono', 'email', 'direccion', 'dni'];
        const cambios = [];

        for (const campo of campos) {
          if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
            const prev = anterior[campo];
            const next = actualizado[campo];
            if (`${show(prev)}` !== `${show(next)}`) {
              cambios.push(
                `cambió "${fieldLabel[campo]}" de "${show(prev)}" a "${show(next)}"`
              );
            }
          }
        }

        const parts = [
          `actualizó el cliente "${show(actualizado.nombre || anterior.nombre)}" (ID #${id})`,
          cambios.length ? cambios.join(' · ') : 'sin cambios relevantes'
        ];

        await registrarLog(
          req,
          'clientes',
          'editar',
          parts.join(' · '),
          usuario_log_id || undefined
        );
      } catch (e) {
        console.warn('[registrarLog clientes actualizar] no crítico:', e.message);
      }
      // ---------------------------

      res.json({ message: 'Cliente actualizado correctamente', actualizado });
    } else {
      res.status(404).json({ mensajeError: 'Cliente no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Buscar clientes por nombre, DNI, teléfono o email (búsqueda rápida/autosuggest)
// Buscar clientes por nombre, DNI, teléfono o email (búsqueda rápida/autosuggest)
export const SEARCH_Clientes_CTS = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) return res.json([]);
    const cleanQuery = query.trim().replace(/\s/g, '');

    // Si la query es numérica: buscar coincidencia exacta de DNI
    if (/^\d+$/.test(cleanQuery)) {
      const clientes = await ClienteModel.findAll({
        where: {
          [Op.and]: [
            { dni: cleanQuery },
            { dni: { [Op.notIn]: ['', 'Sin DNI'] } } // <--- QUITÁ null
          ]
        }
      });
      if (clientes.length > 0) return res.json(clientes);
      return res.status(404).json({ mensajeError: 'Cliente no encontrado' });
    }

    // Si es texto: buscar por nombre o email parcial
    const clientes = await ClienteModel.findAll({
      where: {
        [Op.or]: [
          { nombre: { [Op.like]: `%${cleanQuery}%` } },
          { email: { [Op.like]: `%${cleanQuery}%` } }
        ]
      }
    });

    if (clientes.length > 0) return res.json(clientes);
    return res.status(404).json({ mensajeError: 'Cliente no encontrado' });
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Endpoint: obtener historial de compras de un cliente
export const OBR_HistorialComprasCliente_CTS = async (req, res) => {
  try {
    const clienteId = req.params.id;
    // Trae ventas + suma total gastado
    const ventas = await VentasModel.findAll({
      where: { cliente_id: clienteId },
      order: [['fecha', 'DESC']],
      attributes: ['id', 'fecha', 'total']
    });

    res.json(ventas);
  } catch (error) {
    res.status(500).json({ mensajeError: error.message });
  }
};

// Obtener clientes inactivos según días sin comprar
export const OBRS_ClientesInactivos_CTS = async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 60;

    const clientes = await ClienteModel.findAll({
      where: {
        [Op.or]: [
          { fecha_ultima_compra: null },
          db.literal(`fecha_ultima_compra < NOW() - INTERVAL ${dias} DAY`)
        ]
      },
      order: [['fecha_ultima_compra', 'ASC']]
    });

    res.json(clientes);
  } catch (error) {
    console.error('Error al buscar clientes inactivos:', error);
    res.status(500).json({ mensajeError: 'Error al obtener clientes inactivos' });
  }
};
