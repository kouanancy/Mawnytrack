import "server-only";
import { reportPeriod, reportSummary, type WeeklyReport } from "@/lib/report-model";

// Envoi d'e-mails via l'API HTTP de Resend (variable RESEND_API_KEY).
// Expéditeur provisoire onboarding@resend.dev, en attendant un domaine personnalisé (RESEND_FROM).
const FROM = process.env.RESEND_FROM || "Mawnytrack <onboarding@resend.dev>";

export type Attachment = { filename: string; content: string /* base64 */ };

/** Envoie un e-mail ; renvoie true si Resend l'a accepté. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; attachments?: Attachment[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[e-mail] RESEND_API_KEY absente : e-mail non envoyé.");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, ...msg }),
  });
  if (!res.ok) console.error(`[e-mail] Échec de l'envoi (${res.status}) : ${await res.text()}`);
  return res.ok;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * E-mail de réinitialisation du mot de passe. Les e-mails ne lisent pas les variables CSS :
 * les couleurs de la palette Forêt (valeurs claires) y sont donc écrites en ligne.
 */
export function resetPasswordEmail(url: string) {
  const origin = new URL(url).origin;
  const logo = `${origin}/icons/icon-192.png`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Réinitialisation du mot de passe</title></head>
<body style="margin:0;padding:0;background:#E9F0EC;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F2B25">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9F0EC;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:0 0 20px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${esc(logo)}" width="40" height="40" alt="" style="display:block;border-radius:10px"></td>
<td style="padding-left:10px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#0F2B25">Mawny<span style="color:#0B7A5C">track</span></td>
</tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #D5E0DA;border-radius:16px;padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;color:#0F2B25">Réinitialisation du mot de passe</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0F2B25">Une demande de réinitialisation du mot de passe a été reçue pour ce compte Mawnytrack. Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous.</p>
<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#0B7A5C;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Choisir un nouveau mot de passe</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#4F635B">Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#4F635B">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : le mot de passe actuel reste inchangé.</p>
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;color:#4F635B">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${esc(url)}" style="color:#0B7A5C;word-break:break-all">${esc(url)}</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Mawnytrack — Réinitialisation du mot de passe

Une demande de réinitialisation du mot de passe a été reçue pour ce compte Mawnytrack.
Pour choisir un nouveau mot de passe, ouvrez ce lien :
${url}

Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.
Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : le mot de passe actuel reste inchangé.`;
  return { subject: "Mawnytrack · Réinitialisation du mot de passe", html, text };
}

/** E-mail du rapport hebdomadaire : synthèse en quelques lignes et lien vers le rapport (PDF joint à part). */
export function reportEmail(r: WeeklyReport, url: string, origin: string) {
  const s = reportSummary(r);
  const rows = [...s.week, ...s.month, ...s.other];
  const logo = `${origin}/icons/icon-192.png`;
  const tr = ([a, b]: [string, string]) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #D5E0DA;font-size:14px;color:#4F635B">${esc(a)}</td>` +
    `<td style="padding:7px 0;border-bottom:1px solid #D5E0DA;font-size:14px;font-weight:700;color:#0F2B25;text-align:right;white-space:nowrap">${esc(b)} FCFA</td></tr>`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport de la semaine</title></head>
<body style="margin:0;padding:0;background:#E9F0EC;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F2B25">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9F0EC;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 20px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${esc(logo)}" width="40" height="40" alt="" style="display:block;border-radius:10px"></td>
<td style="padding-left:10px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#0F2B25">Mawny<span style="color:#0B7A5C">track</span></td>
</tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #D5E0DA;border-radius:16px;padding:24px">
<h1 style="margin:0 0 4px;font-size:20px;color:#0F2B25">Rapport de la semaine</h1>
<p style="margin:0 0 16px;font-size:14px;color:#4F635B">${esc(reportPeriod(r))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(tr).join("")}</table>
<p style="margin:20px 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#0B7A5C;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Ouvrir le rapport dans Mawnytrack</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#4F635B">Le rapport complet (budget, dépenses, prêts, emprunts, caisse et investissements) est joint en PDF.</p>
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;color:#4F635B">Cet envoi peut être désactivé dans Mawnytrack › Réglages › Notifications.</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `Mawnytrack — Rapport de la semaine
${reportPeriod(r)}

${rows.map(([a, b]) => `${a} : ${b} FCFA`).join("\n")}

Ouvrir le rapport dans Mawnytrack : ${url}
Le rapport complet est joint en PDF.
Cet envoi peut être désactivé dans Mawnytrack › Réglages › Notifications.`;
  return { html, text };
}
