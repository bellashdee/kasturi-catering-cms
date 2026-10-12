/**
 * Sends a notification email through Resend (https://resend.com) when RESEND_API_KEY is set on the server.
 * Without the key nothing is sent and the caller carries on: a missing or failing email must never stop a form from saving.
 */
export type EmailResult = { sent: boolean; reason?: string };

const RESEND_URL = "https://api.resend.com/emails";

export async function sendNotificationEmail(input: { to: string; subject: string; text: string; html: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY is not set" };

  const from = process.env.NOTIFY_EMAIL_FROM ?? "Central Management System <onboarding@resend.dev>";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `Email service answered ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Email could not be sent" };
  } finally {
    clearTimeout(timer);
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
