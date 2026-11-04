from __future__ import annotations

import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode, urlsplit, urlunsplit

from .config import settings


def send_password_reset_email(email: str, token: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP host and sender email must be configured.")
    parsed_url = urlsplit(settings.password_reset_url)
    query = urlencode({"reset_token": token})
    reset_link = urlunsplit(
        (parsed_url.scheme, parsed_url.netloc, parsed_url.path, query, parsed_url.fragment)
    )
    message = EmailMessage()
    message["Subject"] = "Reset your EventLink password"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        "Use this link to reset your EventLink password. "
        f"It expires in {settings.password_reset_token_expire_minutes} minutes:\n\n"
        f"{reset_link}\n"
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)
