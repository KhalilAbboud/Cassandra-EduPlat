from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import hashlib
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cluster
cluster = {}
def get_replication_factor():
    return min(2, len(cluster))

class Node(BaseModel):
    id: str

class DataItem(BaseModel):
    key: str
    value: str


# ---------- NODE MANAGEMENT ----------

@app.post("/node/add")
def add_node(node: Node):
    if node.id not in cluster:
        cluster[node.id] = []
    return {"message": f"Node {node.id} added"}


@app.delete("/node/remove/{node_id}")
def remove_node(node_id: str):
    cluster.pop(node_id, None)
    return {"message": f"Node {node_id} removed"}

@app.get("/nodes/{node_id}")
def node_health(node_id: str):
    if node_id in cluster:
        return {"status": "healthy"}

    raise HTTPException(status_code=404, detail="Node not found")
    
@app.get("/nodes/status")
def cluster_status():
    return {node: "healthy" for node in cluster.keys()}


@app.get("/cluster")
def get_cluster():
    return cluster


# ---------- PARTITIONING ----------

def get_node_for_key(key: str):
    if not cluster:
        return []

    nodes = sorted(cluster.keys())
    h = int(hashlib.md5(key.encode()).hexdigest(), 16)
    idx = h % len(nodes)

    replication_factor = get_replication_factor()

    selected = []
    for i in range(replication_factor):
        selected.append(nodes[(idx + i) % len(nodes)])

    return selected


# ---------- DATA ----------

@app.post("/data/write")
def write_data(item: DataItem):
    nodes = get_node_for_key(item.key)

    for n in nodes:
        if n not in cluster:
            continue
        cluster[n].append({
            "key": item.key,
            "value": item.value
        })

    return {"replicated_to": nodes}


@app.get("/data/read/{key}")
def read_data(key: str):
    nodes = get_node_for_key(key)
    results = []

    for n in nodes:
        found_value = None

        for item in cluster[n]:
            if item["key"] == key:
                found_value = item["value"]
                break

        results.append({
            "node": n,
            "key": key,
            "status": "found" if found_value else "not found",
            "value": found_value
        })

    return results

@app.delete("/data/{key}")
def delete_data(key: str):
    nodes = get_node_for_key(key)

    for n in nodes:
        if n in cluster:
            cluster[n] = [item for item in cluster[n] if item["key"] != key]

    return {"message": "Data deleted", "replicated_from": nodes}


# ---------- ROOT ----------

@app.get("/")
def root():
    return {"message": "Backend running"}