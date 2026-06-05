import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addNode, removeNode, writeData, readData,
  getCluster, deleteCluster,
  createKeyspace, createTable,
  getEndpoints, explainPartition, getGossip, getBatchHashes,
  getHints, getRepairStats, startNode, stopNode
} from "./services/api";
import TokenRing from "./components/TokenRing";
import CAPErrorModal from "./components/CAPErrorModal";
import HintedHandoffPanel from "./components/HintedHandoffPanel";
import ReadRepairPanel from "./components/ReadRepairPanel";
import { simulatePlacement } from "./utils/cassandraSimulation";
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
const COLUMN_TYPES = ["text", "int", "float", "boolean", "uuid", "timestamp", "bigint"];

async function pollForNodeUp(nodeId, fetchClusterFn, { intervalMs = 1500, timeoutMs = 90000 } = {}) {
  // Wait until the backend reports the node as BOTH running (status "up") AND has tokens.
  // We can't rely on tokens alone because pause/unpause keeps tokens in nodetool ring even
  // while the container is paused — so tokens never disappear and would resolve instantly.
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) { reject(new Error(`Timeout waiting for ${nodeId} to come up`)); return; }
      try {
        const arr = await fetchClusterFn();
        const found = Array.isArray(arr) ? arr.find(n => n.name === nodeId) : null;
        if (found && found.status?.toLowerCase() === "up" && Array.isArray(found.tokens) && found.tokens.length > 0) {
          resolve(found);
        } else {
          setTimeout(tick, intervalMs);
        }
      } catch { setTimeout(tick, intervalMs); }
    };
    tick();
  });
}

// Keep the old name as an alias for the add-node flow (new nodes start with 0 tokens so token check is fine)
async function pollForTokens(nodeId, fetchClusterFn, opts) {
  return pollForNodeUp(nodeId, fetchClusterFn, opts);
}

