from pydantic import BaseModel 
from enum import Enum
class NodeCreate(BaseModel):
    name: str
    cluster_name: str
    initial_token: str | None = None

class NodeStatus(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    JOINING = "JOINING"
    LEAVING = "LEAVING"
class NodeResponse(BaseModel):
    id: str
    name: str
    ip: str
    status: NodeStatus
    rack: str
    datacenter: str
    tokens: list[int]
