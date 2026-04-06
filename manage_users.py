#!/usr/bin/env python3
"""Interactive user management CLI for LoraMap."""

from app import app
from models import db, User


def prompt(text):
    try:
        return input(text).strip()
    except (EOFError, KeyboardInterrupt):
        print("\nAborted.")
        return None


def required_prompt(text):
    """Keep asking until the user types a non-empty value. Returns None on Ctrl+C."""
    while True:
        value = prompt(text)
        if value is None:
            return None
        if value:
            return value
        print("  This field is required.")


def list_users():
    users = User.query.order_by(User.id).all()
    if not users:
        print("\n  No users found.")
        return
    print()
    for u in users:
        status = "active" if u.activated else "pending"
        full_name = " ".join(filter(None, [u.name, u.surname])) or "—"
        print(f"  [{u.id}] {u.username}  ({status})")
        print(f"       Name    : {full_name}")
        print(f"       Email   : {u.email}")
        print(f"       Phone   : {u.phone or '—'}")
        print(f"       Address : {u.address or '—'}")
        print(f"       State   : {u.state or '—'}")
        print(f"       Joined  : {u.created_at.strftime('%Y-%m-%d %H:%M') if u.created_at else '—'}")
        print()


def toggle_users():
    users = User.query.order_by(User.id).all()
    if not users:
        print("\n  No users found.")
        return

    list_users()
    changed = 0
    for u in users:
        status = "active" if u.activated else "pending"
        action = "deactivate" if u.activated else "activate"
        answer = prompt(f"  {u.username} ({status}) — {action}? [y/N] ")
        if answer is None:
            return
        if answer.lower() == 'y':
            u.activated = 0 if u.activated else 1
            new_status = "active" if u.activated else "pending"
            print(f"    → {u.username} set to {new_status}")
            changed += 1

    if changed:
        db.session.commit()
        print(f"\n  {changed} user(s) updated.")
    else:
        print("  No changes made.")


def add_user():
    print()
    username = required_prompt("  Username       : ")
    if username is None:
        return
    email = required_prompt("  Email          : ")
    if email is None:
        return
    password = required_prompt("  Password       : ")
    if password is None:
        return
    name    = prompt("  First name     : ") or None
    surname = prompt("  Last name      : ") or None
    phone   = prompt("  Phone number   : ") or None
    address = prompt("  Address        : ") or None
    state   = prompt("  State/Country  : ") or None
    activate = prompt("  Activate now?  [y/N] ")
    if activate is None:
        return

    if User.query.filter_by(username=username).first():
        print(f"  Error: username '{username}' is already taken.")
        return
    if User.query.filter_by(email=email).first():
        print(f"  Error: email '{email}' is already registered.")
        return

    user = User(
        username=username,
        email=email,
        activated=1 if activate.lower() == 'y' else 0,
        name=name,
        surname=surname,
        phone=phone,
        address=address,
        state=state,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    status = "active" if user.activated else "pending"
    print(f"\n  User '{username}' created ({status}).")


def main():
    with app.app_context():
        while True:
            print("\n  LoraMap — User Management")
            print("  1. List users")
            print("  2. Enable / disable users")
            print("  3. Add new user")
            print("  0. Exit")
            choice = prompt("\n  Choice: ")
            if choice is None or choice == '0':
                break
            elif choice == '1':
                list_users()
            elif choice == '2':
                toggle_users()
            elif choice == '3':
                add_user()
            else:
                print("  Invalid choice.")


if __name__ == '__main__':
    main()
