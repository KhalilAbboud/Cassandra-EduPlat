import uuid
import time
from models.node import NodeCreate, NodeResponse, NodeStatus
from services.dockerService import create_cassandra_node, NETWORK_NAME, get_nodes_in_network, get_client
import docker
from fastapi import HTTPException

EXCLUDED = {"cassandraeduplat-frontend-1", "cassandraeduplat-backend-1"}

# this allows to wait for a node to join the cluster.
# it will keep checking the status of the nodes in the cluster.
# and it will wait until the expected number of nodes are in "up" state.
# if the expected number of nodes are not in "up" state within the timeout period, then it will return a supposed 'False' but it crashes the program :shrug:
#
def wait_for_cluster_join(expected_count: int, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
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


# this allows to wait for a node to be removed from the cluster.
# so the user will not face the issue of the node not being removed from the cluster.

# same logic as wait_for_cluster_join but for removing a node
# this is needed because the node is not removed from the cluster even after the docker container is removed
# it basically means that the node is not removed from the cluster gossip

def wait_for_removenode_complete(peer, host_id: str, timeout=120) -> bool:
    """Block until the dead node's host ID disappears from nodetool status."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            result = peer.exec_run("nodetool status")
            output = result.output.decode()
            if host_id not in output:
                print(f"✅ Node {host_id} fully purged from cluster gossip")
                return True
            # Also check removenode progress
            prog = peer.exec_run(f"nodetool removenode --status")
            print(f"  → removenode status: {prog.output.decode().strip()}")
        except Exception:
            pass
        time.sleep(5)
    print(f"⚠️ Timed out waiting for removenode {host_id} to complete")
    return False

# it makes sure that no nodes are in "down" state before adding a new node.
# this is because if there are nodes in "down" state, the new node will not join the cluster.
# if that's the case then the new node will be stuck in "joining" state and will never join the cluster.

def wait_for_no_down_nodes(timeout=60) -> bool:
    """Before adding a new node, ensure no DN nodes linger in the cluster."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
            if not containers:
                return True
            result = containers[0].exec_run("nodetool status")
            output = result.output.decode()
            if "DN" not in output:
                return True
            print("  → DN node still present, waiting...")
        except Exception:
            pass
        time.sleep(5)
    return False

# node creation logic, basic.
def create_node(payload: NodeCreate) -> NodeResponse:
    node_id = str(uuid.uuid4())

    print("⏳ Checking cluster has no lingering DN nodes...")
    wait_for_no_down_nodes()

    # ← ADD THIS BLOCK: detect ghost node IP for replace_address
    replace_address = None
    try:
        containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
        if containers:
            result = containers[0].exec_run("nodetool status")
            for line in result.output.decode().splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "DN":
                    replace_address = parts[1]
                    print(f"⚠️ Ghost node found at {replace_address}, using replace_address")
                    break
    except Exception as e:
        print(f"⚠️ Could not check for DN nodes: {e}")

    container = create_cassandra_node(node_name=payload.name, replace_address=replace_address)  # ← pass it

    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    expected = len(containers)

    print(f"⏳ Waiting for {expected} UN nodes...")
    wait_for_cluster_join(expected_count=expected)

    try:
        container.reload()
        ip = container.attrs["NetworkSettings"]["Networks"].get(NETWORK_NAME, {}).get("IPAddress", "")
    except Exception:
        raise HTTPException(status_code=409, detail=f"Node {payload.name} was removed during setup")

    return NodeResponse(
        id=node_id,
        name=payload.name,
        ip=ip,
        status=NodeStatus.UP,
        rack="rack1",
        datacenter="dc1",
        tokens=[]
    )

# get all nodes ?
def get_all_nodes() -> list[NodeResponse]:
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


# get node details ?
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

# fixed the nodes crashing when removing, or the other exiting after readding a node that got deleted prior one that got craeted
# in simple term, node a created, b created, node c created, node b deleted, then node b is readded, before the node imidiately exits, now it works

def delete_node(node_id: str) -> bool:
    try:
        client = get_client()
        target = client.containers.get(node_id)

        host_id = None
        try:
            result = target.exec_run("nodetool info")
            for line in result.output.decode().split('\n'):
                if line.strip().startswith('ID'):
                    host_id = line.split(':')[-1].strip()
                    break
            print(f"🔑 Host ID of {node_id}: {host_id}")
        except Exception as e:
            print(f"⚠️ Could not get host ID: {e}")

        peer = None
        for c in get_nodes_in_network():
            if c.name not in EXCLUDED and c.name != node_id:
                peer = c
                break

        target.remove(force=True)
        print(f"🗑️ Container {node_id} removed")

        if peer and host_id:
            try:
                res = peer.exec_run(f"nodetool removenode {host_id}")
                print(f"🔄 removenode started: {res.output.decode()}")
                wait_for_removenode_complete(peer, host_id)
            except Exception as e:
                print(f"⚠️ removenode warning: {e}")
        elif not peer:
            print("ℹ️ No peer — single node cluster, no removenode needed")

        return True
    except docker.errors.NotFound:
        return False