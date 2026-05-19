from pydantic import BaseModel
from typing import Literal

PartitionerType = Literal["Murmur3Partitioner", "RandomPartitioner", "ByteOrderedPartitioner"]

class ClusterResponse(BaseModel):
    cluster_name: str
    partitioner: PartitionerType
    nodes: list[str]
    created_at: str

class ClusterStatusResponse(BaseModel):
    name: str
    status: str  # "running" | "exited" | "paused"
class ClusterCreate(BaseModel):
    cluster_name: str
    nodes: list[str]
    partitioner: PartitionerType = "Murmur3Partitioner"  # ← optionnel, défaut Murmur3

class PartitionerChange(BaseModel):
    partitioner: PartitionerType
