/**
 * Mailer Service — Cobertec Intake
 *
 * Envío de emails transaccionales vía SMTP (nodemailer).
 * Configuración por env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 *
 * Plantillas implementadas:
 *   - sendAdminNewRequestNotification: notifica a los admins de una nueva solicitud de alta
 *   - sendWelcomeEmail: envía al usuario su contraseña temporal tras aprobación
 *   - sendRejectionEmail: notifica al usuario que su solicitud fue rechazada
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ─── Config ─────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST ?? 'mail.cobertec.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const SMTP_FROM = process.env.SMTP_FROM ?? 'Cobertec SAT <sat@cobertec.com>';
const APP_URL = process.env.APP_URL ?? 'https://intake.cobertec.com';

// ─── Types ───────────────────────────────────────────────

interface AdminNotificationPayload {
  to: string[];
  request: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    company_name: string;
    phone: string | null;
    created_at: string;
  };
}

interface WelcomeEmailPayload {
  to: string;
  first_name: string;
  login: string;
  temp_password: string;
  company_name: string;
}

interface RejectionEmailPayload {
  to: string;
  first_name: string;
  reason: string;
  company_name: string;
}

interface ReviewerNotificationPayload {
  to: string;
  reviewer_name: string;
  review_token: string;
  redmine_ticket_url: string;
  company_name: string;
  intake_description: string;
  nature: string;
  domain: string;
  suggested_assignee: string;
}

interface BrunoAlertBasePayload {
  to: string;
  name: string;
  review: {
    id: string;
    redmine_ticket_id: number;
    redmine_ticket_url: string;
    company_name: string;
    reassignment_count?: number;
  };
}

interface BrunoOutOfSyncPayload {
  to: string;
  name: string;
  review: {
    id: string;
    redmine_ticket_id: number;
    redmine_ticket_url: string;
    company_name: string;
  };
}

interface BrunoExpiryDigestPayload {
  to: string;
  name: string;
  expired_reviews: Array<{
    id: string;
    redmine_ticket_id: number;
    redmine_ticket_url: string;
    company_name: string;
  }>;
}

interface PasswordResetEmailPayload {
  to: string;
  first_name: string;
  reset_link: string;
}

// ─── Mailer class ────────────────────────────────────────

export class Mailer {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  async sendAdminNewRequestNotification(payload: AdminNotificationPayload): Promise<void> {
    const { to, request } = payload;
    const date = new Date(request.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: to.join(', '),
      subject: `[Cobertec SAT] Nueva solicitud de alta — ${request.first_name} ${request.last_name} (${request.company_name})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a56db;">Nueva solicitud de alta de usuario</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; font-weight: bold; width: 140px;">Nombre</td><td style="padding: 8px;">${request.first_name} ${request.last_name}</td></tr>
            <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${request.email}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Empresa</td><td style="padding: 8px;">${request.company_name}</td></tr>
            <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold;">Teléfono</td><td style="padding: 8px;">${request.phone ?? '—'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Fecha</td><td style="padding: 8px;">${date}</td></tr>
          </table>
          <p style="margin-top: 24px;">
            <a href="${APP_URL}" style="background: #1a56db; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">
              Gestionar solicitud en el panel admin
            </a>
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">ID de solicitud: ${request.id}</p>
        </div>
      `,
      text: `Nueva solicitud de alta:\n\nNombre: ${request.first_name} ${request.last_name}\nEmail: ${request.email}\nEmpresa: ${request.company_name}\nTeléfono: ${request.phone ?? '—'}\nFecha: ${date}\n\nGestiona la solicitud en: ${APP_URL}`,
    });
  }

  async sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
    const { to, first_name, login, temp_password, company_name } = payload;

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Bienvenido al sistema de soporte de Cobertec',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a56db;">Tu acceso al sistema de soporte está listo</h2>
          <p>Hola ${first_name},</p>
          <p>Tu solicitud de acceso al sistema de soporte técnico de Cobertec para <strong>${company_name}</strong> ha sido aprobada.</p>
          <p>Estos son tus datos de acceso:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr style="background: #f9fafb;"><td style="padding: 12px; font-weight: bold; width: 160px;">Usuario</td><td style="padding: 12px; font-family: monospace;">${login}</td></tr>
            <tr><td style="padding: 12px; font-weight: bold;">Contraseña temporal</td><td style="padding: 12px; font-family: monospace; font-size: 18px;">${temp_password}</td></tr>
          </table>
          <p style="color: #dc2626; font-weight: bold;">⚠️ Deberás cambiar tu contraseña en el primer acceso.</p>
          <p style="margin-top: 24px;">
            <a href="${APP_URL}" style="background: #1a56db; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">
              Acceder al sistema
            </a>
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Si no solicitaste este acceso, puedes ignorar este email o contactar con soporte@cobertec.com.
          </p>
        </div>
      `,
      text: `Hola ${first_name},\n\nTu solicitud de acceso ha sido aprobada.\n\nUsuario: ${login}\nContraseña temporal: ${temp_password}\n\nDeberás cambiar tu contraseña en el primer acceso.\n\nAccede en: ${APP_URL}`,
    });
  }

  async sendRejectionEmail(payload: RejectionEmailPayload): Promise<void> {
    const { to, first_name, reason, company_name } = payload;

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Solicitud de acceso a Cobertec SAT — Estado de tu solicitud',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #374151;">Sobre tu solicitud de acceso</h2>
          <p>Hola ${first_name},</p>
          <p>Hemos revisado tu solicitud de acceso al sistema de soporte técnico de Cobertec para <strong>${company_name}</strong>.</p>
          <p>En este momento no podemos aprobar tu solicitud por el siguiente motivo:</p>
          <blockquote style="border-left: 4px solid #e5e7eb; padding: 12px 16px; margin: 16px 0; color: #374151; background: #f9fafb;">
            ${reason}
          </blockquote>
          <p>Si crees que hay un error o tienes dudas, puedes contactar con nosotros en <a href="mailto:soporte@cobertec.com">soporte@cobertec.com</a>.</p>
        </div>
      `,
      text: `Hola ${first_name},\n\nHemos revisado tu solicitud de acceso para ${company_name}.\n\nNo podemos aprobar tu solicitud por el siguiente motivo:\n\n${reason}\n\nSi tienes dudas, contacta con soporte@cobertec.com.`,
    });
  }

  async sendReviewerNotification(payload: ReviewerNotificationPayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendReviewerNotification:', {
        to: payload.to,
        subject: `[Cobertec SAT] Nueva incidencia asignada a tu revisión — ${payload.company_name}`,
      });
      return;
    }

    const descTrunc = payload.intake_description.length > 300
      ? payload.intake_description.slice(0, 300) + '…'
      : payload.intake_description;

    const approveUrl = `${APP_URL}/review?t=${encodeURIComponent(payload.review_token)}&action=approve`;
    const reviewUrl = `${APP_URL}/review?t=${encodeURIComponent(payload.review_token)}`;

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: `[Cobertec SAT] Nueva incidencia asignada a tu revisión — ${payload.company_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a56db;">Nueva incidencia asignada a tu revisión</h2>
          <p>Hola ${payload.reviewer_name},</p>
          <p>Se ha creado una nueva incidencia que ha sido clasificada y asignada a tu área de responsabilidad.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr style="background: #f9fafb;"><td style="padding: 10px; font-weight: bold; width: 160px;">Empresa</td><td style="padding: 10px;">${payload.company_name}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Área</td><td style="padding: 10px;">${payload.domain}</td></tr>
            <tr style="background: #f9fafb;"><td style="padding: 10px; font-weight: bold;">Naturaleza</td><td style="padding: 10px;">${payload.nature}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold;">Rol asignado</td><td style="padding: 10px;">${payload.suggested_assignee}</td></tr>
          </table>
          <p style="font-weight: bold;">Descripción:</p>
          <blockquote style="border-left: 4px solid #e5e7eb; padding: 12px 16px; margin: 8px 0; color: #374151; background: #f9fafb; font-size: 14px;">
            ${descTrunc.replace(/\n/g, '<br>')}
          </blockquote>
          <p style="margin-top: 24px;">
            <a href="${approveUrl}" style="background: #16a34a; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin-right: 10px;">
              Aceptar asignación
            </a>
            <a href="${reviewUrl}" style="background: #6b7280; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">
              Revisar / Reasignar
            </a>
          </p>
          <p style="margin-top: 16px;">
            <a href="${payload.redmine_ticket_url}" style="color: #1a56db;">Ver ticket en Redmine →</a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Este enlace es válido por 7 días. Si ya no eres el responsable de esta área, usa el botón "Revisar / Reasignar".
          </p>
        </div>
      `,
      text: `Hola ${payload.reviewer_name},\n\nNueva incidencia asignada:\nEmpresa: ${payload.company_name}\nÁrea: ${payload.domain}\nDescripción: ${descTrunc}\n\nAceptar: ${approveUrl}\nReasignar: ${reviewUrl}\nTicket Redmine: ${payload.redmine_ticket_url}`,
    });
  }

  async sendBrunoEscalationAlert(payload: BrunoAlertBasePayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendBrunoEscalationAlert:', { to: payload.to });
      return;
    }
    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: `[Cobertec SAT] Alerta: ${payload.review.reassignment_count ?? '?'} reasignaciones en ticket #${payload.review.redmine_ticket_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #d97706;">Alerta de múltiples reasignaciones</h2>
          <p>Hola ${payload.name},</p>
          <p>El ticket <strong>#${payload.review.redmine_ticket_id}</strong> (${payload.review.company_name}) ha acumulado <strong>${payload.review.reassignment_count ?? '?'} reasignaciones</strong>.</p>
          <p>Puede que haya un problema de clasificación o de asignación de área.</p>
          <p><a href="${payload.review.redmine_ticket_url}" style="color: #1a56db;">Ver ticket en Redmine →</a></p>
          <p style="color: #9ca3af; font-size: 12px;">ID revisión: ${payload.review.id}</p>
        </div>
      `,
      text: `Hola ${payload.name},\n\nAlerta: ${payload.review.reassignment_count ?? '?'} reasignaciones en ticket #${payload.review.redmine_ticket_id} (${payload.review.company_name}).\n\nTicket: ${payload.review.redmine_ticket_url}`,
    });
  }

  async sendBrunoEscalatedTicketAlert(payload: BrunoAlertBasePayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendBrunoEscalatedTicketAlert:', { to: payload.to });
      return;
    }
    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: `[Cobertec SAT] Ticket escalado — #${payload.review.redmine_ticket_id} requiere tu intervención`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #dc2626;">Ticket escalado — Requiere intervención manual</h2>
          <p>Hola ${payload.name},</p>
          <p>El ticket <strong>#${payload.review.redmine_ticket_id}</strong> (${payload.review.company_name}) ha sido escalado tras ${payload.review.reassignment_count ?? '?'} reasignaciones sin resolución.</p>
          <p>Por favor, revisa el ticket y asigna manualmente al técnico correcto.</p>
          <p><a href="${payload.review.redmine_ticket_url}" style="background: #dc2626; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">Ver ticket escalado →</a></p>
          <p style="color: #9ca3af; font-size: 12px;">ID revisión: ${payload.review.id}</p>
        </div>
      `,
      text: `Hola ${payload.name},\n\nTicket escalado: #${payload.review.redmine_ticket_id} (${payload.review.company_name}) tras ${payload.review.reassignment_count ?? '?'} reasignaciones.\n\nRequiere tu intervención: ${payload.review.redmine_ticket_url}`,
    });
  }

  async sendBrunoOutOfSyncAlert(payload: BrunoOutOfSyncPayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendBrunoOutOfSyncAlert:', { to: payload.to });
      return;
    }
    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: `[Cobertec SAT] Ticket desincronizado — #${payload.review.redmine_ticket_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #7c3aed;">Ticket desincronizado con Redmine</h2>
          <p>Hola ${payload.name},</p>
          <p>El ticket <strong>#${payload.review.redmine_ticket_id}</strong> (${payload.review.company_name}) fue reasignado manualmente en Redmine sin pasar por el flujo de revisión automático.</p>
          <p>El sistema ha detectado que el asignado en Redmine no coincide con el registrado en el sistema de revisión.</p>
          <p><a href="${payload.review.redmine_ticket_url}" style="color: #1a56db;">Ver ticket en Redmine →</a></p>
          <p style="color: #9ca3af; font-size: 12px;">ID revisión: ${payload.review.id}</p>
        </div>
      `,
      text: `Hola ${payload.name},\n\nTicket desincronizado: #${payload.review.redmine_ticket_id} (${payload.review.company_name}) fue reasignado directamente en Redmine.\n\nTicket: ${payload.review.redmine_ticket_url}`,
    });
  }

  async sendBrunoExpiryDigest(payload: BrunoExpiryDigestPayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendBrunoExpiryDigest:', {
        to: payload.to,
        count: payload.expired_reviews.length,
      });
      return;
    }
    const ticketList = payload.expired_reviews
      .map(r => `<li><a href="${r.redmine_ticket_url}">#${r.redmine_ticket_id}</a> — ${r.company_name}</li>`)
      .join('');
    const ticketListText = payload.expired_reviews
      .map(r => `  - #${r.redmine_ticket_id} (${r.company_name}): ${r.redmine_ticket_url}`)
      .join('\n');

    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: `[Cobertec SAT] ${payload.expired_reviews.length} revisión(es) expirada(s) sin revisar`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #374151;">Revisiones expiradas sin confirmar</h2>
          <p>Hola ${payload.name},</p>
          <p>Los siguientes tickets han superado el periodo de revisión de 7 días sin que el técnico asignado confirmara o reasignara la asignación:</p>
          <ul style="margin: 16px 0;">${ticketList}</ul>
          <p>Por favor, revisa estos tickets en Redmine y asegúrate de que están correctamente asignados.</p>
          <p style="color: #9ca3af; font-size: 12px;">Este es un resumen automático del sistema de revisión de Cobertec SAT.</p>
        </div>
      `,
      text: `Hola ${payload.name},\n\n${payload.expired_reviews.length} revisión(es) expirada(s) sin confirmar:\n\n${ticketListText}\n\nPor favor revisa estos tickets en Redmine.`,
    });
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
      console.log('[Mailer] SMTP no configurado — email simulado sendPasswordResetEmail:', {
        to: payload.to,
        reset_link: payload.reset_link,
      });
      return;
    }
    await this.transporter.sendMail({
      from: SMTP_FROM,
      to: payload.to,
      subject: 'Recuperación de contraseña — Cobertec SAT',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a56db;">Recupera tu contraseña</h2>
          <p>Hola ${payload.first_name},</p>
          <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si no fuiste tú, ignora este mensaje.</p>
          <p style="margin-top: 24px;">
            <a href="${payload.reset_link}" style="background: #1a56db; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none;">
              Restablecer contraseña
            </a>
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
            Este enlace es válido durante 1 hora. Si no solicitaste el cambio, puedes ignorar este email.
          </p>
        </div>
      `,
      text: `Hola ${payload.first_name},\n\nRestablece tu contraseña en: ${payload.reset_link}\n\nEste enlace es válido durante 1 hora.`,
    });
  }
}

// ─── Singleton ───────────────────────────────────────────

let mailerInstance: Mailer | null = null;

export function getMailer(): Mailer {
  if (!mailerInstance) {
    mailerInstance = new Mailer();
  }
  return mailerInstance;
}
