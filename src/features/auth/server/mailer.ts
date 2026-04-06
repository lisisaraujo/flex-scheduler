import nodemailer from "nodemailer";
import { Invitation } from "@/features/auth/domain/types";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000")
  );
}

function invitationUrl(invitationId: string) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing APP_BASE_URL");
  }
  return `${baseUrl.replace(/\/$/, "")}/invite/${invitationId}`;
}

function createTransport() {
  const port = Number(requireEnv("SMTP_PORT"));
  return nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: {
      user: requireEnv("SMTP_USER"),
      pass: requireEnv("SMTP_PASS"),
    },
  });
}

export async function sendInvitationEmail(invitation: Invitation) {
  const transport = createTransport();
  const inviteLink = invitationUrl(invitation.invitationId);

  await transport.sendMail({
    from: requireEnv("SMTP_FROM"),
    to: invitation.email,
    subject: `Invitation to join ${invitation.companyName}`,
    text: [
      `You have been invited to join ${invitation.companyName} as a ${invitation.role}.`,
      "",
      `Accept your invitation here: ${inviteLink}`,
      "",
      `This invitation expires on ${new Date(invitation.expiresAt).toLocaleString()}.`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #171717;">
        <h2>Join ${invitation.companyName}</h2>
        <p>You have been invited to join <strong>${invitation.companyName}</strong> as a <strong>${invitation.role}</strong>.</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#18181b;color:#ffffff;text-decoration:none;">
            Accept invitation
          </a>
        </p>
        <p>If the button does not work, use this link:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
        <p>This invitation expires on ${new Date(invitation.expiresAt).toLocaleString()}.</p>
      </div>
    `,
  });

  return inviteLink;
}
