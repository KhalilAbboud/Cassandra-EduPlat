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