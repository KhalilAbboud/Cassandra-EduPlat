import uuid
import time
from models.node import NodeCreate, NodeResponse, NodeStatus
from services.dockerService import create_cassandra_node, NETWORK_NAME, get_nodes_in_network, get_client
import docker

# Containers that belong to compose infra, not Cassandra nodes
EXCLUDED = {"cassandraeduplat-frontend-1", "cassandraeduplat-backend-1"}

def wait_for_cluster_join(expected_count: int, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
            # Use first available cassandra node, not hardcoded "node-1"
            containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
            if not containers:
                time.sleep(5)
                continue
            first = containers[0]
            result = first.exec_run("nodetool status")
            output = result.output.decode()
            un_count = output.count("UN")
            print(f"  → {un_count}/{expected_count} UN detected...")
            if un_count >= expected_count:
                return True
        except Exception:
            pass
        time.sleep(5)
    return False

def create_node(payload: NodeCreate) -> NodeResponse:
    node_id = str(uuid.uuid4())
    container = create_cassandra_node(node_name=payload.name)

    # Count only real cassandra nodes (exclude infra)
    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    expected = len(containers)

    print(f"⏳ Waiting for {expected} UN nodes...")
    wait_for_cluster_join(expected_count=expected)

    container.reload()
    ip = container.attrs["NetworkSettings"]["Networks"].get(NETWORK_NAME, {}).get("IPAddress", "")

    return NodeResponse(
        id=node_id,
        name=payload.name,
        ip=ip,
        status=NodeStatus.UP,
        rack="rack1",
        datacenter="dc1",
        tokens=[]
    )

def get_all_nodes() -> list[NodeResponse]:   # ← deduped, was defined twice
    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    result = []
    for container in containers:
        container.reload()
        ip = container.attrs["NetworkSettings"]["Networks"].get(NETWORK_NAME, {}).get("IPAddress", "")
        result.append(NodeResponse(
            id=container.id,
            name=container.name,
            ip=ip,
            status=NodeStatus.UP,
            rack="rack1",
            datacenter="dc1",
            tokens=[]
        ))
    return result

def get_node(node_id: str) -> NodeResponse | None:
    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    for container in containers:
        if container.name == node_id:
            container.reload()
            ip = container.attrs["NetworkSettings"]["Networks"].get(NETWORK_NAME, {}).get("IPAddress", "")
            return NodeResponse(
                id=container.id,
                name=container.name,
                ip=ip,
                status=NodeStatus.UP,
                rack="rack1",
                datacenter="dc1",
                tokens=[]
            )
    return None

def delete_node(node_id: str) -> bool:
    try:
        container = get_client().containers.get(node_id)
        container.remove(force=True)
        return True
    except docker.errors.NotFound:
        return False