function CollapseBtn({ open, onClick, side }) {
  return (
    <button onClick={onClick}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [side === "left" ? "right" : "left"]: -20, zIndex: 10,
        width: 32, height: 64,
        borderRadius: side === "left" ? "0 8px 8px 0" : "8px 0 0 8px",
        background: "#13132a", border: BORDER,
        [side === "left" ? "borderLeft" : "borderRight"]: "none",
        color: ACCENT, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, padding: 0, lineHeight: 1, transition: "background 0.2s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(32,178,170,0.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "#13132a"}
    >
      {side === "left" ? (open ? "◀" : "▶") : (open ? "▶" : "◀")}
    </button>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 10, borderBottom: "1px solid rgba(32,178,170,0.15)" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            flex: 1, padding: "5px 4px", fontSize: 10, cursor: "pointer",
            background: active === t.id ? "rgba(32,178,170,0.15)" : "transparent",
            border: "none", borderBottom: active === t.id ? `2px solid ${ACCENT}` : "2px solid transparent",
            color: active === t.id ? ACCENT : "rgba(255,255,255,0.4)",
            fontWeight: active === t.id ? 700 : 400,
            fontFamily: "inherit", letterSpacing: 1, transition: "all 0.15s",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [leavingNodes, setLeavingNodes] = useState([]);
  const [clusterData, setClusterData] = useState({});
  const [nodeDataMap, setNodeDataMap] = useState({});
  const usedNamesRef = useRef(new Set());
  const clusterInitializedRef = useRef(false);

  const [clusterName, setClusterName] = useState("TestCluster");
  const [editableClusterName, setEditableClusterName] = useState("TestCluster");
  const [hashingType, setHashingType] = useState("murmur3");

  const [keyspaceName, setKeyspaceName] = useState("edu_keyspace");
  const [strategy, setStrategy] = useState("SimpleStrategy");
  const [replicationFactor, setReplicationFactor] = useState(2);
  const [tableName, setTableName] = useState("edu_table");
  const [columns, setColumns] = useState([
    { name: "id", type: "text", isPartitionKey: true },
    { name: "value", type: "text", isPartitionKey: false },
  ]);
  const [schemaReady, setSchemaReady] = useState(false);

  const [dataTab, setDataTab] = useState("manual");

  // ─── Right panel tabs ─────────────────────────────────────────────
  const [rightTab, setRightTab] = useState("output");

  const [rowValues, setRowValues] = useState({});
  const [consistencyLevel, setConsistencyLevel] = useState("QUORUM");
  const [filterKey, setFilterKey] = useState("");
  const [output, setOutput] = useState(null);

  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [partitionKey, setPartitionKey] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvColumnNames, setCsvColumnNames] = useState("");
  const [csvDistribution, setCsvDistribution] = useState([]);

  const [writeFlowAnim, setWriteFlowAnim] = useState(null);
  const [gossipAnim, setGossipAnim] = useState(null);
  const gossipIntervalRef = useRef(null);
  const prevGossipRef = useRef({});

  // ─── CAP Error Modal ──────────────────────────────────────────────
  const [capError, setCapError] = useState(null);
  const [isCsvImporting, setIsCsvImporting] = useState(false);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const SIDEBAR_W = 340;

  const partitionKeys = useMemo(() => columns.filter(c => c.isPartitionKey).map(c => c.name), [columns]);
  const primaryPartitionKey = partitionKeys[0] ?? "";

  const getNextName = useCallback(() =>
    NAME_POOL.find(n => !usedNamesRef.current.has(n)) ?? `Node${Date.now()}`, []);

  const replicatedCounts = useMemo(() => {
    const counts = {};
    csvDistribution.forEach(row => row.replicas?.forEach(n => { counts[n.id] = (counts[n.id] ?? 0) + 1; }));
    return counts;
  }, [csvDistribution]);
  const replicatedNodes = useMemo(() => Object.keys(replicatedCounts).sort(), [replicatedCounts]);
  const maxReplicated = useMemo(() => { const v = Object.values(replicatedCounts); return v.length ? Math.max(...v) : 0; }, [replicatedCounts]);

  const fetchClusterRaw = useCallback(async () => await getCluster(clusterName), [clusterName]);
  const fetchCluster = useCallback(async () => {
    try {
      const arr = await fetchClusterRaw();
      if (Array.isArray(arr)) {
        const dict = {};
        arr.forEach(n => { dict[n.name] = n; });
        setClusterData(dict);
      }
    } catch { /* ignore */ }
  }, [fetchClusterRaw]);

  const addToNodeDataMap = useCallback((rowData, currentNodes, rf, explicitPlacement = null) => {
    const pkVal = rowData[primaryPartitionKey] ?? Object.values(rowData)[0] ?? "";
    const placement = explicitPlacement ?? simulatePlacement({ key: String(pkVal), nodes: currentNodes, replicationFactor: rf, hashingType });
    if (!placement?.replicas?.length) return;
    setNodeDataMap(prev => {
      const next = { ...prev };
      placement.replicas.forEach(node => {
        const existing = next[node.id] ?? [];
        next[node.id] = [...existing.filter(i => i.key !== String(pkVal)), { key: String(pkVal), value: JSON.stringify(rowData) }];
      });
      return next;
    });
  }, [primaryPartitionKey, hashingType]);

  const commitClusterName = useCallback((name) => {
    const trimmed = name.trim() || "TestCluster";
    if (trimmed === clusterName) return;
    setClusterName(trimmed);
    setEditableClusterName(trimmed);
    clusterInitializedRef.current = false;
    setNodes([]); setLeavingNodes([]); setClusterData({}); setNodeDataMap({});
    usedNamesRef.current.clear();
    setOutput(null); setSchemaReady(false); prevGossipRef.current = {};
    setCsvFile(null); setCsvColumns([]); setCsvDistribution([]); setCsvImportResult(null); setCsvError("");
    setRowValues({});
  }, [clusterName]);

  const handleAddNode = useCallback(async (token) => {
    const id = getNextName();
    if (usedNamesRef.current.has(id)) return;
    usedNamesRef.current.add(id);
    const stamp = Date.now();
    setNodes(prev => [...prev, { id, token, tokens: [], status: "joining", stamp }]);
    try {
      if (!clusterInitializedRef.current) {
        clusterInitializedRef.current = true;
        try { await deleteCluster(clusterName); } catch { /* may not exist */ }
      }
      await addNode(id, clusterName, String(token));
      const nodeInfo = await pollForTokens(id, fetchClusterRaw);
      setNodes(prev => prev.map(n => n.id === id && n.stamp === stamp
        ? { ...n, status: "up", tokens: nodeInfo.tokens, ip: nodeInfo.ip ?? "" } : n));
      await fetchCluster();
    } catch (e) {
      setNodes(prev => prev.filter(n => !(n.id === id && n.stamp === stamp)));
      usedNamesRef.current.delete(id);
      setOutput({ error: e.message });
    }
  }, [clusterName, fetchCluster, fetchClusterRaw, getNextName]);

  const handleRemoveNode = useCallback(async (nodeId) => {
    const leaving = nodes.find(n => n.id === nodeId);
    if (leaving) setLeavingNodes(prev => [...prev, { ...leaving, status: "leaving" }]);
    usedNamesRef.current.delete(nodeId);
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setTimeout(() => setLeavingNodes(prev => prev.filter(n => n.id !== nodeId)), 600);
    try { await removeNode(nodeId, clusterName); await fetchCluster(); } catch (e) { console.error("removeNode failed", e); }
  }, [clusterName, fetchCluster, nodes]);

  // ─── handleStopNode: stop container without deleting (for hint/repair testing) ─
  const handleStopNode = useCallback(async (nodeId) => {
    try {
      await stopNode(nodeId, clusterName);
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, status: "down" } : n));
      await fetchCluster();
    } catch (e) {
      console.error("stopNode failed", e);
      setOutput({ error: `Stop failed: ${e.message}` });
    }
  }, [clusterName, fetchCluster]);

  // ─── handleStartNode: restart a stopped node + re-sync frontend state ────
  const handleStartNode = useCallback(async (nodeId, clusterNameArg) => {
    try {
      await startNode(nodeId, clusterNameArg ?? clusterName);
      // Poll until tokens reappear, then mark node as "up" in local state
      const nodeInfo = await pollForTokens(nodeId, fetchClusterRaw);
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, status: "up", tokens: nodeInfo.tokens, ip: nodeInfo.ip ?? n.ip } : n
      ));
      await fetchCluster();
    } catch (e) {
      console.error("startNode failed", e);
      throw e;
    }
  }, [clusterName, fetchCluster, fetchClusterRaw]);

  useEffect(() => {
    if (gossipIntervalRef.current) clearInterval(gossipIntervalRef.current);
    const aliveNodes = nodes.filter(n => n.status === "up" && n.tokens?.length > 0);
    if (aliveNodes.length < 2) { setGossipAnim(null); return; }

    const runGossip = async () => {
      try {
        const data = await getGossip(clusterName);
        const gossipNodes = data?.nodes ?? [];
        if (gossipNodes.length < 2) return;
        const prev = prevGossipRef.current;
        const changed = gossipNodes.filter(n => {
          const old = prev[n.ip];
          return !old || old.heartbeat !== n.heartbeat || old.generation !== n.generation;
        });
        const next = {};
        gossipNodes.forEach(n => { next[n.ip] = { heartbeat: n.heartbeat, generation: n.generation }; });
        prevGossipRef.current = next;
        const pool = changed.length >= 2 ? changed : gossipNodes;
        const fromNode = pool[Math.floor(Math.random() * pool.length)];
        let toNode = pool.filter(n => n.ip !== fromNode.ip)[Math.floor(Math.random() * (pool.length - 1))];
        if (!toNode) toNode = gossipNodes.find(n => n.ip !== fromNode.ip);
        if (!toNode) return;
        const fromFront = aliveNodes.find(n => n.id === fromNode.node_name) ?? aliveNodes[0];
        const toFront = aliveNodes.find(n => n.id === toNode.node_name) ?? aliveNodes[1];
        if (!fromFront || !toFront || fromFront.id === toFront.id) return;
        const TOTAL = 3500;
        const startTime = performance.now();
        setGossipAnim({ from: fromFront, to: toFront, fromData: fromNode, toData: toNode, progress: 0, animId: Math.random() });
        const animate = (now) => {
          const t = Math.min((now - startTime) / TOTAL, 1);
          setGossipAnim(prev => prev ? { ...prev, progress: t } : null);
          if (t < 1) requestAnimationFrame(animate);
          else setTimeout(() => setGossipAnim(null), 1000);
        };
        requestAnimationFrame(animate);
      } catch { /* silencieux */ }
    };

    runGossip();
    gossipIntervalRef.current = setInterval(runGossip, 5500);
    return () => clearInterval(gossipIntervalRef.current);
  }, [nodes, clusterName]);

  const anyJoining = nodes.some(n => n.status === "joining");

  const addColumn = () => setColumns(prev => [...prev, { name: "", type: "text", isPartitionKey: false }]);
  const removeColumn = (i) => setColumns(prev => prev.filter((_, idx) => idx !== i));
  const updateColumn = (i, field, val) => setColumns(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const togglePartitionKey = (i) => setColumns(prev => prev.map((c, idx) => ({ ...c, isPartitionKey: idx === i ? !c.isPartitionKey : c.isPartitionKey })));

  const handleSetup = async () => {
    if (!keyspaceName.trim()) { setOutput({ error: "Keyspace name required" }); return; }
    if (!tableName.trim()) { setOutput({ error: "Table name required" }); return; }
    if (columns.some(c => !c.name.trim())) { setOutput({ error: "All columns must have a name" }); return; }
    if (partitionKeys.length === 0) { setOutput({ error: "At least one partition key required" }); return; }
    try {
      const colsObj = {};
      columns.forEach(c => { colsObj[c.name] = c.type; });
      await createKeyspace(replicationFactor, strategy, keyspaceName, clusterName);
      await createTable(colsObj, partitionKeys, tableName, keyspaceName, clusterName);
      setSchemaReady(true);
      setRowValues({});
      setOutput({ success: `Keyspace '${keyspaceName}' and table '${tableName}' created.`, columns: columns.map(c => `${c.name} (${c.type})${c.isPartitionKey ? " [PK]" : ""}`).join(", ") });
    } catch (e) { setOutput({ error: e.message }); }
  };

  const handleWrite = async () => {
    if (!schemaReady) { setOutput({ error: "Run Setup first" }); return; }
    
    let pkVal = rowValues[primaryPartitionKey];
    if (!pkVal?.trim()) { 
      // Auto-increment logic: find the highest numeric PK in existing data
      let maxPk = 0;
      csvDistribution.forEach(d => {
        const val = parseInt(d.partitionValue, 10);
        if (!isNaN(val) && val > maxPk) maxPk = val;
      });
      pkVal = String(maxPk + 1);
    }
    
    const rowToSend = { ...rowValues, [primaryPartitionKey]: pkVal };
    
    try {
      const r = await writeData(rowToSend, consistencyLevel, keyspaceName, tableName, clusterName);
      setOutput(r);

      let backendPlacement = null;
      try {
        const hashesObj = await getBatchHashes([String(pkVal)], hashingType);
        if (hashesObj[String(pkVal)] != null) {
          backendPlacement = simulatePlacement({
            key: String(pkVal),
            nodes,
            replicationFactor,
            precomputedHash: hashesObj[String(pkVal)]
          });
        }
      } catch (e) {
        backendPlacement = simulatePlacement({ key: String(pkVal), nodes, replicationFactor, hashingType });
      }

      addToNodeDataMap(rowToSend, nodes, replicationFactor, backendPlacement);
      if (backendPlacement) {
        setCsvDistribution(prev => [...prev, { rowId: `manual_${Date.now()}`, partitionValue: String(pkVal), hash: backendPlacement.hash, replicas: backendPlacement.replicas, row: rowToSend }]);
      }

      fetchCluster();

      if (backendPlacement?.hash != null && backendPlacement.replicas?.length > 0) {
        const TOTAL_DURATION = 7000;
        const startTime = performance.now();
        setWriteFlowAnim({ key: String(pkVal), hash: backendPlacement.hash, replicas: backendPlacement.replicas, progress: 0 });
        const animateFlow = (now) => {
          const t = Math.min((now - startTime) / TOTAL_DURATION, 1);
          setWriteFlowAnim(prev => prev ? { ...prev, progress: t } : null);
          if (t < 1) requestAnimationFrame(animateFlow);
          else setTimeout(() => setWriteFlowAnim(null), 1000);
        };
        requestAnimationFrame(animateFlow);
      }
    } catch (e) { setOutput({ error: e.message }); }
  };

  // ─── Read with CAP error detection ────────────────────────────────
  const handleRead = useCallback(async (filters = {}) => {
    try {
      const r = await readData(filters, consistencyLevel, keyspaceName, tableName, clusterName);
      setOutput(r);
    } catch (e) {
      const msg = e.message ?? "";
      const isUnavailable = msg.toLowerCase().includes("unavailable")
        || msg.toLowerCase().includes("nohost")
        || msg.toLowerCase().includes("no host")
        || msg.toLowerCase().includes("500")
        || msg.toLowerCase().includes("503")
        || msg.toLowerCase().includes("failed")
        || e.status === 503 || e.status === 500;
      if (isUnavailable) {
        const deadNodes = nodes.filter(n => n.status === "down" || n.status !== "up");
        const filterVal = filters[primaryPartitionKey];
        let affectedEntry = null;
        if (filterVal) {
          affectedEntry = csvDistribution.find(d => String(d.partitionValue) === String(filterVal));
          if (!affectedEntry) {
            const placement = simulatePlacement({ key: String(filterVal), nodes: [...nodes], replicationFactor, hashingType });
            if (placement) affectedEntry = { partitionValue: filterVal, hash: placement.hash, replicas: placement.replicas, primaryNode: placement.primaryNode?.id };
          }
        }
        setCapError({
          message: msg,
          queriedKey: filterVal ?? "(all)",
          replicationFactor,
          consistencyLevel,
          nodes,
          affectedEntry,
          deadNodes,
          nodeDataMap,
        });
      } else {
        setOutput({ error: msg });
      }
    }
  }, [consistencyLevel, keyspaceName, tableName, clusterName, nodes, primaryPartitionKey,
    csvDistribution, replicationFactor, hashingType, nodeDataMap]);

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
    setCsvError(""); setCsvImportResult(null); setCsvDistribution([]);
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setCsvError("Fichier CSV vide."); return; }
    const firstL = lines[0];
    const delim = firstL.includes(";") && !firstL.includes(",") ? ";" : ",";
    const firstCells = firstL.split(delim).map(c => c.trim());
    const looksLikeHeader = firstCells.every(c => /^[a-zA-Z_][a-zA-Z0-9_ ]*$/.test(c));
    let headers;
    if (looksLikeHeader) { setCsvHasHeader(true); headers = firstCells; }
    else { setCsvHasHeader(false); headers = Array.from({ length: firstCells.length }, (_, i) => `col${i + 1}`); }
    setCsvColumns(headers);
    setPartitionKey(headers[0] ?? "");
  }, []);

  const runCsvInsertLoop = useCallback(async ({ headers, dataLines, delim, pkCol, ksName, tblName }) => {
    let imported = 0, skipped = 0;
    const errors = [];
    setCsvDistribution([]); setNodeDataMap({});

    // Pre-calculate hashes in one ultra-fast batch request
    const uniqueKeys = [...new Set(dataLines.map(line => {
      const parts = line.split(delim).map(c => c.trim());
      return parts[headers.indexOf(pkCol)];
    }).filter(Boolean))];

    let hashesObj = {};
    try {
      hashesObj = await getBatchHashes(uniqueKeys, hashingType);
    } catch (e) {
      console.error("Batch hash failed", e);
    }

    // Scale animation speed based on CSV size to prevent massive delays
    const animDuration = dataLines.length > 50 ? 80 : (dataLines.length > 15 ? 150 : 400);
    // Scale write flow animation duration to match
    const writeFlowDuration = dataLines.length > 50 ? 600 : (dataLines.length > 15 ? 1500 : 4000);

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      if (!line.trim()) continue;
      const parts = line.split(delim).map(c => c.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = parts[idx] ?? ""; });
      const pval = row[pkCol];
      if (!pval) { skipped++; continue; }
      try {
        await writeData(row, consistencyLevel, ksName, tblName, clusterName);
        imported++;

        let backendPlacement = null;
        if (hashesObj[String(pval)] != null) {
          backendPlacement = simulatePlacement({
            key: String(pval),
            nodes,
            replicationFactor,
            precomputedHash: hashesObj[String(pval)]
          });
        } else {
          backendPlacement = simulatePlacement({ key: String(pval), nodes, replicationFactor, hashingType });
        }

        if (backendPlacement?.hash != null && backendPlacement.replicas?.length > 0) {
          // Trigger the write flow animation on the ring (same as manual write)
          const startTime = performance.now();
          const totalDur = writeFlowDuration;
          setWriteFlowAnim({ key: String(pval), hash: backendPlacement.hash, replicas: backendPlacement.replicas, progress: 0 });
          await new Promise(resolve => {
            const animateFlow = (now) => {
              const t = Math.min((now - startTime) / totalDur, 1);
              setWriteFlowAnim(prev => prev ? { ...prev, progress: t } : null);
              if (t < 1) requestAnimationFrame(animateFlow);
              else { setWriteFlowAnim(null); resolve(); }
            };
            requestAnimationFrame(animateFlow);
          });

          setCsvDistribution(prev => [...prev, { rowId: `row${i + 1}`, partitionValue: pval, hash: backendPlacement.hash, replicas: backendPlacement.replicas, row }]);
          addToNodeDataMap(row, nodes, replicationFactor, backendPlacement);
        }
      } catch (err) {
        skipped++;
        errors.push(`row ${i + 1} (${pval}): ${err.message}`);
      }
    }
    setWriteFlowAnim(null);
    return { imported, skipped, errors };
  }, [consistencyLevel, clusterName, nodes, replicationFactor, hashingType, addToNodeDataMap]);

  const onImportCsv = useCallback(async () => {
    if (!csvFile) { setCsvError("Choose a CSV file first."); return; }
    if (!partitionKey) { setCsvError("Choose a partition key."); return; }
    if (nodes.length === 0) { setCsvError("Add nodes to the ring first."); return; }
    setCsvError("");
    setIsCsvImporting(true);

    try {
      const text = await csvFile.text();
      const meta = parseCsvMeta(text);
      if (!meta) { setCsvError("CSV empty or unreadable."); return; }
      const { delim, headers, dataLines } = meta;

      if (schemaReady) {
        const tableColNames = columns.map(c => c.name);
        const missing = headers.filter(h => !tableColNames.includes(h));
        const unknown = tableColNames.filter(c => !headers.includes(c));
        if (missing.length || unknown.length) {
          const parts = [];
          if (missing.length) parts.push(`CSV has unknown columns: ${missing.join(", ")}`);
          if (unknown.length) parts.push(`Table columns not in CSV: ${unknown.join(", ")}`);
          setCsvError(parts.join(" · "));
          return;
        }
        const { imported, skipped, errors } = await runCsvInsertLoop({
          headers, dataLines, delim, pkCol: partitionKey,
          ksName: keyspaceName, tblName: tableName,
        });
        fetchCluster();
        setCsvImportResult({ real: true, mode: "mapped", rows_imported: imported, rows_skipped: skipped, errors: errors.slice(0, 5), partition_key: partitionKey, columns_detected: headers });
        setOutput({ real_import: true, mode: "mapped", rows_imported: imported, rows_skipped: skipped });
        return;
      }

      const colsObj = {};
      headers.forEach(h => { colsObj[h] = "text"; });
      await createKeyspace(replicationFactor, strategy, keyspaceName, clusterName);
      await createTable(colsObj, [partitionKey], tableName, keyspaceName, clusterName);
      setColumns(headers.map((h, i) => ({ name: h, type: "text", isPartitionKey: i === headers.indexOf(partitionKey) })));
      setSchemaReady(true);
      setRowValues({});

      const { imported, skipped, errors } = await runCsvInsertLoop({
        headers, dataLines, delim, pkCol: partitionKey,
        ksName: keyspaceName, tblName: tableName,
      });
      fetchCluster();
      setCsvImportResult({ real: true, mode: "auto", rows_imported: imported, rows_skipped: skipped, errors: errors.slice(0, 5), partition_key: partitionKey, columns_detected: headers });
      setOutput({ real_import: true, mode: "auto_schema", rows_imported: imported, rows_skipped: skipped, schema_created: `${keyspaceName}.${tableName}` });
    } catch (err) { setCsvError(`Import error: ${err.message}`); }
    finally { setIsCsvImporting(false); }
  }, [csvFile, partitionKey, parseCsvMeta, nodes, replicationFactor, hashingType,
    schemaReady, columns, consistencyLevel, keyspaceName, tableName, strategy, clusterName,
    runCsvInsertLoop, fetchCluster]);

  // ─── Derived state for right panel badge ──────────────────────────
  const downNodeCount = nodes.filter(n => n.status !== "up" && n.status !== "joining").length;

  const sidebarStyle = (open, side) => ({
    position: "absolute", top: 0, [side]: 0, height: "100%", width: SIDEBAR_W, zIndex: 20,
    background: "#0a0a14", transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
    transform: open ? "translateX(0)" : side === "left" ? `translateX(-100%)` : `translateX(100%)`,
    ...(side === "left" ? { borderRight: BORDER } : { borderLeft: BORDER }),
  });
  const sidebarInnerStyle = {
    width: SIDEBAR_W, height: "100%", overflowX: "hidden", overflowY: "auto",
    padding: "16px 14px", display: "flex", flexDirection: "column", gap: 0, boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#0a0a14", color: "#fff", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <header style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderBottom: BORDER, background: "rgba(255,255,255,0.02)" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>CassandraEdu</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: 2 }}>SIMULATOR</span>
        {anyJoining && <span style={{ fontSize: 10, color: "#f7c76a", marginLeft: 8, animation: "pulse 1.5s ease-in-out infinite" }}>⟳ waiting for Cassandra tokens...</span>}
        {schemaReady && <span style={{ fontSize: 10, color: "#6af7b8", marginLeft: 8 }}>✓ {keyspaceName}.{tableName}</span>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.15)" }}>cluster</span>
          <span style={{ color: ACCENT, fontWeight: 700 }}>{clusterName}</span>
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{nodes.length} node{nodes.length !== 1 ? "s" : ""} on ring</span>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ─── Left sidebar ─────────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0, width: leftOpen ? SIDEBAR_W : 0, transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={sidebarStyle(leftOpen, "left")}>
            <CollapseBtn open={leftOpen} onClick={() => setLeftOpen(o => !o)} side="left" />
            <div style={sidebarInnerStyle}>

              <Section title="Cluster">
                <label style={lbl}>Cluster Name</label>
                <input
                  style={{ ...inp, borderColor: editableClusterName.trim() !== clusterName ? "rgba(247,198,106,0.6)" : undefined }}
                  value={editableClusterName}
                  onChange={e => setEditableClusterName(e.target.value)}
                  onBlur={e => commitClusterName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); commitClusterName(e.target.value); } }}
                  placeholder="TestCluster"
                />
                {editableClusterName.trim() !== clusterName && (
                  <div style={{ fontSize: 9, color: "#f7c76a", marginBottom: 6, lineHeight: 1.5 }}>
                    ↵ Press Enter or click away to apply — will reset session
                  </div>
                )}
                <label style={lbl}>Partitioner</label>
                <select style={inp} value={hashingType} onChange={e => setHashingType(e.target.value)}>
                  <option value="murmur3">Murmur3Partitioner (default)</option>
                  <option value="md5">RandomPartitioner (MD5)</option>
                  <option value="fnv1a">FNV-1a (Simulated)</option>
                  <option value="xxhash">xxHash (Simulated)</option>
                </select>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", lineHeight: 1.5, fontStyle: "italic" }}>
                  Affects how partition keys are hashed to tokens. Drag the ring to add nodes.
                </div>
              </Section>

              <Section title="Setup">
                <label style={lbl}>Keyspace Name</label>
                <input style={inp} value={keyspaceName} onChange={e => { setKeyspaceName(e.target.value); setSchemaReady(false); }} placeholder="edu_keyspace" />
                <label style={lbl}>Table Name</label>
                <input style={inp} value={tableName} onChange={e => { setTableName(e.target.value); setSchemaReady(false); }} placeholder="edu_table" />
                <label style={lbl}>Columns</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  {columns.map((col, i) => (
                    <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        style={{ flex: 2, boxSizing: "border-box", fontSize: 10, padding: "3px 6px" }}
                        placeholder="col name" value={col.name}
                        onChange={e => { updateColumn(i, "name", e.target.value); setSchemaReady(false); }}
                      />
                      <select
                        style={{ flex: 1.5, fontSize: 10, padding: "3px 2px" }}
                        value={col.type}
                        onChange={e => { updateColumn(i, "type", e.target.value); setSchemaReady(false); }}
                      >
                        {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button
                        title={col.isPartitionKey ? "Remove partition key" : "Set as partition key"}
                        onClick={() => { togglePartitionKey(i); setSchemaReady(false); }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = col.isPartitionKey ? "rgba(32,178,170,0.5)" : "rgba(32,178,170,0.15)";
                          e.currentTarget.style.color = ACCENT;
                          e.currentTarget.style.borderColor = ACCENT;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = col.isPartitionKey ? "rgba(32,178,170,0.3)" : "rgba(255,255,255,0.05)";
                          e.currentTarget.style.color = col.isPartitionKey ? ACCENT : "rgba(255,255,255,0.3)";
                          e.currentTarget.style.borderColor = col.isPartitionKey ? ACCENT : "rgba(255,255,255,0.07)";
                        }}
                        style={{ width: 22, height: 22, flexShrink: 0, padding: 0, fontSize: 9, cursor: "pointer", background: col.isPartitionKey ? "rgba(32,178,170,0.3)" : "rgba(255,255,255,0.05)", border: col.isPartitionKey ? `1px solid ${ACCENT}` : BORDER, color: col.isPartitionKey ? ACCENT : "rgba(255,255,255,0.3)", borderRadius: 4, lineHeight: 1, transition: "background 0.15s, color 0.15s, border-color 0.15s" }}>PK</button>
                      {columns.length > 1 && (
                        <button
                          title="Remove column"
                          onClick={() => { removeColumn(i); setSchemaReady(false); }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = "rgba(247,106,106,0.3)";
                            e.currentTarget.style.borderColor = "#f76a6a";
                            e.currentTarget.style.transform = "scale(1.15)";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "rgba(247,106,106,0.1)";
                            e.currentTarget.style.borderColor = "rgba(247,106,106,0.3)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                          style={{ width: 18, height: 18, flexShrink: 0, padding: 0, fontSize: 11, cursor: "pointer", background: "rgba(247,106,106,0.1)", border: "1px solid rgba(247,106,106,0.3)", color: "#f76a6a", borderRadius: 4, lineHeight: 1, transition: "background 0.15s, border-color 0.15s, transform 0.1s" }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => { addColumn(); setSchemaReady(false); }} style={{ ...btn, fontSize: 10, opacity: 0.7 }}>+ Add Column</button>
                {partitionKeys.length > 0 && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                    PK: <span style={{ color: ACCENT }}>{partitionKeys.join(", ")}</span>
                  </div>
                )}
                <button
                  style={{ ...btn, background: "rgba(32,178,170,0.15)", border: `1px solid ${ACCENT}`, color: ACCENT, fontWeight: 700, transition: "background 0.15s, box-shadow 0.15s, transform 0.1s" }}
                  onClick={handleSetup}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(32,178,170,0.3)";
                    e.currentTarget.style.boxShadow = "0 0 10px rgba(32,178,170,0.25)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(32,178,170,0.15)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                  title={`Creates keyspace '${keyspaceName}' (${strategy}, RF=${replicationFactor}), then table '${tableName}'`}
                >⚙ Apply Schema</button>
                {schemaReady && (
                  <div style={{ fontSize: 9, color: "#6af7b8", marginTop: 2, marginBottom: 4, textAlign: "center" }}>✓ Schema ready</div>
                )}
              </Section>

              <Section title="Data Entry">
                {!schemaReady && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8, fontStyle: "italic" }}>Complete Setup first.</div>
                )}

                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Consistency</label>
                    <select style={{ ...inp, marginBottom: 0 }} value={consistencyLevel} onChange={e => setConsistencyLevel(e.target.value)}>
                      <option value="ONE">ONE</option>
                      <option value="QUORUM">QUORUM</option>
                      <option value="ALL">ALL</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Strategy</label>
                    <select style={{ ...inp, marginBottom: 0 }} value={strategy} onChange={e => { setStrategy(e.target.value); setSchemaReady(false); }}>
                      <option value="SimpleStrategy">Simple</option>
                      <option value="NetworkTopologyStrategy">Network</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Rep Factor</label>
                    <select style={{ ...inp, marginBottom: 0 }} value={replicationFactor} onChange={e => { setReplicationFactor(Number(e.target.value)); setSchemaReady(false); }}>
                      <option value={1}>RF = 1</option>
                      <option value={2}>RF = 2</option>
                      <option value={3}>RF = 3</option>
                    </select>
                  </div>
                </div>

                <Tabs
                  tabs={[{ id: "manual", label: "Manual" }, { id: "csv", label: "CSV Import" }]}
                  active={dataTab}
                  onChange={setDataTab}
                />

                {dataTab === "manual" && (
                  <>
                    <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1, marginBottom: 4, marginTop: 2 }}>WRITE</div>
                    {schemaReady ? (
                      columns.map(col => (
                        <div key={col.name}>
                          <label style={{ ...lbl, color: col.isPartitionKey ? ACCENT : "rgba(255,255,255,0.4)" }}>
                            {col.name} <span style={{ fontSize: 9, opacity: 0.6 }}>({col.type}){col.isPartitionKey ? " [PK]" : ""}</span>
                          </label>
                          <input
                            style={inp} placeholder={`${col.name}...`}
                            value={rowValues[col.name] ?? ""}
                            onChange={e => setRowValues(prev => ({ ...prev, [col.name]: e.target.value }))}
                          />
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 8, fontStyle: "italic" }}>No schema yet.</div>
                    )}
                    <button style={{ ...btn, opacity: schemaReady ? 1 : 0.4 }} onClick={handleWrite}>Write to Cassandra</button>
                    <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>READ</div>
                    <label style={lbl}>Filter by partition key</label>
                    <input
                      style={inp} placeholder={primaryPartitionKey || "partition key value"}
                      value={filterKey} onChange={e => setFilterKey(e.target.value)}
                    />
                    <button style={btn} onClick={() => {
                      const filters = filterKey.trim() && primaryPartitionKey ? { [primaryPartitionKey]: filterKey.trim() } : {};
                      handleRead(filters);
                    }}>Read from Cassandra</button>
                    <button style={{ ...btn, opacity: 0.7 }} onClick={() => handleRead({})}>Read All</button>
                    {filterKey && primaryPartitionKey && (
                      <>
                        <button style={btn} onClick={() =>
                          getEndpoints(filterKey, keyspaceName, tableName, clusterName).then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                        }>Get Endpoints for key</button>
                        <button style={btn} onClick={() =>
                          explainPartition(filterKey, keyspaceName, tableName, clusterName).then(r => setOutput(r)).catch(e => setOutput({ error: e.message }))
                        }>Explain Partition</button>
                      </>
                    )}
                  </>
                )}

                {dataTab === "csv" && (
                  <>
                    <div style={{
                      fontSize: 9, marginBottom: 8, padding: "4px 8px", borderRadius: 4,
                      background: schemaReady ? "rgba(106,247,184,0.07)" : "rgba(247,198,106,0.07)",
                      border: schemaReady ? "1px solid rgba(106,247,184,0.2)" : "1px solid rgba(247,198,106,0.2)",
                      color: schemaReady ? "#6af7b8" : "#f7c76a", lineHeight: 1.6
                    }}>
                      {schemaReady
                        ? `Mode B — inserting into ${keyspaceName}.${tableName} · CSV headers must match table columns exactly`
                        : `Mode A — CSV headers will auto-create keyspace & table (all columns as text)`}
                    </div>
                    <input type="file" accept=".csv,text/csv" style={{ ...inp, fontSize: 10 }} onChange={onFileChange} />
                    {csvColumns.length > 0 && (
                      <div style={{ background: "rgba(32,178,170,0.05)", border: "1px solid rgba(32,178,170,0.15)", borderRadius: 5, padding: "6px 8px", marginBottom: 6, fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                        <span style={{ color: ACCENT, fontWeight: 700 }}>Columns:</span><br />
                        {csvColumns.map((c, i) => {
                          const mismatch = schemaReady && !columns.map(col => col.name).includes(c);
                          return (
                            <span key={c}>
                              <span style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}.</span>{" "}
                              <span style={{ color: mismatch ? "#f76a6a" : "rgba(255,255,255,0.7)" }}>{c}{mismatch ? " ✗" : ""}</span>
                              {i < csvColumns.length - 1 ? "  " : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {csvColumns.length > 0 && (
                      <>
                        <label style={lbl}>Partition Key</label>
                        <select style={inp} value={partitionKey} onChange={e => setPartitionKey(e.target.value)}>
                          {csvColumns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    )}
                    <style>
                      {`
                        @keyframes pulseOrange {
                          0% { background: rgba(247,198,106,0.15); border-color: rgba(247,198,106,0.4); box-shadow: 0 0 5px rgba(247,198,106,0.2); }
                          50% { background: rgba(247,198,106,0.4); border-color: rgba(247,198,106,1); box-shadow: 0 0 15px rgba(247,198,106,0.6); }
                          100% { background: rgba(247,198,106,0.15); border-color: rgba(247,198,106,0.4); box-shadow: 0 0 5px rgba(247,198,106,0.2); }
                        }
                      `}
                    </style>
                    <button
                      style={{
                        ...btn,
                        background: isCsvImporting ? "rgba(247,198,106,0.2)" : (csvFile && partitionKey && nodes.length > 0 ? "rgba(32,178,170,0.15)" : "rgba(255,255,255,0.03)"),
                        border: isCsvImporting ? "1px solid #f7c76a" : (csvFile && partitionKey && nodes.length > 0 ? `1px solid ${ACCENT}` : BORDER),
                        color: isCsvImporting ? "#f7c76a" : (csvFile && partitionKey && nodes.length > 0 ? ACCENT : "rgba(255,255,255,0.3)"),
                        fontWeight: 700,
                        animation: isCsvImporting ? "pulseOrange 1.5s infinite ease-in-out" : "none",
                        transition: isCsvImporting ? "none" : "background 0.15s, border-color 0.15s, color 0.15s",
                      }}
                      onClick={onImportCsv}
                      disabled={isCsvImporting}
                    >
                      {isCsvImporting ? "⏳ Importing..." : (schemaReady ? "Import CSV" : "Import & Auto-Create Schema")}
                    </button>
                    {csvError && (
                      <div style={{ background: "rgba(247,106,106,0.08)", border: "1px solid rgba(247,106,106,0.3)", borderRadius: 5, padding: "6px 8px", fontSize: 10, color: "#f76a6a", marginBottom: 4 }}>⚠ {csvError}</div>
                    )}
                    {csvImportResult?.real && (
                      <div style={{ background: "rgba(32,178,170,0.08)", border: "1px solid rgba(32,178,170,0.3)", borderRadius: 6, padding: "8px 10px", fontSize: 10, lineHeight: 1.8 }}>
                        <div style={{ color: ACCENT, fontWeight: 700, marginBottom: 4 }}>
                          {csvImportResult.mode === "auto" ? "✓ Auto-schema + import" : "✓ Import Cassandra"}
                        </div>
                        <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Inserted: </span><strong style={{ color: "#6af7b8" }}>{csvImportResult.rows_imported}</strong></div>
                        {csvImportResult.rows_skipped > 0 && (
                          <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Skipped: </span><strong style={{ color: "#f7c76a" }}>{csvImportResult.rows_skipped}</strong></div>
                        )}
                        {csvImportResult.errors?.length > 0 && (
                          <div style={{ color: "#f76a6a", fontSize: 9, marginTop: 4 }}>
                            {csvImportResult.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                          </div>
                        )}
                        <div><span style={{ color: "rgba(255,255,255,0.4)" }}>PK: </span><strong>{csvImportResult.partition_key}</strong></div>
                      </div>
                    )}
                  </>
                )}
              </Section>

              <Section title="Cluster Reset">
                <button
                  style={{ background: "rgba(247,106,106,0.15)", borderColor: "#f76a6a", color: "#f76a6a", ...btn }}
                  onClick={() => {
                    deleteCluster(clusterName).then(() => {
                      clusterInitializedRef.current = false;
                      setNodes([]); setLeavingNodes([]); setClusterData({}); setNodeDataMap({});
                      usedNamesRef.current.clear(); setOutput(null);
                      setCsvFile(null); setCsvColumns([]); setCsvDistribution([]); setCsvImportResult(null); setCsvError("");
                      setRowValues({}); setSchemaReady(false); prevGossipRef.current = {};
                    }).catch(e => setOutput({ error: e.message }));
                  }}
                >Delete Cluster</button>
              </Section>

            </div>
          </div>
        </div>

        {/* ─── Main canvas ──────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 20px", gap: 16, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", display: "flex", gap: 24 }}>
            <span><strong style={{ color: ACCENT }}>Drag +</strong> → add node</span>
            <span><strong style={{ color: ACCENT }}>Hover</strong> → inspect data</span>
            <span><strong style={{ color: "#f59e0b" }}>🛑 stop</strong> → simulate failure</span>
            <span><strong style={{ color: "#f76a6a" }}>× remove</strong> → delete node</span>
          </div>

          {replicatedNodes.length > 0 && (
            <div style={{ ...card, width: "100%", maxWidth: 900, marginBottom: 0 }}>
              <div style={h3}>Distribution / Node</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {replicatedNodes.map(n => {
                  const count = replicatedCounts[n] ?? 0;
                  const pct = maxReplicated > 0 ? Math.round((count / maxReplicated) * 100) : 0;
                  return (
                    <div key={n} style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 10, color: ACCENT }}>{n}</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{count}</span>
                      </div>
                      <div style={{ border: BORDER, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: ACCENT, height: 8, transition: "width .4s", borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 900 }}>
            <TokenRing
              nodes={nodes} leavingNodes={leavingNodes} cluster={clusterData}
              nodeDataMap={nodeDataMap} onAddNode={handleAddNode} onRemoveNode={handleRemoveNode}
              onStopNode={handleStopNode}
              csvDistribution={csvDistribution} disabled={anyJoining}
              writeFlowAnim={writeFlowAnim} gossipAnim={gossipAnim}
              hashingType={hashingType}
            />
          </div>

          {/* ─── Bottom panels: Output + Hints + ReadRepair ──────────── */}
          <div style={{ width: "100%", maxWidth: 900 }}>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 2, marginBottom: 10, borderBottom: "1px solid rgba(32,178,170,0.15)" }}>
              {[
                { id: "output", label: "Output" },
                { id: "hints", label: downNodeCount > 0 ? `⚡ Hints (${downNodeCount} down)` : "⚡ Hints" },
                { id: "repair", label: "🔍 Read Repair" },
              ].map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  style={{
                    flex: 1, padding: "6px 4px", fontSize: 10, cursor: "pointer",
                    background: rightTab === t.id ? "rgba(32,178,170,0.15)" : "transparent",
                    border: "none", borderBottom: rightTab === t.id ? `2px solid ${ACCENT}` : "2px solid transparent",
                    color: rightTab === t.id ? ACCENT : t.id === "hints" && downNodeCount > 0 ? "#f59e0b" : "rgba(255,255,255,0.4)",
                    fontWeight: rightTab === t.id ? 700 : 400,
                    fontFamily: "inherit", letterSpacing: 1, transition: "all 0.15s",
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {rightTab === "output" && (
              <div style={{ ...card, marginBottom: 0 }}>
                <div style={h3}>Output</div>
                {output
                  ? <div style={{ fontSize: 10, maxHeight: 300, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(output, null, 2)}</div>
                  : <span style={{ opacity: 0.3, fontSize: 11 }}>No output yet.</span>}
              </div>
            )}

            {rightTab === "hints" && (
              <HintedHandoffPanel
                clusterName={clusterName}
                nodes={nodes}
                getHints={getHints}
                startNode={handleStartNode}
              />
            )}

            {rightTab === "repair" && (
              <ReadRepairPanel
                clusterName={clusterName}
                nodes={nodes}
                readData={readData}
                keyspaceName={keyspaceName}
                tableName={tableName}
                consistencyLevel={consistencyLevel}
                getRepairStats={getRepairStats}
              />
            )}
          </div>
        </main>
      </div>

      {/* ─── CAP Error Modal ──────────────────────────────────────── */}
      {capError && (
        <CAPErrorModal
          error={capError}
          onClose={() => setCapError(null)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, fontWeight: 700, padding: "10px 2px 8px", borderBottom: "1px solid rgba(32,178,170,0.15)", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}