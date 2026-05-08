from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import csv
import io

router = APIRouter(prefix="/data", tags=["Data"])

@router.post("/import_csv")
async def import_csv(
    file: UploadFile = File(...),
    has_header: bool = Form(True),
    column_names: str = Form(""),
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

    for row in data_rows:
        c0 = row[0].strip() if row else ""
        if not c0:
            skipped += 1
            continue
        row_id = f"row{c0}" if c0.isdigit() else c0
        row_obj = {}
        for idx, col_val in enumerate(row):
            col_name = header_cols[idx] if idx < len(header_cols) else f"col{idx+1}"
            row_obj[col_name] = col_val.strip()
        table_rows[row_id] = row_obj

    return {
        "message": "CSV imported",
        "rows_imported": len(table_rows),
        "rows_skipped": skipped,
        "table": {table_name: table_rows},
    }