const API_BASE = "http://localhost:8000/api/v1";

export async function addNode(name) {
  const res = await fetch(`${API_BASE}/nodes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cluster_name: "TestCluster" }),
  });
  return res.json();
}

export async function removeNode(id) {
  const res = await fetch(`${API_BASE}/nodes/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function getNodeHealth(nodeId) {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}`);
  return res.json();
}

export async function getCluster() {
  const res = await fetch(`${API_BASE}/nodes/`);
  return res.json();
}

export async function getClusterStatus() {
  const res = await fetch(`${API_BASE}/cluster/status`);
  return res.json();
}

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

  let data;
  try { data = await res.json(); } catch {
    throw new Error("CSV import failed: invalid server response");
  }

  if (!res.ok) {
    throw new Error(data?.detail ? `CSV import failed: ${data.detail}` : "CSV import failed");
  }

  return data;
}