"""
Minimal Canvas API mock for local testing.
Run with: python canvas_mock.py
Listens on port 4000.
"""
from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/api/v1/courses")
def courses():
    return [
        {"id": 1, "name": "COSC 499", "course_code": "COSC499",
         "workflow_state": "available", "enrollment_term_id": 1},
        {"id": 2, "name": "COSC 310", "course_code": "COSC310",
         "workflow_state": "available", "enrollment_term_id": 1},
    ]

@app.get("/api/v1/courses/{course_id}/assignments")
def assignments(course_id: int):
    return [
        {"id": 101, "name": "Assignment 1", "due_at": "2026-07-01T23:59:00Z",
         "points_possible": 100.0, "description": "First assignment"},
        {"id": 102, "name": "Assignment 2", "due_at": "2026-07-15T23:59:00Z",
         "points_possible": 50.0, "description": None},
    ]

@app.get("/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions")
def submissions(course_id: int, assignment_id: int):
    return [
        {"id": 1001, "user_id": 201, "score": None, "grade": None,
         "submitted_at": None, "workflow_state": "unsubmitted",
         "late": False, "missing": True},
        {"id": 1002, "user_id": 202, "score": 85.0, "grade": "B",
         "submitted_at": "2026-06-30T20:00:00Z", "workflow_state": "submitted",
         "late": False, "missing": False},
        {"id": 1003, "user_id": 203, "score": None, "grade": None,
         "submitted_at": "2026-07-02T10:00:00Z", "workflow_state": "submitted",
         "late": True, "missing": False},
    ]

@app.post("/api/v1/courses/{course_id}/assignments")
def create_assignment(course_id: int):
    return {"id": 999, "name": "New Assignment", "published": False,
            "points_possible": 100.0, "due_at": None}

@app.post("/api/v1/conversations")
def send_message():
    return {"id": 1, "subject": "Reminder"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4000)