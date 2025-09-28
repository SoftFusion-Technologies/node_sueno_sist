// Controllers/Cheques/CTS_TB_ChequeImagenes.js
/*
 * Programador: Benjamin Orellana
 * Fecha Creación: 21 / 09 / 2025
 * Versión: 1.0
 *
 * Descripción:
 * Controladores para Imágenes de Cheques:
 *  - Listar imágenes por cheque
 *  - Ver metadatos de una imagen
 *  - Subir imagen (JPEG/PNG/PDF) con hash sha256 y unicidad
 *  - Descargar imagen (stream) con log de evento
 *  - Editar tipo/observaciones (respetando UNIQUE cheque_id+tipo)
 *  - Eliminar imagen (físico + metadatos + evento)
 *
 * Notas:
 *  - Storage local por defecto: process.env.UPLOADS_DIR (ej. "./uploads")
 *  - storage_key = cheques/YYYY/MM/<cheque_id>/<tipo>-<uuid>.<ext>
 *  - UNIQUEs respetados: (cheque_id,tipo) y (sha256)
 */

import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import multer from 'multer';
import db from '../../DataBase/db.js';
import {
  Op,
  Transaction,
  col,
  literal,
  UniqueConstraintError
} from 'sequelize';
import { fileURLToPath } from 'url';

import { ChequeModel } from '../../Models/Cheques/MD_TB_Cheques.js';
import { ChequeImagenModel } from '../../Models/Cheques/MD_TB_ChequeImagenes.js';
import { ChequeImagenEventoModel } from '../../Models/Cheques/MD_TB_ChequeImagenEventos.js';
import { registrarLog } from '../../Helpers/registrarLog.js';

/* =========================
   Config / Helpers
   ========================= */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const BASE_UPLOAD_DIR = process.env.UPLOADS_DIR || path.resolve('./uploads');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8080';

function mapChequeImagen(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  const url = `${PUBLIC_BASE_URL}/uploads/${plain.storage_key}`;
  return {
    ...plain,
    url,
    thumb_url: plain.thumb_url
      ? `${PUBLIC_BASE_URL}/uploads/${plain.thumb_key || plain.thumb_url}`
      : null
  };
}
const ensureDir = async (dir) => fsp.mkdir(dir, { recursive: true });

const sha256Buffer = (buf) => {
  const hash = crypto.createHash('sha256');
  hash.update(buf);
  return hash.digest('hex');
};

const safeName = (name = '') =>
  name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200);

const extFrom = (originalname, mimetype) => {
  const extByMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf'
  };
  const byMime = extByMime[mimetype] || '';
  const byName = path.extname(originalname || '').replace('.', '');
  return (byMime || byName || 'bin').toLowerCase();
};

const nowParts = () => {
  const d = new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { yyyy, mm };
};

const ipToBuffer = (req) => {
  try {
    const raw = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const ip = raw.includes(',') ? raw.split(',')[0].trim() : raw.trim();
    if (!ip) return null;
    // Simple store as text -> Buffer
    return Buffer.from(ip);
  } catch {
    return null;
  }
};

// optional dimensions using sharp (si está instalado)
const probeDimensions = async (buf, mime) => {
  if (!mime.startsWith('image/')) return { w: null, h: null };
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    return { w: meta.width ?? null, h: meta.height ?? null };
  } catch {
    return { w: null, h: null };
  }
};

/* =========================
   Multer (middleware)
   ========================= */
const upload = multer({
  storage: multer.memoryStorage(), // mantenemos en memoria para hashear antes de escribir
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido (solo JPG, PNG, PDF)'));
    }
    cb(null, true);
  }
});

// Exportá este middleware para usarlo en la ruta POST
export const uploadChequeImagenMulter = upload.single('file');

/* =========================================================================
 * 1) Listar imágenes por cheque  GET /cheques/:cheque_id/imagenes
 *    query: tipo?=frente|dorso|otro
 * =======================================================================*/
