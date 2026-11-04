from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy.exc import IntegrityError

from database.database import SessionLocal
from database.models import User, UserRole
from .security import PasswordTooLongError, hash_password


def create_admin(email: str) -> int:
    email = email.strip().lower()
    if not email:
        print("Email is required.", file=sys.stderr)
        return 2
    password = getpass.getpass("Admin password (minimum 10 characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 2
    if not 10 <= len(password) <= 128:
        print("Password must contain between 10 and 128 characters.", file=sys.stderr)
        return 2
    try:
        password_hash = hash_password(password)
    except PasswordTooLongError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    with SessionLocal() as db:
        db.add(
            User(
                email=email,
                password_hash=password_hash,
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            print("An account with that email already exists.", file=sys.stderr)
            return 1
    print(f"Admin account created for {email}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m backend.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)
    admin_parser = subparsers.add_parser("create-admin")
    admin_parser.add_argument("--email", required=True)
    args = parser.parse_args()
    if args.command == "create-admin":
        return create_admin(args.email)
    parser.error("Unknown command.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
