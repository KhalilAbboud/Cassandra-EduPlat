const API_BASE = "/api/v1";

// ─── Constantes par défaut ───────────────────────────────────────────
const CLUSTER   = "TestCluster";
const KEYSPACE  = "edu_keyspace";
const TABLE     = "edu_table";

// ─── Nodes ───────────────────────────────────────────────────────────

export async function addNode(name) {
  const res = await fetch(`${API_BASE}/nodes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cluster_name: CLUSTER }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `addNode failed (${res.status})`);
  }
  return res.json();
}

export async function removeNode(nodeName) {
  const res = await fetch(`${API_BASE}/nodes/${CLUSTER}/${nodeName}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `removeNode failed (${res.status})`);
  }
  return res.json();
}

export async function stopNode(nodeName) {
  const res = await fetch(`${API_BASE}/nodes/${CLUSTER}/${nodeName}/stop`, {
    method: "PUT",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `stopNode failed (${res.status})`);
  }
  return res.json();
}

export async function startNode(nodeName) {
  const res = await fetch(`${API_BASE}/nodes/${CLUSTER}/${nodeName}/start`, {
    method: "PUT",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `startNode failed (${res.status})`);
  }
  return res.json();
}

export async function getCluster() {
  const res = await fetch(`${API_BASE}/nodes/${CLUSTER}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `getCluster failed (${res.status})`);
  }
  return res.json();
}

export async function getClusterStatus() {
  const res = await fetch(`${API_BASE}/cluster/${CLUSTER}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `getClusterStatus failed (${res.status})`);
  }
  return res.json();
}

export async function createCluster(nodeNames, partitioner = "Murmur3Partitioner") {
  const res = await fetch(`${API_BASE}/cluster/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cluster_name: CLUSTER, nodes: nodeNames, partitioner }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `createCluster failed (${res.status})`);
  }
  return res.json();
}

export async function deleteCluster() {
  const res = await fetch(`${API_BASE}/cluster/${CLUSTER}/delete`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `deleteCluster failed (${res.status})`);
  }
  return res.json();
}

export async function changePartitioner(partitioner) {
  const res = await fetch(`${API_BASE}/cluster/${CLUSTER}/change-partitioner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partitioner }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `changePartitioner failed (${res.status})`);
  }
  return res.json();
}

// ─── Keyspace & Table (setup initial) ───────────────────────────────

export async function createKeyspace(replicationFactor = 1, strategy = "SimpleStrategy") {
  const res = await fetch(`${API_BASE}/data/${CLUSTER}/keyspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyspace_name: KEYSPACE, replication_factor: replicationFactor, strategy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `createKeyspace failed (${res.status})`);
  }
  return res.json();
}

export async function createTable(columns, partitionKey) {
  const res = await fetch(`${API_BASE}/data/${CLUSTER}/${KEYSPACE}/table`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      table_name: TABLE,
      columns,
      partition_key: partitionKey,
      clustering_key: [],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `createTable failed (${res.status})`);
  }
  return res.json();
}

// ─── Data ────────────────────────────────────────────────────────────

export async function writeData(data, consistency = "QUORUM") {
  const res = await fetch(`${API_BASE}/data/${CLUSTER}/${KEYSPACE}/${TABLE}/insert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, write_consistency: consistency }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `writeData failed (${res.status})`);
  }
  return res.json();
}

export async function readData(filters = {}, consistency = "QUORUM") {
  const res = await fetch(`${API_BASE}/data/${CLUSTER}/${KEYSPACE}/${TABLE}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, read_consistency: consistency }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `readData failed (${res.status})`);
  }
  return res.json();
}

// ─── Token & Partitioning ────────────────────────────────────────────

export async function getTokenRing() {
  const res = await fetch(`${API_BASE}/token/${CLUSTER}/ring`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `getTokenRing failed (${res.status})`);
  }
  return res.json();
}

export async function getDistribution() {
  const res = await fetch(`${API_BASE}/token/${CLUSTER}/distribution`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `getDistribution failed (${res.status})`);
  }
  return res.json();
}

export async function getEndpoints(partitionKey) {
  const res = await fetch(`${API_BASE}/token/${CLUSTER}/${KEYSPACE}/${TABLE}/endpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partition_key: partitionKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `getEndpoints failed (${res.status})`);
  }
  return res.json();
}

export async function explainPartition(partitionKey) {
  const res = await fetch(`${API_BASE}/token/${CLUSTER}/${KEYSPACE}/${TABLE}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partition_key: partitionKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `explainPartition failed (${res.status})`);
  }
  return res.json();
}