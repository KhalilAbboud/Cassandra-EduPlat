import socket
import docker
import time

client = docker.from_env()


# ─── Port allocation ──────────────────────────────────────────────────────────

def find_free_port(start: int = 9042, end: int = 9200) -> int:
    """Retourne le premier port TCP libre dans la plage donnée."""
    used_ports = set()
    for container in client.containers.list():
        for port_bindings in container.ports.values():
            if port_bindings:
                for binding in port_bindings:
                    used_ports.add(int(binding["HostPort"]))

    for port in range(start, end):
        if port in used_ports:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue

    raise RuntimeError(f"Aucun port libre trouvé entre {start} et {end}")


# ─── Cluster readiness ────────────────────────────────────────────────────────

def wait_until_up(container, node_name, expected_un_count=1, timeout=180):
    print(f"Waiting for {node_name} ({expected_un_count} UN expected)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            container.reload()
            if container.status != "running":
                return False
            result = container.exec_run("nodetool status")
            output = result.output.decode()
            un_count = output.count("UN")
            print(f"{un_count} UN detected...")
            if result.exit_code == 0 and un_count >= expected_un_count:
                print(f"{node_name} sees {un_count} UN nodes")
                return True
        except Exception:
            pass
        time.sleep(5)
    return False


# ─── Network ──────────────────────────────────────────────────────────────────

def get_or_create_network(network_name: str):
    networks = [n for n in client.networks.list(names=[network_name]) if n.name == network_name]
    if networks:
        print(f"Network {network_name} already exists.")
        return networks[0]
    network = client.networks.create(network_name, driver="bridge")
    print(f"Network {network_name} created.")
    return network


def get_existing_seed(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"

    networks = [n for n in client.networks.list(names=[network_name]) if n.name == network_name]
    if not networks:
        return None

    network = networks[0]
    network.reload()

    for container in network.containers:
        try:
            result = container.exec_run("nodetool status")
            if result.exit_code == 0 and "UN" in result.output.decode():
                ip = container.attrs["NetworkSettings"]["Networks"][network_name]["IPAddress"]
                print(f"Found existing seed: {container.name} ({ip})")
                return ip
        except Exception:
            continue

    return None


# ─── Partitioner ──────────────────────────────────────────────────────────────

PARTITIONER_MAP = {
    "Murmur3Partitioner": "org.apache.cassandra.dht.Murmur3Partitioner",
    "RandomPartitioner": "org.apache.cassandra.dht.RandomPartitioner",
    "ByteOrderedPartitioner": "org.apache.cassandra.dht.ByteOrderedPartitioner",
}


# ─── Node operations ──────────────────────────────────────────────────────────

def create_cassandra_node(node_name: str, cluster_name: str, partitioner: str = "Murmur3Partitioner", initial_token: str = None):
    network_name = f"cassandra-net-{cluster_name}"

    try:
        old = client.containers.get(node_name)
        old.remove(force=True)
        print(f"Removed old {node_name}")
    except docker.errors.NotFound:
        pass

    get_or_create_network(network_name)

    host_port = find_free_port()

    seed = get_existing_seed(cluster_name)
    if seed:
        print(f"{node_name} will join cluster via seed {seed}")
    else:
        print(f"{node_name} will be the first node (seed = itself)")
        seed = node_name

    partitioner_full = PARTITIONER_MAP.get(partitioner, PARTITIONER_MAP["Murmur3Partitioner"])

    env = {
        "CASSANDRA_CLUSTER_NAME": cluster_name,
        "CASSANDRA_SEEDS": seed,
        "CASSANDRA_PARTITIONER": partitioner_full,
        # Keep heap small so 3 nodes can coexist without triggering Docker's
        # OOM killer. AlwaysPreTouch (Cassandra default) commits ALL heap at
        # startup — 3 × 512M = 1.5 GB committed instantly, which kills peers.
        "MAX_HEAP_SIZE": "256M",
        "HEAP_NEWSIZE": "64M",
        # Give gossip more time to settle before bootstrap begins
        "CASSANDRA_RING_DELAY_MS": "10000",
        "CASSANDRA_NUM_TOKENS": "16",
        # Allow bootstrapping even when a peer replica is temporarily down.
        # Without this, Cassandra aborts with "Necessary replicas for strict
        # consistency were removed by source filters" if any node is DOWN.
        "CASSANDRA_CONSISTENT_RANGE_MOVEMENT": "false",
        "JVM_EXTRA_OPTS": "-Dcassandra.consistent.rangemovement=false",
    }
    if initial_token:
        env["CASSANDRA_INITIAL_TOKEN"] = initial_token

    container = client.containers.run(
        "cassandra:latest",
        name=node_name,
        environment=env,
        ports={"9042/tcp": host_port},
        mem_limit="1.5g",  # 256M heap + ~1.25G headroom for off-heap (Netty, direct memory, metaspace)
        detach=True,
        network=network_name,
    )
    print(f"{node_name} started on host port {host_port} (partitioner: {partitioner})")
    return container, host_port


def create_cluster(node_names: list, cluster_name: str, partitioner: str = "Murmur3Partitioner"):
    network_name = f"cassandra-net-{cluster_name}"
    get_or_create_network(network_name)

    containers = []
    for node_name in node_names:
        container, host_port = create_cassandra_node(node_name, cluster_name, partitioner)
        containers.append(container)

        expected = len(containers)
        seed_container = containers[0]
        wait_until_up(seed_container, node_name, expected_un_count=expected)

    print("\nCluster ready!")
    result = containers[0].exec_run("nodetool status")
    print(result.output.decode())


def get_nodes_in_network(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    network = get_or_create_network(network_name)
    network.reload()
    
    import socket
    hostname = socket.gethostname()
    
    nodes = []
    for container in network.containers:
        if container.id.startswith(hostname) or container.name == hostname:
            continue
        nodes.append(container)
        
    print(f"Nodes in {network_name}: {[c.name for c in nodes]}")
    return nodes


def delete_cassandra_node(node_name: str, cluster_name: str) -> bool:
    try:
        container = client.containers.get(node_name)
        container.remove(force=True)
        print(f"{node_name} removed")
        return True
    except docker.errors.NotFound:
        return False


def stop_cassandra_node(node_name: str, cluster_name: str) -> bool:
    try:
        container = client.containers.get(node_name)
        if container.status == 'running':
            container.pause()
            print(f"{node_name} paused")
        return True
    except docker.errors.NotFound:
        return False


def start_cassandra_node(node_name: str, cluster_name: str) -> bool:
    try:
        container = client.containers.get(node_name)
        if container.status == 'paused':
            container.unpause()
            print(f"{node_name} unpaused")
        elif container.status != 'running':
            container.start()
            print(f"{node_name} started")
        return True
    except docker.errors.NotFound:
        return False