from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

from routes.node_routes import router as node_router
app = FastAPI()
@app.get("/")
def root():
    return {
        "hello": "Welcome to the CassandraEdu API! Visit /docs for interactive API documentation."
    }

app.include_router(node_router, prefix="/api/v1")
