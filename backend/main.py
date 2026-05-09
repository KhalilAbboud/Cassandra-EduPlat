from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routes.cluster_routes import router as cluster_router
from routes.node_routes import router as node_router
from services.dockerService import get_client
from routes.data_routes import router as data_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    print("🧹 Shutting down — cleaning up cluster...")
    try:
        client = get_client()
        containers = client.containers.list(filters={"network": "cassandra-net"})
        for container in containers:
            if container.name not in {"cassandraeduplat-frontend-1", "cassandraeduplat-backend-1"}:
                print(f"🧹 Removing {container.name}")
                container.remove(force=True)   # ← force=True skips stop, much faster
        try:
            client.networks.get("cassandra-net").remove()
            print("🧹 Network removed")
        except Exception:
            pass
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