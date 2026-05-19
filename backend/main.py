from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.cluster_routes import router as cluster_router
from routes.node_routes import router as node_router
from routes.data_routes import router as data_router
from services.registryService import write_registry
from routes.token_routes import router as token_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    write_registry({})
    print("📋 Registry cleared on startup")
    yield
    write_registry({})
    print("📋 Registry cleared on shutdown")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Welcome to CassandraEdu API! Visit /docs for documentation."}

app.include_router(node_router, prefix="/api/v1")
app.include_router(cluster_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")
app.include_router(token_router, prefix="/api/v1")