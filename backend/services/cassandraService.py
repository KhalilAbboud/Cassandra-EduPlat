from cassandra.cluster import Cluster
from cassandra.policies import DCAwareRoundRobinPolicy
from cassandra.query import SimpleStatement
from cassandra import ConsistencyLevel
from services.dockerService import client
from cassandra import Unavailable
from cassandra.cluster import NoHostAvailable
from fastapi import HTTPException
import uuid

CONSISTENCY_MAP = {
    "ONE":    ConsistencyLevel.ONE,
    "QUORUM": ConsistencyLevel.QUORUM,
    "ALL":    ConsistencyLevel.ALL,
}

def get_session(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    all_containers = client.containers.list(all=True)

    contact_points = []
    for c in all_containers:
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks and c.status == "running":
            ports = c.attrs.get("NetworkSettings", {}).get("Ports", {})
            host_port_info = ports.get("9042/tcp")
            if host_port_info:
                hp = int(host_port_info[0]["HostPort"])
                contact_points.append(hp)

    if not contact_points:
        raise Exception(f"No running nodes found for cluster '{cluster_name}'")

    first_port = contact_points[0]
    print(f"Connecting to {cluster_name} via 127.0.0.1:{first_port}")

    cluster = Cluster(
        contact_points=["127.0.0.1"],
        port=first_port,
        load_balancing_policy=DCAwareRoundRobinPolicy(local_dc="datacenter1"),
        protocol_version=5,
        connect_timeout=30,
    )
    session = cluster.connect()
    session.default_timeout = 30
    return session


def create_keyspace(cluster_name, keyspace_name, replication_factor=1, strategy="SimpleStrategy"):
    session = get_session(cluster_name)
    if strategy == "SimpleStrategy":
        cql = f"""
            CREATE KEYSPACE IF NOT EXISTS {keyspace_name}
            WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': {replication_factor}}}
        """
    else:
        cql = f"""
            CREATE KEYSPACE IF NOT EXISTS {keyspace_name}
            WITH replication = {{'class': 'NetworkTopologyStrategy', 'datacenter1': {replication_factor}}}
        """
    session.execute(cql)
    print(f"Keyspace '{keyspace_name}' created")
    return {"keyspace": keyspace_name, "strategy": strategy, "replication_factor": replication_factor}


def list_keyspaces(cluster_name: str):
    session = get_session(cluster_name)
    rows = session.execute("SELECT keyspace_name FROM system_schema.keyspaces")
    system_keyspaces = {"system", "system_auth", "system_distributed", "system_schema", "system_traces"}
    return [row.keyspace_name for row in rows if row.keyspace_name not in system_keyspaces]


def create_table(cluster_name, keyspace_name, table_name, columns, partition_key, clustering_key=[]):
    session = get_session(cluster_name)
    columns_cql = ", ".join(f"{col} {dtype}" for col, dtype in columns.items())
    partition = f"({', '.join(partition_key)})" if len(partition_key) > 1 else partition_key[0]
    if clustering_key:
        primary_key = f"PRIMARY KEY ({partition}, {', '.join(clustering_key)})"
    else:
        primary_key = f"PRIMARY KEY ({partition})"
    cql = f"""
        CREATE TABLE IF NOT EXISTS {keyspace_name}.{table_name} (
            {columns_cql},
            {primary_key}
        )
    """
    session.execute(cql)
    print(f"Table '{keyspace_name}.{table_name}' created")
    return {"keyspace": keyspace_name, "table": table_name, "columns": columns,
            "partition_key": partition_key, "clustering_key": clustering_key}


def list_tables(cluster_name: str, keyspace_name: str):
    session = get_session(cluster_name)
    rows = session.execute(
        "SELECT table_name FROM system_schema.tables WHERE keyspace_name = %s",
        [keyspace_name]
    )
    return [row.table_name for row in rows]


def insert_data(cluster_name, keyspace_name, table_name, data, write_consistency="QUORUM"):
    try:
        session = get_session(cluster_name)
        consistency = CONSISTENCY_MAP.get(write_consistency, ConsistencyLevel.QUORUM)

        processed_data = {}
        for k, v in data.items():
            processed_data[k] = uuid.uuid4() if v == "uuid()" else v

        columns = ", ".join(processed_data.keys())
        placeholders = ", ".join(["%s"] * len(processed_data))
        values = list(processed_data.values())

        cql = f"INSERT INTO {keyspace_name}.{table_name} ({columns}) VALUES ({placeholders})"
        statement = SimpleStatement(cql, consistency_level=consistency)
        session.execute(statement, values)

        print(f"Inserted into '{keyspace_name}.{table_name}' with consistency {write_consistency}")
        return {"inserted": {k: str(v) for k, v in processed_data.items()}, "consistency": write_consistency}

    except Unavailable as e:
        raise HTTPException(status_code=503, detail={
            "error": "Consistency level not achievable",
            "consistency_requested": write_consistency,
            "required_replicas": e.required_replicas,
            "alive_replicas": e.alive_replicas,
            "tip": "Try a lower consistency level or ensure enough nodes are UP"
        })
    except NoHostAvailable as e:
        for host, exc in e.errors.items():
            if isinstance(exc, Unavailable):
                raise HTTPException(status_code=503, detail={
                    "error": "Consistency level not achievable",
                    "consistency_requested": write_consistency,
                    "required_replicas": exc.required_replicas,
                    "alive_replicas": exc.alive_replicas,
                    "reason": "Replication factor too low or not enough nodes UP",
                    "tip": "Increase replication_factor or use a lower consistency level"
                })
        raise HTTPException(status_code=503, detail={"error": "No hosts available", "details": str(e)})


def select_data(cluster_name, keyspace_name, table_name, filters={}, read_consistency="QUORUM"):
    try:
        session = get_session(cluster_name)
        consistency = CONSISTENCY_MAP.get(read_consistency, ConsistencyLevel.QUORUM)

        cql = f"SELECT * FROM {keyspace_name}.{table_name}"
        values = []
        if filters:
            where_clause = " AND ".join(f"{col} = %s" for col in filters.keys())
            cql += f" WHERE {where_clause}"
            values = list(filters.values())

        statement = SimpleStatement(cql, consistency_level=consistency)
        rows = session.execute(statement, values)

        result = [dict(row._asdict()) for row in rows]
        print(f"Read {len(result)} rows from '{keyspace_name}.{table_name}' with consistency {read_consistency}")
        return result

    except Unavailable as e:
        raise HTTPException(status_code=503, detail={
            "error": "Consistency level not achievable",
            "consistency_requested": read_consistency,
            "required_replicas": e.required_replicas,
            "alive_replicas": e.alive_replicas,
            "reason": "Replication factor too low or not enough nodes UP",
            "tip": "Increase replication_factor or use a lower consistency level"
        })
    except NoHostAvailable as e:
        for host, exc in e.errors.items():
            if isinstance(exc, Unavailable):
                raise HTTPException(status_code=503, detail={
                    "error": "Consistency level not achievable",
                    "consistency_requested": read_consistency,
                    "required_replicas": exc.required_replicas,
                    "alive_replicas": exc.alive_replicas,
                    "reason": "Replication factor too low or not enough nodes UP",
                    "tip": "Increase replication_factor or use a lower consistency level"
                })
        raise HTTPException(status_code=503, detail={"error": "No hosts available", "details": str(e)})