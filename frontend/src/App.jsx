import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addNode, removeNode, writeData, readData,
  getCluster, deleteCluster,
  createKeyspace, createTable,
  getEndpoints, explainPartition, getGossip, getBatchHashes,
  getHints, getRepairStats, startNode
} from "./services/api";
import TokenRing from "./components/TokenRing";
import CAPErrorModal from "./components/CAPErrorModal";
import HintedHandoffPanel from "./components/HintedHandoffPanel";
import ReadRepairPanel from "./components/ReadRepairPanel";
import { simulatePlacement } from "./utils/cassandraSimulation";
import "./App.css";

const NAME_POOL = ["NodeA", "NodeB", "NodeC", "NodeD", "NodeE", "NodeF"];
const BORDER = "1px solid #2E4560";
const BG_CARD = "#243447";
const ACCENT = "#18B4C8";
const card = { background: BG_CARD, border: BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
const h3 = { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, marginBottom: 8, fontWeight: 700, margin: "0 0 10px" };
const inp = { width: "100%", boxSizing: "border-box", marginBottom: 6 };
const btn = { width: "100%", marginBottom: 4 };
const lbl = { fontSize: 10, color: "#5A7A96", marginBottom: 3, display: "block" };

// Colonnes fixes : id (PK) + value
const FIXED_COLUMNS = [
  { name: "id", type: "text", isPartitionKey: true },
  { name: "value", type: "text", isPartitionKey: false },
];

async function pollForTokens(nodeId, fetchClusterFn, { intervalMs = 1500, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) { reject(new Error(`Timeout waiting for tokens on ${nodeId}`)); return; }
      try {
        const arr = await fetchClusterFn();
        const found = Array.isArray(arr) ? arr.find(n => n.name === nodeId) : null;
        if (found && Array.isArray(found.tokens) && found.tokens.length > 0) resolve(found);
        else setTimeout(tick, intervalMs);
      } catch { setTimeout(tick, intervalMs); }
    };
    tick();
  });
}

