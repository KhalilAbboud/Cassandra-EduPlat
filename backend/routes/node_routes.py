from fastapi import APIRouter, HTTPException
from models.node import NodeCreate, NodeResponse
from services.node_service import create_node, get_all_nodes, delete_node, stop_node, start_node

router = APIRouter(prefix="/nodes", tags=["Nodes"])

@router.post("/", response_model=NodeResponse, status_code=201)
def create_node_endpoint(payload: NodeCreate):
    return create_node(payload)

@router.get("/{cluster_name}", response_model=list[NodeResponse])
def get_all_nodes_endpoint(cluster_name: str):
    return get_all_nodes(cluster_name)

@router.delete("/{cluster_name}/{node_name}", status_code=200)
def delete_node_endpoint(cluster_name: str, node_name: str):
    deleted = delete_node(node_name, cluster_name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
    return {"message": f"Node '{node_name}' deleted successfully"}

@router.put("/{cluster_name}/{node_name}/stop", status_code=200)
def stop_node_endpoint(cluster_name: str, node_name: str):
    stopped = stop_node(node_name, cluster_name)
    if not stopped:
        raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
    return {"message": f"Node '{node_name}' stopped successfully"}

@router.put("/{cluster_name}/{node_name}/start", status_code=200)
def start_node_endpoint(cluster_name: str, node_name: str):
    started = start_node(node_name, cluster_name)
    if not started:
        raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")
    return {"message": f"Node '{node_name}' started successfully"}