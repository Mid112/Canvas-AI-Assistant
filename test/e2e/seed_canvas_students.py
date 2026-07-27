"""Idempotently seed two Canvas student logins in the local sandbox.

Creates (or reuses) student1/student2 on lbjay/canvas-docker, ensures a
dedicated seed course exists, enrolls both students only in that course,
and removes their StudentEnrollment rows from any other courses.

  student1@example.edu / canvas-docker
  student2@example.edu / canvas-docker

Default seed course: course_code "COSC 499" ("Capstone Project").

Env overrides:
  E2E_CANVAS_URL, E2E_CANVAS_TOKEN
  CANVAS_STUDENT1_EMAIL, CANVAS_STUDENT1_PASSWORD, CANVAS_STUDENT1_NAME
  CANVAS_STUDENT2_EMAIL, CANVAS_STUDENT2_PASSWORD, CANVAS_STUDENT2_NAME
  CANVAS_SEED_COURSE_CODE (default COSC 499)
  CANVAS_SEED_COURSE_NAME (default Capstone Project)
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
SEED_COURSE_CODE = os.environ.get("CANVAS_SEED_COURSE_CODE") or "COSC 499"
SEED_COURSE_NAME = os.environ.get("CANVAS_SEED_COURSE_NAME") or "Capstone Project"
# Older local sandboxes used SEED-STU; reuse and rename those.
_LEGACY_SEED_COURSE_CODES = ("SEED-STU",)

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


def _find_seed_course() -> dict[str, Any] | None:
    courses = _request(
        "GET",
        f"/api/v1/accounts/{ACCOUNT_ID}/courses",
        query={"per_page": "100"},
    )
    if not isinstance(courses, list):
        return None

    by_code: dict[str, list[dict[str, Any]]] = {}
    for course in courses:
        code = str(course.get("course_code") or "")
        by_code.setdefault(code, []).append(course)

    for code in (SEED_COURSE_CODE, *_LEGACY_SEED_COURSE_CODES):
        matches = by_code.get(code) or []
        if not matches:
            continue
        # Prefer the course that already has people when duplicates exist.
        ranked = sorted(
            matches,
            key=lambda c: (
                0 if str(c.get("workflow_state") or "") == "available" else 1,
                int(c.get("id") or 0),
            ),
        )
        return ranked[0]
    return None


def _sync_seed_course_identity(course: dict[str, Any]) -> dict[str, Any]:
    course_id = str(course["id"])
    current_name = str(course.get("name") or "")
    current_code = str(course.get("course_code") or "")
    if current_name == SEED_COURSE_NAME and current_code == SEED_COURSE_CODE:
        return course

    updated = _request(
        "PUT",
        f"/api/v1/courses/{course_id}",
        form={
            "course[name]": SEED_COURSE_NAME,
            "course[course_code]": SEED_COURSE_CODE,
        },
    )
    if isinstance(updated, dict) and updated.get("id") is not None:
        print(
            f"  renamed seed course to {SEED_COURSE_NAME!r} "
            f"(code={SEED_COURSE_CODE!r})"
        )
        return updated
    course = dict(course)
    course["name"] = SEED_COURSE_NAME
    course["course_code"] = SEED_COURSE_CODE
    return course


def _ensure_teacher_enrollment(course_id: str, teacher_user_id: int) -> None:
    enrollments = _request(
        "GET",
        f"/api/v1/courses/{course_id}/enrollments",
        query={"per_page": "100"},
    )
    if isinstance(enrollments, list) and any(
        int(e.get("user_id") or 0) == teacher_user_id
        and e.get("type") == "TeacherEnrollment"
        and str(e.get("enrollment_state") or "") != "deleted"
        for e in enrollments
    ):
        print(f"  teacher already enrolled in seed course {course_id}")
        return

    enrollment = _request(
        "POST",
        f"/api/v1/courses/{course_id}/enrollments",
        form={
            "enrollment[user_id]": str(teacher_user_id),
            "enrollment[type]": "TeacherEnrollment",
            "enrollment[enrollment_state]": "active",
            "enrollment[notify]": "false",
        },
    )
    state = (enrollment or {}).get("enrollment_state", "?")
    print(f"  enrolled teacher in seed course {course_id} ({state})")


def _ensure_seed_course(teacher_user_id: int) -> tuple[str, str]:
    existing = _find_seed_course()
    if existing is not None:
        existing = _sync_seed_course_identity(existing)
        course_id = str(existing["id"])
        name = existing.get("name") or SEED_COURSE_NAME
        print(
            f"Ensured seed course: {name} "
            f"(id={course_id}, code={SEED_COURSE_CODE}, existing)"
        )
        _ensure_teacher_enrollment(course_id, teacher_user_id)
        return course_id, f"{name} (id={course_id}, code={SEED_COURSE_CODE})"

    created = _request(
        "POST",
        f"/api/v1/accounts/{ACCOUNT_ID}/courses",
        form={
            "course[name]": SEED_COURSE_NAME,
            "course[course_code]": SEED_COURSE_CODE,
            "enroll_me": "true",
            "offer": "true",
        },
    )
    if not isinstance(created, dict) or "id" not in created:
        raise SystemExit(f"Unexpected create-course response: {created!r}")
    course_id = str(created["id"])
    name = created.get("name") or SEED_COURSE_NAME
    print(
        f"Ensured seed course: {name} "
        f"(id={course_id}, code={SEED_COURSE_CODE}, created)"
    )
    # enroll_me should add the token user; still ensure in case the
    # older canvas-docker build skips it.
    _ensure_teacher_enrollment(course_id, teacher_user_id)
    return course_id, f"{name} (id={course_id}, code={SEED_COURSE_CODE})"


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
        print(f"  already enrolled in seed course {course_id} as student")
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
    print(f"  enrolled in seed course {course_id} as student ({state})")


def _remove_other_student_enrollments(user_id: int, keep_course_id: str) -> None:
    enrollments = _request(
        "GET",
        f"/api/v1/users/{user_id}/enrollments",
        query={"per_page": "100"},
    )
    if not isinstance(enrollments, list):
        return
    for enrollment in enrollments:
        if enrollment.get("type") != "StudentEnrollment":
            continue
        if str(enrollment.get("enrollment_state") or "") == "deleted":
            continue
        course_id = str(enrollment.get("course_id") or "")
        if course_id == keep_course_id:
            continue
        enrollment_id = enrollment.get("id")
        if enrollment_id is None:
            continue
        _request(
            "DELETE",
            f"/api/v1/courses/{course_id}/enrollments/{enrollment_id}",
            form={"task": "delete"},
        )
        print(f"  removed StudentEnrollment from course {course_id}")


def ensure_students() -> None:
    self_user = _request("GET", "/api/v1/users/self")
    teacher_user_id = int((self_user or {}).get("id") or 0)
    if teacher_user_id <= 0:
        raise SystemExit("Could not resolve Canvas token user id from /users/self")
    print(f"Canvas OK at {CANVAS_URL} (token user id={teacher_user_id})")

    course_id, course_label = _ensure_seed_course(teacher_user_id)

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
        _remove_other_student_enrollments(user_id, course_id)

    print("")
    print("Canvas student logins (password in parentheses):")
    for email, password, _name in STUDENTS:
        print(f"  {email}  ({password})")
    print(f"Enrolled only in seed course: {course_label}")


if __name__ == "__main__":
    ensure_students()
    sys.exit(0)
