// utils/httpErrors.js

// ==============================
//  AppError: error de negocio/HTTP
// ==============================
export class AppError extends Error {
  constructor({
    status = 400,
    code = 'BAD_REQUEST',
    message = 'Solicitud inválida',
    tips = [],
    details = {}
  } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.tips = Array.isArray(tips) ? tips : [String(tips)];
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static from(err, fallback = {}) {
    if (err instanceof AppError) return err;
    return toHttpError(err, fallback);
  }
}

// Pequeño helper para validar
export const assertApp = (cond, cfg) => {
  if (!cond) throw new AppError(cfg);
};

// ==============================
//  Mapper principal
// ==============================
export const toHttpError = (err, fallback = {}) => {
  // 1) Si ya es AppError, devolverlo
  if (err instanceof AppError) return err;

  // 2) Sequelize family (nombre y parent con código MySQL)
  const name = err?.name;
  const parentCode = err?.parent?.code; // ej: 'ER_LOCK_WAIT_TIMEOUT'
  const errno = err?.parent?.errno; // ej: 1205
  const sqlState = err?.parent?.sqlState; // ej: 'HY000'
  const sqlMsg = err?.parent?.sqlMessage;

  // ---- Unicidad (índices únicos) ----
  if (name === 'SequelizeUniqueConstraintError') {
    const fields = err?.errors?.map((e) => e.path);
    return new AppError({
      status: 409,
      code: 'DUPLICATE',
      message:
        fallback.message || 'Ya existe un registro con esos datos únicos.',
      tips: fallback.tips || [
        'Revisá los campos únicos y probá con otros valores.'
      ],
      details: { fields, sqlMessage: sqlMsg }
    });
  }

  // ---- FK violations ----
  // 1451: ER_ROW_IS_REFERENCED_2 (no se puede borrar, está referenciado)
  // 1452: ER_NO_REFERENCED_ROW_2 (no existe la fila referenciada)
  if (
    name === 'SequelizeForeignKeyConstraintError' ||
    [1451, 1452].includes(errno)
  ) {
    const isDeleteConflict = errno === 1451;
    const msg = isDeleteConflict
      ? 'No se puede eliminar: tiene registros relacionados.'
      : 'La referencia indicada no existe o no es válida.';
    const code = isDeleteConflict ? 'FK_CONFLICT_DELETE' : 'FK_CONFLICT';
    return new AppError({
      status: 409,
      code,
      message: fallback.message || msg,
      tips:
        fallback.tips ||
        (isDeleteConflict
          ? ['Eliminá/migrá los registros dependientes antes de borrar.']
          : ['Revisá los IDs referenciados (banco, cuenta, cliente, etc.).']),
      details: { sqlMessage: sqlMsg, sqlState }
    });
  }

  // ---- Validaciones de modelo ----
  if (name === 'SequelizeValidationError') {
    const tips = err.errors?.map((e) => `${e.path}: ${e.message}`) ?? [];
    return new AppError({
      status: 422,
      code: 'MODEL_VALIDATION',
      message: fallback.message || 'Datos inválidos.',
      tips: fallback.tips || tips,
      details: { sqlMessage: sqlMsg }
    });
  }

  // ---- Valores inválidos / truncados / longitudes ----
  // 1366 ER_TRUNCATED_WRONG_VALUE_FOR_FIELD (valor inválido para el tipo)
  // 1406 ER_DATA_TOO_LONG
  // 1048 ER_BAD_NULL_ERROR (NOT NULL)
  if ([1366, 1406, 1048].includes(errno)) {
    let message = 'Valor inválido para uno o más campos.';
    const tips = [];
    if (errno === 1366) tips.push('Verificá el tipo/forma del dato ingresado.');
    if (errno === 1406)
      tips.push('El valor supera la longitud máxima permitida.');
    if (errno === 1048) tips.push('Hay campos obligatorios sin completar.');
    return new AppError({
      status: 422,
      code: 'DATA_FORMAT',
      message: fallback.message || message,
      tips: fallback.tips || tips,
      details: { sqlMessage: sqlMsg, sqlState }
    });
  }

  // ---- Concurrencia/Bloqueos ----
  // 1205 ER_LOCK_WAIT_TIMEOUT
  // 1213 ER_LOCK_DEADLOCK
  if (name === 'SequelizeDatabaseError' && [1205, 1213].includes(errno)) {
    const isDeadlock = errno === 1213;
    return new AppError({
      status: 503,
      code: isDeadlock ? 'DEADLOCK' : 'LOCK_TIMEOUT',
      message:
        fallback.message ||
        (isDeadlock
          ? 'Se detectó un bloqueo de concurrencia (deadlock).'
          : 'El sistema está ocupado procesando otra operación similar.'),
      tips:
        fallback.tips ||
        (isDeadlock
          ? [
              'Reintentá la operación.',
              'Evitá modificar el mismo recurso desde varias ventanas.',
              'Si persiste, contactá soporte para revisar transacciones.'
            ]
          : [
              'Reintentá la operación.',
              'Evitá tener múltiples pestañas editando el mismo dato.',
              'Si persiste, avisá a soporte para revisar bloqueos.'
            ]),
      details: { sqlMessage: sqlMsg, sqlState }
    });
  }

  // 3) Zod/Joi (opcional)
  if (name === 'ZodError' && Array.isArray(err.issues)) {
    const tips = err.issues.map((i) => `${i.path?.join('.')}: ${i.message}`);
    return new AppError({
      status: 422,
      code: 'SCHEMA_VALIDATION',
      message: 'Los datos no cumplen el esquema requerido.',
      tips,
      details: { issues: err.issues }
    });
  }

  // 4) Genérico
  return new AppError({
    status: fallback.status || 500,
    code: fallback.code || 'UNEXPECTED',
    message: fallback.message || 'Ocurrió un error inesperado.',
    tips: fallback.tips || [
      'Reintentá en unos segundos.',
      'Si persiste, contactá soporte.'
    ],
    details: { reason: err?.message, sqlMessage: sqlMsg, sqlState }
  });
};

// ==============================
//  Helpers Express
// ==============================

// Envía la respuesta de error con formato consistente
export const sendHttpError = (res, err) => {
  const httpErr = AppError.from(err);
  return res.status(httpErr.status).json({
    ok: false,
    code: httpErr.code,
    mensajeError: httpErr.message,
    tips: httpErr.tips,
    details: httpErr.details
  });
};

// Wrapper para controladores async
export const wrapAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => sendHttpError(res, e));
