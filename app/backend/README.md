# Backend - FastAPI

FastAPI project setup, configuration, CORS, and router scaffolding.

## Structure

```
backend/
|-- app/
|   |-- __init__.py
|   |-- main.py            # app entry point, CORS, router wiring, /health
|   |-- config.py          # typed settings via pydantic-settings
|   |-- core/              # shared app logic 
|   |-- routers/
|   |   |-- auth.py        # placeholder (issue #49)
|   |   |-- canvas.py      # placeholder (issue #56)
|   |-- models/            # DB models (later milestone)
|   |-- schemas/           # Pydantic schemas (later milestone)
|   |-- services/          # business logic (later milestone)
|   |-- integrations/      # external API clients (later milestone)
|-- .env.example
|-- .gitignore
|-- requirements.txt
```

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload
```

- API root: http://localhost:8000/
- Health check: http://localhost:8000/health
- Interactive docs: http://localhost:8000/docs

