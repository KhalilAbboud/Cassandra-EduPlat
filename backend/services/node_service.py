import uuid
from models.node import NodeCreate, NodeResponse, NodeStatus
from services.dockerService import create_cassandra_container, NETWORK_NAME, get_nodes_in_network

def create_node(payload: NodeCreate) -> NodeResponse:
    node_id = str(uuid.uuid4())
    container = create_cassandra_container(
        node_name=payload.name,
        cluster_name=payload.cluster_name
    )
    
    container.reload()
    ip = container.attrs["NetworkSettings"]["Networks"][NETWORK_NAME]["IPAddress"]
    
    # 3. Construire et sretourner le NodeResponse
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
