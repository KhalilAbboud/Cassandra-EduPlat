import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addNode, removeNode, writeData, readData,
  getCluster, getNodeHealth, getClusterStatus,
  deleteData, importCsv,
} from "./services/api";
import TokenRing from "./components/TokenRing";
import { simulatePlacement, checkConsistency } from "./utils/cassandraSimulation";
import "./App.css";
const NAME_POOL = [
  "NodeA", "NodeB", "NodeC", "NodeD", "NodeE",
  "NodeF", "NodeG", "NodeH", "NodeI", "NodeJ",
  "NodeK", "NodeL", "NodeM", "NodeN", "NodeO",
  "NodeP", "NodeQ", "NodeR", "NodeS", "NodeT",
];

// ── style tokens ─────────────────────────────────────────────────────────────
const BORDER = "1px solid rgba(255,255,255,0.07)";
const BG_CARD = "rgba(255,255,255,0.03)";
const PURPLE = "#7c6af7";

const card = { background: BG_CARD, border: BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
const h3 = { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: PURPLE, marginBottom: 8, fontWeight: 700, margin: "0 0 10px" };
const inp = { width: "100%", boxSizing: "border-box", marginBottom: 6 };
const btn = { width: "100%", marginBottom: 4 };
const lbl = { fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 3, display: "block" };

// ── sidebar toggle button ─────────────────────────────────────────────────────
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
        color: PURPLE,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        padding: 0,
        lineHeight: 1,
        transition: "background 0.2s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(124,106,247,0.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "#13132a"}
    >
      {side === "left"
        ? (open ? "◀" : "▶")
        : (open ? "▶" : "◀")}
    </button>
  );
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [clusterData, setClusterData] = useState({});

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [deleteKey, setDeleteKey] = useState("");
  const [output, setOutput] = useState(null);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [healthNodeId, setHealthNodeId] = useState("");
  const [clusterStatus, setClusterStatus] = useState(null);

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

  // ── sidebar open/close state ──────────────────────────────────────────────
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const SIDEBAR_W = 270;
  const COLLAPSED_W = 0;

  const replicatedCounts = csvImportResult?.replicated_counts_per_node ?? {};
  const replicatedNodes = useMemo(() => Object.keys(replicatedCounts).sort(), [replicatedCounts]);
  const maxReplicated = useMemo(() => {
    const vals = Object.values(replicatedCounts);
    return vals.length ? Math.max(...vals) : 0;
  }, [replicatedCounts]);

  // ── helpers ──────────────────────────────────────────────────────────────
  const fetchCluster = useCallback(async () => {
    try { setClusterData(await getCluster()); } catch { /* ignore */ }
  }, []);

  const handleAddNode = useCallback(async (token) => {
    const usedIds = new Set(nodes.map((n) => n.id));
    const id = NAME_POOL.find((name) => !usedIds.has(name)) ?? `Node${Date.now()}`;
    setNodes((prev) => [...prev, { id, token, status: "up" }]);
    try { await addNode(id); await fetchCluster(); } catch (e) { console.error(e); }
  }, [nodes, fetchCluster]);

  const handleRemoveNode = useCallback(async (nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setSimulationResult(null); setConsistencyResult(null);
    try { await removeNode(nodeId); await fetchCluster(); } catch (e) { console.error(e); }
  }, [fetchCluster]);

  const handleMoveNode = useCallback((nodeId, token) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, token } : n));
  }, []);

  const toggleNodeStatus = useCallback((nodeId) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, status: n.status === "up" ? "down" : "up" } : n));
  }, []);

  const runSimulation = useCallback(() => {
    if (!key) return;
    const result = simulatePlacement({ key, nodes, replicationFactor });
    setSimulationResult(result);
    if (result?.replicas)
      setConsistencyResult(checkConsistency({ replicas: result.replicas, consistencyLevel }));
  }, [key, nodes, replicationFactor, consistencyLevel]);

  // Re-check consistency when CL changes while a simulation result exists
  useEffect(() => {
    if (simulationResult?.replicas) {
      setConsistencyResult(checkConsistency({ replicas: simulationResult.replicas, consistencyLevel }));
    }
  }, [consistencyLevel, simulationResult]);

  const parseCsvMeta = useCallback((text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return null;
    const firstL = lines[0];
    const delim = firstL.includes(";") && !firstL.includes(",") ? ";" : ",";
    let headers, dataLines;
    if (csvHasHeader) {
      headers = firstL.split(delim).map((c) => c.trim());
      dataLines = lines.slice(1);
    } else {
      dataLines = lines;
      if (csvColumnNames.trim()) {
        const sep = csvColumnNames.includes(";") ? ";" : ",";
        headers = csvColumnNames.split(sep).map((c) => c.trim());
      } else {
        headers = Array.from({ length: lines[0].split(delim).length }, (_, i) => `col${i + 1}`);
      }
    }
    return { delim, headers, dataLines };
  }, [csvHasHeader, csvColumnNames]);

  const onFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0] ?? null;
    setCsvFile(file); setCsvError(""); setCsvImportResult(null);
    setCsvPreviewRows({}); setCsvDistribution([]);
    if (!file) return;
    const text = await file.text();
    const meta = parseCsvMeta(text);
    if (!meta) { setCsvError("Empty CSV."); return; }
    const { delim, headers, dataLines } = meta;
    setCsvColumns(headers); setPartitionKey(headers[0] ?? "");
    const tableName = file.name.replace(/\.csv$/i, "") || "ImportedTable";
    const preview = {};
    for (let i = 0; i < Math.min(dataLines.length, 12); i++) {
      const parts = dataLines[i].split(delim).map((c) => c.trim());
      if (!parts[0]) continue;
      const rowId = /^\d+$/.test(parts[0]) ? `row${parts[0]}` : parts[0];
      const rowObj = {};
      headers.forEach((h, idx) => { if (parts[idx] !== undefined && parts[idx] !== "") rowObj[h] = parts[idx]; });
      preview[rowId] = rowObj;
    }
    if (!Object.keys(preview).length) { setCsvError("Could not parse preview."); return; }
    setCsvPreviewRows({ [tableName]: preview });
  }, [parseCsvMeta]);

  const onImportCsv = useCallback(async () => {
    if (!csvFile) { setCsvError("Choose a CSV file first."); return; }
    if (!partitionKey) { setCsvError("Choose a partition key."); return; }
    setCsvError("");

    let backendResult = null;
    try {
      backendResult = await importCsv(csvFile, csvHasHeader, csvColumnNames);
    } catch (err) {
      setCsvError(err.message ?? "Backend import failed");
      return;
    }

    const text = await csvFile.text();
    const meta = parseCsvMeta(text);
    if (!meta) { setCsvError("Empty CSV."); return; }
    const { delim, headers, dataLines } = meta;
    const dist = [];
    dataLines.forEach((line, i) => {
      const parts = line.split(delim).map((c) => c.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = parts[idx] ?? ""; });
      const pval = row[partitionKey];
      if (!pval) return;
      const placement = simulatePlacement({ key: String(pval), nodes, replicationFactor });
      dist.push({ rowId: `row${i + 1}`, partitionValue: pval, hash: placement?.hash, primaryNode: placement?.primaryNode?.id, replicas: placement?.replicas ?? [] });
    });

    const mergedResult = { ...backendResult };
    setCsvImportResult(mergedResult);
    setOutput(mergedResult);
    setCsvDistribution(dist);

    await fetchCluster();
  }, [csvFile, partitionKey, csvHasHeader, csvColumnNames, parseCsvMeta, nodes, replicationFactor, fetchCluster]);

  // ── sidebar content styles ────────────────────────────────────────────────
  const sidebarStyle = (open, side) => ({
    position: "fixed",
    top: 48,
    [side]: 0,
    height: "calc(100vh - 48px)",
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

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      background: "#0a0a14", color: "#fff",
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
    }}>

      {/* ── header ── */}
      <header style={{
        height: 48, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 12, padding: "0 20px",
        borderBottom: BORDER, background: "rgba(255,255,255,0.02)",
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: PURPLE, letterSpacing: 1 }}>CassandraEdu</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: 2 }}>SIMULATOR</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          {nodes.length} node{nodes.length !== 1 ? "s" : ""} on ring
        </span>
      </header>

      {/* ── body row ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ══ LEFT SIDEBAR ══ */}
        <div style={{ position: "fixed", top: 48, left: 0, height: "calc(100vh - 48px)", zIndex: 20, width: SIDEBAR_W }}>
          <div style={sidebarStyle(leftOpen, "left")}>
            <CollapseBtn open={leftOpen} onClick={() => setLeftOpen(o => !o)} side="left" />
            <div style={sidebarInnerStyle}>

              <Section title="Cluster">
                <button style={btn} onClick={() => getCluster().then((r) => { setOutput(r); setClusterData(r); }).catch((e) => setOutput({ error: e.message }))}>Show Cluster</button>
              </Section>

              <Section title="CSV Import">
                <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={csvHasHeader}
                    onChange={(e) => { setCsvHasHeader(e.target.checked); setCsvPreviewRows({}); }} />
                  Has header row
                </label>
                {!csvHasHeader && (
                  <input style={inp} placeholder="col1;col2;col3" value={csvColumnNames}
                    onChange={(e) => { setCsvColumnNames(e.target.value); setCsvPreviewRows({}); }} />
                )}
                <input type="file" accept=".csv,text/csv" style={{ ...inp, fontSize: 10 }} onChange={onFileChange} />
                {csvColumns.length > 0 && (
                  <>
                    <label style={lbl}>Partition Key</label>
                    <select style={inp} value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)}>
                      {csvColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                )}
                <button style={btn} onClick={onImportCsv}>Import CSV</button>
                {csvError && <pre style={{ color: "#f76a6a", fontSize: 10 }}>{csvError}</pre>}
                {Object.keys(csvPreviewRows).length > 0 && (
                  <>
                    <label style={{ ...lbl, marginTop: 8 }}>Preview (first rows)</label>
                    <pre style={{ maxHeight: 160, overflow: "auto", fontSize: 9 }}>
                      {JSON.stringify(csvPreviewRows, null, 2)}
                    </pre>
                  </>
                )}
              </Section>



              {csvImportResult?.table && (
                <Section title="Imported Table">
                  <pre style={{ maxHeight: 220, overflow: "auto", fontSize: 9 }}>
                    {JSON.stringify(csvImportResult.table, null, 2)}
                  </pre>
                  <p style={{ opacity: 0.35, fontSize: 10, marginTop: 4 }}>
                    {csvImportResult.rows_imported} rows imported
                    {csvImportResult.rows_skipped > 0 && `, ${csvImportResult.rows_skipped} skipped`}
                  </p>
                </Section>
              )}

            </div>
          </div>
        </div>

        {/* ══ CENTER ══ */}
        <main style={{
          flex: 1, overflow: "auto",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "24px 20px", gap: 16,
          minWidth: 0,
          marginLeft: leftOpen ? SIDEBAR_W : 0,
          marginRight: rightOpen ? SIDEBAR_W : 0,
          transition: "margin 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {/* hint bar */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", display: "flex", gap: 24 }}>
            <span><strong style={{ color: PURPLE }}>Drag +</strong> → add node</span>
            <span><strong style={{ color: PURPLE }}>Hover</strong> → inspect data</span>
            <span><strong style={{ color: PURPLE }}>× button</strong> → remove node</span>
          </div>

          {/* ring */}
          <div style={{ width: "100%", maxWidth: 900 }}>
            <TokenRing
              nodes={nodes} cluster={clusterData}
              onAddNode={handleAddNode} onRemoveNode={handleRemoveNode} onMoveNode={handleMoveNode}
              simulationResult={simulationResult} csvDistribution={csvDistribution}
            />
          </div>

          {/* bottom strip */}
          <div style={{ width: "100%", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/*output*/}
            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Output</div>
              {output
                ? <div style={{ fontSize: 10, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(output, null, 2)}
                </div>
                : <span style={{ opacity: 0.3, fontSize: 11 }}>No output yet.</span>}
            </div>
            {/* simulation settings */}
            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Simulation Settings</div>
              <label style={lbl}>Replication Factor</label>
              <select style={inp} value={replicationFactor} onChange={(e) => setReplicationFactor(Number(e.target.value))}>
                <option value={1}>RF = 1</option><option value={2}>RF = 2</option><option value={3}>RF = 3</option>
              </select>
              <label style={lbl}>Consistency Level</label>
              <select style={inp} value={consistencyLevel} onChange={(e) => setConsistencyLevel(e.target.value)}>
                <option value="ONE">ONE</option><option value="QUORUM">QUORUM</option><option value="ALL">ALL</option>
              </select>
              <button
                style={{ ...btn, marginTop: 4, background: "rgba(124,106,247,0.12)", border: `1px solid ${PURPLE}`, color: PURPLE, marginBottom: 0 }}
                onClick={runSimulation} disabled={!key || nodes.length === 0}>
                ▶ Simulate Write
              </button>
            </div>

            {/* simulation result */}
            <div style={{ ...card, flex: 1, minWidth: 190, marginBottom: 0 }}>
              <div style={h3}>Simulation Result</div>
              {simulationResult ? (
                <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Key: </span>{simulationResult.key}</div>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Hash: </span>{simulationResult.hash}</div>
                  <div><span style={{ color: "rgba(255,255,255,0.35)" }}>Primary: </span>{simulationResult.primaryNode?.id ?? "—"}</div>
                  {simulationResult.replicas.map((n, i) => (
                    <div key={n.id} style={{ color: PURPLE }}>{i === 0 ? "★ Primary" : `  Replica ${i}`}: {n.id}</div>
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
                  {nodes.length === 0 ? "Add nodes first." : "Enter a key on the right and simulate."}
                </p>
              )}
            </div>
          </div>

          {/* bottom strip row 2 — relocated panels */}
          <div style={{ width: "100%", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Node Failure Sim */}
            <div style={{ ...card, flex: 1, minWidth: 180, marginBottom: 0 }}>
              <div style={h3}>Node Failure Sim</div>
              {nodes.length === 0
                ? <p style={{ opacity: 0.35, fontSize: 11 }}>Add nodes via the ring first.</p>
                : nodes.map((node) => (
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

            {/* Cluster Status & Node Health */}
            <div style={{ ...card, flex: 1, minWidth: 180, marginBottom: 0 }}>
              <div style={h3}>Cluster & Node Health</div>
              <button style={{ ...btn, marginBottom: 6 }} onClick={() => getClusterStatus().then(setClusterStatus).catch((e) => setClusterStatus({ error: e.message }))}>Cluster Status</button>
              {clusterStatus && <pre style={{ fontSize: 9, maxHeight: 100, overflow: "auto", marginBottom: 8 }}>{JSON.stringify(clusterStatus, null, 2)}</pre>}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input style={{ ...inp, flex: 1, marginBottom: 0 }} placeholder="NodeA" value={healthNodeId} onChange={(e) => setHealthNodeId(e.target.value)} />
                <button style={{ ...btn, width: "auto", flex: "0 0 auto", marginBottom: 0, padding: "6px 10px", fontSize: 10 }}
                  onClick={() => getNodeHealth(healthNodeId).then(setNodeStatus).catch((e) => setNodeStatus({ error: e.message }))}>
                  Check
                </button>
              </div>
              {nodeStatus && <pre style={{ fontSize: 9, maxHeight: 100, overflow: "auto", marginTop: 6 }}>{JSON.stringify(nodeStatus, null, 2)}</pre>}
            </div>

            {/* Distribution / Node */}
            {replicatedNodes.length > 0 && (
              <div style={{ ...card, flex: 2, minWidth: 250, marginBottom: 0 }}>
                <div style={h3}>Distribution / Node</div>
                {replicatedNodes.map((n) => {
                  const count = replicatedCounts[n] ?? 0;
                  const pct = maxReplicated > 0 ? Math.round((count / maxReplicated) * 100) : 0;
                  return (
                    <div key={n} style={{ display: "grid", gridTemplateColumns: "68px 1fr 30px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 10 }}>{n}</div>
                      <div style={{ border: BORDER, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: PURPLE, height: 10, transition: "width .4s" }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 10 }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ══ RIGHT SIDEBAR ══ */}
        <div style={{ position: "fixed", top: 48, right: 0, height: "calc(100vh - 48px)", zIndex: 20, width: SIDEBAR_W }}>
          <div style={sidebarStyle(rightOpen, "right")}>
            <CollapseBtn open={rightOpen} onClick={() => setRightOpen(o => !o)} side="right" />
            <div style={sidebarInnerStyle}>

              <Section title="Write / Read">
                <label style={lbl}>Key</label>
                <input style={inp} placeholder="e.g. user:42" value={key} onChange={(e) => setKey(e.target.value)} />
                <label style={lbl}>Value</label>
                <input style={inp} placeholder="e.g. Alice" value={value} onChange={(e) => setValue(e.target.value)} />
                <button style={btn} onClick={() => writeData(key, value).then((r) => { setOutput(r); fetchCluster(); }).catch((e) => setOutput({ error: e.message }))}>Write</button>
                <button style={btn} onClick={() => readData(key).then(setOutput).catch((e) => setOutput({ error: e.message }))}>Read</button>
              </Section>

              <Section title="Delete">
                <label style={lbl}>Key</label>
                <input style={inp} placeholder="key to delete" value={deleteKey} onChange={(e) => setDeleteKey(e.target.value)} />
                <button style={{ ...btn, color: "#f76a6a" }}
                  onClick={() => deleteData(deleteKey).then((r) => { setOutput(r); fetchCluster(); }).catch((e) => setOutput({ error: e.message }))}>
                  Delete
                </button>
              </Section>



            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── tiny section wrapper ─────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
        color: PURPLE, fontWeight: 700,
        padding: "10px 2px 8px",
        borderBottom: "1px solid rgba(124,106,247,0.15)",
        marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}