/**
 * Lista negra de extensiones ejecutables / potencialmente peligrosas.
 * La misma lista se mantiene en frontend/src/utils/attachments.ts (mantener sincronizadas).
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsh',
  '.ps1', '.psm1', '.jar', '.app', '.deb', '.rpm', '.dmg',
  '.apk', '.sh', '.bash', '.zsh',
]);

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
