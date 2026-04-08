import type {
  IntakePayload,
  ConfirmationPayload,
  IntakeResponse,
} from '../types';

const API_BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  // El backend siempre devuelve un objeto con status
  // Si es error HTTP pero el body tiene estructura, lo devolvemos como ErrorResponse
  if (!response.ok && !data.status) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }

  return data as T;
}

/**
 * Envía la descripción inicial al backend para clasificación.
 */
export async function submitIntake(payload: IntakePayload): Promise<IntakeResponse> {
  return post<IntakeResponse>('/intake/submit', payload);
}

/**
 * Confirma o edita la clasificación.
 */
export async function confirmIntake(payload: ConfirmationPayload): Promise<IntakeResponse> {
  return post<IntakeResponse>('/intake/confirm', payload);
}

/**
 * Convierte un File del navegador a un Attachment base64.
 */
export async function fileToAttachment(file: File): Promise<{
  filename: string;
  content_type: string;
  data: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        data: base64,
      });
    };
    reader.onerror = () => reject(new Error(`Error leyendo archivo: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
