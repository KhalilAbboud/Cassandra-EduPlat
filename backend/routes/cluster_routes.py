from fastapi import APIRouter
from pydantic import BaseModel
from services.dockerService import create_cluster, get_nodes_in_network

router = APIRouter()

class ClusterCreate(BaseModel):
    nodes: list[str]

@router.post("/create")      
def create_cluster_route(payload: ClusterCreate):
    create_cluster(payload.nodes)
    return {"message": "Cluster created", "nodes": payload.nodes}

@router.get("/status")       
def cluster_status():
    containers = get_nodes_in_network()
    return [{"name": c.name, "status": c.status} for c in containers]

@router.delete("/delete")
def delete_cluster():
    containers = get_nodes_in_network()
    for c in containers:
        c.remove(force=True)
    return {"message": "Cluster deleted"}


# this one resets the cluster completely on UI Refresh or docker-compose down/up or upon pressing reset button on UI
# if the users wants to keep the cluster running but just want to remove the nodes, they can use the delete endpoint instead and then create new nodes with the create endpoint
# but this ones serves as a hard reset in case a node crashes, or he want to switch to a different cluster configuration, or just want to start fresh without any nodes running, 
# it will remove all the nodes and the network as well, so that when the user creates a new cluster, it will be created from scratch without any leftover containers or network issues
@router.delete("/reset")
def reset_cluster():
    from services.dockerService import get_client, NETWORK_NAME
    import docker
    client = get_client()
    excluded = {"cassandraeduplat-frontend-1", "cassandraeduplat-backend-1"}
    removed = []
    try:
        containers = client.containers.list(filters={"network": NETWORK_NAME})
        for c in containers:
            if c.name not in excluded:
                c.remove(force=True)
                removed.append(c.name)
        client.networks.get(NETWORK_NAME).remove()
    except docker.errors.NotFound:
        pass
    except Exception as e:
        return {"message": "Partial cleanup", "removed": removed, "error": str(e)}
    return {"message": "Cluster reset", "removed": removed}