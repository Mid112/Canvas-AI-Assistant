import sys
from pathlib import Path
from dotenv import load_dotenv

backend_path = Path(__file__).parent.parent.parent / "app" / "backend"
sys.path.insert(0, str(backend_path))

# Load app/backend/.env so DATABASE_URL and other settings are correct
# regardless of which directory pytest is run from
load_dotenv(backend_path / ".env")
