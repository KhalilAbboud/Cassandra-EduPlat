from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routes.cluster_routes import router as cluster_router
from routes.node_routes import router as node_router
from services.dockerService import get_client
from routes.data_routes import router as data_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # startup
    # shutdown cleanup
    try:
        client = get_client()
        for container in client.containers.list(filters={"network": "cassandra-net"}):
            print(f"🧹 Stopping {container.name}")
            container.stop()
            container.remove()
        client.networks.get("cassandra-net").remove()
        print("🧹 cassandra-net removed")
    except Exception as e:
        print(f"Cleanup warning: {e}")

app = FastAPI(lifespan=lifespan)   # ← only ONE app, with lifespan from the start

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"hello": "Welcome to the CassandraEdu API! Visit /docs for interactive API documentation."}

app.include_router(node_router, prefix="/api/v1")
app.include_router(cluster_router, prefix="/api/v1/cluster")
app.include_router(data_router, prefix="/api/v1")