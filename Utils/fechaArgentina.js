export function getFechaArgentina() {
  // Obtené fecha local de Argentina como string "dd/mm/yyyy, HH:MM:SS"
  const localStr = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires'
  });

  // Parseá el string manualmente
  const [fechaPart, horaPart] = localStr.split(', ');
  const [dia, mes, año] = fechaPart.split('/');
  const [hora, minuto, segundo] = horaPart.split(':');

  // Armá ISO como string
  const isoArg = `${año}-${mes.padStart(2, '0')}-${dia.padStart(
    2,
    '0'
  )}T${hora}:${minuto}:${segundo}-03:00`;

  // Convertí a Date que Sequelize interpreta bien
  return new Date(isoArg);
}
