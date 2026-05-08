from services.dockerService import client


def get_running_container(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    all_containers = client.containers.list()
    for c in all_containers:
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks and c.status == "running":
            return c
    raise Exception(f"No running container found for cluster '{cluster_name}'")


def _build_ip_to_name(cluster_name: str) -> dict:
    """Helper partagé — mappe IP → nom du container dans le réseau du cluster."""
    network_name = f"cassandra-net-{cluster_name}"
    ip_to_name = {}
    for c in client.containers.list():
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks:
            ip = networks[network_name].get("IPAddress", "")
            if ip:
                ip_to_name[ip] = c.name
    return ip_to_name


def get_endpoints(cluster_name: str, keyspace: str, table: str, partition_key: str):
    container = get_running_container(cluster_name)
    result = container.exec_run(
        f"nodetool getendpoints {keyspace} {table} {partition_key}"
    )
    if result.exit_code != 0:
        raise Exception(f"nodetool getendpoints failed: {result.output.decode()}")

    ips = [ip.strip() for ip in result.output.decode().splitlines() if ip.strip()]
    ip_to_name = _build_ip_to_name(cluster_name)

    return [
        {"ip": ip, "node_name": ip_to_name.get(ip, "unknown")}
        for ip in ips
    ]


def get_token_ring(cluster_name: str):
    container = get_running_container(cluster_name)
    result = container.exec_run("nodetool ring")
    if result.exit_code != 0:
        raise Exception(f"nodetool ring failed: {result.output.decode()}")
    
    output = result.output.decode()
    nodes = {}

    # nodetool ring format: <ip> <rack> <Up/Down> <Normal/Joining/...> <load_val> <load_unit> <owns%> <token>
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 7 and parts[2] in ["Up", "Down"] and parts[3] in ["Normal", "Joining", "Leaving", "Moving"]:
            ip = parts[0]
            status = "UN" if parts[2] == "Up" else "DN"
            token = parts[-1]
            if ip not in nodes:
                nodes[ip] = {"ip": ip, "status": status, "tokens": []}
            nodes[ip]["tokens"].append(token)
    
    return list(nodes.values())

def get_data_distribution(cluster_name: str):
    container = get_running_container(cluster_name)
    result = container.exec_run("nodetool status")
    if result.exit_code != 0:
        raise Exception(f"nodetool status failed: {result.output.decode()}")

    output = result.output.decode()
    ip_to_name = _build_ip_to_name(cluster_name)

    # Format nodetool status :
    # <UN/DN>  <ip>  <load_val>  <load_unit>  <tokens>  <owns%>  <host-id>  <rack>
    distribution = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0] in ["UN", "DN", "UJ", "UL"]:
            ip = parts[1]
            load = parts[2] + " " + parts[3]
            owns = parts[5] if len(parts) > 5 else "?"
            distribution.append({
                "ip": ip,
                "node_name": ip_to_name.get(ip, "unknown"),
                "status": parts[0],
                "load": load,
                "owns_percent": owns,
                "tokens": int(parts[4])
            })

    return distribution

import mmh3  # murmur3

def explain_partition(cluster_name: str, keyspace: str, table: str, partition_key: str):
    # 1. Calcul du hash Murmur3
    hash_value = mmh3.hash64(partition_key, signed=True)[0]

    # 2. Récupérer le ring complet
    ring_nodes = get_token_ring(cluster_name)
    
    # 3. Aplatir tous les tokens avec leur nœud
    all_tokens = []
    for node in ring_nodes:
        for token in node["tokens"]:
            all_tokens.append({
                "token": int(token),
                "node": node["ip"],
                "status": node["status"]
            })
    all_tokens.sort(key=lambda x: x["token"])

    # 4. Trouver le nœud responsable (premier token >= hash)
    responsible = None
    for t in all_tokens:
        if t["token"] >= hash_value:
            responsible = t
            break
    if not responsible:
        responsible = all_tokens[0]  # wrap around

    # 5. Récupérer les replicas via getendpoints
    replicas = get_endpoints(cluster_name, keyspace, table, partition_key)

    return {
        "partition_key": partition_key,
        "murmur3_hash": hash_value,
        "responsible_token": responsible,
        "replicas": replicas,
        "explanation": (
            f"Le hash Murmur3 de '{partition_key}' est {hash_value}. "
            f"Sur le ring, le token immédiatement supérieur est {responsible['token']} "
            f"→ nœud {responsible['node']}. "
            f"Les réplicas incluent {len(replicas)} nœud(s) selon le RF."
        )
    }