from fastapi import APIRouter, HTTPException
from models.node import NodeCreate, NodeResponse
from services.node_service import create_node, get_all_nodes, get_node, delete_node

router = APIRouter(prefix="/nodes", tags=["Nodes"])

@router.post("/", response_model=NodeResponse, status_code=201)
def create_node_endpoint(payload: NodeCreate):
    return create_node(payload)

@router.get("/", response_model=list[NodeResponse])
def get_all_nodes_endpoint():
    return get_all_nodes()

@router.get("/{node_id}", response_model=NodeResponse)    # ← single node health
def get_node_endpoint(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node

@router.delete("/{node_id}")                               # ← delete single node
def delete_node_endpoint(node_id: str):
    if not delete_node(node_id):
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return {"message": f"Node {node_id} removed"}