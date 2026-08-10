# Backend - FastAPI

FastAPI backend for the Canvas Helper AI Assistant. Provides authentication (register, login, JWT) and a PostgreSQL database layer. Future milestones will add Canvas API integration and AI features.

## Structure

```
backend/
|-- app/
|   |-- __init__.py
|   |-- main.py            # app entry point, CORS, router wiring, /health
|   |-- config.py          # typed settings via pydantic-settings
|   |-- dependencies.py    # shared dependencies (get_current_user)
|   |-- core/
|   |   |-- database.py    # async SQLAlchemy engine and session
|   |   |-- security.py    # password hashing and JWT utilities
|   |-- routers/
|   |   |-- auth.py        # register, login, /me endpoints
|   |   |-- canvas.py      # placeholder (issue #56)
|   |-- models/
|   |   |-- user.py        # User ORM model
|   |-- schemas/
|   |   |-- auth.py        # request/response Pydantic schemas
|   |-- services/
|   |   |-- auth.py        # register and login business logic
|   |-- integrations/      # external API clients (later milestone)
|-- .env.example
|-- .gitignore
|-- requirements.txt
```

## Setup

```bash
cd app/backend
cp .env.example .env             # Windows: copy .env.example .env
```

Start the database:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Run the server:

```bash
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | App status |
| GET | `/health` | Health check |
| POST | `/api/v1/auth/register` | Register and receive JWT |
| POST | `/api/v1/auth/login` | Login and receive JWT |
| GET | `/api/v1/auth/me` | Get current user (requires Bearer token) |

- Interactive docs: http://localhost:8000/docs
