from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal
from services.dockerService import create_cluster, get_nodes_in_network, client, PARTITIONER_MAP
from services.registryService import add_cluster, remove_cluster

router = APIRouter(prefix="/cluster", tags=["Cluster"])

PartitionerType = Literal["Murmur3Partitioner", "RandomPartitioner", "ByteOrderedPartitioner"]

class ClusterCreate(BaseModel):
    cluster_name: str
    nodes: list[str]
    partitioner: PartitionerType = "Murmur3Partitioner"  # ← optionnel, défaut Murmur3

class PartitionerChange(BaseModel):
    partitioner: PartitionerType


@router.post("/create")
def create_cluster_route(payload: ClusterCreate):
    create_cluster(payload.nodes, payload.cluster_name, payload.partitioner)  # ← passé ici
    add_cluster(payload.cluster_name, payload.partitioner, payload.nodes)
    return {
        "message": "Cluster created",
        "cluster": payload.cluster_name,
        "nodes": payload.nodes,
        "partitioner": payload.partitioner
    }

@router.get("/{cluster_name}/status")
def cluster_status(cluster_name: str):
    containers = get_nodes_in_network(cluster_name)
    return [{"name": c.name, "status": c.status} for c in containers]

@router.delete("/{cluster_name}/delete")
def delete_cluster(cluster_name: str):
    containers = get_nodes_in_network(cluster_name)
    for c in containers:
        c.remove(force=True)
    remove_cluster(cluster_name)
    return {"message": f"Cluster '{cluster_name}' deleted"}

@router.post("/{cluster_name}/stop")
def stop_cluster(cluster_name: str):
    containers = get_nodes_in_network(cluster_name)
    for c in containers:
        c.stop()
    return {"message": f"Cluster '{cluster_name}' stopped"}

@router.post("/{cluster_name}/start")
def start_cluster(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    all_containers = client.containers.list(all=True)
    cassandra_containers = [
        c for c in all_containers
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {})
    ]
    for c in cassandra_containers:
        c.start()
    return {"message": f"Cluster '{cluster_name}' started ({len(cassandra_containers)} nodes)"}

@router.post("/{cluster_name}/change-partitioner")
def change_partitioner(cluster_name: str, payload: PartitionerChange):
    # 1. Récupérer les noms des nœuds avant de tout supprimer
    containers = get_nodes_in_network(cluster_name)
    node_names = [c.name for c in containers]

    # 2. Supprimer tous les containers
    for c in containers:
        c.remove(force=True)

    # 3. Recréer le cluster avec le nouveau partitioner
    create_cluster(node_names, cluster_name, payload.partitioner)
    add_cluster(cluster_name, payload.partitioner, node_names)
    return {
        "warning": "All data has been lost",
        "cluster": cluster_name,
        "new_partitioner": payload.partitioner,
        "nodes_recreated": node_names
    }