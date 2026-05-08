import json
import os
from datetime import datetime

REGISTRY_PATH = "cluster_registry.json"

def write_registry(data: dict):
    with open(REGISTRY_PATH, "w") as f:
        json.dump(data, f, indent=2)

def read_registry() -> dict:
    if not os.path.exists(REGISTRY_PATH):
        return {}
    with open(REGISTRY_PATH, "r") as f:
        content = f.read().strip()
        if not content:
            return {}
        return json.loads(content)

def add_cluster(cluster_name: str, partitioner: str, nodes: list[str]):
    registry = read_registry()
    registry[cluster_name] = {
        "cluster_name": cluster_name,
        "partitioner": partitioner,
        "nodes": nodes,
        "created_at": datetime.now().isoformat()
    }
    write_registry(registry)
    print(f"Cluster '{cluster_name}' saved to registry")

def remove_cluster(cluster_name: str):
    registry = read_registry()
    if cluster_name in registry:
        del registry[cluster_name]
        write_registry(registry)
        print(f"Cluster '{cluster_name}' removed from registry")

def get_cluster(cluster_name: str) -> dict | None:
    registry = read_registry()
    return registry.get(cluster_name, None)
