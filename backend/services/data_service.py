from cassandra.cluster import Cluster
from cassandra.policies import RoundRobinPolicy
from services.dockerService import get_nodes_in_network, NETWORK_NAME
from services.node_service import EXCLUDED

# Discovers live Cassandra node IPs from Docker,
# connects via the driver, and ensures the keyspace + table exist.
# ik the replication factor is hardcoded here mb we'll fix or i'll fix it later 
# the cluster ip logic is the same as others 

def get_cassandra_session():
    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    if not containers:
        raise Exception("No Cassandra nodes available")

    # Collect IPs of all running Cassandra containers
    ips = []
    for c in containers:
        try:
            c.reload()
            ip = c.attrs["NetworkSettings"]["Networks"].get(NETWORK_NAME, {}).get("IPAddress", "")
            if ip:
                ips.append(ip)
        except Exception:
            continue

    if not ips:
        raise Exception("Could not resolve any node IPs")

    # Connect to the cluster and the cassandra driver handles load balancing across nodes
    cluster = Cluster(ips, load_balancing_policy=RoundRobinPolicy(), protocol_version=5)
    session = cluster.connect()

    # Create keyspace with RF=1 (data stored on 1 node, Cassandra handles placement of them across all the nodes crated)
    session.execute("""
        CREATE KEYSPACE IF NOT EXISTS edu
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    """)
    session.set_keyspace("edu")

    # Simple key/value table — value holds JSON for CSV rows, the patition key is the key, and the rest get stored in the value row
    session.execute("""
        CREATE TABLE IF NOT EXISTS store (
            key text PRIMARY KEY,
            value text
        )
    """)
    return session, cluster


# basic operation on cassandra db (r/w/d)
def write_data(key: str, value: str):
    session, cluster = get_cassandra_session()
    try:
        session.execute("INSERT INTO store (key, value) VALUES (%s, %s)", (key, value))
        return {"message": "Written", "key": key, "value": value}
    finally:
        cluster.shutdown()


def read_data(key: str):
    session, cluster = get_cassandra_session()
    try:
        rows = session.execute("SELECT * FROM store WHERE key=%s", (key,))
        row = rows.one()
        if not row:
            raise Exception(f"Key '{key}' not found")
        return {"key": row.key, "value": row.value}
    finally:
        cluster.shutdown()


def delete_data(key: str):
    session, cluster = get_cassandra_session()
    try:
        session.execute("DELETE FROM store WHERE key=%s", (key,))
        return {"message": "Deleted", "key": key}
    finally:
        cluster.shutdown()