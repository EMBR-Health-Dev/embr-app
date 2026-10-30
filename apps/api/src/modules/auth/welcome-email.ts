import type { Locale } from "../../lib/locale.js";

/**
 * The one-time welcome email, sent when an account's email address is
 * verified for the first time (see auth.service.ts). Fixed copy only:
 * renderWelcomeEmail takes a language and a link, nothing about the
 * person, so it cannot carry anything from her record. An inbox is not
 * a private place (same rule as the weekly reminder).
 *
 * The French and Japanese copy follows the terms the apps already use
 * (tableau de bord, BRIEF, 周閉経期, 医療者); a native speaker should
 * still review it before launch, like every other translated string.
 */
interface WelcomeCopy {
  subject: string;
  preheader: string;
  headline: string;
  paragraphs: string[];
  cta: string;
  motto: string;
  signature: string;
  footer: string;
}

const WELCOME_COPY: Record<Locale, WelcomeCopy> = {
  en: {
    subject: "Welcome to EMBR. Your health deserves to be understood.",
    preheader: "Start with how you feel today.",
    headline: "Your health deserves to be understood.",
    paragraphs: [
      "Welcome to EMBR.",
      "Navigating perimenopause and menopause can be confusing. Symptoms change, patterns can be difficult to identify, and communicating what you are experiencing during a short medical appointment is not always easy.",
      "EMBR helps you build a structured record of your experience, understand patterns over time, and prepare a clear clinical brief for conversations with your healthcare professional.",
      "You can start by recording how you feel today. Over time, your entries will help you build a clearer picture of your experience.",
    ],
    cta: "Open your EMBR dashboard",
    motto: "Your health. Your data. Your voice.",
    signature: "The EMBR Team",
    footer:
      "You are receiving this email because you created an EMBR account. EMBR never includes your health information in emails.",
  },
  fr: {
    subject: "Bienvenue sur EMBR. Votre santé mérite d’être comprise.",
    preheader: "Commencez par noter comment vous vous sentez aujourd’hui.",
    headline: "Votre santé mérite d’être comprise.",
    paragraphs: [
      "Bienvenue sur EMBR.",
      "La périménopause et la ménopause peuvent être déroutantes. Les symptômes évoluent, les tendances sont parfois difficiles à repérer, et il n’est pas toujours facile d’exprimer ce que vous vivez au cours d’une consultation médicale souvent brève.",
      "EMBR vous aide à tenir un suivi structuré de votre expérience, à en comprendre l’évolution au fil du temps et à préparer un BRIEF clinique clair pour vos échanges avec votre professionnel de santé.",
      "Vous pouvez commencer par noter comment vous vous sentez aujourd’hui. Au fil du temps, vos saisies vous permettront de dessiner une image plus claire de votre expérience.",
    ],
    cta: "Ouvrir votre tableau de bord EMBR",
    motto: "Votre santé. Vos données. Votre voix.",
    signature: "L’équipe EMBR",
    footer:
      "Vous recevez cet e-mail parce que vous avez créé un compte EMBR. EMBR n’inclut jamais vos informations de santé dans ses e-mails.",
  },
  ja: {
    subject: "EMBRへようこそ。あなたの健康は、きちんと理解されるべきものです。",
    preheader: "まずは、今日の体調を記録することから。",
    headline: "あなたの健康は、きちんと理解されるべきものです。",
    paragraphs: [
      "EMBRへようこそ。",
      "周閉経期や更年期は、戸惑うことの多い時期です。症状は移り変わり、その傾向はつかみにくく、限られた診察時間の中でご自身の状態を伝えるのは、決して簡単ではありません。",
      "EMBRは、ご自身の経験を整理して記録し、時間の経過とともに傾向を把握し、医療者との対話に役立つわかりやすいBRIEFを準備するお手伝いをします。",
      "まずは、今日の体調を記録することから始めてみてください。記録を重ねるにつれて、ご自身の経験がより明確に見えてきます。",
    ],
    cta: "EMBRのダッシュボードを開く",
    motto: "あなたの健康。あなたのデータ。あなたの声。",
    signature: "EMBRチーム",
    footer:
      "このメールは、EMBRのアカウントを作成された方にお送りしています。EMBRがメールに健康情報を含めることはありません。",
  },
};

// EMBR Brand Guidelines v1.0, the same values as apps/web's globals.css
// palette. Email clients ignore CSS variables, so they are inlined.
const COLOR = {
  graphite900: "#2A1F39",
  graphite500: "#746B82",
  graphite100: "#F1EEF4",
  lilac100: "#F1EAF5",
  lilac700: "#7A588A",
  pearl50: "#FAF7FB",
  white: "#FFFFFF",
};

// The apps self-host Instrument Serif and Inter; email clients cannot
// load them reliably, so these stacks fall back to system faces.
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Hiragino Sans', 'Yu Gothic', Meiryo, sans-serif";

// The same punctuation the other plain text emails use before a link.
const LABEL_SEPARATOR: Record<Locale, string> = { en: ": ", fr: " : ", ja: "：" };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderWelcomeEmail(locale: Locale, dashboardUrl: string): RenderedEmail {
  const copy = WELCOME_COPY[locale];
  const href = escapeHtml(dashboardUrl);

  const paragraphs = copy.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:26px;color:${COLOR.graphite900};">${escapeHtml(p)}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(copy.subject)}</title>
<style>
  @media (max-width: 600px) {
    .embr-card { padding: 32px 24px !important; }
    .embr-headline { font-size: 30px !important; line-height: 36px !important; }
    .embr-cta a { display: block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.pearl50};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.pearl50};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 8px 24px;font-family:${SERIF};font-size:24px;letter-spacing:6px;color:${COLOR.lilac700};">EMBR</td>
        </tr>
        <tr>
          <td class="embr-card" style="background-color:${COLOR.white};border:1px solid ${COLOR.graphite100};border-radius:16px;padding:48px 44px;">
            <h1 class="embr-headline" style="margin:0 0 28px;font-family:${SERIF};font-weight:400;font-size:36px;line-height:42px;color:${COLOR.graphite900};">${escapeHtml(copy.headline)}</h1>
            ${paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="embr-cta" style="margin:30px 0 34px;">
              <tr>
                <td style="border-radius:999px;background-color:${COLOR.lilac700};">
                  <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:600;line-height:20px;color:${COLOR.white};text-decoration:none;border-radius:999px;text-align:center;">${escapeHtml(copy.cta)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-family:${SERIF};font-style:italic;font-size:20px;line-height:28px;color:${COLOR.lilac700};">${escapeHtml(copy.motto)}</p>
            <p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${COLOR.graphite900};">${escapeHtml(copy.signature)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;font-family:${SANS};font-size:12px;line-height:19px;color:${COLOR.graphite500};">${escapeHtml(copy.footer)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    copy.headline,
    "",
    ...copy.paragraphs.flatMap((p) => [p, ""]),
    `${copy.cta}${LABEL_SEPARATOR[locale]}${dashboardUrl}`,
    "",
    copy.motto,
    copy.signature,
    "",
    "--",
    copy.footer,
  ].join("\n");

  return { subject: copy.subject, html, text };
}
