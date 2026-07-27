"""Idempotently seed two Canvas student logins in the local sandbox.

Creates (or reuses) student1/student2 on lbjay/canvas-docker and enrolls
them as active students in the first course returned by the Canvas API
(or CANVAS_SEED_COURSE_ID when set).

  student1@example.edu / canvas-docker
  student2@example.edu / canvas-docker

Env overrides:
  E2E_CANVAS_URL, E2E_CANVAS_TOKEN
  CANVAS_STUDENT1_EMAIL, CANVAS_STUDENT1_PASSWORD, CANVAS_STUDENT1_NAME
  CANVAS_STUDENT2_EMAIL, CANVAS_STUDENT2_PASSWORD, CANVAS_STUDENT2_NAME
  CANVAS_SEED_COURSE_ID (optional; otherwise first teacher course)
  CANVAS_ACCOUNT_ID (default 1)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

CANVAS_URL = (os.environ.get("E2E_CANVAS_URL") or "http://localhost:3000").rstrip("/")
TOKEN = os.environ.get("E2E_CANVAS_TOKEN") or "canvas-docker"
ACCOUNT_ID = os.environ.get("CANVAS_ACCOUNT_ID") or "1"
COURSE_ID_OVERRIDE = (os.environ.get("CANVAS_SEED_COURSE_ID") or "").strip()

STUDENTS: tuple[tuple[str, str, str], ...] = (
    (
        os.environ.get("CANVAS_STUDENT1_EMAIL", "student1@example.edu"),
        os.environ.get("CANVAS_STUDENT1_PASSWORD", "canvas-docker"),
        os.environ.get("CANVAS_STUDENT1_NAME", "Student One"),
    ),
    (
        os.environ.get("CANVAS_STUDENT2_EMAIL", "student2@example.edu"),
        os.environ.get("CANVAS_STUDENT2_PASSWORD", "canvas-docker"),
        os.environ.get("CANVAS_STUDENT2_NAME", "Student Two"),
    ),
)


def _request(
    method: str,
    path: str,
    *,
    form: dict[str, str] | None = None,
    query: dict[str, str] | None = None,
) -> Any:
    url = f"{CANVAS_URL}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    data = None
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
    }
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(
            f"Canvas API {method} {path} failed: HTTP {exc.code}\n{detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Cannot reach Canvas at {CANVAS_URL} ({exc.reason}). "
            "Start it with: docker compose -f docker-compose.dev.yml up -d canvas-docker"
        ) from exc


def _resolve_course() -> tuple[str, str]:
    """Return (course_id, course_label) for enrollment."""
    if COURSE_ID_OVERRIDE:
        return COURSE_ID_OVERRIDE, f"course id {COURSE_ID_OVERRIDE} (override)"

    courses = _request("GET", "/api/v1/courses", query={"per_page": "50"})
    if not isinstance(courses, list) or not courses:
        raise SystemExit(
            "No Canvas courses found for this token. Create a course in the "
            "sandbox (as canvas@example.edu), then re-run make seed-canvas-students."
        )
    first = courses[0]
    course_id = str(first.get("id") or "")
    if not course_id:
        raise SystemExit(f"Unexpected courses response: {first!r}")
    name = first.get("name") or first.get("course_code") or "unnamed"
    return course_id, f"{name} (id={course_id})"


def _find_user_by_login(login_id: str) -> dict[str, Any] | None:
    users = _request(
        "GET",
        f"/api/v1/accounts/{ACCOUNT_ID}/users",
        query={"search_term": login_id, "per_page": "50"},
    )
    if not isinstance(users, list):
        return None
    for user in users:
        if str(user.get("login_id") or "").lower() == login_id.lower():
            return user
    return None


def _create_user(email: str, password: str, name: str) -> dict[str, Any]:
    created = _request(
        "POST",
        f"/api/v1/accounts/{ACCOUNT_ID}/users",
        form={
            "user[name]": name,
            "user[short_name]": name,
            "user[sortable_name]": name,
            "pseudonym[unique_id]": email,
            "pseudonym[password]": password,
            "pseudonym[send_confirmation]": "false",
            "communication_channel[type]": "email",
            "communication_channel[address]": email,
            "communication_channel[skip_confirmation]": "true",
        },
    )
    if not isinstance(created, dict) or "id" not in created:
        raise SystemExit(f"Unexpected create-user response for {email}: {created!r}")
    return created


def _ensure_student_enrollment(user_id: int, course_id: str) -> None:
    # lbjay/canvas-docker is an older Canvas API: avoid state[] filters
    # (they 404). Prefer course users listing, then fall back to enroll.
    students = _request(
        "GET",
        f"/api/v1/courses/{course_id}/users",
        query={"enrollment_type[]": "student", "per_page": "100"},
    )
    if isinstance(students, list) and any(int(u.get("id") or 0) == user_id for u in students):
        print(f"  already enrolled in course {course_id} as student")
        return

    enrollment = _request(
        "POST",
        f"/api/v1/courses/{course_id}/enrollments",
        form={
            "enrollment[user_id]": str(user_id),
            "enrollment[type]": "StudentEnrollment",
            "enrollment[enrollment_state]": "active",
            "enrollment[notify]": "false",
        },
    )
    state = (enrollment or {}).get("enrollment_state", "?")
    print(f"  enrolled in course {course_id} as student ({state})")


def ensure_students() -> None:
    self_user = _request("GET", "/api/v1/users/self")
    print(
        f"Canvas OK at {CANVAS_URL} "
        f"(token user id={(self_user or {}).get('id')})"
    )

    course_id, course_label = _resolve_course()
    print(f"Enrolling students in {course_label}")

    for email, password, name in STUDENTS:
        existing = _find_user_by_login(email)
        if existing is not None:
            user_id = int(existing["id"])
            print(f"Ensured Canvas login: {email} (id={user_id}, existing)")
        else:
            created = _create_user(email, password, name)
            user_id = int(created["id"])
            print(f"Ensured Canvas login: {email} (id={user_id}, created)")
        _ensure_student_enrollment(user_id, course_id)

    print("")
    print("Canvas student logins (password in parentheses):")
    for email, password, _name in STUDENTS:
        print(f"  {email}  ({password})")
    print(f"Enrolled as active students in {course_label}")


if __name__ == "__main__":
    ensure_students()
    sys.exit(0)
