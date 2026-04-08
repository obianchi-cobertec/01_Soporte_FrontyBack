/**
 * Genera un UUID v4 para identificar la sesión de intake.
 * Se genera una vez al montar el componente principal.
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}
