// utils/httpErrors.js
export class AppError extends Error {
  constructor({
    status = 400,
    code = 'BAD_REQUEST',
    message,
    tips = [],
    details = {}
  }) {
    super(message);
    this.status = status;
    this.code = code;
    this.tips = tips;
    this.details = details; // e.g. { field: 'numero', hint: '...' }
  }
}

export const toHttpError = (err) => {
  // Errores de negocio lanzados por nosotros
  if (err instanceof AppError) return err;

  // Sequelize: unicidad
  if (err?.name === 'SequelizeUniqueConstraintError') {
    const fields = err?.errors?.map((e) => e.path);
    return new AppError({
      status: 409,
      code: 'DUPLICATE',
      message: 'Ya existe un cheque con ese banco y número',
      tips: [
        'Verificá que el número de cheque no esté registrado para ese banco.',
        'Si es emitido, revisá el próximo número de la chequera.',
        'Si es recibido, validá que el número no se haya cargado antes.'
      ],
      details: { fields }
    });
  }

  // Sequelize: FK, validaciones, etc.
  if (err?.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError({
      status: 409,
      code: 'FK_CONFLICT',
      message: 'La referencia indicada no existe o no es válida',
      tips: ['Revisá los IDs de banco/chequera/cliente/proveedor/venta.']
    });
  }
  if (err?.name === 'SequelizeValidationError') {
    return new AppError({
      status: 422,
      code: 'MODEL_VALIDATION',
      message: 'Datos inválidos',
      tips: err.errors?.map((e) => `${e.path}: ${e.message}`) ?? []
    });
  }
  if (
    err?.name === 'SequelizeDatabaseError' &&
    err?.parent?.code === 'ER_LOCK_WAIT_TIMEOUT'
  ) {
    return new AppError({
      status: 503,
      code: 'LOCK_TIMEOUT',
      message: 'El sistema está ocupado procesando otra operación similar',
      tips: [
        'Reintentá la operación.',
        'Evitá tener múltiples pestañas creando el mismo cheque.',
        'Si persiste, avisá a soporte para revisar bloqueos.'
      ],
      details: { hint: 'MySQL ER_LOCK_WAIT_TIMEOUT en cheques.' }
    });
  }

  // Genérico
  return new AppError({
    status: 500,
    code: 'UNEXPECTED',
    message: 'Ocurrió un error inesperado',
    tips: ['Reintentá en unos segundos.', 'Si persiste, contactá soporte.'],
    details: { reason: err?.message }
  });
};
