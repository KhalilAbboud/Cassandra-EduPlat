const API_BASE = "/api/v1";

function extractError(err, fallback) {
  const detail = err?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  const msg = detail.error ?? detail.message ?? JSON.stringify(detail);
  const tip = detail.tip ? ` — ${detail.tip}` : "";
  return msg + tip;
}

// ─── Nodes ───────────────────────────────────────────────────────────

export async function addNode(name, clusterName = "TestCluster", initial_token = null) {
  const res = await fetch(`${API_BASE}/nodes/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cluster_name: clusterName, initial_token }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `addNode failed (${res.status})`)); }
  return res.json();
}

export async function removeNode(nodeName, clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/nodes/${clusterName}/${nodeName}`, { method: "DELETE" });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `removeNode failed (${res.status})`)); }
  return res.json();
}

export async function stopNode(nodeName, clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/nodes/${clusterName}/${nodeName}/stop`, { method: "PUT" });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `stopNode failed (${res.status})`)); }
  return res.json();
}

export async function startNode(nodeName, clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/nodes/${clusterName}/${nodeName}/start`, { method: "PUT" });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `startNode failed (${res.status})`)); }
  return res.json();
}

export async function getCluster(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/nodes/${clusterName}`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getCluster failed (${res.status})`)); }
  return res.json();
}

// ─── Cluster ─────────────────────────────────────────────────────────

export async function getClusterStatus(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/cluster/${clusterName}/status`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getClusterStatus failed (${res.status})`)); }
  return res.json();
}

export async function createCluster(nodeNames, partitioner = "Murmur3Partitioner", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/cluster/create`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cluster_name: clusterName, nodes: nodeNames, partitioner }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `createCluster failed (${res.status})`)); }
  return res.json();
}

export async function deleteCluster(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/cluster/${clusterName}/delete`, { method: "DELETE" });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `deleteCluster failed (${res.status})`)); }
  return res.json();
}

export async function changePartitioner(partitioner, clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/cluster/${clusterName}/change-partitioner`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partitioner }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `changePartitioner failed (${res.status})`)); }
  return res.json();
}

// ─── Keyspace & Table ────────────────────────────────────────────────

export async function createKeyspace(replicationFactor = 1, strategy = "SimpleStrategy", keyspaceName = "edu_keyspace", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/data/${clusterName}/keyspace`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyspace_name: keyspaceName, replication_factor: replicationFactor, strategy }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `createKeyspace failed (${res.status})`)); }
  return res.json();
}

export async function createTable(columns, partitionKey, tableName = "edu_table", keyspaceName = "edu_keyspace", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/data/${clusterName}/${keyspaceName}/table`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table_name: tableName, columns, partition_key: partitionKey, clustering_key: [] }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `createTable failed (${res.status})`)); }
  return res.json();
}

// ─── Data ────────────────────────────────────────────────────────────

export async function writeData(data, consistency = "QUORUM", keyspaceName = "edu_keyspace", tableName = "edu_table", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/data/${clusterName}/${keyspaceName}/${tableName}/insert`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, write_consistency: consistency }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `writeData failed (${res.status})`)); }
  return res.json();
}

export async function readData(filters = {}, consistency = "QUORUM", keyspaceName = "edu_keyspace", tableName = "edu_table", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/data/${clusterName}/${keyspaceName}/${tableName}/select`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, read_consistency: consistency }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `readData failed (${res.status})`)); }
  return res.json();
}

// ─── Token & Partitioning ────────────────────────────────────────────

export async function getTokenRing(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/token/${clusterName}/ring`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getTokenRing failed (${res.status})`)); }
  return res.json();
}

export async function getDistribution(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/token/${clusterName}/distribution`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getDistribution failed (${res.status})`)); }
  return res.json();
}

export async function getEndpoints(partitionKey, keyspaceName = "edu_keyspace", tableName = "edu_table", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/token/${clusterName}/${keyspaceName}/${tableName}/endpoints`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partition_key: partitionKey }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getEndpoints failed (${res.status})`)); }
  return res.json();
}

export async function explainPartition(partitionKey, keyspaceName = "edu_keyspace", tableName = "edu_table", clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/token/${clusterName}/${keyspaceName}/${tableName}/explain`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partition_key: partitionKey }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `explainPartition failed (${res.status})`)); }
  return res.json();
}

export async function getGossip(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/token/${clusterName}/gossip`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getGossip failed (${res.status})`)); }
  return res.json();
}

// ─── Hinted Handoff ──────────────────────────────────────────────────
// Response: { hints: [{target_node, key, mutation_ts, coordinator}], raw_tpstats: string }

export async function getHints(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/repair/${clusterName}/hints`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getHints failed (${res.status})`)); }
  return res.json();
}

export async function getBatchHashes(keys) {
  const res = await fetch(`${API_BASE}/token/hashes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getBatchHashes failed (${res.status})`)); }
  return res.json();
}

// ─── Read Repair ─────────────────────────────────────────────────────
// Response: { repairs: [{key, stale_node, repaired_at}], total_read_repairs: number }

export async function getRepairStats(clusterName = "TestCluster") {
  const res = await fetch(`${API_BASE}/repair/${clusterName}/repair-stats`);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(extractError(err, `getRepairStats failed (${res.status})`)); }
  return res.json();
}