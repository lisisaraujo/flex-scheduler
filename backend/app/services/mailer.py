from __future__ import annotations
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings


def _render_email(heading: str, paragraphs: list[str], cta_label: str | None = None, cta_href: str | None = None) -> str:
    paras_html = "".join(f"<p>{p}</p>" for p in paragraphs)
    cta_html = ""
    if cta_label and cta_href:
        cta_html = (
            f'<p><a href="{cta_href}" style="display:inline-block;padding:12px 20px;border-radius:999px;'
            f'background:#18181b;color:#ffffff;text-decoration:none;">{cta_label}</a></p>'
            f'<p>If the button does not work, use this link:</p><p><a href="{cta_href}">{cta_href}</a></p>'
        )
    return (
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;">'
        f"<h2>{heading}</h2>{paras_html}{cta_html}</div>"
    )


def _invitation_url(invitation_id: str) -> str:
    base = get_settings().app_base_url.rstrip("/")
    return f"{base}/invite/{invitation_id}"


def _month_url(month_id: str) -> str:
    base = get_settings().app_base_url.rstrip("/")
    return f"{base}/m/{month_id}"


def _shift_label(date: str, shift_type: str) -> str:
    from datetime import date as dt
    d = dt.fromisoformat(date)
    kind = "Night" if shift_type == "night" else "Day"
    formatted = d.strftime("%A, %B %-d")
    return f"{kind} shift on {formatted}"


def _send_sync(to: str, subject: str, text: str, html: str) -> None:
    settings = get_settings()
    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_pass, settings.smtp_from]):
        return  # email not configured — skip silently

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    if settings.smtp_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
            server.login(settings.smtp_user, settings.smtp_pass)
            server.send_message(msg)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_pass)
            server.send_message(msg)


async def _send(to: str, subject: str, text: str, html: str) -> None:
    await asyncio.to_thread(_send_sync, to, subject, text, html)


async def send_invitation_email(
    invitation_id: str,
    email: str,
    team_name: str,
    role: str,
    expires_at_ms: int,
) -> str:
    from datetime import datetime, timezone
    link = _invitation_url(invitation_id)
    expires = datetime.fromtimestamp(expires_at_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    await _send(
        to=email,
        subject=f"Invitation to join {team_name}",
        text="\n".join([
            f"You have been invited to join {team_name} as a {role}.",
            "",
            f"Accept your invitation here: {link}",
            "",
            f"This invitation expires on {expires}.",
        ]),
        html=_render_email(
            heading=f"Join {team_name}",
            paragraphs=[
                f"You have been invited to join <strong>{team_name}</strong> as a <strong>{role}</strong>.",
                f"This invitation expires on {expires}.",
            ],
            cta_label="Accept invitation",
            cta_href=link,
        ),
    )
    return link


async def send_swap_request_email(
    swap_id: str,
    month_id: str,
    requester_name: str,
    requestee_email: str,
    requester_shift_date: str,
    requester_shift_type: str,
    requestee_shift_date: str,
    requestee_shift_type: str,
) -> None:
    link = _month_url(month_id)
    offered = _shift_label(requester_shift_date, requester_shift_type)
    wanted = _shift_label(requestee_shift_date, requestee_shift_type)
    await _send(
        to=requestee_email,
        subject=f"{requester_name} wants to swap shifts with you",
        text="\n".join([
            f"{requester_name} would like to swap their {offered} for your {wanted}.",
            "",
            f"Review and respond here: {link}",
        ]),
        html=_render_email(
            heading="New shift swap request",
            paragraphs=[
                f"<strong>{requester_name}</strong> would like to swap their <strong>{offered}</strong> for your <strong>{wanted}</strong>.",
            ],
            cta_label="Review request",
            cta_href=link,
        ),
    )


async def send_swap_response_email(
    month_id: str,
    requestee_name: str,
    requester_email: str,
    accepted: bool,
    requester_shift_date: str,
    requester_shift_type: str,
    requestee_shift_date: str,
    requestee_shift_type: str,
) -> None:
    link = _month_url(month_id)
    offered = _shift_label(requester_shift_date, requester_shift_type)
    wanted = _shift_label(requestee_shift_date, requestee_shift_type)
    verb = "accepted" if accepted else "declined"
    heading = "Your swap request was accepted" if accepted else "Your swap request was declined"
    await _send(
        to=requester_email,
        subject=f"{requestee_name} {verb} your shift swap request",
        text="\n".join([
            f"{requestee_name} has {verb} your request to swap your {offered} for their {wanted}.",
            "",
            f"View the schedule here: {link}",
        ]),
        html=_render_email(
            heading=heading,
            paragraphs=[
                f"<strong>{requestee_name}</strong> has {verb} your request to swap your <strong>{offered}</strong> for their <strong>{wanted}</strong>.",
            ],
            cta_label="View schedule",
            cta_href=link,
        ),
    )
