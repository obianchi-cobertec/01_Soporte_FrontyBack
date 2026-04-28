/**
 * Email Service — nodemailer
 *
 * Configurado por variables de entorno:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (default false),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Si SMTP_HOST no está configurado, los envíos son no-op (modo dev/test).
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ─── Config ─────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? '"Cobertec Soporte" <soporte@cobertec.com>';

// ─── Transporter (singleton lazy) ───────────────────────

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function send(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(`[Email] SMTP no configurado — email no enviado a ${options.to}: "${options.subject}"`);
    return;
  }
  await t.sendMail({ from: SMTP_FROM, ...options });
}

// ─── Templates ──────────────────────────────────────────

/**
 * Email de recuperación de contraseña con enlace de reset (válido 1 hora).
 */
export async function sendPasswordRecovery(
  email: string,
  name: string,
  resetUrl: string,
): Promise<void> {
  const subject = 'Recuperación de contraseña — Cobertec Soporte';

  const text = `
Hola ${name},

Has solicitado restablecer tu contraseña en el sistema de soporte de Cobertec.

Usa el siguiente enlace para crear una nueva contraseña (válido durante 1 hora):

${resetUrl}

Si no has solicitado este cambio, ignora este mensaje. Tu contraseña actual no se ha modificado.

Cobertec Soporte
`.trim();

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">Cobertec Soporte</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <h2 style="margin-top:0">Recuperación de contraseña</h2>
    <p>Hola <strong>${name}</strong>,</p>
    <p>Has solicitado restablecer tu contraseña. El enlace es válido durante <strong>1 hora</strong>:</p>
    <div style="text-align:center;margin:30px 0">
      <a href="${resetUrl}" style="background:#1a56db;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
        Restablecer contraseña
      </a>
    </div>
    <p style="color:#6b7280;font-size:14px">Si el botón no funciona, copia este enlace:</p>
    <p style="color:#6b7280;font-size:13px;word-break:break-all">${resetUrl}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="color:#6b7280;font-size:13px">Si no has solicitado este cambio, puedes ignorar este mensaje.</p>
  </div>
</body>
</html>`;

  await send({ to: email, subject, text, html });
}

/**
 * Email de bienvenida a nuevo usuario con contraseña temporal.
 * Se pedirá cambio de contraseña en el primer acceso.
 */
export async function sendWelcome(
  email: string,
  name: string,
  tempPassword: string,
  loginUrl: string,
): Promise<void> {
  const subject = 'Bienvenido/a al sistema de soporte de Cobertec';

  const text = `
Hola ${name},

Tu cuenta de acceso al sistema de soporte de Cobertec ha sido creada.

Datos de acceso:
  Email: ${email}
  Contraseña temporal: ${tempPassword}

Accede aquí: ${loginUrl}

Al entrar por primera vez se te pedirá que establezcas una nueva contraseña.

Cobertec Soporte
`.trim();

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">Cobertec Soporte</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <h2 style="margin-top:0">Bienvenido/a al portal de soporte</h2>
    <p>Hola <strong>${name}</strong>,</p>
    <p>Tu cuenta de acceso al sistema de soporte técnico de Cobertec ha sido creada:</p>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin:20px 0">
      <p style="margin:0 0 8px 0"><strong>Email:</strong> ${email}</p>
      <p style="margin:0"><strong>Contraseña temporal:</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${tempPassword}</code></p>
    </div>
    <div style="text-align:center;margin:30px 0">
      <a href="${loginUrl}" style="background:#1a56db;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
        Acceder al portal
      </a>
    </div>
    <p style="color:#6b7280;font-size:14px">Al acceder por primera vez se te pedirá que establezcas una nueva contraseña.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="color:#6b7280;font-size:13px">Si tienes algún problema, contacta con el equipo de Cobertec.</p>
  </div>
</body>
</html>`;

  await send({ to: email, subject, text, html });
}

/**
 * Notificación al admin cuando llega una solicitud de alta pendiente de aprobación.
 */
export async function sendAdminSignupNotification(
  adminEmail: string,
  newUserName: string,
  newUserEmail: string,
  adminPanelUrl: string,
): Promise<void> {
  const subject = `Nueva solicitud de alta — ${newUserName}`;

  const text = `
Nueva solicitud de acceso al sistema de soporte de Cobertec.

Solicitante: ${newUserName}
Email: ${newUserEmail}

Revisa la solicitud en el panel de administración:
${adminPanelUrl}

Cobertec Soporte (notificación automática)
`.trim();

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">Cobertec Soporte</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <h2 style="margin-top:0">Nueva solicitud de alta</h2>
    <p>Se ha recibido una solicitud de acceso al portal de soporte:</p>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin:20px 0">
      <p style="margin:0 0 8px 0"><strong>Nombre:</strong> ${newUserName}</p>
      <p style="margin:0"><strong>Email:</strong> ${newUserEmail}</p>
    </div>
    <div style="text-align:center;margin:30px 0">
      <a href="${adminPanelUrl}" style="background:#1a56db;color:white;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
        Gestionar solicitud
      </a>
    </div>
    <p style="color:#6b7280;font-size:13px">Notificación automática del sistema de soporte de Cobertec.</p>
  </div>
</body>
</html>`;

  await send({ to: adminEmail, subject, text, html });
}
