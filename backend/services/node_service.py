import uuid
import time
from models.node import NodeCreate, NodeResponse, NodeStatus
from services.dockerService import create_cassandra_node, NETWORK_NAME, get_nodes_in_network
def wait_for_cluster_join(expected_count: int, timeout=180):
    """Attend que node-1 voit expected_count nœuds UN"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            node1 = client.containers.get("node-1") # ou le premier nœud du réseau
            result = node1.exec_run("nodetool status")
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
    
    # Compter combien de nœuds sont dans le réseau
    containers = get_nodes_in_network()
    expected = len(containers)
    
    # Attendre que TOUS les nœuds actuels soient visibles depuis le premier
    print(f"⏳ Waiting for {expected} UN nodes...")
    wait_for_cluster_join(expected_count=expected)
    
    container.reload()
    ip = container.attrs["NetworkSettings"]["Networks"][NETWORK_NAME]["IPAddress"]
    
    return NodeResponse(
        id=node_id,
        name=payload.name,
        ip=ip,
        status=NodeStatus.UP,
        rack="rack1",
        datacenter="dc1",
        tokens=[]
    )
def get_all_nodes() -> list[NodeResponse]:
    containers = get_nodes_in_network()
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
def get_all_nodes() -> list[NodeResponse]:
    containers = get_nodes_in_network()
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
