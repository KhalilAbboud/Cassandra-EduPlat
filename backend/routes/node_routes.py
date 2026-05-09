from fastapi import APIRouter, HTTPException
from models.node import NodeCreate, NodeResponse
from services.node_service import create_node, get_all_nodes, get_node, delete_node

router = APIRouter(prefix="/nodes", tags=["Nodes"])

# add node

@router.post("/", response_model=NodeResponse, status_code=201)
def create_node_endpoint(payload: NodeCreate):
    return create_node(payload)

# get all nodes

@router.get("/", response_model=list[NodeResponse])
def get_all_nodes_endpoint():
    return get_all_nodes()

# get single node health

@router.get("/{node_id}", response_model=NodeResponse)
def get_node_endpoint(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node

# delete single node

@router.delete("/{node_id}")
def delete_node_endpoint(node_id: str):
    if not delete_node(node_id):
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return {"message": f"Node {node_id} removed"}