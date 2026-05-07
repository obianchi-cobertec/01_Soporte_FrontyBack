import { getRedmineMapping } from '../../config/loader.js';
import { composeSubject, composeDescription } from './ticket-composer.js';
import { getIdentityStore } from '../identity/store.js';
import { logEvent } from '../events/index.js';
import { lookupCobertecUser } from './identity-validator.js';
import type {
  ClassificationResponse,
  IntakePayload,
  Attachment,
  BillableInfo,
  BillingAcceptance,
} from '../../types.js';

// ─── Tipos exportados ────────────────────────────────────────────────────────

export interface ResolvedAssignee {
  role: string;
  redmine_user_id: number;
  email: string;
  name: string;
}

/**
 * Resuelve el assignee a partir de una clave de rol funcional.
 * Busca primero en identity.db (getUserByRedmineUserId), luego en cobertec-users.json.
 * Devuelve null si no se puede resolver.
 */
export function resolveAssigneeFromRole(roleKey: string): ResolvedAssignee | null {
  const mapping = getRedmineMapping();
  const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};

  const redmineUserId = roleMap[roleKey];
  if (!redmineUserId) return null;

  const store = getIdentityStore();
  const identityUser = store.getUserByRedmineUserId(redmineUserId);
  if (identityUser) {
    return {
      role: roleKey,
      redmine_user_id: redmineUserId,
      email: identityUser.email,
      name: identityUser.name,
    };
  }

  // Fallback a cobertec-users.json
  const cobertecUser = lookupCobertecUser(redmineUserId);
  if (cobertecUser) {
    return {
      role: roleKey,
      redmine_user_id: redmineUserId,
      email: cobertecUser.email,
      name: cobertecUser.name,
    };
  }

  return null;
}

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
    classification: ClassificationResponse,
    clarification?: { question: string; answer: string },
    billable?: BillableInfo | null,
    billingAcceptance?: BillingAcceptance | null
  ): Promise<RedmineTicketResult> {
    const mapping = getRedmineMapping();
    const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};

    // Determinar si el caso es inasignable:
    // CONDICIÓN: suggested_assignee no resuelve en role_to_user_id
    //            AND (domain === 'dominio_no_claro' OR nature === 'ambiguo')
    const suggestedAssignee = classification.suggested_assignee;
    const resolvedAssigneeId = suggestedAssignee ? roleMap[suggestedAssignee] : undefined;
    const isUnresolvable = !resolvedAssigneeId;
    const isAmbiguousDomain =
      classification.classification.domain === 'dominio_no_claro' ||
      classification.classification.nature === 'ambiguo';
    const isUnassignable = isUnresolvable && isAmbiguousDomain;

    if (isUnassignable) {
      const fallbackId = mapping.redmine_defaults.unassignable_fallback_assignee_id ?? null;
      logEvent('unassignable_fallback_applied', intake.session_id, {
        suggested_assignee: suggestedAssignee,
        domain: classification.classification.domain,
        nature: classification.classification.nature,
        fallback_id: fallbackId,
      });
      if (fallbackId !== null) {
        console.log(`[Redmine] Caso inasignable — usando fallback assignee ID: ${fallbackId}`);
      } else {
        console.warn('[Redmine] Caso inasignable y unassignable_fallback_assignee_id no configurado — ticket sin asignar');
      }
    }

    const uploadTokens = await this.uploadAttachments(intake.attachments);
    const subject = composeSubject(classification, isUnassignable);
    const description = composeDescription(intake, classification, clarification, billable, billingAcceptance);

    // Resolver login de Redmine del usuario para impersonation
    const store = getIdentityStore();
    const redmineLogin = store.getRedmineLogin(intake.user_id) ?? null;

    // Resolver proyecto Redmine real del cliente
    const projectId = mapping.company_to_project[intake.company_id]
      ?? mapping.company_to_project['_default']
      ?? 'cobertec-intake-test';

    const payload = this.buildIssuePayload(
      intake, classification, subject, description, uploadTokens, mapping, projectId,
      isUnassignable ? (mapping.redmine_defaults.unassignable_fallback_assignee_id ?? null) : undefined,
      billable,
      billingAcceptance
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
    projectId: string,
    fallbackAssigneeId?: number | null,
    billable?: BillableInfo | null,
    billingAcceptance?: BillingAcceptance | null
  ): Record<string, unknown> {
    const priorityId = mapping.priority_mapping[classification.suggested_priority]
      ?? mapping.priority_mapping['normal']
      ?? 4;

    // Resolver ID numérico de usuario a partir del rol funcional
    const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};
    const assigneeRoleKey = classification.suggested_assignee ?? mapping.redmine_defaults.default_assignee;

    let assigneeId: number | null;
    if (fallbackAssigneeId !== undefined) {
      // Caso inasignable → usar fallback (puede ser null si no configurado)
      assigneeId = fallbackAssigneeId ?? null;
    } else {
      assigneeId = (assigneeRoleKey != null ? roleMap[assigneeRoleKey] : undefined)
        ?? (typeof mapping.redmine_defaults.default_assignee_id === 'number'
            ? mapping.redmine_defaults.default_assignee_id
            : null);
    }

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
      'Academia Cobertec': 'otro',
      'Comercial': 'otro',
      'Resto': 'otro',
    };
    const solutionValue = SOLUTION_NORMALIZE[classification.solution_associated]
      ?? classification.solution_associated.toLowerCase().replace(/\s+/g, '_').slice(0, 30)
      ?? 'no_determinado';

    // Normalizar expertis_module al valor corto del campo lista de Redmine
    // Valores aceptados por el campo IA_Modulo_Expertis (id:23) en Redmine:
    // compras, ventas, almacen, gmao, financiero, crm, presupuestos, tarifas, informes, usuarios, configuracion_general, no_aplica
    const MODULE_NORMALIZE: Record<string, string> = {
      'general': 'configuracion_general',
      'logistica': 'almacen',
      'comercial': 'ventas',
      'proyectos': 'presupuestos',
      'fabricacion': 'almacen',
      'calidad': 'configuracion_general',
      'rrhh': 'usuarios',
      'no_claro': 'no_aplica',  // fallback y clasificaciones ambiguas
    };
    const VALID_MODULES = new Set([
      'compras', 'ventas', 'almacen', 'gmao', 'financiero', 'crm',
      'presupuestos', 'tarifas', 'informes', 'usuarios', 'configuracion_general', 'no_aplica',
    ]);
    const rawModule = classification.expertis_module ?? 'no_aplica';
    const mappedModule = MODULE_NORMALIZE[rawModule] ?? rawModule;
    const moduleValue = VALID_MODULES.has(mappedModule) ? mappedModule : 'no_aplica';

    const customFields = [
      // Campo 6 "Clase" omitido intencionalmente: Redmine lo auto-rellena con su valor default
      // ("[0. Petición]"). Enviarlo explícitamente causa error 500 por validación del lado Redmine.
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

    if (billable?.is_billable && billingAcceptance?.accepted && mapping.custom_fields.ia_aceptacion_coste != null) {
      customFields.push({ id: mapping.custom_fields.ia_aceptacion_coste.id, value: '1' });
    }

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

  async updateIssueAssignee(ticketId: number, assigneeId: number, projectIdentifier?: string): Promise<void> {
    const url = `${this.baseUrl}/issues/${ticketId}.json`;
    const payload = { issue: { assigned_to_id: assigneeId } };
    console.log(`[Redmine] updateIssueAssignee → PUT ${url}`, JSON.stringify(payload));

    const doput = () => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Redmine-API-Key': this.apiKey },
      body: JSON.stringify(payload),
    });

    const response = await doput();

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Redmine] updateIssueAssignee FAILED: status=${response.status} url=${url} body=${errorBody}`);

      // 422 "Asignado a no es válido" → el usuario no es miembro del proyecto.
      // Si tenemos el identificador del proyecto, añadirlo y reintentar una vez.
      if (response.status === 422 && projectIdentifier) {
        console.log(`[Redmine] Intentando añadir usuario ${assigneeId} al proyecto "${projectIdentifier}" y reintentando...`);
        await this.ensureMembership(projectIdentifier, assigneeId);

        const retryResponse = await doput();
        if (!retryResponse.ok) {
          const retryBody = await retryResponse.text();
          console.error(`[Redmine] updateIssueAssignee retry FAILED: status=${retryResponse.status} body=${retryBody}`);
          throw new Error(`Redmine PUT ${ticketId} → ${retryResponse.status}: ${retryBody}`);
        }
        console.log(`[Redmine] updateIssueAssignee OK tras añadir membresía (ticket=${ticketId})`);
        return;
      }

      throw new Error(`Redmine PUT ${ticketId} → ${response.status}: ${errorBody}`);
    }
  }

  /** Añade el usuario como miembro del proyecto si no lo está ya. Best-effort: no lanza. */
  private async ensureMembership(projectIdentifier: string, userId: number): Promise<void> {
    const mapping = getRedmineMapping();
    const roleId = mapping.redmine_defaults.support_role_id ?? 4;
    const url = `${this.baseUrl}/projects/${projectIdentifier}/memberships.json`;
    const body = JSON.stringify({ membership: { user_id: userId, role_ids: [roleId] } });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Redmine-API-Key': this.apiKey },
        body,
      });
      if (res.ok || res.status === 422) {
        // 422 aquí = ya es miembro (Redmine devuelve "User is already a member")
        console.log(`[Redmine] ensureMembership usuario=${userId} proyecto=${projectIdentifier} → ${res.status}`);
      } else {
        const errBody = await res.text();
        console.warn(`[Redmine] ensureMembership WARN: ${res.status} ${errBody}`);
      }
    } catch (err) {
      console.warn('[Redmine] ensureMembership error (ignorado):', err);
    }
  }

  async addPrivateNote(ticketId: number, note: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/issues/${ticketId}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Redmine-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        issue: {
          notes: note,
          private_notes: true,
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Redmine API error al añadir nota en ticket ${ticketId}: ${response.status} ${errorBody}`);
    }
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
  async updateIssueAssignee(ticketId: number, assigneeId: number, projectIdentifier?: string): Promise<void> {
    console.log(`[Redmine Sim] updateIssueAssignee ticket=${ticketId} assignee=${assigneeId} project=${projectIdentifier ?? 'n/a'}`);
  }

  async addPrivateNote(ticketId: number, note: string): Promise<void> {
    console.log(`[Redmine Sim] addPrivateNote ticket=${ticketId}:`, note.slice(0, 100));
  }

  async createTicket(
    intake: IntakePayload,
    classification: ClassificationResponse,
    clarification?: { question: string; answer: string },
    billable?: BillableInfo | null,
    billingAcceptance?: BillingAcceptance | null
  ): Promise<RedmineTicketResult> {
    const mapping = getRedmineMapping();
    const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};
    // Misma condición que RedmineClient: solo suggested_assignee (sin fallback a default_assignee)
    const suggestedAssignee = classification.suggested_assignee;
    const resolvedAssigneeId = suggestedAssignee ? roleMap[suggestedAssignee] : undefined;
    const isUnassignable =
      !resolvedAssigneeId &&
      (classification.classification.domain === 'dominio_no_claro' ||
       classification.classification.nature === 'ambiguo');

    const subject = composeSubject(classification, isUnassignable);
    const description = composeDescription(intake, classification, clarification, billable, billingAcceptance);
    simulatedTicketCounter++;
    const ticketId = String(simulatedTicketCounter);
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`[Redmine Sim] Ticket simulado #${ticketId}: ${subject}`);
    if (description.includes('## Aclaración del usuario')) {
      console.log('[Redmine Sim] Ticket incluye aclaración del usuario');
    }
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
