from pydantic import BaseModel
from typing import List, Optional

class EndpointsRequest(BaseModel):
    partition_key: str

class BatchHashesRequest(BaseModel):
    keys: List[str]
    hashing_type: str = "murmur3"  # "murmur3" or "md5"

class NodeEndpoint(BaseModel):
    ip: str
    node_name: str

class EndpointsResponse(BaseModel):
    keyspace: str
    table: str
    partition_key: str
    endpoints: List[NodeEndpoint]

class NodeTokenInfo(BaseModel):
    ip: str
    status: str
    tokens: List[str]

class RingResponse(BaseModel):
    cluster_name: str
    nodes: List[NodeTokenInfo]

class NodeDistribution(BaseModel):
    ip: str
    node_name: str
    status: str
    load: str
    owns_percent: str
    tokens: int

class DistributionResponse(BaseModel):
    cluster_name: str
    nodes: List[NodeDistribution]