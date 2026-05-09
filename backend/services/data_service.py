from cassandra.cluster import Cluster
from cassandra.policies import RoundRobinPolicy
from services.dockerService import get_nodes_in_network, NETWORK_NAME
from services.node_service import EXCLUDED

def get_cassandra_session():
    """Connect to the Cassandra cluster via any live node's IP."""
    containers = [c for c in get_nodes_in_network() if c.name not in EXCLUDED]
    if not containers:
        raise Exception("No Cassandra nodes available")

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

    cluster = Cluster(ips, load_balancing_policy=RoundRobinPolicy(), protocol_version=5)
    session = cluster.connect()

    # Ensure keyspace and table exist
    session.execute("""
        CREATE KEYSPACE IF NOT EXISTS edu
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    """)
    session.set_keyspace("edu")
    session.execute("""
        CREATE TABLE IF NOT EXISTS store (
            key text PRIMARY KEY,
            value text
        )
    """)
    return session, cluster


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