/**
 * test-mailer.ts — Script de prueba de configuración SMTP
 *
 * Envía un email de prueba a o.bianchi@cobertec.com usando la configuración
 * SMTP del .env para verificar que el servidor de correo responde correctamente.
 *
 * Uso: cd backend && npx tsx scripts/test-mailer.ts
 */

import 'dotenv/config';
import { Mailer } from '../src/services/mailer/mailer-index.js';
import nodemailer from 'nodemailer';

const TO = 'o.bianchi@cobertec.com';

// Accede al transporter interno de Mailer para enviar un email arbitrario de prueba
const mailer = new Mailer();
const transporter = (mailer as unknown as { transporter: nodemailer.Transporter }).transporter;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_FROM = process.env.SMTP_FROM ?? 'Cobertec SAT <sat@cobertec.com>';

if (!SMTP_HOST) {
  console.error('❌  SMTP_HOST no configurado en .env — no se puede enviar email de prueba.');
  process.exit(1);
}

console.log(`📧  Enviando email de prueba...`);
console.log(`    Host:    ${SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`);
console.log(`    Usuario: ${SMTP_USER ?? '(sin autenticación)'}`);
console.log(`    De:      ${SMTP_FROM}`);
console.log(`    Para:    ${TO}`);
console.log('');

try {
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: TO,
    subject: 'Test SMTP Cobertec Intake',
    text: 'Si recibes este email, el SMTP está configurado correctamente.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #1a56db;">Test SMTP Cobertec Intake</h2>
        <p>Si recibes este email, el SMTP está configurado correctamente.</p>
        <p style="color: #6b7280; font-size: 12px;">Enviado desde el script <code>backend/scripts/test-mailer.ts</code></p>
      </div>
    `,
  });

  console.log('✅  Email enviado correctamente.');
  console.log(`    Message-ID: ${info.messageId}`);
  if (info.accepted?.length) {
    console.log(`    Aceptado por: ${info.accepted.join(', ')}`);
  }
  if (info.rejected?.length) {
    console.warn(`    Rechazado para: ${info.rejected.join(', ')}`);
  }
} catch (err) {
  console.error('❌  Error al enviar el email:');
  console.error(err);
  process.exit(1);
}
