import docker
import time
client = docker.from_env()
# ERREUR 2 — wait_until_up n'est pas défini dans dockerService.py
# ← ajoute cette fonction
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
                ip = container.attrs['NetworkSettings']['Networks'][network_name]['IPAddress']
                print(f"Found existing seed: {container.name} ({ip})")
                return ip
        except Exception:
            continue
    
    return None

PARTITIONER_MAP = {
    "Murmur3Partitioner": "org.apache.cassandra.dht.Murmur3Partitioner",
    "RandomPartitioner": "org.apache.cassandra.dht.RandomPartitioner",
    "ByteOrderedPartitioner": "org.apache.cassandra.dht.ByteOrderedPartitioner",
}

def create_cassandra_node(node_name: str, cluster_name: str, partitioner: str = "Murmur3Partitioner"):
    network_name = f"cassandra-net-{cluster_name}"
    
    try:
        old = client.containers.get(node_name)
        old.remove(force=True)
        print(f"Removed old {node_name}")
    except docker.errors.NotFound:
        pass
    get_or_create_network(network_name)  
    # Port hôte unique par nœud — node-1=9042, node-2=9043, etc.
    existing = client.containers.list(all=True)
    cassandra_nodes = [
        c for c in existing
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {})
    ]
    host_port = 9042 + len(cassandra_nodes)

    seed = get_existing_seed(cluster_name)
    if seed:
        print(f"{node_name} will join cluster via seed {seed}")
    else:
        print(f"{node_name} will be the first node (seed = itself)")
        seed = node_name

    partitioner_full = PARTITIONER_MAP.get(partitioner, PARTITIONER_MAP["Murmur3Partitioner"])

    container = client.containers.run(
        "cassandra:latest",
        name=node_name,
        environment={
            "CASSANDRA_CLUSTER_NAME": cluster_name,
            "CASSANDRA_SEEDS": seed,
            "CASSANDRA_PARTITIONER": partitioner_full,
            "MAX_HEAP_SIZE": "512M",
            "HEAP_NEWSIZE": "100M",
            "CASSANDRA_RING_DELAY_MS": "5000"
        },
        ports={"9042/tcp": host_port},  # ← nouveau
        mem_limit="1g",
        detach=True,
        network=network_name
    )
    print(f"{node_name} started on host port {host_port} (partitioner: {partitioner})")
    return container, host_port  # ← retourne aussi le port

def create_cluster(node_names: list, cluster_name: str, partitioner: str = "Murmur3Partitioner"):
    network_name = f"cassandra-net-{cluster_name}"
    get_or_create_network(network_name)
    
    containers = []
    for node_name in node_names:
        container, host_port = create_cassandra_node(node_name, cluster_name, partitioner)  # ← unpack
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
    print(f"Nodes in {network_name}: {[container.name for container in network.containers]}")
    return list(network.containers)
def delete_cassandra_node(node_name: str,cluster_name: str) -> bool:
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
        container.stop()
        print(f"{node_name} stopped")
        return True
    except docker.errors.NotFound:
        return False
    
def start_cassandra_node(node_name: str,cluster_name: str) -> bool:
    try:
        container = client.containers.get(node_name)
        container.start()
        print(f"{node_name} started")
        return True
    except docker.errors.NotFound:
        return False