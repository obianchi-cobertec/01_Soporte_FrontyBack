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
}

// ─── Singleton ───────────────────────────────────────────

let mailerInstance: Mailer | null = null;

export function getMailer(): Mailer {
  if (!mailerInstance) {
    mailerInstance = new Mailer();
  }
  return mailerInstance;
}
