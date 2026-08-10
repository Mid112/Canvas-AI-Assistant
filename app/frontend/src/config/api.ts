// In dev, always use the Vite proxy so API calls work on any port without CORS
// or .env changes. Production builds use VITE_API_BASE_URL from the environment.
export const API_BASE_URL =
  import.meta.env.MODE === "development"
    ? "/api/v1"
    : (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1");

export const AUTH_TOKEN_KEY = "access_token";
