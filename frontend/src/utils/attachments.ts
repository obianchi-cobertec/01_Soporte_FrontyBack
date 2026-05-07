/**
 * Utilidades para la gestión de adjuntos en el formulario de intake.
 * La lista de extensiones bloqueadas debe mantenerse sincronizada con
 * backend/src/utils/blocked-extensions.ts.
 */

export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsh',
  '.ps1', '.psm1', '.jar', '.app', '.deb', '.rpm', '.dmg',
  '.apk', '.sh', '.bash', '.zsh',
]);

/** Tamaño máximo de body (25 MB). */
export const MAX_TOTAL_BYTES: number = 25 * 1024 * 1024;

/** Límite seguro dejando 1 MB de margen para el JSON y el texto de la descripción. */
export const SAFE_LIMIT_BYTES: number = 24 * 1024 * 1024;

/**
 * Devuelve true si el nombre de archivo tiene una extensión bloqueada.
 * La comprobación es insensible a mayúsculas.
 */
export function isExecutableExtension(filename: string): boolean {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filename.slice(dotIdx).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext);
}

/**
 * Genera un nombre de archivo único para capturas pegadas.
 * Formato: captura-YYYYMMDD-HHmmss.png
 * Si ya existe en existingNames, añade sufijo -1, -2, etc.
 */
export function generatePasteFilename(existingNames: Set<string>): string {
  const now = new Date();
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const base =
    `captura-` +
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  let candidate = `${base}.png`;
  let n = 1;
  while (existingNames.has(candidate)) {
    candidate = `${base}-${n}.png`;
    n++;
  }
  return candidate;
}

/**
 * Formatea un tamaño en bytes a una cadena legible.
 * Ejemplos: "256 B", "1.4 KB", "3.2 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Devuelve la extensión del archivo en minúsculas, incluido el punto.
 * Devuelve cadena vacía si no hay extensión.
 */
export function getExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return '';
  return filename.slice(dotIdx).toLowerCase();
}
