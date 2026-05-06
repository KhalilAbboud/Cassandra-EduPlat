import docker
import time
client = docker.from_env()
NETWORK_NAME = "cassandra-net"

def get_or_create_network():
    networks = client.networks.list(names=[NETWORK_NAME])
    if networks:
        return networks[0]
    else:
        return client.networks.create(NETWORK_NAME, driver="bridge")
def create_cassandra_container(node_name: str, cluster_name: str, seed_node_name: str = None):
    network = get_or_create_network()
    seeds = seed_node_name if seed_node_name else node_name
    
    container = client.containers.run(
    "cassandra:latest",
    name=node_name,
    environment={
        "CASSANDRA_CLUSTER_NAME": cluster_name,
        "CASSANDRA_SEEDS": seeds,
        "MAX_HEAP_SIZE": "512M",
        "HEAP_NEWSIZE": "100M"
    },
    mem_limit="1g",
    detach=True,
    network=NETWORK_NAME
    )
    
    
    # Attendre que le nœud soit vraiment UP
    print(f"⏳ {node_name} joining cluster...")
    # while True:
    #     try:
    #         result = container.exec_run("nodetool status")
    #         if result.exit_code == 0 and "UN" in result.output.decode():
    #             print(f"✅ {node_name} is UP")
    #             break
    #     except Exception:
    #         pass
    #     time.sleep(5)
    
    return container
def get_nodes_in_network():
    network = get_or_create_network()
    network.reload()  # rafraîchir les infos
    return list(network.containers)  # pas .list() !