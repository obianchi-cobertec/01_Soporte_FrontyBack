import type {
  IntakePayload,
  ConfirmationPayload,
  IntakeResponse,
} from '../types';
import { getAccessToken } from './auth-api';

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 25_000;

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

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
