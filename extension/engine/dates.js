// Utilidades de fechas en la zona horaria del gimnasio.
// Internamente un "día" es una cadena YYYY-MM-DD en hora local del gimnasio.

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }));
  }
  return formatters.get(timeZone);
}

/** Instante (ISO o Date) → día local YYYY-MM-DD. */
export function localDay(instant, timeZone) {
  return formatter(timeZone).format(new Date(instant));
}

function toUTC(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day, n) {
  return fromUTC(toUTC(day) + n * 86400000);
}

/** Suma meses naturales; si el día no existe en el mes destino, usa el último día. */
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return fromUTC(target.getTime());
}

export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** Lunes de la semana del día dado (semana lunes–domingo). */
export function weekStart(day) {
  const dow = new Date(toUTC(day)).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}