// GET /cheques/:cheque_id/imagenes
export const OBRS_ChequeImagenes_CTS = async (req, res) => {
  try {
    const cheque_id = Number(req.params.cheque_id);
    const {
      q = '',
      tipo = '',
      page = 1,
      pageSize = 24,
      order = 'created_at',
      dir = 'DESC'
    } = req.query;

    const where = { cheque_id };
    if (tipo) where.tipo = String(tipo);

    if (q) {
      where[Op.or] = [
        { observaciones: { [Op.like]: `%${q}%` } },
        { filename: { [Op.like]: `%${q}%` } }
      ];
    }

    const ORDERABLE = new Set(['id', 'created_at', 'updated_at', 'byte_size']);
    const orderCol = ORDERABLE.has(String(order))
      ? String(order)
      : 'created_at';
    const orderDir = String(dir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const limit = Math.max(1, Number(pageSize));
    const pageNum = Math.max(1, Number(page));
    const offset = (pageNum - 1) * limit;

   const { rows, count } = await ChequeImagenModel.findAndCountAll({
     where,
     attributes: {
       include: [
         // alias de compat para el front:
         [col('mime_type'), 'mimetype'],

         // URL directa al archivo servido estáticamente
         [
           literal(`CONCAT('${PUBLIC_BASE_URL}', '/uploads/', storage_key)`),
           'url'
         ],

         // URL de descarga controlada por endpoint
         [
           literal(
             `CONCAT('${PUBLIC_BASE_URL}', '/cheques/', cheque_id, '/imagenes/', id, '/download')`
           ),
           'download_url'
         ]
       ]
     },
     order: [
       [orderCol, orderDir],
       ['id', 'DESC']
     ],
     limit,
     offset
   });

    return res.json({
      items: rows,
      total: count,
      page: pageNum,
      pageSize: limit
    });
  } catch (err) {
    console.error('OBRS_ChequeImagenes_CTS error:', err);
    return res.status(500).json({
      message: 'Fail',
      error: err?.message || 'Error interno'
    });
  }
};
/* =========================================================================
 * 2) Ver metadatos de una imagen  GET /cheques/:cheque_id/imagenes/:id
 * =======================================================================*/
// GET /cheques/:cheque_id/imagenes/:id
export const OBR_ChequeImagen_CTS = async (req, res) => {
  try {
    const cheque_id = Number(req.params.cheque_id);
    const id = Number(req.params.id);

    const row = await ChequeImagenModel.findOne({
      where: { id, cheque_id },
      attributes: [
        'id',
        'cheque_id',
        'tipo',
        'observaciones',
        'mime_type',
        'byte_size',
        'storage_key',
        'created_at',
        'updated_at'
      ]
    });
    if (!row)
      return res.status(404).json({ mensajeError: 'Imagen no encontrada' });

    const base = process.env.PUBLIC_BASE_URL || '';
    const data = row.toJSON();

    data.url = data.storage_key ? `${base}/uploads/${data.storage_key}` : null;
    data.download_url = `${base}/cheques/${cheque_id}/imagenes/${id}/download`;
    // compat alias por si el front lo usa:
    data.mimetype = data.mime_type;

    return res.json(data);
  } catch (err) {
    console.error('OBR_ChequeImagen_CTS error:', err);
    return res
      .status(500)
      .json({ message: 'Fail', error: err?.message || 'Error interno' });
  }
};


/* =========================================================================
 * 3) Subir imagen  POST /cheques/:cheque_id/imagenes
 *    body: { tipo: 'frente'|'dorso'|'otro', observaciones?, usuario_log_id? }
 *    file: multipart field "file"
 * =======================================================================*/
export const CR_ChequeImagen_CTS = async (req, res) => {
  const cheque_id = Number(req.params.cheque_id);

  // aceptar ambos nombres desde el form-data para compatibilidad
  const rawTipo = (req.body?.tipo || req.body?.tipo_imagen || 'otro')
    .toString()
    .toLowerCase();

  const observaciones = req.body?.observaciones ?? null;
  const usuario_log_id = req.body?.usuario_log_id ?? null;
  const file = req.file;

  if (!file) {
    return res
      .status(400)
      .json({ mensajeError: 'Archivo requerido (campo "file")' });
  }

  const TIPOS = ['frente', 'dorso', 'otro'];
  const tipo = TIPOS.includes(rawTipo) ? rawTipo : 'otro';

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  // para poder limpiar si algo falla luego de escribir
  let absPath = null;

  try {
    // 1) cheque debe existir
    const cheque = await ChequeModel.findByPk(cheque_id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!cheque) {
      throw new Error('Cheque inexistente');
    }

    // 2) unicidad por tipo (solo frente/dorso)
    if (tipo !== 'otro') {
      const ya = await ChequeImagenModel.findOne({
        where: { cheque_id, tipo },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (ya) {
        // coherente con el índice UNIQUE (cheque_id,tipo)
        return res.status(409).json({
          mensajeError: `Ya existe una imagen de tipo "${tipo}" para este cheque`,
          existente: ya
        });
      }
    }

    // 3) preparar archivo
    const originalname = safeName(file.originalname || 'archivo');
    const mimetype = file.mimetype;
    const ext = extFrom(originalname, mimetype);
    const sha256 = sha256Buffer(file.buffer);

    // 4) dedupe global por sha256
    const dup = await ChequeImagenModel.findOne({
      where: { sha256 },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (dup) {
      if (dup.cheque_id === cheque_id && dup.tipo === tipo) {
        await t.commit();
        // devolver existente como 200 para UX amable
        return res.status(200).json({
          message: 'Imagen ya existente para este cheque y tipo',
          imagen: withUrl(dup) // añadimos url inline
        });
      }
      // existe en otro cheque o distinto tipo para este cheque
      return res.status(409).json({
        mensajeError: 'El mismo archivo ya fue cargado (sha256 duplicado)',
        duplicado: dup
      });
    }

    // 5) dimensiones (solo si es imagen conocida)
    let width_px = null;
    let height_px = null;
    try {
      const dims = await probeDimensions(file.buffer, mimetype);
      if (dims) {
        width_px = Number(dims.w) || null;
        height_px = Number(dims.h) || null;
      }
    } catch {
      // ignorar: podría ser pdf u otro
    }

    // 6) construir storage key y escribir a disco
    const { yyyy, mm } = nowParts();
    const key = `cheques/${yyyy}/${mm}/${cheque_id}/${tipo}-${crypto.randomUUID()}.${ext}`;
    absPath = path.join(BASE_UPLOAD_DIR, key);
    await ensureDir(path.dirname(absPath));
    await fsp.writeFile(absPath, file.buffer);

    // 7) insertar metadatos
    const nueva = await ChequeImagenModel.create(
      {
        cheque_id,
        tipo,
        filename: originalname,
        mime_type: mimetype, // ojo: columna es mime_type (no "mimetype")
        byte_size: file.size,
        width_px,
        height_px,
        sha256,
        storage_key: key,
        storage_bucket: null,
        storage_region: null,
        observaciones,
        uploaded_by: usuario_log_id || null
      },
      { transaction: t }
    );

    // 8) evento upload (no bloqueante, pero dentro de la tx para coherencia)
    await ChequeImagenEventoModel.create(
      {
        cheque_id,
        imagen_id: nueva.id,
        evento: 'upload',
        user_id: usuario_log_id || null,
        ip_addr: ipToBuffer(req),
        user_agent: String(req.headers['user-agent'] || ''),
        detalle: `Upload ${tipo}`
      },
      { transaction: t }
    );

    await t.commit();

    // respuesta con url lista para <img>
    return res.json({
      message: 'Imagen subida correctamente',
      imagen: withUrl(nueva)
    });
  } catch (error) {
    // revertir tx
    try {
      await t.rollback();
    } catch {}

    // si ya habíamos escrito el archivo, intentamos limpiarlo
    if (absPath) {
      try {
        await fsp.unlink(absPath);
      } catch {}
    }

    // conflicto por índice único (fallback)
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        mensajeError:
          'Conflicto de unicidad (ya existe frente/dorso para este cheque)'
      });
    }

    console.error('CR_ChequeImagen_CTS:', error);
    return res
      .status(500)
      .json({ mensajeError: error?.message || 'Error interno' });
  }
};

// helper para adjuntar la URL inline de descarga a un registro
function withUrl(rowOrPlain) {
  // soporta instancia de sequelize o objeto plano
  const plain = typeof rowOrPlain.toJSON === 'function' ? rowOrPlain.toJSON() : rowOrPlain;
  return {
    ...plain,
    url: `/cheques/${plain.cheque_id}/imagenes/${plain.id}/download?inline=1`
  };
}

/* =========================================================================
 * 4) Descargar imagen  GET /cheques/:cheque_id/imagenes/:id/download
 * =======================================================================*/
export const DWN_ChequeImagen_CTS = async (req, res) => {
  const { cheque_id, id } = req.params;
  try {
    const row = await ChequeImagenModel.findOne({
      where: { id: Number(id), cheque_id: Number(cheque_id) }
    });
    if (!row)
      return res.status(404).json({ mensajeError: 'Imagen no encontrada' });

    const absPath = path.join(BASE_UPLOAD_DIR, row.storage_key);
    if (!fs.existsSync(absPath)) {
      return res
        .status(404)
        .json({ mensajeError: 'Archivo físico no encontrado' });
    }

    // Evento de descarga (no hace falta bloquear la respuesta)
    ChequeImagenEventoModel.create({
      imagen_id: row.id,
      cheque_id: row.cheque_id,
      evento: 'download',
      user_id: req.query.usuario_log_id || req.body?.usuario_log_id || null,
      ip_addr: ipToBuffer(req),
      user_agent: (req.headers['user-agent'] || '').toString(),
      detalle: 'Descarga'
    }).catch(() => {});

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Length', row.byte_size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(row.filename)}"`
    );
    fs.createReadStream(absPath).pipe(res);
  } catch (error) {
    console.error('DWN_ChequeImagen_CTS:', error);
    res.status(500).json({ mensajeError: error.message });
  }
};

/* =========================================================================
 * 5) Editar metadatos  PATCH /cheques/:cheque_id/imagenes/:id
 *    body: { tipo?, observaciones?, usuario_log_id? }
 *    - respeta UNIQUE (cheque_id, tipo)
 * =======================================================================*/
export const UR_ChequeImagen_CTS = async (req, res) => {
  const cheque_id = Number(req.params.cheque_id);
  const id = Number(req.params.id);

  // aceptar ambos nombres para compatibilidad
  const rawTipo = req.body?.tipo ?? req.body?.tipo_imagen;
  const observaciones = req.body?.observaciones ?? null;
  const usuario_log_id = req.body?.usuario_log_id ?? null;

  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  try {
    const row = await ChequeImagenModel.findOne({
      where: { id, cheque_id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ mensajeError: 'Imagen no encontrada' });
    }

    // normalizar tipo (si vino)
    let nextTipo = row.tipo;
    if (typeof rawTipo === 'string' && rawTipo.trim()) {
      const v = rawTipo.toLowerCase();
      const TIPOS = ['frente', 'dorso', 'otro'];
      if (!TIPOS.includes(v)) {
        await t.rollback();
        return res
          .status(400)
          .json({ mensajeError: "tipo inválido ('frente'|'dorso'|'otro')" });
      }
      nextTipo = v;

      // si cambia y no es 'otro', validar unicidad para este cheque
      if (nextTipo !== row.tipo && nextTipo !== 'otro') {
        const ya = await ChequeImagenModel.findOne({
          where: {
            cheque_id,
            tipo: nextTipo,
            id: { [Op.ne]: id } // excluir la actual
          },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (ya) {
          await t.rollback();
          return res.status(409).json({
            mensajeError: `Ya existe una imagen de tipo "${nextTipo}" para este cheque`,
            existente: ya
          });
        }
      }
    }

    // armar payload de update solo con campos provistos
    const updatePayload = {};
    if (rawTipo !== undefined) updatePayload.tipo = nextTipo;
    if (req.body?.observaciones !== undefined)
      updatePayload.observaciones = observaciones;

    // si no hay nada para actualizar, devolver tal cual
    if (Object.keys(updatePayload).length === 0) {
      await t.rollback();
      return res
        .status(200)
        .json({ message: 'Sin cambios', imagen: withUrl(row) });
    }

    await ChequeImagenModel.update(updatePayload, {
      where: { id },
      transaction: t
    });

    // evento de auditoría (opcional)
    try {
      await ChequeImagenEventoModel.create(
        {
          cheque_id,
          imagen_id: id,
          evento: 'update_meta',
          user_id: usuario_log_id || null,
          ip_addr: null, // opcional si no guardás IP aquí
          user_agent: String(req.headers['user-agent'] || ''),
          detalle: `Editó ${[
            updatePayload.tipo ? `tipo=${updatePayload.tipo}` : null,
            updatePayload.observaciones ? 'observaciones' : null
          ]
            .filter(Boolean)
            .join(', ')}`
        },
        { transaction: t }
      );
    } catch (e) {
      // no bloquear por evento
      console.warn('ChequeImagenEvento(update_meta) warn:', e?.message || e);
    }

    await t.commit();

    // log fuera de la transacción
    try {
      await registrarLog(
        req,
        'cheque_imagenes',
        'editar',
        `actualizó imagen (${row.filename}) del cheque_id=${row.cheque_id}`,
        usuario_log_id
      );
    } catch {}

    const actualizado = await ChequeImagenModel.findByPk(id);
    return res.json({
      message: 'Imagen actualizada',
      imagen: withUrl(actualizado)
    });
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('UR_ChequeImagen_CTS:', error);
    return res
      .status(500)
      .json({ mensajeError: error?.message || 'Error interno' });
  }
};

/* =========================================================================
 * 6) Eliminar imagen  DELETE /cheques/:cheque_id/imagenes/:id
 *    - borra metadatos + archivo físico (si existe)
 *    - evento 'delete' + log
 * =======================================================================*/
export const ER_ChequeImagen_CTS = async (req, res) => {
  const { cheque_id, id } = req.params;
  const usuario_log_id =
    req.body?.usuario_log_id ?? req.query?.usuario_log_id ?? null;

  let row; // lo necesitamos para saber storage_key y datos del log

  // 1) Leer SIN lock
  row = await ChequeImagenModel.findOne({
    where: { id: Number(id), cheque_id: Number(cheque_id) }
  });
  if (!row) {
    return res.status(404).json({ mensajeError: 'Imagen no encontrada' });
  }
  const absPath = path.join(BASE_UPLOAD_DIR, row.storage_key);

  // 2) Tx corta SOLO para el destroy
  const t = await db.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });
  try {
    // Borrado “optimista”: asegurate que sigue existiendo
    const deleted = await ChequeImagenModel.destroy({
      where: { id: row.id, cheque_id: row.cheque_id },
      transaction: t,
      limit: 1
    });

    if (!deleted) {
      // Otro proceso la borró antes
      await t.rollback();
      return res
        .status(409)
        .json({ mensajeError: 'La imagen ya no existe (concurrente).' });
    }

    await t.commit();
  } catch (error) {
    try {
      await t.rollback();
    } catch {}
    console.error('ER_ChequeImagen_CTS destroy tx:', error);
    // Si te interesa reintentar una vez en lock timeout:
    if (error?.original?.code === 'ER_LOCK_WAIT_TIMEOUT') {
      return res
        .status(503)
        .json({ mensajeError: 'Reintentá: bloqueo de base momentáneo.' });
    }
    return res.status(500).json({ mensajeError: error.message });
  }

  // 3) Borrado físico (fuera de tx)
  try {
    await fsp.unlink(absPath);
  } catch {}

  // 4) Evento/log (fuera de tx para no forzar locks)
  try {
    await ChequeImagenEventoModel.create({
      imagen_id: row.id,
      cheque_id: row.cheque_id,
      evento: 'delete',
      user_id: usuario_log_id || null,
      ip_addr: ipToBuffer(req),
      user_agent: (req.headers['user-agent'] || '').toString(),
      detalle: `Delete ${row.tipo}`
    });
  } catch (e) {
    console.warn('evento delete falló (no crítico):', e?.message || e);
  }
  try {
    await registrarLog(
      req,
      'cheque_imagenes',
      'eliminar',
      `eliminó imagen (${row.filename}) del cheque_id=${row.cheque_id}`,
      usuario_log_id
    );
  } catch {}

  return res.json({ message: 'Imagen eliminada correctamente.' });
};
