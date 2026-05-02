from fastapi import FastAPI
from pydantic import BaseModel
import hashlib

app = FastAPI()

# In-memory cluster simulation
cluster = {}
replication_factor = 2

class Node(BaseModel):
    id: str

class DataItem(BaseModel):
    key: str
    value: str

@app.post("/node/add")
def add_node(node: Node):
    cluster[node.id] = []
    return {"message": f"Node {node.id} added"}

@app.delete("/node/remove/{node_id}")
def remove_node(node_id: str):
    if node_id in cluster:
        del cluster[node_id]
        return {"message": f"Node {node_id} removed"}
    return {"error": "Node not found"}

@app.get("/cluster")
def get_cluster():
    return cluster

# Simple hash-based partitioning

def get_node_for_key(key: str):
    if not cluster:
        return []
    nodes = sorted(cluster.keys())
    h = int(hashlib.md5(key.encode()).hexdigest(), 16)
    idx = h % len(nodes)
    selected = []
    for i in range(replication_factor):
        selected.append(nodes[(idx + i) % len(nodes)])
    return selected

@app.post("/data/write")
def write_data(item: DataItem):
    nodes = get_node_for_key(item.key)
    for n in nodes:
        cluster[n].append({"key": item.key, "value": item.value})
    return {"replicated_to": nodes}

@app.get("/data/read/{key}")
def read_data(key: str):
    nodes = get_node_for_key(key)
    results = []
    for n in nodes:
        for item in cluster[n]:
            if item["key"] == key:
                results.append({"node": n, "value": item["value"]})
    return results