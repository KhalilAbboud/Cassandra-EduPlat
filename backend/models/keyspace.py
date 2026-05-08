from pydantic import BaseModel
from typing import Literal

StrategyType = Literal["SimpleStrategy", "NetworkTopologyStrategy"]

class KeyspaceCreate(BaseModel):
    keyspace_name: str
    replication_factor: int = 1
    strategy: StrategyType = "SimpleStrategy"

class KeyspaceResponse(BaseModel):
    keyspace: str
    strategy: StrategyType
    replication_factor: int