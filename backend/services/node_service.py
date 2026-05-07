import uuid
from models.node import NodeCreate, NodeResponse, NodeStatus
from services.dockerService import (
    create_cassandra_node, get_nodes_in_network,
    stop_cassandra_node, delete_cassandra_node,
    start_cassandra_node, wait_until_up, client
)

def create_node(payload: NodeCreate) -> NodeResponse:
    network_name = f"cassandra-net-{payload.cluster_name}"
    node_id = str(uuid.uuid4())
    
    container = create_cassandra_node(node_name=payload.name, cluster_name=payload.cluster_name)
    
    containers = get_nodes_in_network(payload.cluster_name)
    expected = len(containers)
    
    print(f"⏳ Waiting for {expected} UN nodes...")
    wait_until_up(container, payload.name, expected_un_count=expected)
    
    container.reload()
    ip = container.attrs["NetworkSettings"]["Networks"][network_name]["IPAddress"]
    
    return NodeResponse(
        id=node_id,
        name=payload.name,
        ip=ip,
        status=NodeStatus.UP,
        rack="rack1",
        datacenter="dc1",
        tokens=[]
    )

def parse_nodetool_status(output: str) -> dict:
    status_map = {}
    for line in output.splitlines():
        line = line.strip()
        if len(line) < 2:
            continue
        state_code = line[:2]
        status_mapping = {
            "UN": NodeStatus.UP,
            "DN": NodeStatus.DOWN,
            "UJ": NodeStatus.JOINING,
            "UL": NodeStatus.LEAVING,
        }
        if state_code in status_mapping:
            parts = line.split()
            if len(parts) >= 2:
                ip = parts[1]
                status_map[ip] = status_mapping[state_code]
    return status_map

def get_all_nodes(cluster_name: str) -> list[NodeResponse]:
    network_name = f"cassandra-net-{cluster_name}"
    containers = client.containers.list(all=True)

    cassandra_containers = []
    for container in containers:
        container.reload()
        networks = container.attrs["NetworkSettings"]["Networks"]
        if network_name in networks:
            cassandra_containers.append(container)

    ip_status_map = {}
    for container in cassandra_containers:
        if container.status == "running":
            try:
                result = container.exec_run("nodetool status")
                if result.exit_code == 0:
                    ip_status_map = parse_nodetool_status(result.output.decode())
                    break
            except Exception:
                continue

    result = []
    for container in cassandra_containers:
        container.reload()
        networks = container.attrs["NetworkSettings"]["Networks"]
        ip = networks.get(network_name, {}).get("IPAddress", "")

        if ip in ip_status_map:
            status = ip_status_map[ip]
        elif container.status == "running":
            status = NodeStatus.UP
        else:
            status = NodeStatus.DOWN

        result.append(NodeResponse(
            id=container.id,
            name=container.name,
            ip=ip,
            status=status,
            rack="rack1",
            datacenter="dc1",
            tokens=[]
        ))
    return result

def delete_node(node_name: str, cluster_name: str) -> bool:
    return delete_cassandra_node(node_name, cluster_name)

def stop_node(node_name: str, cluster_name: str) -> bool:
    return stop_cassandra_node(node_name, cluster_name)

def start_node(node_name: str, cluster_name: str) -> bool:
    return start_cassandra_node(node_name, cluster_name)