from fastapi import APIRouter
from pydantic import BaseModel
from services.dockerService import create_cluster, get_nodes_in_network

router = APIRouter()

class ClusterCreate(BaseModel):
    nodes: list[str]

@router.post("/create")       # ✅ plus de /cluster
def create_cluster_route(payload: ClusterCreate):
    create_cluster(payload.nodes)
    return {"message": "Cluster created", "nodes": payload.nodes}

@router.get("/status")        # ✅ plus de /cluster
def cluster_status():
    containers = get_nodes_in_network()
    return [{"name": c.name, "status": c.status} for c in containers]

@router.delete("/delete")
def delete_cluster():
    containers = get_nodes_in_network()
    for c in containers:
        c.remove(force=True)
    return {"message": "Cluster deleted"}