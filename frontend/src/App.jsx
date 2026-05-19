import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addNode, removeNode, writeData, readData,
  getCluster, getClusterStatus,
  deleteCluster, stopNode, startNode,
  createKeyspace, createTable,
  getTokenRing, getDistribution, getEndpoints, explainPartition
} from "./services/api";
import TokenRing from "./components/TokenRing";
import { simulatePlacement, checkConsistency } from "./utils/cassandraSimulation";
import "./App.css";

const NAME_POOL = ["NodeA", "NodeB", "NodeC", "NodeD", "NodeE", "NodeF"];

const BORDER = "1px solid rgba(255,255,255,0.07)";
const BG_CARD = "rgba(255,255,255,0.03)";
const ACCENT = "#20B2AA";

const card = { background: BG_CARD, border: BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
const h3 = { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, marginBottom: 8, fontWeight: 700, margin: "0 0 10px" };
const inp = { width: "100%", boxSizing: "border-box", marginBottom: 6 };
const btn = { width: "100%", marginBottom: 4 };
const lbl = { fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 3, display: "block" };

async function pollForTokens(nodeId, fetchClusterFn, { intervalMs = 1500, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timeout waiting for tokens on ${nodeId}`));
        return;
      }
      try {
        const arr = await fetchClusterFn();
        const found = Array.isArray(arr) ? arr.find(n => n.name === nodeId) : null;
        if (found && Array.isArray(found.tokens) && found.tokens.length > 0) {
          resolve(found);
        } else {
          setTimeout(tick, intervalMs);
        }
      } catch {
        setTimeout(tick, intervalMs);
      }
    };
    tick();
  });
}

function CollapseBtn({ open, onClick, side }) {
  return (
    <button
      onClick={onClick}
      title={open ? "Collapse" : "Expand"}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [side === "left" ? "right" : "left"]: -20,
        zIndex: 10,
        width: 32,
        height: 64,
        borderRadius: side === "left" ? "0 8px 8px 0" : "8px 0 0 8px",
        background: "#13132a",
        border: BORDER,
        [side === "left" ? "borderLeft" : "borderRight"]: "none",
        color: ACCENT,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        padding: 0,
        lineHeight: 1,
        transition: "background 0.2s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(32,178,170,0.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "#13132a"}
    >
      {side === "left" ? (open ? "◀" : "▶") : (open ? "▶" : "◀")}
    </button>
  );
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [leavingNodes, setLeavingNodes] = useState([]);
  const [clusterData, setClusterData] = useState({});
  const [nodeDataMap, setNodeDataMap] = useState({});

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [clusterStatus, setClusterStatus] = useState(null);
  const usedNamesRef = useRef(new Set());

  const [csvFile, setCsvFile] = useState(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState({});
  const [csvColumns, setCsvColumns] = useState([]);
  const [partitionKey, setPartitionKey] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvColumnNames, setCsvColumnNames] = useState("");
  const [csvDistribution, setCsvDistribution] = useState([]);

  const [replicationFactor, setReplicationFactor] = useState(2);
  const [consistencyLevel, setConsistencyLevel] = useState("QUORUM");
  const [simulationResult, setSimulationResult] = useState(null);
  const [consistencyResult, setConsistencyResult] = useState(null);
  const [output, setOutput] = useState(null);



  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const SIDEBAR_W = 270;

  const getNextName = useCallback(() => {
    return NAME_POOL.find((name) => !usedNamesRef.current.has(name)) ?? `Node${Date.now()}`;
  }, []);

  const replicatedCounts = useMemo(() => {
    const fromBackend = csvImportResult?.replicated_counts_per_node;
    if (fromBackend && Object.keys(fromBackend).length > 0) return fromBackend;
    const counts = {};
    csvDistribution.forEach(row => {
      row.replicas?.forEach(n => {
        counts[n.id] = (counts[n.id] ?? 0) + 1;
      });
    });
    return counts;
  }, [csvImportResult, csvDistribution]);

  const replicatedNodes = useMemo(() => Object.keys(replicatedCounts).sort(), [replicatedCounts]);
  const maxReplicated = useMemo(() => {
    const vals = Object.values(replicatedCounts);
    return vals.length ? Math.max(...vals) : 0;
  }, [replicatedCounts]);

  const fetchClusterRaw = useCallback(async () => {
    const arr = await getCluster();
    return arr;
  }, []);

  const fetchCluster = useCallback(async () => {
    try {
      const arr = await fetchClusterRaw();
      if (Array.isArray(arr)) {
        const dict = {};
        arr.forEach(n => { dict[n.name] = n; });
        setClusterData(dict);
      } else {
        setClusterData({});
      }
    } catch { /* ignore */ }
  }, [fetchClusterRaw]);

  const addToNodeDataMap = useCallback((k, v, currentNodes, rf) => {
    const placement = simulatePlacement({ key: k, nodes: currentNodes, replicationFactor: rf });
    if (!placement?.replicas?.length) return;
    setNodeDataMap(prev => {
      const next = { ...prev };
      placement.replicas.forEach(node => {
        const existing = next[node.id] ?? [];
        const filtered = existing.filter(item => item.key !== k);
        next[node.id] = [...filtered, { key: k, value: v }];
      });
      return next;
    });
  }, []);

  const handleAddNode = useCallback(async (token) => {
    const id = getNextName();
    if (usedNamesRef.current.has(id)) return;
    usedNamesRef.current.add(id);
    const stamp = Date.now();

    setNodes(prev => [...prev, { id, token, tokens: [], status: "joining", stamp }]);

    try {
      await addNode(id);
      const nodeInfo = await pollForTokens(id, fetchClusterRaw);
      setNodes(prev =>
        prev.map(n =>
          n.id === id && n.stamp === stamp
            ? { ...n, status: "up", tokens: nodeInfo.tokens, ip: nodeInfo.ip ?? "" }
            : n
        )
      );
      await fetchCluster();
    } catch (e) {
      setNodes(prev => prev.filter(n => !(n.id === id && n.stamp === stamp)));
      usedNamesRef.current.delete(id);
      console.error("addNode failed:", e.message);
      setOutput({ error: e.message });
    }
  }, [fetchCluster, fetchClusterRaw, getNextName]);

  const handleRemoveNode = useCallback(async (nodeId) => {
    const leavingNode = nodes.find(n => n.id === nodeId);
    if (leavingNode) {
      setLeavingNodes(prev => [...prev, { ...leavingNode, status: "leaving" }]);
    }
    usedNamesRef.current.delete(nodeId);
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setSimulationResult(null);
    setConsistencyResult(null);
    setTimeout(() => {
      setLeavingNodes(prev => prev.filter(n => n.id !== nodeId));
    }, 600);
    try {
      await removeNode(nodeId);
      await fetchCluster();
    } catch (e) {
      console.error("removeNode failed", e);
    }
  }, [fetchCluster, nodes]);

  const toggleNodeStatus = useCallback((nodeId) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: n.status === "up" ? "down" : "up" } : n));
  }, []);

  const runSimulation = useCallback(() => {
    if (!key) return;
    const result = simulatePlacement({ key, nodes, replicationFactor });
    setSimulationResult(result);
    if (result?.replicas)
      setConsistencyResult(checkConsistency({ replicas: result.replicas, consistencyLevel }));
  }, [key, nodes, replicationFactor, consistencyLevel]);

  const anyJoining = nodes.some(n => n.status === "joining");

  useEffect(() => {
    if (simulationResult?.replicas) {
      setConsistencyResult(checkConsistency({ replicas: simulationResult.replicas, consistencyLevel }));
    }
  }, [consistencyLevel, simulationResult]);

  const parseCsvMeta = useCallback((text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return null;
    const firstL = lines[0];
    const delim = firstL.includes(";") && !firstL.includes(",") ? ";" : ",";
    let headers, dataLines;
    if (csvHasHeader) {
      headers = firstL.split(delim).map(c => c.trim());
      dataLines = lines.slice(1);
    } else {
      dataLines = lines;
      if (csvColumnNames.trim()) {
        const sep = csvColumnNames.includes(";") ? ";" : ",";
        headers = csvColumnNames.split(sep).map(c => c.trim());
      } else {
        headers = Array.from({ length: lines[0].split(delim).length }, (_, i) => `col${i + 1}`);
      }
    }
    return { delim, headers, dataLines };
  }, [csvHasHeader, csvColumnNames]);

  const onFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0] ?? null;
    setCsvFile(file);
    setCsvError("");
    setCsvImportResult(null);
    setCsvPreviewRows({});
    setCsvDistribution([]);
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setCsvError("Fichier CSV vide."); return; }

    const firstL = lines[0];
    const delim = firstL.includes(";") && !firstL.includes(",") ? ";" : ",";
    const firstCells = firstL.split(delim).map(c => c.trim());
    const looksLikeHeader = firstCells.every(c => /^[a-zA-Z_][a-zA-Z0-9_ ]*$/.test(c));

    let headers, dataLines;
    if (looksLikeHeader) {
      setCsvHasHeader(true);
      headers = firstCells;
      dataLines = lines.slice(1);
    } else {
      setCsvHasHeader(false);
      headers = Array.from({ length: firstCells.length }, (_, i) => `col${i + 1}`);
      dataLines = lines;
    }

    setCsvColumns(headers);
    setPartitionKey(headers[0] ?? "");

    const tableName = file.name.replace(/\.csv$/i, "") || "ImportedTable";
    const preview = {};
    for (let i = 0; i < Math.min(dataLines.length, 12); i++) {
      const parts = dataLines[i].split(delim).map(c => c.trim());
      if (!parts[0]) continue;
      const rowId = /^\d+$/.test(parts[0]) ? `row${parts[0]}` : parts[0];
      const rowObj = {};
      headers.forEach((h, idx) => {
        if (parts[idx] !== undefined && parts[idx] !== "") rowObj[h] = parts[idx];
      });
      preview[rowId] = rowObj;
    }
    if (!Object.keys(preview).length) { setCsvError("Impossible de parser le CSV."); return; }
    setCsvPreviewRows({ [tableName]: preview });
  }, []);

  const onImportCsv = useCallback(async () => {
    if (!csvFile) { setCsvError("Choose a CSV file first."); return; }
    if (!partitionKey) { setCsvError("Choose a partition key."); return; }
    if (nodes.length === 0) { setCsvError("Add nodes to the ring first."); return; }
    setCsvError("");

    try {
      const text = await csvFile.text();
      const meta = parseCsvMeta(text);
      if (!meta) { setCsvError("CSV vide ou illisible."); return; }

      const { delim, headers, dataLines } = meta;
      const upNodes = nodes.filter(n => n.status === "up");
      const dist = [];
      const newNodeDataMap = {};
      let skipped = 0;

      dataLines.forEach((line, i) => {
        if (!line.trim()) return;
        const parts = line.split(delim).map(c => c.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = parts[idx] ?? ""; });
        const pval = row[partitionKey];
        if (!pval) { skipped++; return; }

        const placement = simulatePlacement({ key: String(pval), nodes, replicationFactor });
        dist.push({
          rowId: `row${i + 1}`,
          partitionValue: pval,
          hash: placement?.hash,
          primaryNode: placement?.primaryNode?.id,
          replicas: placement?.replicas ?? [],
          row,
        });

        const valueStr = JSON.stringify(row);
        placement?.replicas?.forEach(node => {
          const existing = newNodeDataMap[node.id] ?? [];
          const filtered = existing.filter(item => item.key !== String(pval));
          newNodeDataMap[node.id] = [...filtered, { key: String(pval), value: valueStr }];
        });
      });

      // Animation séquentielle : vide d'abord, puis ajoute un par un
      setCsvDistribution([]);
      setNodeDataMap({});

      const DELAY = Math.min(400, Math.max(150, Math.floor(4000 / Math.max(dist.length, 1))));

      for (let i = 0; i < dist.length; i++) {
        await new Promise(res => setTimeout(res, DELAY));
        const entry = dist[i];
        setCsvDistribution(prev => [...prev, entry]);
        entry.replicas?.forEach(replica => {
          setNodeDataMap(prev => {
            const existing = prev[replica.id] ?? [];
            const filtered = existing.filter(item => item.key !== entry.partitionValue);
            return { ...prev, [replica.id]: [...filtered, { key: entry.partitionValue, value: JSON.stringify(entry.row) }] };
          });
        });
      }

      // Finalise avec le nodeDataMap complet
      setNodeDataMap(newNodeDataMap);

      const result = {
        simulated: true,
        rows_imported: dist.length,
        rows_skipped: skipped,
        nodes_used: upNodes.map(n => n.id),
        partition_key: partitionKey,
        columns_detected: headers,
      };
      setCsvImportResult(result);
      setOutput(result);

    } catch (err) {
      setCsvError(`Erreur import: ${err.message}`);
      console.error("Import CSV error:", err);
    }
  }, [csvFile, partitionKey, parseCsvMeta, nodes, replicationFactor]);

  const sidebarStyle = (open, side) => ({
    position: "absolute",
    top: 0,
    [side]: 0,
    height: "100%",
    width: SIDEBAR_W,
    zIndex: 20,
    background: "#0a0a14",
    transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
    transform: open ? "translateX(0)" : side === "left" ? `translateX(-100%)` : `translateX(100%)`,
    ...(side === "left" ? { borderRight: BORDER } : { borderLeft: BORDER }),
  });

  const sidebarInnerStyle = {
    width: SIDEBAR_W,
    height: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    boxSizing: "border-box",
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      background: "#0a0a14", color: "#fff",
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
    }}>
      <header style={{
        height: 48, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 12, padding: "0 20px",
        borderBottom: BORDER, background: "rgba(255,255,255,0.02)",
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>CassandraEdu</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: 2 }}>SIMULATOR</span>
        {anyJoining && (
          <span style={{ fontSize: 10, color: "#f7c76a", marginLeft: 8, animation: "pulse 1.5s ease-in-out infinite" }}>
            ⟳ waiting for Cassandra tokens...
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          {nodes.length} node{nodes.length !== 1 ? "s" : ""} on ring
        </span>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* LEFT SIDEBAR */}
        <div style={{ position: "relative", flexShrink: 0, width: leftOpen ? SIDEBAR_W : 0, transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={sidebarStyle(leftOpen, "left")}>
            <CollapseBtn open={leftOpen} onClick={() => setLeftOpen(o => !o)} side="left" />
            <div style={sidebarInnerStyle}>

              <Section title="CSV Import (Simulation)">
                <label style={lbl}>Replication Factor</label>
                <select style={inp} value={replicationFactor} onChange={e => setReplicationFactor(Number(e.target.value))}>
                  <option value={1}>RF = 1</option>
                  <option value={2}>RF = 2</option>
                  <option value={3}>RF = 3</option>
                </select>

                <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={csvHasHeader}
                    onChange={e => { setCsvHasHeader(e.target.checked); setCsvPreviewRows({}); setCsvColumns([]); }} />
                  Has header row
                </label>

                {!csvHasHeader && (
                  <input
                    style={inp}
                    placeholder="ex: id;nom;prenom;statut"
                    value={csvColumnNames}
                    onChange={e => { setCsvColumnNames(e.target.value); setCsvPreviewRows({}); }}
                  />
                )}

                <input type="file" accept=".csv,text/csv" style={{ ...inp, fontSize: 10 }} onChange={onFileChange} />

                {csvColumns.length > 0 && (
                  <div style={{
                    background: "rgba(32,178,170,0.05)",
                    border: "1px solid rgba(32,178,170,0.15)",
                    borderRadius: 5, padding: "6px 8px", marginBottom: 6,
                    fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1.7,
                  }}>
                    <span style={{ color: ACCENT, fontWeight: 700 }}>Colonnes détectées:</span><br />
                    {csvColumns.map((c, i) => (
                      <span key={c}>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}.</span>{" "}
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>{c}</span>
                        {i < csvColumns.length - 1 ? "  " : ""}
                      </span>
                    ))}
                    <br />
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>
                      Séparateur: {csvColumns.length > 1 ? "auto-détecté" : "?"}
                    </span>
                  </div>
                )}

                {csvColumns.length > 0 && (
                  <>
                    <label style={lbl}>Partition Key (colonne à hasher)</label>
                    <select style={inp} value={partitionKey} onChange={e => setPartitionKey(e.target.value)}>
                      {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                )}

                <button
                  style={{
                    ...btn,
                    background: csvFile && partitionKey && nodes.length > 0
                      ? "rgba(32,178,170,0.15)" : "rgba(255,255,255,0.03)",
                    border: csvFile && partitionKey && nodes.length > 0
                      ? `1px solid ${ACCENT}` : BORDER,
                    color: csvFile && partitionKey && nodes.length > 0 ? ACCENT : "rgba(255,255,255,0.3)",
                    fontWeight: 700,
                  }}
                  onClick={onImportCsv}
                >
                  Import CSV
                </button>

                {csvError && (
                  <div style={{
                    background: "rgba(247,106,106,0.08)",
                    border: "1px solid rgba(247,106,106,0.3)",
                    borderRadius: 5, padding: "6px 8px",
                    fontSize: 10, color: "#f76a6a", whiteSpace: "pre-wrap", marginBottom: 4,
                  }}>
                    ⚠ {csvError}
                  </div>
                )}

                {csvImportResult?.simulated && (
                  <div style={{
                    background: "rgba(32,178,170,0.08)",
                    border: "1px solid rgba(32,178,170,0.3)",
                    borderRadius: 6, padding: "8px 10px", fontSize: 10, lineHeight: 1.8,
                  }}>
                    <div style={{ color: ACCENT, fontWeight: 700, marginBottom: 4 }}>✓ Import simulé</div>
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Lignes importées: </span>
                      <strong style={{ color: "#6af7b8" }}>{csvImportResult.rows_imported}</strong>
                    </div>
                    {csvImportResult.rows_skipped > 0 && (
                      <div>
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>Lignes ignorées: </span>
                        <strong style={{ color: "#f7c76a" }}>{csvImportResult.rows_skipped}</strong>
                      </div>
                    )}
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Partition key: </span>
                      <strong>{csvImportResult.partition_key}</strong>
                    </div>
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Nœuds: </span>
                      <strong>{csvImportResult.nodes_used?.join(", ")}</strong>
                    </div>
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Colonnes: </span>
                      <span style={{ fontSize: 9 }}>{csvImportResult.columns_detected?.join(", ")}</span>
                    </div>
                  </div>
                )}

              </Section>

              <Section title="Write / Read">
                <label style={lbl}>Key</label>
                <input style={inp} placeholder="e.g. user_id" value={key} onChange={e => setKey(e.target.value)} />
                <label style={lbl}>Value</label>
                <input style={inp} placeholder="e.g. Alice" value={value} onChange={e => setValue(e.target.value)} />
                <button style={btn} onClick={async () => {
                  if (!key.trim()) { setOutput({ error: "Key cannot be empty" }); return; }
                  try {
                    await createKeyspace(replicationFactor);
                    await createTable({ [key]: "text", value: "text" }, [key]);
                    const r = await writeData({ [key]: value }, consistencyLevel);
                    setOutput(r);
                    addToNodeDataMap(key, value, nodes, replicationFactor);
                    fetchCluster();
                  } catch (e) { setOutput({ error: e.message }); }
                }}>Write to Cassandra</button>
                <button style={btn} onClick={() =>
                  readData({ [key]: value }, consistencyLevel)
                    .then(r => setOutput(r))
                    .catch(e => setOutput({ error: e.message }))
                }>Read from Cassandra</button>
                <button style={{ ...btn, opacity: 0.7 }} onClick={() =>
                  readData({}, "ONE")
                    .then(r => setOutput(r))
                    .catch(e => setOutput({ error: e.message }))
                }>Read All</button>
              </Section>

            </div>
          </div>
        </div>

        {/* CENTER */}
        <main style={{
          flex: 1, overflow: "auto",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "24px 20px", gap: 16, minWidth: 0,
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", display: "flex", gap: 24 }}>
            <span><strong style={{ color: ACCENT }}>Drag +</strong> → add node</span>
            <span><strong style={{ color: ACCENT }}>Hover</strong> → inspect data</span>
            <span><strong style={{ color: ACCENT }}>× button</strong> → remove node</span>
          </div>

          <div style={{ width: "100%", maxWidth: 900 }}>
            <TokenRing
              nodes={nodes} leavingNodes={leavingNodes} cluster={clusterData}
              nodeDataMap={nodeDataMap}
              onAddNode={handleAddNode} onRemoveNode={handleRemoveNode}
              simulationResult={simulationResult} csvDistribution={csvDistribution}
              disabled={anyJoining}
            />
          </div>

          <div style={{ width: "100%", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Output</div>
              {output
                ? <div style={{ fontSize: 10, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(output, null, 2)}
                  </div>
                : <span style={{ opacity: 0.3, fontSize: 11 }}>No output yet.</span>}
            </div>

            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Simulation Settings</div>
              <label style={lbl}>Consistency Level</label>
              <select style={inp} value={consistencyLevel} onChange={e => setConsistencyLevel(e.target.value)}>
                <option value="ONE">ONE</option>
                <option value="QUORUM">QUORUM</option>
                <option value="ALL">ALL</option>
              </select>
              <button
                style={{ ...btn, marginTop: 4, background: "rgba(32,178,170,0.12)", border: `1px solid ${ACCENT}`, color: ACCENT, marginBottom: 0 }}
                onClick={runSimulation} disabled={!key || nodes.length === 0}>
                ▶ Simulate Write
              </button>
            </div>
          </div>

          <div style={{ width: "100%", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ ...card, flex: 1, minWidth: 180, marginBottom: 0 }}>
              <div style={h3}>Node Failure Sim</div>
              {nodes.length === 0
                ? <p style={{ opacity: 0.35, fontSize: 11 }}>Add nodes via the ring first.</p>
                : nodes.map(node => (
                  <button key={node.id}
                    style={{
                      ...btn,
                      background: node.status === "down" ? "#8b2020" : undefined,
                      color: node.status === "down" ? "#fff" : undefined,
                      border: node.status === "down" ? "1px solid #b33030" : undefined,
                      fontWeight: node.status === "down" ? 700 : undefined,
                    }}
                    onClick={() => toggleNodeStatus(node.id)}>
                    {node.status === "up" ? "⬇ Disable" : "⬆ Enable"} {node.id}
                  </button>
                ))}
            </div>

            {replicatedNodes.length > 0 && (
              <div style={{ ...card, flex: 1, minWidth: 200, marginBottom: 0 }}>
                <div style={h3}>Distribution / Node</div>
                {replicatedNodes.map(n => {
                  const count = replicatedCounts[n] ?? 0;
                  const pct = maxReplicated > 0 ? Math.round((count / maxReplicated) * 100) : 0;
                  return (
                    <div key={n} style={{ display: "grid", gridTemplateColumns: "68px 1fr 30px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 10 }}>{n}</div>
                      <div style={{ border: BORDER, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: ACCENT, height: 10, transition: "width .4s" }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 10 }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Simulation Result</div>
              {simulationResult ? (
                <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Key: </span>{simulationResult.key}</div>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Hash: </span>{String(simulationResult.hash)}</div>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Primary: </span>{simulationResult.primaryNode?.id ?? "—"}</div>
                  {simulationResult.replicas.map((n, i) => (
                    <div key={n.id} style={{ color: ACCENT }}>{i === 0 ? "★ Primary" : `  Replica ${i}`}: {n.id}</div>
                  ))}
                  {consistencyResult && (
                    <div style={{
                      marginTop: 8, padding: "6px 8px", borderRadius: 6,
                      background: consistencyResult.success ? "rgba(106,247,184,0.07)" : "rgba(247,106,106,0.07)",
                      border: `1px solid ${consistencyResult.success ? "#6af7b8" : "#f76a6a"}44`
                    }}>
                      <div style={{ color: consistencyResult.success ? "#6af7b8" : "#f76a6a", fontWeight: 700 }}>
                        {consistencyResult.success ? "✓ WRITE SUCCESS" : "✗ WRITE FAILED"}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
                        {consistencyResult.consistencyLevel} · needs {consistencyResult.required} · alive {consistencyResult.aliveReplicas}/{consistencyResult.required}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ opacity: 0.3, fontSize: 11 }}>
                  {nodes.length === 0 ? "Add nodes first." : "Enter a key and simulate."}
                </p>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR */}
        <div style={{ position: "relative", flexShrink: 0, width: rightOpen ? SIDEBAR_W : 0, transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={sidebarStyle(rightOpen, "right")}>
            <CollapseBtn open={rightOpen} onClick={() => setRightOpen(o => !o)} side="right" />
            <div style={sidebarInnerStyle}>

              <Section title="Cluster">
                <button style={btn} onClick={() =>
                  getCluster()
                    .then(arr => {
                      setOutput(arr);
                      if (Array.isArray(arr)) {
                        const dict = {};
                        arr.forEach(n => { dict[n.name] = n; });
                        setClusterData(dict);
                      }
                    })
                    .catch(e => setOutput({ error: e.message }))
                }>Show Cluster</button>

                <button style={btn} onClick={() =>
                  getClusterStatus()
                    .then(setClusterStatus)
                    .catch(e => setClusterStatus({ error: e.message }))
                }>Cluster Status</button>
                {clusterStatus && (
                  <pre style={{ fontSize: 9, maxHeight: 100, overflow: "auto", marginBottom: 8 }}>
                    {JSON.stringify(clusterStatus, null, 2)}
                  </pre>
                )}
              </Section>

              <Section title="Token Ring">
                <button style={btn} onClick={() =>
                  getTokenRing().then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                }>Get Token Ring</button>
                <button style={btn} onClick={() =>
                  getDistribution().then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                }>Get Distribution</button>
                {key && (
                  <>
                    <button style={btn} onClick={() =>
                      getEndpoints(key).then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                    }>Get Endpoints for key</button>
                    <button style={btn} onClick={() =>
                      explainPartition(key).then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                    }>Explain Partition</button>
                  </>
                )}
              </Section>

              <Section title="Cluster Reset">
                <button
                  style={{ background: "rgba(247,106,106,0.15)", borderColor: "#f76a6a", color: "#f76a6a", ...btn }}
                  onClick={() => {
                    deleteCluster()
                      .then(() => {
                        setNodes([]); setLeavingNodes([]); setClusterData({}); setNodeDataMap({});
                        usedNamesRef.current.clear();
                        setOutput(null); setClusterStatus(null);
                        setSimulationResult(null); setConsistencyResult(null);
                        setCsvFile(null); setCsvPreviewRows({}); setCsvColumns([]);
                        setCsvDistribution([]); setCsvImportResult(null); setCsvError("");
                        setKey(""); setValue("");
                      })
                      .catch(e => setOutput({ error: e.message }));
                  }}
                >Delete Cluster</button>
              </Section>

            </div>
          </div>
        </div>

      </div>


    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
        color: ACCENT, fontWeight: 700,
        padding: "10px 2px 8px",
        borderBottom: "1px solid rgba(32,178,170,0.15)",
        marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}