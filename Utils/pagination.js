// src/Utils/pagination.js
import { Op } from 'sequelize';

export const DEFAULT_LIMIT = 9;
export const MAX_LIMIT = 100;

export function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rawPage = Number.parseInt(query.page);
  const hasPage = Number.isFinite(rawPage) && rawPage > 0;

  const rawOffset = Number.parseInt(query.offset);
  const hasOffset = Number.isFinite(rawOffset) && rawOffset >= 0;

  const offset = hasOffset ? rawOffset : hasPage ? (rawPage - 1) * limit : 0;
  const page = hasPage ? rawPage : Math.floor(offset / limit) + 1;

  const sort = sanitizeSort(query.sort);
  const order =
    String(query.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  return { limit, offset, page, sort, order };
}

// Evitá inyección limitando columnas ordenables por recurso
export function sanitizeSort(sort) {
  return String(sort || '').trim();
}

// Construye la metadata de respuesta
export function buildMeta({ total, limit, offset }) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return {
    total,
    page,
    pageSize: limit,
    totalPages,
    hasPrev,
    hasNext,
    offset,
    nextOffset: hasNext ? offset + limit : null,
    prevOffset: hasPrev ? Math.max(0, offset - limit) : null
  };
}

// Opcional: links auto-construidos (útil si querés REST navegable)
export function buildLinks(req, meta) {
  const make = (offset) => {
    if (offset == null) return null;
    const url = new URL(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`
    );
    url.searchParams.set('offset', offset);
    url.searchParams.set('limit', meta.pageSize);
    return url.toString();
  };

  return {
    self: make(meta.offset),
    next: make(meta.nextOffset),
    prev: make(meta.prevOffset)
  };
}

// Helper de búsqueda simple por columnas (case/accent insensitive según collation)
export function buildLikeFilter(q, cols = []) {
  if (!q || !String(q).trim()) return null;
  return {
    [Op.or]: cols.map((c) => ({ [c]: { [Op.like]: `%${q}%` } }))
  };
}
