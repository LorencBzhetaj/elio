import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { maskEmail } from '../../lib/crypto';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Non-production transport: no real email is sent. Each message is written to .data/mail/*.html
 * (/tmp on Vercel, the only writable place) and the sign-in link is printed to the log so it can be used.
 */
export function createConsoleTransport(dir = process.env.VERCEL ? path.join(os.tmpdir(), 'mail') : '.data/mail'): EmailTransport {
  return {
    async send(m) {
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 7)}.html`);
      await fs.writeFile(file, `<!-- To: ${m.to} | Subject: ${m.subject} -->\n${m.html}`, 'utf8');
      console.info(`[email] to=${maskEmail(m.to)} subject="${m.subject}" saved=${file}`);
      // Console transport = no real email (local dev or a staging preview): print the link so it can be
      // used from the terminal / Vercel logs. Production must use SMTP (enforced by config validation).
      if (process.env.APP_ENV !== 'production') {
        const link = /https?:\/\/\S+\/access\/redeem\?token=[\w-]+/.exec(m.text)?.[0];
        if (link) console.info(`[email] DEV sign-in link (single use, expires soon): ${link}`);
      }
    },
  };
}

/** Generic SMTP transport (works with most transactional email vendors). */
export async function createSmtpTransport(smtpUrl: string, from: string): Promise<EmailTransport> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport(smtpUrl);
  return {
    async send(m) {
      await transporter.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    },
  };
}

/** In-memory transport for tests; can be told to fail. */
export function createMemoryTransport(): EmailTransport & { sent: EmailMessage[]; failNext: number } {
  const t = {
    sent: [] as EmailMessage[],
    failNext: 0,
    async send(m: EmailMessage) {
      if (t.failNext > 0) {
        t.failNext--;
        throw new Error('simulated email outage');
      }
      t.sent.push(m);
    },
  };
  return t;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderEmail(opts: { brand: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; footer: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#faf5eb;font-family:Arial,sans-serif;color:#29221f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fffdf8;border-radius:16px;padding:32px">
<tr><td>
<p style="font-family:Georgia,serif;font-size:20px;color:#7a1830;margin:0 0 24px">${esc(opts.brand)}</p>
<h1 style="font-family:Georgia,serif;font-size:26px;color:#5e1124;margin:0 0 16px">${esc(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(p)}</p>`).join('\n')}
${opts.action ? `<p style="margin:24px 0"><a href="${esc(opts.action.url)}" style="background:#7a1830;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;display:inline-block;font-weight:bold">${esc(opts.action.label)}</a></p>` : ''}
<p style="font-size:13px;color:#70675d;margin:24px 0 0">${esc(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [opts.brand, '', opts.heading, '', ...opts.paragraphs, '', opts.action ? `${opts.action.label}: ${opts.action.url}` : '', '', opts.footer].join('\n');
  return { html, text };
}
