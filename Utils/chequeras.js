// utils/chequeras.js
import { AppError } from './httpErrors.js';
import { ChequeraModel } from '../Models/Cheques/MD_TB_Chequeras.js';

/* =========================================================================
 * Helpers de validación
 * =======================================================================*/
export function validarRangoChequera(desde, hasta, proximo) {
  const d = Number(desde),
    h = Number(hasta),
    p = proximo == null ? d : Number(proximo);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h <= 0) {
    throw new AppError({
      status: 400,
      code: 'RANGO_INVALIDO',
      message: 'Rango inválido',
      tips: ['Ingresá números positivos en "desde" y "hasta".']
    });
  }
  if (h < d) {
    throw new AppError({
      status: 400,
      code: 'RANGO_INVERTIDO',
      message: 'El número "hasta" no puede ser menor que "desde"',
      tips: ['Corregí el orden del rango.']
    });
  }
  if (!Number.isFinite(p) || p < d || p > h) {
    throw new AppError({
      status: 400,
      code: 'PROXIMO_FUERA_DE_RANGO',
      message: 'El próximo número debe estar dentro del rango',
      tips: ['Ajustá "próximo Nº" para que esté entre "desde" y "hasta".'],
      details: { field: 'proximo_nro' }
    });
  }
}

/**
 * Sugerir un hueco de longitud `len` para la cuenta dada.
 * - Busca huecos entre chequeras existentes (ordenadas por nro_desde).
 * - Si no hay hueco intermedio, coloca al final (maxHasta + 1 .. + len).
 * - Si preferDesde está dentro de un hueco que alcanza, prioriza ese hueco.
 */
export async function sugerirRangoDisponible(
  banco_cuenta_id,
  len,
  preferDesde = null
) {
  const existentes = await ChequeraModel.findAll({
    where: { banco_cuenta_id },
    attributes: ['nro_desde', 'nro_hasta'],
    order: [['nro_desde', 'ASC']]
  });

  // Normalizar y fusionar solapados por si los hubiera
  const rangos = [];
  for (const r of existentes) {
    const d = Number(r.nro_desde),
      h = Number(r.nro_hasta);
    if (!rangos.length) rangos.push([d, h]);
    else {
      const last = rangos[rangos.length - 1];
      if (d <= last[1] + 1) {
        // toca o solapa -> merge
        last[1] = Math.max(last[1], h);
      } else {
        rangos.push([d, h]);
      }
    }
  }

  // Helper: verifica si [x, x+len-1] cabe sin cruzar rangos ocupados
  const cabeEn = (x) => {
    const hasta = x + len - 1;
    for (const [a, b] of rangos) {
      if (hasta < a) return true; // queda antes de este rango -> no choca con ninguno previo
      if (x > b) continue; // queda después de este -> seguir
      return false; // choca este
    }
    return true; // no chocó ninguno
  };

  // 1) Si pasaron preferDesde y cabe, priorizar
  if (preferDesde != null) {
    const pd = Number(preferDesde);
    if (Number.isFinite(pd) && cabeEn(pd)) {
      return { nro_desde: pd, nro_hasta: pd + len - 1 };
    }
  }

  // 2) Probar huecos entre rangos
  // Inicio lógico: 1 (o 1er hueco antes del primer rango)
  let cursor = 1;
  for (const [a, b] of rangos) {
    if (cursor + len - 1 < a) {
      // Hueco [cursor, a-1] alcanza
      return { nro_desde: cursor, nro_hasta: cursor + len - 1 };
    }
    // Mover cursor al final del rango +1
    cursor = b + 1;
  }

  // 3) No hay huecos intermedios: colocar al final
  return { nro_desde: cursor, nro_hasta: cursor + len - 1 };
}
