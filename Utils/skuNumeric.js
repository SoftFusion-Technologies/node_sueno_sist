// utils/skuNumeric.js
export const WIDTHS = {
  prod: 5,
  local: 3,
  lugar: 3,
  estado: 2,
  check: 2
};
const pad = (n, w) => String(Number(n)).padStart(w, '0');

export function mod97(strDigits) {
  let rem = 0;
  for (let i = 0; i < strDigits.length; i++) {
    const d = strDigits.charCodeAt(i) - 48; // '0'..'9'
    if (d < 0 || d > 9) continue;
    rem = (rem * 10 + d) % 97;
  }
  return rem;
}
export function checksum97(strDigits) {
  return String(mod97(strDigits)).padStart(WIDTHS.check, '0');
}

// 18 dígitos: PPPPP TTT LLL GGG EE CC
export function encodeNumericSku({
  producto_id,
  local_id,
  lugar_id,
  estado_id = 0
}) {
  const core =
    pad(producto_id, WIDTHS.prod) +
    pad(local_id, WIDTHS.local) +
    pad(lugar_id, WIDTHS.lugar) +
    pad(estado_id, WIDTHS.estado);
  return core + checksum97(core);
}
