import { APP_NAME } from "./config";

export type EmailResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Send invite email via Resend when configured.
 * Returns sent:false with a reason if email is not configured — callers should
 * still expose the invite link so admins can copy/paste it.
 */
export async function sendInviteEmail(opts: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  videoTitles: string[];
  recipientName?: string | null;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      sent: false,
      reason:
        "Email not configured (set RESEND_API_KEY and EMAIL_FROM). Copy the invite link instead.",
    };
  }

  const greeting = opts.recipientName?.trim()
    ? `Hi ${opts.recipientName.trim()},`
    : "Hello,";
  const list =
    opts.videoTitles.length > 0
      ? opts.videoTitles.map((t) => `• ${t}`).join("\n")
      : "• (videos selected by the research team)";

  const text = `${greeting}

${opts.inviterName} invited you to narrate surgical videos in ${APP_NAME}.

Videos assigned to you:
${list}

No account signup needed. Open this link to access only those videos and record:
${opts.inviteUrl}

If you were not expecting this email, you can ignore it.
`;

  const html = `
    <p>${greeting}</p>
    <p><strong>${escapeHtml(opts.inviterName)}</strong> invited you to narrate surgical videos in <strong>${escapeHtml(APP_NAME)}</strong>.</p>
    <p>Videos assigned to you:</p>
    <ul>${opts.videoTitles.map((t) => `<li>${escapeHtml(t)}</li>`).join("") || "<li>(selected by the research team)</li>"}</ul>
    <p><strong>No account signup needed.</strong> <a href="${escapeHtml(opts.inviteUrl)}">Open your videos</a></p>
    <p style="color:#666;font-size:13px;">Or paste this link: ${escapeHtml(opts.inviteUrl)}</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: `Invitation to narrate videos — ${APP_NAME}`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend failed:", res.status, body);
    return {
      sent: false,
      reason: `Email provider error (${res.status}). Copy the invite link instead.`,
    };
  }

  return { sent: true, provider: "resend" };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
