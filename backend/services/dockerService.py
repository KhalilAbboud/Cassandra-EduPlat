import docker
import time

_client = None

def get_client():
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client
NETWORK_NAME = "cassandra-net"
CLUSTER_NAME = "TestCluster"

def wait_until_up(container, node_name, expected_un_count=1, timeout=180):
    print(f"⏳ Waiting for {node_name} ({expected_un_count} UN expected)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            container.reload()
            if container.status != "running":
                return False
            result = container.exec_run("nodetool status")
            output = result.output.decode()
            un_count = output.count("UN")
            print(f"  → {un_count} UN detected...")
            if result.exit_code == 0 and un_count >= expected_un_count:
                print(f"✅ {node_name} sees {un_count} UN nodes")
                return True
        except Exception:
            pass
        time.sleep(5)
    return False

def get_or_create_network():
    networks = get_client().networks.list(names=[NETWORK_NAME])
    # Filtrer par nom exact
    networks = [n for n in networks if n.name == NETWORK_NAME]
    if networks:
        print(networks[0].attrs['IPAM']['Config'][0].get('Subnet', 'N/A') + " network already exists.")
        return networks[0]
    else:
        network = get_client().networks.create(NETWORK_NAME, driver="bridge")
        print(f"✅ Network {NETWORK_NAME} created.")
        return network
def get_existing_seed():
    """Retourne l'IP d'un nœud déjà UP dans le réseau, sinon None"""
    networks = [n for n in get_client().networks.list(names=[NETWORK_NAME]) if n.name == NETWORK_NAME]
    if not networks:
        return None
    
    network = networks[0]
    network.reload()
    
    for container in network.containers:
        try:
            result = container.exec_run("nodetool status")
            if result.exit_code == 0 and "UN" in result.output.decode():
                # Récupérer son IP
                ip = container.attrs['NetworkSettings']['Networks'][NETWORK_NAME]['IPAddress']
                print(f"🌱 Found existing seed: {container.name} ({ip})")
                return ip
        except Exception:
            continue
    
    return None  # Aucun nœud existant → ce nœud sera le seed

def create_cassandra_node(node_name, replace_address=None):  # ← add replace_address param
    get_or_create_network()
    try:
        old = get_client().containers.get(node_name)
        old.remove(force=True)
        print(f"🗑️ Removed old {node_name}")
    except docker.errors.NotFound:
        pass

    seed = get_existing_seed()
    
    if seed:
        print(f"🔗 {node_name} will join cluster via seed {seed}")
    else:
        print(f"🆕 {node_name} will be the first node (seed = itself)")
        seed = node_name

    # Build environment
    env = {
        "CASSANDRA_CLUSTER_NAME": CLUSTER_NAME,
        "CASSANDRA_SEEDS": seed,
        "MAX_HEAP_SIZE": "512M",
        "HEAP_NEWSIZE": "100M",
        "CASSANDRA_RING_DELAY_MS": "5000",
        "CASSANDRA_CONSISTENT_RANGEMOVEMENT": "false"
    }

    # ← ADD THIS BLOCK
    if replace_address:
        env["JVM_OPTS"] = f"-Dcassandra.replace_address={replace_address}"
        print(f"🔁 Replacing dead node at {replace_address}")

    container = get_client().containers.run(
        "cassandra:latest",
        name=node_name,
        environment=env,
        mem_limit="1g",
        detach=True,
        network=NETWORK_NAME
    )
    print(f"🚀 {node_name} started")
    return container

def create_cluster(node_names: list):
    get_or_create_network()
    
    containers = []
    for node_name in node_names:
        container = create_cassandra_node(node_name)
        containers.append(container)
        
        # Attendre que ce nœud soit visible dans le cluster avant le suivant
        expected = len(containers)
        seed_container = containers[0]
        wait_until_up(seed_container, node_name, expected_un_count=expected)
    
    print("\n🎉 Cluster ready!")
    result = containers[0].exec_run("nodetool status")
    print(result.output.decode())
def get_nodes_in_network():
    network = get_or_create_network()
    network.reload()  
    print(f"📋 Nodes in {NETWORK_NAME}: {[container.name for container in network.containers]}")
    return list(network.containers)  