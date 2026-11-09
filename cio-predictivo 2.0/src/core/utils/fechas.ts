const DOS_DIGITOS = (valor: string | number): string => String(valor).padStart(2, '0');

const formatearFechaHora = (fecha: Date): string => {
  if (Number.isNaN(fecha.getTime())) return '';
  return `${DOS_DIGITOS(fecha.getDate())}-${DOS_DIGITOS(fecha.getMonth() + 1)}-${fecha.getFullYear()} ${DOS_DIGITOS(fecha.getHours())}:${DOS_DIGITOS(fecha.getMinutes())}`;
};

/**
 * Normaliza fechas de distintas fuentes (Date, ISO 8601, timestamps, locale
 * es-CL o dd/mm/aaaa hh:mm) a un formato corto y uniforme: dd-mm-aaaa hh:mm.
 * Evita que fechas largas descuadren tablas y reportes.
 */
export const formatearFechaCorta = (valor: unknown): string => {
  if (valor instanceof Date) return formatearFechaHora(valor);

  const raw = String(valor ?? '').trim();
  if (!raw || raw === '—' || raw === 'S/D') return raw || '—';

  // Timestamp en milisegundos o segundos.
  if (/^\d{10,13}$/.test(raw)) {
    const numero = Number(raw);
    return formatearFechaHora(new Date(numero < 1e12 ? numero * 1000 : numero));
  }

  // ISO 8601: 2026-11-08T18:12:52 o 2026-11-08 18:12:52.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]} ${iso[4]}:${iso[5]}`;

  // dd/mm/aaaa, dd-mm-aaaa o dd.mm.aaaa, con hora y segundos opcionales.
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const dia = DOS_DIGITOS(dmy[1]);
    const mes = DOS_DIGITOS(dmy[2]);
    if (dmy[4] && dmy[5]) {
      return `${dia}-${mes}-${dmy[3]} ${DOS_DIGITOS(dmy[4])}:${dmy[5]}`;
    }
    return `${dia}-${mes}-${dmy[3]}`;
  }

  // Texto no reconocido: se acota para no romper el layout.
  return raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
};
