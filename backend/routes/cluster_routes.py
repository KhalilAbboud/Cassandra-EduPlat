from fastapi import APIRouter
from datetime import datetime
from services.dockerService import create_cluster, get_nodes_in_network, client, PARTITIONER_MAP
from services.registryService import add_cluster, remove_cluster
from models.cluster import ClusterCreate, ClusterResponse, ClusterStatusResponse, PartitionerChange

router = APIRouter(prefix="/cluster", tags=["Cluster"])

@router.post("/create", response_model=ClusterResponse)
def create_cluster_route(payload: ClusterCreate):
    create_cluster(payload.nodes, payload.cluster_name, payload.partitioner)
    add_cluster(payload.cluster_name, payload.partitioner, payload.nodes)
    return ClusterResponse(
        cluster_name=payload.cluster_name,
        partitioner=payload.partitioner,
        nodes=payload.nodes,
        created_at=datetime.now().isoformat()
    )

@router.get("/{cluster_name}/status", response_model=list[ClusterStatusResponse])
def cluster_status(cluster_name: str):
    containers = get_nodes_in_network(cluster_name)
    return [ClusterStatusResponse(name=c.name, status=c.status) for c in containers]

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

@router.post("/{cluster_name}/change-partitioner", response_model=ClusterResponse)
def change_partitioner(cluster_name: str, payload: PartitionerChange):
    containers = get_nodes_in_network(cluster_name)
    node_names = [c.name for c in containers]
    for c in containers:
        c.remove(force=True)
    create_cluster(node_names, cluster_name, payload.partitioner)
    add_cluster(cluster_name, payload.partitioner, node_names)
    return ClusterResponse(
        cluster_name=cluster_name,
        partitioner=payload.partitioner,
        nodes=node_names,
        created_at=datetime.now().isoformat()
    )