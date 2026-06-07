import nodemailer from "nodemailer";
import { Invitation } from "@/features/auth/domain/types";
import { ShiftSlotRef, ShiftSwapRequest } from "@/features/scheduler/domain/types";

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

function monthUrl(monthId: string) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing APP_BASE_URL");
  }
  return `${baseUrl.replace(/\/$/, "")}/m/${monthId}`;
}

function renderEmail(input: { heading: string; paragraphs: string[]; cta?: { label: string; href: string } }) {
  const paragraphsHtml = input.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n");
  const ctaHtml = input.cta
    ? `
        <p>
          <a href="${input.cta.href}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#18181b;color:#ffffff;text-decoration:none;">
            ${input.cta.label}
          </a>
        </p>
        <p>If the button does not work, use this link:</p>
        <p><a href="${input.cta.href}">${input.cta.href}</a></p>
      `
    : "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #171717;">
      <h2>${input.heading}</h2>
      ${paragraphsHtml}
      ${ctaHtml}
    </div>
  `;
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
    html: renderEmail({
      heading: `Join ${invitation.companyName}`,
      paragraphs: [
        `You have been invited to join <strong>${invitation.companyName}</strong> as a <strong>${invitation.role}</strong>.`,
        `This invitation expires on ${new Date(invitation.expiresAt).toLocaleString()}.`,
      ],
      cta: { label: "Accept invitation", href: inviteLink },
    }),
  });

  return inviteLink;
}

function shiftLabel(shift: ShiftSlotRef) {
  const kind = shift.shiftType === "night" ? "Night" : "Day";
  const date = new Date(`${shift.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return `${kind} shift on ${date}`;
}

export async function sendSwapRequestEmail(input: { swap: ShiftSwapRequest; requesteeEmail: string }) {
  const transport = createTransport();
  const link = monthUrl(input.swap.monthId);
  const offered = shiftLabel(input.swap.requesterShift);
  const wanted = shiftLabel(input.swap.requesteeShift);

  await transport.sendMail({
    from: requireEnv("SMTP_FROM"),
    to: input.requesteeEmail,
    subject: `${input.swap.requesterName} wants to swap shifts with you`,
    text: [
      `${input.swap.requesterName} would like to swap their ${offered} for your ${wanted}.`,
      "",
      `Review and respond here: ${link}`,
    ].join("\n"),
    html: renderEmail({
      heading: "New shift swap request",
      paragraphs: [
        `<strong>${input.swap.requesterName}</strong> would like to swap their <strong>${offered}</strong> for your <strong>${wanted}</strong>.`,
      ],
      cta: { label: "Review request", href: link },
    }),
  });

  return link;
}

export async function sendSwapResponseEmail(input: { swap: ShiftSwapRequest; requesterEmail: string; accepted: boolean }) {
  const transport = createTransport();
  const link = monthUrl(input.swap.monthId);
  const offered = shiftLabel(input.swap.requesterShift);
  const wanted = shiftLabel(input.swap.requesteeShift);
  const verb = input.accepted ? "accepted" : "declined";

  await transport.sendMail({
    from: requireEnv("SMTP_FROM"),
    to: input.requesterEmail,
    subject: `${input.swap.requesteeName} ${verb} your shift swap request`,
    text: [
      `${input.swap.requesteeName} has ${verb} your request to swap your ${offered} for their ${wanted}.`,
      "",
      `View the schedule here: ${link}`,
    ].join("\n"),
    html: renderEmail({
      heading: input.accepted ? "Your swap request was accepted" : "Your swap request was declined",
      paragraphs: [
        `<strong>${input.swap.requesteeName}</strong> has ${verb} your request to swap your <strong>${offered}</strong> for their <strong>${wanted}</strong>.`,
      ],
      cta: { label: "View schedule", href: link },
    }),
  });

  return link;
}
