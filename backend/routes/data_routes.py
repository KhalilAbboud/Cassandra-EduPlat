from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.data_service import write_data, read_data, delete_data
from pydantic import BaseModel
import csv, io

router = APIRouter(prefix="/data", tags=["Data"])

class DataItem(BaseModel):
    key: str
    value: str

# most of these are CSV related methods, write, read and delete, which interact with the database inside the containers
# so far only csv is supported "duh"
@router.post("/write")
def write_data_route(item: DataItem):
    try:
        return write_data(item.key, item.value)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/read/{key}")
def read_data_route(key: str):
    try:
        return read_data(key)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/{key}")
def delete_data_route(key: str):
    try:
        return delete_data(key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# this is the import method, which is used to import data from a CSV file into the database
# basically you can import a CSV file into the database and it will be replicated across the cluster
# it uses our internal simulation logic to determine where to replicate the data, in a real cassandra cluster
# idk see if you wanna change it or not, it works cuz data is in the docker volumes, altought the replication factor is fixed here
# the frontend dev should implement a way to manually select the RF upon importing the CSV

@router.post("/import_csv")
async def import_csv(
    file: UploadFile = File(...),
    has_header: bool = Form(True),
    column_names: str = Form(""),
    partition_key: str = Form(""),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="CSV file is required")

    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to decode CSV as UTF-8")

    lines = [ln for ln in decoded.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Empty CSV")

    first_line = lines[0]
    delimiter = ";" if (";" in first_line and "," not in first_line) else ","

    reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
    all_rows = [r for r in reader if r and not all(c.strip() == "" for c in r)]

    if not all_rows:
        raise HTTPException(status_code=400, detail="No valid rows found")

    if has_header:
        header_cols = [c.strip() for c in all_rows[0]]
        data_rows = all_rows[1:]
    else:
        data_rows = all_rows
        if column_names.strip():
            sep = ";" if ";" in column_names else ","
            header_cols = [c.strip() for c in column_names.split(sep)]
        else:
            header_cols = [f"col{i+1}" for i in range(len(data_rows[0]))]

    table_name = (file.filename or "ImportedTable").rsplit(".", 1)[0]
    table_rows = {}
    skipped = 0

    pk_index = 0
    if partition_key and partition_key in header_cols:
        pk_index = header_cols.index(partition_key)

    for row in data_rows:
        pk_value = row[pk_index].strip() if len(row) > pk_index else ""
        if not pk_value:
            skipped += 1
            continue
        row_id = pk_value  # ← was f"row{c0}" — now just the raw value of the partition key e.g. "2"
        row_obj = {}
        for idx, col_val in enumerate(row):
            col_name = header_cols[idx] if idx < len(header_cols) else f"col{idx+1}"
            row_obj[col_name] = col_val.strip()
        table_rows[row_id] = row_obj
    
    write_errors = []
    for row_id, row_obj in table_rows.items():
        try:
            import json
            write_data(str(row_id), json.dumps(row_obj, ensure_ascii=False))
        except Exception as e:
            write_errors.append(f"ERROR writing row {row_id}: {str(e)}")

    return {
        "message": "CSV imported",
        "rows_imported": len(table_rows),
        "rows_skipped": skipped,
        "write_errors": write_errors,
        "table": {table_name: table_rows},
    }