import { getRedmineMapping } from '../../config/loader.js';
import { composeSubject, composeDescription } from './ticket-composer.js';
import type {
  ClassificationResponse,
  IntakePayload,
  Attachment,
} from '../../types.js';

// =============================================================================
// Redmine Client — Bloque 5
//
// Integración con la API REST de Redmine.
// Responsabilidades:
//   - Subir adjuntos
//   - Crear tickets con clasificación, asunto y descripción enriquecida
//   - Mapear campos de la taxonomía intermedia a IDs de Redmine
//
// ESTADO: estructura lista, IDs y mapeos pendientes de confirmación (VT-01..VT-04)
// =============================================================================

export interface RedmineConfig {
  baseUrl: string;     // ej: https://redmine.cobertec.com
  apiKey: string;      // API key con permisos de creación
}

export interface RedmineTicketResult {
  ticket_id: string;
  ticket_url: string;
}

export class RedmineClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: RedmineConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  /**
   * Flujo completo: subir adjuntos → crear ticket → devolver ID.
   */
  async createTicket(
    intake: IntakePayload,
    classification: ClassificationResponse
  ): Promise<RedmineTicketResult> {
    // 1. Subir adjuntos (si hay)
    const uploadTokens = await this.uploadAttachments(intake.attachments);

    // 2. Componer asunto y descripción
    const subject = composeSubject(classification);
    const description = composeDescription(intake, classification);

    // 3. Construir payload de Redmine
    const mapping = getRedmineMapping();
    const payload = this.buildIssuePayload(
      intake,
      classification,
      subject,
      description,
      uploadTokens,
      mapping
    );

    // 4. Crear ticket
    const result = await this.postIssue(payload);

    return result;
  }

  /**
   * Sube un archivo a Redmine y devuelve el token de referencia.
   * Redmine requiere POST a /uploads.json con el archivo en body.
   */
  private async uploadAttachments(
    attachments: Attachment[]
  ): Promise<Array<{ token: string; filename: string; content_type: string }>> {
    const results = [];

    for (const att of attachments) {
      const buffer = Buffer.from(att.data, 'base64');

      const response = await fetch(`${this.baseUrl}/uploads.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Redmine-API-Key': this.apiKey,
        },
        body: buffer,
      });

      if (!response.ok) {
        console.error(`[Redmine] Error subiendo adjunto ${att.filename}: ${response.status}`);
        continue; // No bloquear la creación del ticket por un adjunto fallido
      }

      const data = await response.json() as { upload: { token: string } };
      results.push({
        token: data.upload.token,
        filename: att.filename,
        content_type: att.content_type,
      });
    }

    return results;
  }

  /**
   * Construye el payload JSON para POST /issues.json
   */
  private buildIssuePayload(
    intake: IntakePayload,
    classification: ClassificationResponse,
    subject: string,
    description: string,
    uploadTokens: Array<{ token: string; filename: string; content_type: string }>,
    mapping: ReturnType<typeof getRedmineMapping>
  ): Record<string, unknown> {
    // Resolver project_id desde mapeo empresa → proyecto
    const projectId = mapping.company_to_project[intake.company_id]
      ?? mapping.company_to_project['_default']
      ?? '__PENDIENTE__';

    // Resolver priority_id
    const priorityId = mapping.priority_mapping[classification.suggested_priority]
      ?? mapping.priority_mapping['normal']
      ?? '__PENDIENTE__';

    // Resolver assignee
    const assigneeId = classification.suggested_assignee
      ?? mapping.redmine_defaults.default_assignee_id;

    // Custom fields
    const customFields = [
      {
        id: mapping.custom_fields.nature?.id ?? '__CF_NATURE__',
        value: classification.classification.nature,
      },
      {
        id: mapping.custom_fields.block?.id ?? '__CF_BLOCK__',
        value: classification.redmine_mapping.block,
      },
      {
        id: mapping.custom_fields.module?.id ?? '__CF_MODULE__',
        value: classification.redmine_mapping.module,
      },
      {
        id: mapping.custom_fields.need?.id ?? '__CF_NEED__',
        value: classification.redmine_mapping.need,
      },
      {
        id: mapping.custom_fields.confidence?.id ?? '__CF_CONFIDENCE__',
        value: classification.confidence,
      },
      {
        id: mapping.custom_fields.review_status?.id ?? '__CF_REVIEW_STATUS__',
        value: classification.review_status,
      },
    ];

    return {
      issue: {
        project_id: projectId,
        tracker_id: mapping.redmine_defaults.tracker_id,
        subject,
        description,
        status_id: mapping.redmine_defaults.status_id_initial,
        priority_id: priorityId,
        assigned_to_id: assigneeId,
        custom_fields: customFields,
        uploads: uploadTokens.map(t => ({
          token: t.token,
          filename: t.filename,
          content_type: t.content_type,
        })),
      },
    };
  }

  /**
   * POST /issues.json — crea el ticket en Redmine.
   */
  private async postIssue(
    payload: Record<string, unknown>
  ): Promise<RedmineTicketResult> {
    const response = await fetch(`${this.baseUrl}/issues.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Redmine-API-Key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Redmine API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as { issue: { id: number } };

    return {
      ticket_id: String(data.issue.id),
      ticket_url: `${this.baseUrl}/issues/${data.issue.id}`,
    };
  }
}

// =============================================================================
// Simulated Redmine Client — Modo simulación para desarrollo y demos
//
// Genera tickets ficticios con IDs incrementales. Registra en consola
// el payload completo que se enviaría a Redmine real.
// Se activa cuando REDMINE_URL no está configurada.
// =============================================================================

let simulatedTicketCounter = 1000;

export class SimulatedRedmineClient {
  async createTicket(
    intake: IntakePayload,
    classification: ClassificationResponse
  ): Promise<RedmineTicketResult> {
    const subject = composeSubject(classification);
    const description = composeDescription(intake, classification);

    simulatedTicketCounter++;
    const ticketId = String(simulatedTicketCounter);

    console.log(`[Redmine SIMULADO] Ticket #${ticketId} creado:`);
    console.log(`  Asunto: ${subject}`);
    console.log(`  Naturaleza: ${classification.classification.nature}`);
    console.log(`  Dominio: ${classification.classification.domain}`);
    console.log(`  Confianza: ${classification.confidence}`);
    console.log(`  Prioridad: ${classification.suggested_priority}`);
    console.log(`  Adjuntos: ${intake.attachments.length}`);
    console.log(`  Descripción enriquecida: ${description.length} chars`);

    // Simular latencia de red
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      ticket_id: ticketId,
      ticket_url: `https://redmine.cobertec.com/issues/${ticketId}`,
    };
  }
}

// --- Factory ---

let instance: RedmineClient | SimulatedRedmineClient | null = null;

export function getRedmineClient(): RedmineClient | SimulatedRedmineClient {
  if (!instance) {
    const baseUrl = process.env.REDMINE_URL;
    const apiKey = process.env.REDMINE_API_KEY;

    if (!baseUrl || !apiKey) {
      console.log('[Redmine] REDMINE_URL no configurada → modo simulación activado');
      instance = new SimulatedRedmineClient();
    } else {
      instance = new RedmineClient({ baseUrl, apiKey });
    }
  }
  return instance;
}

export function resetRedmineClient(): void {
  instance = null;
}
