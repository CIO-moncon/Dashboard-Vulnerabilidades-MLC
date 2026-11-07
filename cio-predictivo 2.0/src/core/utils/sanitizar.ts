// ============================================================================
// Sanitización HTML compartida — CIO Predictivo 2.0
// ============================================================================
// Única fuente de verdad para escapar texto antes de insertarlo en el DOM.
// Evita duplicación y reduce el riesgo de XSS en interpolaciones de innerHTML.
// ============================================================================

/**
 * Escapa los caracteres especiales de HTML en un texto.
 * Devuelve cadena vacía si el valor es null/undefined.
 */
export function escaparHTML(texto: unknown = ''): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Alias en inglés por compatibilidad con convenciones de otros módulos.
 */
export const escapeHtml = escaparHTML;