function CollapseBtn({ open, onClick, side }) {
  return (
    <button onClick={onClick}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [side === "left" ? "right" : "left"]: -20, zIndex: 10,
        width: 32, height: 64,
        borderRadius: side === "left" ? "0 8px 8px 0" : "8px 0 0 8px",
        background: "#FFFFFF", border: BORDER,
        [side === "left" ? "borderLeft" : "borderRight"]: "none",
        color: ACCENT, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, padding: 0, lineHeight: 1, transition: "background 0.2s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(32,178,170,0.15)"}
      onMouseLeave={e => e.currentTarget.style.background = "#FFFFFF"}
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
            color: active === t.id ? ACCENT : "#5A7A96",
            fontWeight: active === t.id ? 700 : 400,
            fontFamily: "inherit", letterSpacing: 1, transition: "all 0.15s",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Message pédagogique affiché après Write/Read
function PedaMessage({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div style={{
      background: "rgba(24,180,200,0.10)",
      border: `1px solid ${ACCENT}`,
      borderRadius: 8,
      padding: "10px 14px",
      marginBottom: 8,
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>💡</span>
      <span style={{ fontSize: 11, color: "#1e56a0", lineHeight: 1.6, flex: 1, fontWeight: 500 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#5A7A96", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
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
  const addNodeQueueRef = useRef(Promise.resolve());

  const [clusterName, setClusterName] = useState("TestCluster");
  const [editableClusterName, setEditableClusterName] = useState("TestCluster");
  const [hashingType, setHashingType] = useState("murmur3");

  const [keyspaceName, setKeyspaceName] = useState("edu_keyspace");
  const [strategy, setStrategy] = useState("SimpleStrategy");
  const [replicationFactor, setReplicationFactor] = useState(2);
  const [tableName] = useState("edu_table");

  // Colonnes fixes — pas d'état éditable
  const columns = FIXED_COLUMNS;
  const partitionKeys = ["id"];
  const primaryPartitionKey = "id";

  const [schemaReady, setSchemaReady] = useState(false);
  const [schemaMode, setSchemaMode] = useState("manual");
  const [dataTab, setDataTab] = useState("manual");
  const [rightTab, setRightTab] = useState("output");

  const [rowValues, setRowValues] = useState({});
  const [consistencyLevel, setConsistencyLevel] = useState("QUORUM");
  const [filterKey, setFilterKey] = useState("");
  const [output, setOutput] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(null);

  // Coordinator node sélectionné par l'utilisateur
  const [coordinatorNode, setCoordinatorNode] = useState("");

  // Message pédagogique
  const [pedaMsg, setPedaMsg] = useState("");

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

  const [capError, setCapError] = useState(null);
  const [isCsvImporting, setIsCsvImporting] = useState(false);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const SIDEBAR_W = 280;

  // Noeuds actifs pour le select coordinator
  const upNodes = useMemo(() => nodes.filter(n => n.status === "up"), [nodes]);

  // Sync coordinatorNode quand la liste change
  useEffect(() => {
    if (upNodes.length === 0) { setCoordinatorNode(""); return; }
    if (!upNodes.find(n => n.id === coordinatorNode)) {
      setCoordinatorNode(upNodes[0].id);
    }
  }, [upNodes, coordinatorNode]);

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
    addNodeQueueRef.current = Promise.resolve();
    setNodes([]); setLeavingNodes([]); setClusterData({}); setNodeDataMap({});
    usedNamesRef.current.clear();
    setOutput(null); setSchemaReady(false); prevGossipRef.current = {};
    setCsvFile(null); setCsvColumns([]); setCsvDistribution([]); setCsvImportResult(null); setCsvError("");
    setRowValues({});
    setLoadingMsg(null);
    setPedaMsg("");
  }, [clusterName]);

  const doReset = useCallback(() => {
    deleteCluster(clusterName).then(() => {
      clusterInitializedRef.current = false;
      addNodeQueueRef.current = Promise.resolve();
      setNodes([]); setLeavingNodes([]); setClusterData({}); setNodeDataMap({});
      usedNamesRef.current.clear(); setOutput(null); setLoadingMsg(null);
      setCsvFile(null); setCsvColumns([]); setCsvDistribution([]); setCsvImportResult(null); setCsvError("");
      setRowValues({}); setSchemaReady(false); prevGossipRef.current = {};
      setPedaMsg("");
    }).catch(e => setOutput({ error: e.message }));
  }, [clusterName]);

  const getNextName = useCallback(() =>
    NAME_POOL.find(n => !usedNamesRef.current.has(n)) ?? `Node${Date.now()}`, []);

  const handleAddNode = useCallback((token) => {
    const id = getNextName();
    if (usedNamesRef.current.has(id)) return;
    usedNamesRef.current.add(id);
    const stamp = Date.now();

    setNodes(prev => [...prev, { id, token, tokens: [], status: "joining", stamp }]);

    addNodeQueueRef.current = addNodeQueueRef.current.then(async () => {
      setLoadingMsg(`⟳ Creating ${id} — waiting for Cassandra...`);
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
      } finally {
        setLoadingMsg(null);
      }
    });
  }, [clusterName, fetchCluster, fetchClusterRaw, getNextName]);

  const handleRemoveNode = useCallback(async (nodeId) => {
    const leaving = nodes.find(n => n.id === nodeId);
    if (leaving) setLeavingNodes(prev => [...prev, { ...leaving, status: "leaving" }]);
    usedNamesRef.current.delete(nodeId);
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setTimeout(() => setLeavingNodes(prev => prev.filter(n => n.id !== nodeId)), 600);
    try { await removeNode(nodeId, clusterName); await fetchCluster(); } catch (e) { console.error("removeNode failed", e); }
  }, [clusterName, fetchCluster, nodes]);

  const handleStartNode = useCallback(async (nodeId, clusterNameArg) => {
    try {
      setLoadingMsg(`⟳ Restarting ${nodeId}...`);
      await startNode(nodeId, clusterNameArg ?? clusterName);
      const nodeInfo = await pollForTokens(nodeId, fetchClusterRaw);
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, status: "up", tokens: nodeInfo.tokens, ip: nodeInfo.ip ?? n.ip } : n
      ));
      await fetchCluster();
    } catch (e) {
      console.error("startNode failed", e);
    } finally {
      setLoadingMsg(null);
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

  const handleSetup = async () => {
    if (!keyspaceName.trim()) { setOutput({ error: "Keyspace name required" }); return; }
    try {
      setLoadingMsg(`⟳ Creating keyspace '${keyspaceName}'...`);
      const colsObj = { id: "text", value: "text" };
      await createKeyspace(replicationFactor, strategy, keyspaceName, clusterName);
      setLoadingMsg(`⟳ Creating table '${tableName}'...`);
      await createTable(colsObj, ["id"], tableName, keyspaceName, clusterName);
      setSchemaReady(true);
      setRowValues({});
      setOutput({ success: `Keyspace '${keyspaceName}' and table '${tableName}' created.`, columns: "id (text) [PK], value (text)" });
    } catch (e) {
      setOutput({ error: e.message });
    } finally {
      setLoadingMsg(null);
    }
  };

  const handleWrite = async () => {
    if (!schemaReady) { setOutput({ error: "Run Setup first" }); return; }
    const pkVal = rowValues["id"];
    if (!pkVal?.trim()) { setOutput({ error: "Partition key 'id' cannot be empty" }); return; }
    try {
      setLoadingMsg(`⟳ Envoi à ${coordinatorNode || "un nœud"} — écriture de '${pkVal}'...`);
      const r = await writeData(rowValues, consistencyLevel, keyspaceName, tableName, clusterName);
      setOutput(r);

      let backendPlacement = null;
      try {
        const hashesObj = await getBatchHashes([String(pkVal)]);
        if (hashesObj[String(pkVal)] != null) {
          backendPlacement = simulatePlacement({
            key: String(pkVal), nodes, replicationFactor,
            precomputedHash: hashesObj[String(pkVal)]
          });
        }
      } catch {
        backendPlacement = simulatePlacement({ key: String(pkVal), nodes, replicationFactor, hashingType });
      }

      addToNodeDataMap(rowValues, nodes, replicationFactor, backendPlacement);
      if (backendPlacement) {
        setCsvDistribution(prev => [...prev, { rowId: `manual_${Date.now()}`, partitionValue: String(pkVal), hash: backendPlacement.hash, replicas: backendPlacement.replicas, row: rowValues }]);
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

      // Message pédagogique
      if (coordinatorNode) {
        setPedaMsg(
          `Tu t'es connecté à ${coordinatorNode}. Ce nœud a reçu ta requête, calculé le hash de "${pkVal}" et routé l'écriture vers le(s) bon(s) replica(s) — sans être un maître. Essaie avec un autre nœud d'entrée : les données arrivent exactement au même endroit !`
        );
      }
    } catch (e) {
      setOutput({ error: e.message });
    } finally {
      setLoadingMsg(null);
    }
  };

  const handleRead = useCallback(async (filters = {}) => {
    try {
      const filterVal = filters[primaryPartitionKey];
      setLoadingMsg(filterVal ? `⟳ Envoi à ${coordinatorNode || "un nœud"} — lecture de '${filterVal}'...` : "⟳ Lecture en cours...");
      const r = await readData(filters, consistencyLevel, keyspaceName, tableName, clusterName);
      setOutput(r);

      // Message pédagogique
      if (coordinatorNode && filterVal) {
        setPedaMsg(
          `Tu t'es connecté à ${coordinatorNode} pour lire "${filterVal}". Ce nœud a contacté les réplicas responsables de cette clé et retourné la réponse — sans être un point central. Change de nœud d'entrée et relance : le résultat est identique !`
        );
      }
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
          message: msg, queriedKey: filterVal ?? "(all)",
          replicationFactor, consistencyLevel, nodes, affectedEntry, deadNodes, nodeDataMap,
        });
      } else {
        setOutput({ error: msg });
      }
    } finally {
      setLoadingMsg(null);
    }
  }, [consistencyLevel, keyspaceName, tableName, clusterName, nodes, primaryPartitionKey,
    csvDistribution, replicationFactor, hashingType, nodeDataMap, coordinatorNode]);

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

    const uniqueKeys = [...new Set(dataLines.map(line => {
      const parts = line.split(delim).map(c => c.trim());
      return parts[headers.indexOf(pkCol)];
    }).filter(Boolean))];

    let hashesObj = {};
    try { hashesObj = await getBatchHashes(uniqueKeys); } catch (e) { console.error("Batch hash failed", e); }

    const animDuration = dataLines.length > 50 ? 80 : (dataLines.length > 15 ? 150 : 400);

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      if (!line.trim()) continue;
      const parts = line.split(delim).map(c => c.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = parts[idx] ?? ""; });
      const pval = row[pkCol];
      if (!pval) { skipped++; continue; }
      try {
        setLoadingMsg(`⟳ Importing row ${i + 1}/${dataLines.length} — '${pval}'`);
        await writeData(row, consistencyLevel, ksName, tblName, clusterName);
        imported++;

        let backendPlacement = null;
        if (hashesObj[String(pval)] != null) {
          backendPlacement = simulatePlacement({ key: String(pval), nodes, replicationFactor, precomputedHash: hashesObj[String(pval)] });
        } else {
          backendPlacement = simulatePlacement({ key: String(pval), nodes, replicationFactor, hashingType });
        }

        if (backendPlacement?.hash != null && backendPlacement.replicas?.length > 0) {
          await new Promise(res => setTimeout(res, animDuration));
          setCsvDistribution(prev => [...prev, { rowId: `row${i + 1}`, partitionValue: pval, hash: backendPlacement.hash, replicas: backendPlacement.replicas, row }]);
          addToNodeDataMap(row, nodes, replicationFactor, backendPlacement);
        }
      } catch (err) {
        skipped++;
        errors.push(`row ${i + 1} (${pval}): ${err.message}`);
      }
    }
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
        const { imported, skipped, errors } = await runCsvInsertLoop({ headers, dataLines, delim, pkCol: partitionKey, ksName: keyspaceName, tblName: tableName });
        fetchCluster();
        setCsvImportResult({ real: true, mode: "mapped", rows_imported: imported, rows_skipped: skipped, errors: errors.slice(0, 5), partition_key: partitionKey, columns_detected: headers });
        setOutput({ real_import: true, mode: "mapped", rows_imported: imported, rows_skipped: skipped });
        return;
      }

      const colsObj = {};
      headers.forEach(h => { colsObj[h] = "text"; });
      setLoadingMsg(`⟳ Creating keyspace '${keyspaceName}'...`);
      await createKeyspace(replicationFactor, strategy, keyspaceName, clusterName);
      setLoadingMsg(`⟳ Creating table '${tableName}'...`);
      await createTable(colsObj, [partitionKey], tableName, keyspaceName, clusterName);
      setSchemaReady(true);
      setRowValues({});

      const { imported, skipped, errors } = await runCsvInsertLoop({ headers, dataLines, delim, pkCol: partitionKey, ksName: keyspaceName, tblName: tableName });
      fetchCluster();
      setCsvImportResult({ real: true, mode: "auto", rows_imported: imported, rows_skipped: skipped, errors: errors.slice(0, 5), partition_key: partitionKey, columns_detected: headers });
      setOutput({ real_import: true, mode: "auto_schema", rows_imported: imported, rows_skipped: skipped, schema_created: `${keyspaceName}.${tableName}` });
    } catch (err) {
      setCsvError(`Import error: ${err.message}`);
    } finally {
      setIsCsvImporting(false);
      setLoadingMsg(null);
    }
  }, [csvFile, partitionKey, parseCsvMeta, nodes, replicationFactor, hashingType,
    schemaReady, columns, consistencyLevel, keyspaceName, tableName, strategy, clusterName,
    runCsvInsertLoop, fetchCluster]);

  const downNodeCount = nodes.filter(n => n.status !== "up" && n.status !== "joining").length;

  const sidebarStyle = (open, side) => ({
    position: "absolute", top: 0, [side]: 0, height: "100%", width: SIDEBAR_W, zIndex: 20,
    background: "#F0F4F8", transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
    transform: open ? "translateX(0)" : side === "left" ? `translateX(-100%)` : `translateX(100%)`,
    ...(side === "left" ? { borderRight: BORDER } : { borderLeft: BORDER }),
  });
  const sidebarInnerStyle = {
    width: SIDEBAR_W, height: "100%", overflowX: "hidden", overflowY: "auto",
    padding: "16px 14px", display: "flex", flexDirection: "column", gap: 0, boxSizing: "border-box",
  };

  // Select nœud d'entrée — réutilisé dans Write et Read
  const NodeEntrySelect = () => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ ...lbl, color: ACCENT }}>
        Nœud d'entrée
        <span style={{ color: "#5A7A96", fontWeight: 400, marginLeft: 4 }}>— tu te connectes à ce nœud</span>
      </label>
      {upNodes.length === 0
        ? <div style={{ fontSize: 10, color: "#5A7A96", fontStyle: "italic", marginBottom: 4 }}>Aucun nœud UP</div>
        : (
          <select
            style={{ ...inp, marginBottom: 0, border: `1px solid ${ACCENT}`, color: ACCENT, background: "rgba(24,180,200,0.07)", fontWeight: 600 }}
            value={coordinatorNode}
            onChange={e => setCoordinatorNode(e.target.value)}
          >
            {upNodes.map(n => (
              <option key={n.id} value={n.id}>{n.id}</option>
            ))}
          </select>
        )
      }
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F0F4F8", color: "#1A2B3C", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ height: 42, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderBottom: BORDER, background: "#FFFFFF" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>CassandraEdu</span>
        <span style={{ fontSize: 11, color: "#8AA8C0", letterSpacing: 2 }}>SIMULATOR</span>

        {loadingMsg && (
          <span style={{ fontSize: 10, color: "#f7c76a", marginLeft: 8, animation: "pulse 1.5s ease-in-out infinite" }}>
            {loadingMsg}
          </span>
        )}
        {!loadingMsg && anyJoining && (
          <span style={{ fontSize: 10, color: "#f7c76a", marginLeft: 8, animation: "pulse 1.5s ease-in-out infinite" }}>
            ⟳ waiting for Cassandra tokens...
          </span>
        )}

        {schemaReady && <span style={{ fontSize: 10, color: "#6af7b8", marginLeft: 8 }}>✓ {keyspaceName}.{tableName}</span>}

        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#8AA8C0" }}>{nodes.length} node{nodes.length !== 1 ? "s" : ""} on ring</span>
          {/* Bouton reset dans le header */}
          <button
            onClick={doReset}
            title="Reset cluster — removes all nodes and data"
            style={{
              fontSize: 10, padding: "3px 10px", cursor: "pointer",
              background: "rgba(247,106,106,0.10)", border: "1px solid rgba(247,106,106,0.4)",
              color: "#f76a6a", borderRadius: 5, fontFamily: "inherit", fontWeight: 600,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(247,106,106,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(247,106,106,0.10)"}
          >
            ⟳ Reset Cluster
          </button>
        </span>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ─── Left sidebar ─────────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0, width: leftOpen ? SIDEBAR_W : 0, transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={sidebarStyle(leftOpen, "left")}>
            <CollapseBtn open={leftOpen} onClick={() => setLeftOpen(o => !o)} side="left" />
            <div style={sidebarInnerStyle}>

              {/* ── Section Cluster (conservée) ── */}
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
                <label style={lbl}>Hashing Type</label>
                <select style={inp} value={hashingType} onChange={e => setHashingType(e.target.value)}>
                  <option value="murmur3">Murmur3 (default)</option>
                  <option value="md5">MD5</option>
                  <option value="fnv1a">FNV-1a</option>
                  <option value="xxhash">xxHash</option>
                </select>
                <div style={{ fontSize: 9, color: "#8AA8C0", lineHeight: 1.5, fontStyle: "italic" }}>
                  Drag the ring to add nodes.
                </div>
              </Section>

              {/* ── Section Setup (colonnes fixes, pas de Strategy editable) ── */}
              <Section title="Schema Mode">
                <div className="mode-switcher">
                  <button
                    className={`mode-choice ${schemaMode === "manual" ? "active" : ""}`}
                    onClick={() => {
                      setSchemaMode("manual");
                      setDataTab("manual");
                    }}
                  >
                    <strong>Manual</strong>
                    <span>Create schema step by step</span>
                  </button>

                  <button
                    className={`mode-choice ${schemaMode === "csv" ? "active" : ""}`}
                    onClick={() => {
                      setSchemaMode("csv");
                      setDataTab("csv");
                    }}
                  >
                    <strong>CSV Auto</strong>
                    <span>Import CSV and create schema</span>
                  </button>
                </div>

                {schemaMode === "manual" && (
                  <>
                    <div className="ux-help-box">
                      Manual mode: choose keyspace, strategy and RF before writing data.
                    </div>

                    <label style={lbl}>Keyspace Name</label>
                    <input
                      style={inp}
                      value={keyspaceName}
                      onChange={e => {
                        setKeyspaceName(e.target.value);
                        setSchemaReady(false);
                      }}
                      placeholder="edu_keyspace"
                    />

                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Strategy</label>
                        <select
                          style={{ ...inp, marginBottom: 0 }}
                          value={strategy}
                          onChange={e => {
                            setStrategy(e.target.value);
                            setSchemaReady(false);
                          }}
                        >
                          <option value="SimpleStrategy">Simple</option>
                          <option value="NetworkTopologyStrategy">Network</option>
                        </select>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Replication Factor</label>
                        <select
                          style={{ ...inp, marginBottom: 0 }}
                          value={replicationFactor}
                          onChange={e => {
                            setReplicationFactor(Number(e.target.value));
                            setSchemaReady(false);
                          }}
                        >
                          <option value={1}>RF = 1</option>
                          <option value={2}>RF = 2</option>
                          <option value={3}>RF = 3</option>
                        </select>
                      </div>
                    </div>

                    <div className="schema-preview">
                      <strong>Fixed table:</strong><br />
                      <span>id</span> text [PK] · <span>value</span> text
                    </div>

                    <button
                      style={{ ...btn }}
                      onClick={handleSetup}
                      disabled={!!loadingMsg}
                    >
                      {loadingMsg ? loadingMsg : "Create Manual Schema"}
                    </button>

                    {schemaReady && (
                      <div className="success-mini">
                        ✓ Schema ready: {keyspaceName}.{tableName}
                      </div>
                    )}
                  </>
                )}

                {schemaMode === "csv" && (
                  <div className="ux-help-box csv">
                    CSV mode: no manual setup required. Upload a CSV, choose the partition key, then import.
                  </div>
                )}
              </Section>

              {/* ── Section Data Entry ── */}
              <Section title="Data Entry">
                {!schemaReady && schemaMode === "manual" && (
                  <div className="warning-mini">
                    Create the manual schema first.
                  </div>
                )}

                {!schemaReady && schemaMode === "csv" && (
                  <div className="success-mini">
                    CSV will create the schema automatically.
                  </div>
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
                </div>

                {schemaMode === "manual" && (
                  <Tabs
                    tabs={[{ id: "manual", label: "Manual Data" }]}
                    active={dataTab}
                    onChange={setDataTab}
                  />
                )}

                {schemaMode === "csv" && (
                  <Tabs
                    tabs={[{ id: "csv", label: "CSV Auto Import" }]}
                    active={dataTab}
                    onChange={setDataTab}
                  />
                )}

                {dataTab === "manual" && (
                  <>
                    {/* Message pédagogique */}
                    <PedaMessage msg={pedaMsg} onClose={() => setPedaMsg("")} />

                    <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1, marginBottom: 4, marginTop: 2 }}>WRITE</div>

                    {/* Nœud d'entrée */}
                    <NodeEntrySelect />

                    {schemaReady ? (
                      <>
                        <label style={{ ...lbl, color: ACCENT }}>id <span style={{ fontSize: 9, opacity: 0.6 }}>(text) [PK]</span></label>
                        <input
                          style={inp} placeholder="id..."
                          value={rowValues["id"] ?? ""}
                          onChange={e => setRowValues(prev => ({ ...prev, id: e.target.value }))}
                        />
                        <label style={lbl}>value <span style={{ fontSize: 9, opacity: 0.6 }}>(text)</span></label>
                        <input
                          style={inp} placeholder="value..."
                          value={rowValues["value"] ?? ""}
                          onChange={e => setRowValues(prev => ({ ...prev, value: e.target.value }))}
                        />
                      </>
                    ) : (
                      <div style={{ fontSize: 10, color: "#8AA8C0", marginBottom: 8, fontStyle: "italic" }}>No schema yet.</div>
                    )}

                    <button
                      style={{ ...btn, opacity: schemaReady && !loadingMsg ? 1 : 0.4 }}
                      onClick={handleWrite}
                      disabled={!!loadingMsg}
                    >
                      {loadingMsg && loadingMsg.includes("Writing") ? loadingMsg : "Write to Cassandra"}
                    </button>

                    <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>READ</div>

                    {/* Nœud d'entrée pour le read aussi */}
                    <NodeEntrySelect />

                    <label style={lbl}>Filter by partition key (id)</label>
                    <input
                      style={inp} placeholder="id value"
                      value={filterKey} onChange={e => setFilterKey(e.target.value)}
                    />
                    <button
                      style={{ ...btn, opacity: loadingMsg ? 0.4 : 1 }}
                      disabled={!!loadingMsg}
                      onClick={() => {
                        const filters = filterKey.trim() ? { id: filterKey.trim() } : {};
                        handleRead(filters);
                      }}
                    >
                      {loadingMsg && loadingMsg.includes("Reading") ? loadingMsg : "Read from Cassandra"}
                    </button>
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
                      <div style={{ background: "rgba(32,178,170,0.05)", border: "1px solid rgba(32,178,170,0.15)", borderRadius: 5, padding: "6px 8px", marginBottom: 6, fontSize: 9, color: "#1A2B3C", lineHeight: 1.7 }}>
                        <span style={{ color: ACCENT, fontWeight: 700 }}>Columns:</span><br />
                        {csvColumns.map((c, i) => {
                          const mismatch = schemaReady && !columns.map(col => col.name).includes(c);
                          return (
                            <span key={c}>
                              <span style={{ color: "#8AA8C0" }}>{i + 1}.</span>{" "}
                              <span style={{ color: mismatch ? "#f76a6a" : "#1A2B3C" }}>{c}{mismatch ? " ✗" : ""}</span>
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
                    <style>{`
                      @keyframes pulseOrange {
                        0% { background: rgba(247,198,106,0.15); border-color: rgba(247,198,106,0.4); box-shadow: 0 0 5px rgba(247,198,106,0.2); }
                        50% { background: rgba(247,198,106,0.4); border-color: rgba(247,198,106,1); box-shadow: 0 0 15px rgba(247,198,106,0.6); }
                        100% { background: rgba(247,198,106,0.15); border-color: rgba(247,198,106,0.4); box-shadow: 0 0 5px rgba(247,198,106,0.2); }
                      }
                    `}</style>
                    <button
                      style={{
                        ...btn,
                        background: isCsvImporting ? "rgba(247,198,106,0.2)" : (csvFile && partitionKey && nodes.length > 0 ? "rgba(32,178,170,0.15)" : "rgba(255,255,255,0.03)"),
                        border: isCsvImporting ? "1px solid #f7c76a" : (csvFile && partitionKey && nodes.length > 0 ? `1px solid ${ACCENT}` : BORDER),
                        color: isCsvImporting ? "#f7c76a" : (csvFile && partitionKey && nodes.length > 0 ? ACCENT : "#1A2B3C"),
                        fontWeight: 700,
                        animation: isCsvImporting ? "pulseOrange 1.5s infinite ease-in-out" : "none",
                        transition: isCsvImporting ? "none" : "background 0.15s, border-color 0.15s, color 0.15s",
                      }}
                      onClick={onImportCsv}
                      disabled={isCsvImporting}
                    >
                      {isCsvImporting
                        ? (loadingMsg || "⏳ Importing...")
                        : (schemaReady ? "Import CSV" : "Import & Auto-Create Schema")}
                    </button>
                    {csvError && (
                      <div style={{ background: "rgba(247,106,106,0.08)", border: "1px solid rgba(247,106,106,0.3)", borderRadius: 5, padding: "6px 8px", fontSize: 10, color: "#f76a6a", marginBottom: 4 }}>⚠ {csvError}</div>
                    )}
                    {csvImportResult?.real && (
                      <div style={{ background: "rgba(32,178,170,0.08)", border: "1px solid rgba(32,178,170,0.3)", borderRadius: 6, padding: "8px 10px", fontSize: 10, lineHeight: 1.8 }}>
                        <div style={{ color: ACCENT, fontWeight: 700, marginBottom: 4 }}>
                          {csvImportResult.mode === "auto" ? "✓ Auto-schema + import" : "✓ Import Cassandra"}
                        </div>
                        <div><span style={{ color: "#5A7A96" }}>Inserted: </span><strong style={{ color: "#6af7b8" }}>{csvImportResult.rows_imported}</strong></div>
                        {csvImportResult.rows_skipped > 0 && (
                          <div><span style={{ color: "#5A7A96" }}>Skipped: </span><strong style={{ color: "#f7c76a" }}>{csvImportResult.rows_skipped}</strong></div>
                        )}
                        {csvImportResult.errors?.length > 0 && (
                          <div style={{ color: "#f76a6a", fontSize: 9, marginTop: 4 }}>
                            {csvImportResult.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                          </div>
                        )}
                        <div><span style={{ color: "#5A7A96" }}>PK: </span><strong>{csvImportResult.partition_key}</strong></div>
                      </div>
                    )}
                  </>
                )}
              </Section>

            </div>
          </div>
        </div>

        {/* ─── Main canvas ──────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "1px 4px", gap: 16, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#8AA8C0", display: "flex", gap: 24, marginBottom: -10, }}>
            <span><strong style={{ color: ACCENT }}>Drag +</strong> → add node</span>
            <span><strong style={{ color: ACCENT }}>Hover</strong> → inspect data</span>
            <span><strong style={{ color: ACCENT }}>× button</strong> → remove node</span>
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
                        <span style={{ fontSize: 10, color: "#5A7A96" }}>{count}</span>
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

          <div style={{ width: "100%", maxWidth: 650, marginTop: -10 }}>

            <TokenRing
              nodes={nodes} leavingNodes={leavingNodes} cluster={clusterData}
              nodeDataMap={nodeDataMap} onAddNode={handleAddNode} onRemoveNode={handleRemoveNode}
              csvDistribution={csvDistribution} disabled={anyJoining}
              writeFlowAnim={writeFlowAnim} gossipAnim={gossipAnim}
              hashingType={hashingType}
            />

          </div>

          {/* ─── Bottom panels ─────────────────────────────────────── */}
          <div style={{ width: "100%", maxWidth: 900, marginTop: -90 }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 10, borderBottom: "1px solid rgba(32,178,170,0.15)" }}>
              {[
                { id: "output", label: "Output" },
                { id: "hints", label: downNodeCount > 0 ? `⚡ Hints (${downNodeCount} down)` : "⚡ Hints" },
                { id: "repair", label: "🔍 Read Repair" },
              ].map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  style={{
                    flex: 1,
                    height: 34,
                    padding: "0 12px",
                    fontSize: 11,
                    cursor: "pointer",
                    background: rightTab === t.id ? "rgba(24,180,200,0.18)" : "transparent",
                    border: "1px solid transparent",
                    borderBottom: rightTab === t.id ? `2px solid ${ACCENT}` : "2px solid transparent",
                    borderRadius: "8px 8px 0 0",
                    color: rightTab === t.id ? ACCENT : t.id === "hints" && downNodeCount > 0 ? "#f59e0b" : "#5A7A96",
                    fontWeight: rightTab === t.id ? 700 : 500,
                    fontFamily: "inherit",
                    letterSpacing: 1,
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                    position: "relative",
                    zIndex: 5
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {rightTab === "output" && (
              <div style={{ ...card, marginBottom: 0 }}>
                <div style={h3}>Output</div>
                {output
                  ? <div style={{
                    fontSize: 10,
                    maxHeight: 300,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    color: "#EDF2F7"
                  }}>{JSON.stringify(output, null, 2)}</div>
                  : <span style={{ opacity: 0.5, fontSize: 11, color: "#EDF2F7" }}>No output yet.</span>}
              </div>
            )}

            {rightTab === "hints" && (
              <HintedHandoffPanel
                clusterName={clusterName} nodes={nodes}
                getHints={getHints} startNode={handleStartNode}
              />
            )}

            {rightTab === "repair" && (
              <ReadRepairPanel
                clusterName={clusterName} nodes={nodes}
                readData={readData} keyspaceName={keyspaceName}
                tableName={tableName} consistencyLevel={consistencyLevel}
                getRepairStats={getRepairStats}
              />
            )}
          </div>
        </main>
      </div>

      {capError && (
        <CAPErrorModal error={capError} onClose={() => setCapError(null)} />
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