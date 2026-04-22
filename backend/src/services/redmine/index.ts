import { getRedmineMapping } from '../../config/loader.js';
import { composeSubject, composeDescription } from './ticket-composer.js';
import { getIdentityStore } from '../identity/store.js';
import type {
  ClassificationResponse,
  IntakePayload,
  Attachment,
} from '../../types.js';

export interface RedmineConfig {
  baseUrl: string;
  apiKey: string;
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

  async createTicket(
    intake: IntakePayload,
    classification: ClassificationResponse
  ): Promise<RedmineTicketResult> {
    const uploadTokens = await this.uploadAttachments(intake.attachments);
    const subject = composeSubject(classification);
    const description = composeDescription(intake, classification);
    const mapping = getRedmineMapping();

    // Resolver login de Redmine del usuario para impersonation
    const store = getIdentityStore();
    const redmineLogin = store.getRedmineLogin(intake.user_id) ?? null;

    // Resolver proyecto Redmine real del cliente
    const projectId = mapping.company_to_project[intake.company_id]
      ?? mapping.company_to_project['_default']
      ?? 'cobertec-intake-test';

    const payload = this.buildIssuePayload(
      intake, classification, subject, description, uploadTokens, mapping, projectId
    );
    return this.postIssue(payload, redmineLogin);
  }

  private async uploadAttachments(
    attachments: Attachment[]
  ): Promise<Array<{ token: string; filename: string; content_type: string }>> {
    const uploads = await Promise.all(
      attachments.map(async (att) => {
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
          return null;
        }
        const data = await response.json() as { upload: { token: string } };
        return { token: data.upload.token, filename: att.filename, content_type: att.content_type };
      })
    );
    return uploads.filter((u): u is NonNullable<typeof u> => u !== null);
  }

  private buildIssuePayload(
    intake: IntakePayload,
    classification: ClassificationResponse,
    subject: string,
    description: string,
    uploadTokens: Array<{ token: string; filename: string; content_type: string }>,
    mapping: ReturnType<typeof getRedmineMapping>,
    projectId: string
  ): Record<string, unknown> {
    const priorityId = mapping.priority_mapping[classification.suggested_priority]
      ?? mapping.priority_mapping['normal']
      ?? 4;

    // Resolver ID numérico de usuario a partir del rol funcional
    const roleMap: Record<string, number> = (mapping as any).role_to_user_id ?? {};
    const assigneeRole = classification.suggested_assignee ?? mapping.redmine_defaults.default_assignee;
    const assigneeId = roleMap[assigneeRole]
      ?? (typeof mapping.redmine_defaults.default_assignee_id === 'number'
          ? mapping.redmine_defaults.default_assignee_id
          : null);

    // Normalizar solution_associated al valor corto del campo lista de Redmine
    const SOLUTION_NORMALIZE: Record<string, string> = {
      'Expertis / Movilsat ERP': 'expertis',
      'Movilsat': 'movilsat',
      'Portal OT': 'portal_ot',
      'Soluciones IA': 'solucionesia',
      'Planificador Inteligente': 'planificador',
      'App Fichajes / Gastos / Vacaciones': 'app_fichajes',
      'Sistemas': 'servidor',
      'Business Intelligence': 'otro',
      'Comercial': 'otro',
      'Resto': 'otro',
    };
    const solutionValue = SOLUTION_NORMALIZE[classification.solution_associated]
      ?? classification.solution_associated.toLowerCase().replace(/\s+/g, '_').slice(0, 30)
      ?? 'no_determinado';

    // Normalizar expertis_module al valor corto del campo lista de Redmine
    const MODULE_NORMALIZE: Record<string, string> = {
      'general': 'configuracion_general',
      'logistica': 'almacen',
      'comercial': 'ventas',
      'proyectos': 'presupuestos',
      'fabricacion': 'almacen',
      'calidad': 'configuracion_general',
      'rrhh': 'usuarios',
    };
    const rawModule = classification.expertis_module ?? 'no_aplica';
    const moduleValue = MODULE_NORMALIZE[rawModule] ?? rawModule;

    const customFields = [
      { id: 6,  value: '[0. Petición]' },
      { id: 16, value: '0' },
      { id: 17, value: '0' },
      { id: mapping.custom_fields.nature?.id ?? 21,              value: classification.classification.nature },
      { id: mapping.custom_fields.solution_associated?.id ?? 22, value: solutionValue },
      { id: mapping.custom_fields.expertis_module?.id ?? 23,     value: moduleValue },
      { id: mapping.custom_fields.block?.id ?? 24,               value: classification.redmine_mapping.block },
      { id: mapping.custom_fields.module?.id ?? 25,              value: classification.redmine_mapping.module },
      { id: mapping.custom_fields.need?.id ?? 26,                value: classification.redmine_mapping.need },
      { id: mapping.custom_fields.confidence?.id ?? 27,          value: classification.confidence },
      { id: mapping.custom_fields.review_status?.id ?? 28,       value: classification.review_status },
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

  private async postIssue(
    payload: Record<string, unknown>,
    redmineLogin: string | null
  ): Promise<RedmineTicketResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Redmine-API-Key': this.apiKey,
    };

    if (redmineLogin) {
      headers['X-Redmine-Switch-User'] = redmineLogin;
      console.log(`[Redmine] Impersonando usuario: ${redmineLogin}`);
    }

    const response = await fetch(`${this.baseUrl}/issues.json`, {
      method: 'POST',
      headers,
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
    console.log(`[Redmine SIMULADO] Ticket #${ticketId} creado: ${subject}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      ticket_id: ticketId,
      ticket_url: `https://redmine.cobertec.com/issues/${ticketId}`,
    };
  }
}

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
