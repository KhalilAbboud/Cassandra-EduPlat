from fastapi import APIRouter
from models.node import NodeCreate, NodeResponse
from services.node_service import create_node
from services.node_service import get_all_nodes


router = APIRouter(prefix="/nodes", tags=["Nodes"])
@router.post("/", response_model=NodeResponse, status_code=201)
def create_node_endpoint(payload: NodeCreate):
    return create_node(payload)

@router.get("/", response_model=list[NodeResponse])
def get_all_nodes_endpoint():
    return get_all_nodes()
