from fastapi import FastAPI, HTTPException, File, Form
from pydantic import BaseModel
import hashlib
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
import csv
import io

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

class CsvImportRow(BaseModel):
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


# ---------- CSV IMPORT ----------

@app.post("/data/import_csv")
async def import_csv(
    file: UploadFile = File(...),
    has_header: bool = Form(True),
    column_names: str = Form(""),   # e.g. "ID;firstname;lastname;status"
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="CSV file is required")

    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to decode CSV as UTF-8")

    lines = [ln for ln in decoded.splitlines() if ln.strip() != ""]
    if not lines:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    first_line = lines[0]
    delimiter = ";"
    if "," in first_line and ";" not in first_line:
        delimiter = ","
    elif "," in first_line and ";" in first_line:
        delimiter = ","

    reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
    all_rows = [row for row in reader if row and not all(c.strip() == "" for c in row)]

    if not all_rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    # Resolve header column names
    if has_header:
        header_cols = [c.strip() for c in all_rows[0]]
        data_rows = all_rows[1:]
    else:
        data_rows = all_rows
        if column_names.strip():
            sep = ";" if ";" in column_names else ","
            header_cols = [c.strip() for c in column_names.split(sep)]
        else:
            # Auto-generate from width of first data row
            width = len(data_rows[0]) if data_rows else 1
            header_cols = [f"col{i + 1}" for i in range(width)]

    rows: list[CsvImportRow] = []
    skipped = 0
    for row in data_rows:
        c0 = row[0].strip() if row else ""
        if not c0:
            skipped += 1
            continue
        rest = [c.strip() for c in row[1:]]
        rows.append(CsvImportRow(key=c0, value=delimiter.join(rest)))

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    table_name = (file.filename or "ImportedTable").rsplit(".", 1)[0] or "ImportedTable"
    table_rows: dict[str, dict[str, str]] = {}
    nodes_touched: dict[str, int] = {}

    for r in rows:
        nodes = get_node_for_key(r.key)
        for n in nodes:
            if n not in cluster:
                continue
            cluster[n].append({"key": r.key, "value": r.value})
            nodes_touched[n] = nodes_touched.get(n, 0) + 1

        row_id = f"row{r.key}" if r.key.isdigit() else r.key
        rest_cols = r.value.split(delimiter) if r.value else []

        key_col_name = header_cols[0] if header_cols else "key"
        row_obj: dict[str, str] = {key_col_name: r.key}
        for idx, col_val in enumerate(rest_cols):
            col_name = header_cols[idx + 1] if (idx + 1) < len(header_cols) else f"col{idx + 1}"
            row_obj[col_name] = col_val

        table_rows[row_id] = row_obj

    return {
        "message": "CSV imported",
        "rows_imported": len(rows),
        "rows_skipped": skipped,
        "replicated_counts_per_node": nodes_touched,
        "table": {table_name: table_rows},
    }

# ---------- ROOT ----------

@app.get("/")
def root():
    return {"message": "Backend running"}
