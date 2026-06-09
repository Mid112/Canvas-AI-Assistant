import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.responses import JSONResponse

mcp = FastMCP("canvas-mcp")

@mcp.tool()
def fetch_courses(instructor_id: str) -> dict:
    """Fetch courses for an instructor — stub for now."""
    return {"courses": [], "instructor_id": instructor_id}

@mcp.custom_route("/health", methods=["GET"])
async def health(request):
    return JSONResponse({"status": "ok"})

# get the app directly without wrapping
app = mcp.streamable_http_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)