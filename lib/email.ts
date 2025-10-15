// lib/email.ts
import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_NAME = "Inventory",
} = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
  // Log once on boot; handlers will also guard and return 500 with a helpful message
  console.warn(
    "[email] SMTP env not fully set; verification emails will fail."
  );
}

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: String(SMTP_SECURE || "false").toLowerCase() === "true",
  auth:
    SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

export async function sendVerificationEmail(opts: {
  to: string;
  subject: string;
  code: string;
  purpose: "signup" | "reset";
  expiresInSec: number;
}) {
  const { to, subject, code, purpose, expiresInSec } = opts;
  const app = process.env.APP_NAME || APP_NAME || "Inventory";
  const url = process.env.APP_URL || "";

  const text = `Your ${app} ${
    purpose === "signup" ? "sign-up" : "password reset"
  } code is ${code}.\n\nThis code expires in ${expiresInSec} seconds.${
    url ? `\n\nOpen: ${url}` : ""
  }`;
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6">
<h2>${app}</h2>
<p>Your <strong>${
    purpose === "signup" ? "sign-up" : "password reset"
  }</strong> verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
<p>This code expires in <strong>${expiresInSec} seconds</strong>.</p>
${
  url
    ? `<p><a href="${url}" target="_blank" rel="noreferrer noopener">Open ${app}</a></p>`
    : ""
}
<p style="color:#666">If you didn't request this, you can ignore this email.</p>
</div>
`;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_FROM) {
    throw new Error("SMTP env not configured: SMTP_HOST/SMTP_PORT/SMTP_FROM");
  }

  await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
}
