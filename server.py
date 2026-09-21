import logging
import socket
from pathlib import Path
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("crunchyroll_relay")

app = FastAPI(title="Crunchyroll Remote Relay")


def get_local_ip() -> str:
    """Retrieve the host machine's LAN IP address for easy mobile access."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


class ConnectionManager:
    """Manages active WebSocket connections and relays messages."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        client_info = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        logger.info(f"Client connected: {client_info} (Active connections: {len(self.active_connections)})")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        client_info = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        logger.info(f"Client disconnected: {client_info} (Active connections: {len(self.active_connections)})")

    async def broadcast(self, message: str, sender: WebSocket):
        """Relays a message from one client to all other connected clients."""
        stale_connections = set()
        for connection in self.active_connections:
            if connection != sender:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.warning(f"Error sending message to client: {e}")
                    stale_connections.add(connection)

        for stale in stale_connections:
            self.disconnect(stale)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Relayed command: {data}")
            await manager.broadcast(data, sender=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
        manager.disconnect(websocket)


# Ensure static directory exists to prevent mount errors
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Mount static files for the mobile web remote at the root
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    local_ip = get_local_ip()
    port = 8000
    print("\n" + "=" * 60)
    print(" 🚀 Crunchyroll Controller Server Running")
    print(f" • PC Local URL:   http://localhost:{port}")
    print(f" • Mobile LAN URL: http://{local_ip}:{port}")
    print(f" • WebSocket:      ws://localhost:{port}/ws")
    print("=" * 60 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=port)
