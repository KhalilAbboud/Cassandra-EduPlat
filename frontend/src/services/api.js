const API_BASE = "http://localhost:8000";

// Nodes api calls
export async function addNode(id) {
  const res = await fetch(`${API_BASE}/node/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

export async function removeNode(id) {
  const res = await fetch(`${API_BASE}/node/remove/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function getNodeHealth(nodeId) {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}`);
  return res.json();
}

export async function getCluster() {
  const res = await fetch(`${API_BASE}/cluster`);
  return res.json();
}

export async function getClusterStatus() {
  const res = await fetch(`${API_BASE}/nodes/status`);
  return res.json();
}



// Data api calls
export async function writeData(key, value) {
  const res = await fetch(`${API_BASE}/data/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return res.json();
}

export async function readData(key) {
  const res = await fetch(`${API_BASE}/data/read/${key}`);
  return res.json();
}

export async function deleteData(key) {
  const res = await fetch(`${API_BASE}/data/${key}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function importCsv(file, hasHeader = true, columnNames = "") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("has_header", String(hasHeader));
  formData.append("column_names", columnNames);

  const res = await fetch(`${API_BASE}/data/import_csv`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let detail = null;
    try {
      const data = await res.json();
      detail = data?.detail ?? null;
    } catch { /* ignore */ }
    throw new Error(detail ? `CSV import failed: ${detail}` : "CSV import failed");
  }

  return res.json();
}
