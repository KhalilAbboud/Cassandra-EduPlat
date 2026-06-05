from fastapi import APIRouter, HTTPException
from models.token import (
    EndpointsRequest, EndpointsResponse,
    RingResponse, DistributionResponse,
    BatchHashesRequest
)
from services.tokenService import get_endpoints, get_token_ring, get_data_distribution, explain_partition
import mmh3
from services.dockerService import client

router = APIRouter(prefix="/token", tags=["Token & Partitioning"])


@router.post("/{cluster_name}/{keyspace}/{table}/endpoints", response_model=EndpointsResponse)
def endpoints(cluster_name: str, keyspace: str, table: str, body: EndpointsRequest):
    try:
        nodes = get_endpoints(cluster_name, keyspace, table, body.partition_key)
        return EndpointsResponse(
            keyspace=keyspace, table=table,
            partition_key=body.partition_key, endpoints=nodes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_name}/ring", response_model=RingResponse)
def ring(cluster_name: str):
    try:
        nodes = get_token_ring(cluster_name)
        return RingResponse(cluster_name=cluster_name, nodes=nodes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_name}/distribution", response_model=DistributionResponse)
def distribution(cluster_name: str):
    try:
        nodes = get_data_distribution(cluster_name)
        return DistributionResponse(cluster_name=cluster_name, nodes=nodes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_name}/{keyspace}/{table}/explain")
def explain(cluster_name: str, keyspace: str, table: str, body: EndpointsRequest):
    try:
        result = explain_partition(cluster_name, keyspace, table, body.partition_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hashes")
def batch_hashes(body: BatchHashesRequest):
    try:
        result = {}
        for k in body.keys:
            if body.hashing_type == "md5":
                import hashlib
                md5_digest = hashlib.md5(k.encode("utf-8")).hexdigest()
                result[k] = str(int(md5_digest, 16))
            elif body.hashing_type == "fnv1a":
                # Match frontend FNV1a logic (scaled to Murmur3 range)
                h = 0x811c9dc5
                for char in k:
                    h ^= ord(char)
                    h = (h * 0x01000193) % 0x100000000
                MURMUR3_MIN = -9223372036854775808
                MURMUR3_RANGE = 18446744073709551616
                scaled = int((h * (MURMUR3_RANGE / 0x100000000)) + MURMUR3_MIN)
                result[k] = str(scaled)
            elif body.hashing_type == "xxhash":
                # Mock xxHash using python hash (just for simulation purposes since xxhash library isn't installed)
                # Keep it deterministic using hashlib md5 but scaled differently
                import hashlib
                digest = int(hashlib.md5(k.encode("utf-8")).hexdigest()[:16], 16)
                MURMUR3_MIN = -9223372036854775808
                result[k] = str(digest + MURMUR3_MIN)
            else:
                # Default: Murmur3Partitioner (signed 64-bit)
                result[k] = str(mmh3.hash64(k, signed=True)[0])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Gossip ──────────────────────────────────────────────────────────

def _get_running_container(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    for c in client.containers.list():
        c.reload()
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {}) and c.status == "running":
            return c
    raise Exception(f"No running container found for cluster '{cluster_name}'")


def _parse_gossipinfo(output: str) -> list:
    """
    Parse nodetool gossipinfo output.
    Each block starts with /ip and contains key:value lines.
    Returns list of dicts with ip, status, generation, heartbeat, load, dc, rack.
    """
    nodes = []
    current = None
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("/"):
            if current:
                nodes.append(current)
            current = {"ip": line.lstrip("/"), "status": "UNKNOWN", "generation": 0, "heartbeat": 0, "load": "?", "dc": "?", "rack": "?"}
        elif current and ":" in line:
            key, _, val = line.partition(":")
            key = key.strip().upper()
            val = val.strip()
            if key == "STATUS":
                # Format: "STATUS:version:NORMAL,token" or "NORMAL,..."
                parts = val.split(",")
                status_raw = parts[0].split(":")[-1].strip()
                current["status"] = status_raw
            elif key == "GENERATION":
                try: current["generation"] = int(val.split(":")[-1].strip())
                except: pass
            elif key == "HEARTBEAT":
                try: current["heartbeat"] = int(val.split(":")[-1].strip())
                except: pass
            elif "LOAD" in key:
                current["load"] = val.split(":")[-1].strip()
            elif key == "DC":
                current["dc"] = val.split(":")[-1].strip()
            elif key == "RACK":
                current["rack"] = val.split(":")[-1].strip()
    if current:
        nodes.append(current)
    return nodes


def _build_ip_to_name(cluster_name: str) -> dict:
    network_name = f"cassandra-net-{cluster_name}"
    mapping = {}
    for c in client.containers.list(all=True):
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks:
            ip = networks[network_name].get("IPAddress", "")
            if ip:
                mapping[ip] = c.name
    return mapping


@router.get("/{cluster_name}/gossip")
def gossip(cluster_name: str):
    """
    Retourne les données gossip réelles via nodetool gossipinfo.
    Chaque entrée contient: ip, node_name, status, generation, heartbeat, load, dc, rack.
    """
    try:
        container = _get_running_container(cluster_name)
        result = container.exec_run("nodetool gossipinfo")
        if result.exit_code != 0:
            raise Exception(f"nodetool gossipinfo failed: {result.output.decode()}")
        output = result.output.decode()
        nodes = _parse_gossipinfo(output)
        ip_to_name = _build_ip_to_name(cluster_name)
        for node in nodes:
            node["node_name"] = ip_to_name.get(node["ip"], node["ip"])
        return {"cluster_name": cluster_name, "nodes": nodes}
    except Exception as e:
        if "No running container found" in str(e):
            return {"cluster_name": cluster_name, "nodes": []}
        raise HTTPException(status_code=500, detail=str(e))