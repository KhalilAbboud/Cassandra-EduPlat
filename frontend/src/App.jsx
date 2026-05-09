import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addNode,
  removeNode,
  writeData,
  readData,
  getCluster,
  getNodeHealth,
  getClusterStatus,
  deleteData,
  importCsv,
} from "./services/api";
import TokenRing from "./components/TokenRing";
import {
  simulatePlacement,
  checkConsistency,
} from "./utils/cassandraSimulation";
import "./App.css";

const NAME_POOL = [
  "NodeA", "NodeB", "NodeC", "NodeD", "NodeE",
  "NodeF", "NodeG", "NodeH", "NodeI", "NodeJ",
  "NodeK", "NodeL", "NodeM", "NodeN", "NodeO",
  "NodeP", "NodeQ", "NodeR", "NodeS", "NodeT",
];

const SIDEBAR_W = 270;

function CollapseBtn({ open, onClick, side }) {
  return (
    <button
      onClick={onClick}
      title={open ? "Collapse" : "Expand"}
      className={`collapse-btn collapse-btn-${side}`}
    >
      {side === "left" ? (open ? "◀" : "▶") : open ? "▶" : "◀"}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <section className="side-section">
      <div className="side-section-title">{title}</div>
      {children}
    </section>
  );
}

function DashboardCard({ title, children, className = "" }) {
  return (
    <div className={`dashboard-card ${className}`}>
      <div className="section-title">{title}</div>
      {children}
    </div>
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

  const [theme, setTheme] = useState("dark");

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

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const [partitioner, setPartitioner] = useState("Educational Hash");

  const replicatedCounts = csvImportResult?.replicated_counts_per_node ?? {};

  const replicatedNodes = useMemo(
    () => Object.keys(replicatedCounts).sort(),
    [replicatedCounts]
  );

  const maxReplicated = useMemo(() => {
    const vals = Object.values(replicatedCounts);
    return vals.length ? Math.max(...vals) : 0;
  }, [replicatedCounts]);

  const fetchCluster = useCallback(async () => {
    try {
      const data = await getCluster();
      setClusterData(data);
    } catch {
      // backend optional during frontend demo
    }
  }, []);

  const handleAddNode = useCallback(
    async (token) => {
      const usedIds = new Set(nodes.map((n) => n.id));
      const id =
        NAME_POOL.find((name) => !usedIds.has(name)) ?? `Node${Date.now()}`;

      setNodes((prev) => [...prev, { id, token, status: "up" }]);

      try {
        await addNode(id);
        await fetchCluster();
      } catch (e) {
        console.error(e);
      }
    },
    [nodes, fetchCluster]
  );

  const handleRemoveNode = useCallback(
    async (nodeId) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setSimulationResult(null);
      setConsistencyResult(null);

      try {
        await removeNode(nodeId);
        await fetchCluster();
      } catch (e) {
        console.error(e);
      }
    },
    [fetchCluster]
  );

  const handleMoveNode = useCallback((nodeId, token) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, token } : n))
    );
  }, []);

  const toggleNodeStatus = useCallback((nodeId) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, status: n.status === "up" ? "down" : "up" }
          : n
      )
    );
  }, []);



  useEffect(() => {
    if (simulationResult?.replicas) {
      setConsistencyResult(
        checkConsistency({
          replicas: simulationResult.replicas,
          consistencyLevel,
        })
      );
    }
  }, [consistencyLevel, simulationResult]);

  const parseCsvMeta = useCallback(
    (text) => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return null;

      const firstLine = lines[0];
      const delimiter =
        firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

      let headers = [];
      let dataLines = [];

      if (csvHasHeader) {
        headers = firstLine.split(delimiter).map((c) => c.trim());
        dataLines = lines.slice(1);
      } else {
        dataLines = lines;

        if (csvColumnNames.trim()) {
          const sep = csvColumnNames.includes(";") ? ";" : ",";
          headers = csvColumnNames.split(sep).map((c) => c.trim());
        } else {
          headers = Array.from(
            { length: lines[0].split(delimiter).length },
            (_, i) => `col${i + 1}`
          );
        }
      }

      return { delimiter, headers, dataLines };
    },
    [csvHasHeader, csvColumnNames]
  );

  const onFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0] ?? null;

      setCsvFile(file);
      setCsvError("");
      setCsvImportResult(null);
      setCsvPreviewRows({});
      setCsvDistribution([]);

      if (!file) return;

      const text = await file.text();
      const meta = parseCsvMeta(text);

      if (!meta) {
        setCsvError("Empty CSV.");
        return;
      }

      const { delimiter, headers, dataLines } = meta;

      setCsvColumns(headers);
      setPartitionKey(headers[0] ?? "");

      const tableName = file.name.replace(/\.csv$/i, "") || "ImportedTable";
      const preview = {};

      for (let i = 0; i < Math.min(dataLines.length, 12); i++) {
        const parts = dataLines[i].split(delimiter).map((c) => c.trim());
        if (!parts[0]) continue;

        const rowId = /^\d+$/.test(parts[0]) ? `row${parts[0]}` : parts[0];
        const rowObj = {};

        headers.forEach((h, idx) => {
          if (parts[idx] !== undefined && parts[idx] !== "") {
            rowObj[h] = parts[idx];
          }
        });

        preview[rowId] = rowObj;
      }

      if (!Object.keys(preview).length) {
        setCsvError("Could not parse preview.");
        return;
      }

      setCsvPreviewRows({ [tableName]: preview });
    },
    [parseCsvMeta]
  );

  const onImportCsv = useCallback(async () => {
    if (!csvFile) {
      setCsvError("Choose a CSV file first.");
      return;
    }

    if (!partitionKey) {
      setCsvError("Choose a partition key.");
      return;
    }

    setCsvError("");

    const text = await csvFile.text();
    const meta = parseCsvMeta(text);

    if (!meta) {
      setCsvError("Empty CSV.");
      return;
    }

    const { delimiter, headers, dataLines } = meta;

    const table = {};
    const distribution = [];
    const replicatedCountsPerNode = {};

    dataLines.forEach((line, i) => {
      const parts = line.split(delimiter).map((c) => c.trim());

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] ?? "";
      });

      const rowId = `row${i + 1}`;
      table[rowId] = row;

      const partitionValue = row[partitionKey];
      if (!partitionValue) return;

      const placement = simulatePlacement({
        key: String(partitionValue),
        nodes,
        replicationFactor,
      });

      placement?.replicas?.forEach((replica) => {
        replicatedCountsPerNode[replica.id] =
          (replicatedCountsPerNode[replica.id] ?? 0) + 1;
      });

      distribution.push({
        rowId,
        partitionValue,
        hash: placement?.hash,
        primaryNode: placement?.primaryNode?.id,
        replicas: placement?.replicas ?? [],
      });
    });

    const result = {
      table,
      rows_imported: Object.keys(table).length,
      rows_skipped: 0,
      replicated_counts_per_node: replicatedCountsPerNode,
    };

    setCsvImportResult(result);
    setOutput(result);
    setCsvDistribution(distribution);
  }, [
    csvFile,
    partitionKey,
    parseCsvMeta,
    nodes,
    replicationFactor,
  ]);

  const runSimulation = useCallback(async () => {
    if (nodes.length === 0) {
      setOutput({ error: "Add at least one node to the ring first." });
      return;
    }

    // MODE CSV
    if (csvFile && partitionKey) {
      await onImportCsv();

      setOutput({
        mode: "CSV simulation",
        message: "CSV rows distributed using selected partition key.",
        partitionKey,
      });

      return;
    }

    // MODE SINGLE KEY
    if (!key) {
      setOutput({
        error:
          "Enter a key for single write simulation, or import a CSV and choose a partition key.",
      });
      return;
    }

    const result = simulatePlacement({
      key,
      nodes,
      replicationFactor,
    });

    setSimulationResult(result);

    if (result?.replicas) {
      setConsistencyResult(
        checkConsistency({
          replicas: result.replicas,
          consistencyLevel,
        })
      );
    }

    setOutput({
      mode: "Single key simulation",
      key,
      hash: result?.hash,
      primaryNode: result?.primaryNode?.id,
      replicas: result?.replicas?.map((node) => node.id),
    });
  }, [
    nodes,
    csvFile,
    partitionKey,
    onImportCsv,
    key,
    replicationFactor,
    consistencyLevel,
  ]);

  const sidebarStyle = (open, side) => ({
    width: SIDEBAR_W,
    transform: open
      ? "translateX(0)"
      : side === "left"
        ? "translateX(-100%)"
        : "translateX(100%)",
  });

  return (
    <div className={`app-shell ${theme}`}>
      <header className="app-header">
        <span className="app-logo">CassandraEdu</span>
        <span className="app-subtitle">SIMULATOR</span>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
        <span className="app-node-count">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""} on ring
        </span>
      </header>

      <div className="app-body">
        <aside className="sidebar sidebar-left" style={sidebarStyle(leftOpen, "left")}>
          <CollapseBtn
            open={leftOpen}
            onClick={() => setLeftOpen((o) => !o)}
            side="left"
          />

          <div className="sidebar-inner">
            <Section title="Cluster">
              <button
                className="btn-full"
                onClick={() =>
                  getCluster()
                    .then((r) => {
                      setOutput(r);
                      setClusterData(r);
                    })
                    .catch((e) => setOutput({ error: e.message }))
                }
              >
                Show Cluster
              </button>
            </Section>

            <Section title="CSV Import">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={csvHasHeader}
                  onChange={(e) => {
                    setCsvHasHeader(e.target.checked);
                    setCsvPreviewRows({});
                  }}
                />
                Has header row
              </label>

              {!csvHasHeader && (
                <input
                  placeholder="col1;col2;col3"
                  value={csvColumnNames}
                  onChange={(e) => {
                    setCsvColumnNames(e.target.value);
                    setCsvPreviewRows({});
                  }}
                />
              )}

              <input type="file" accept=".csv,text/csv" onChange={onFileChange} />

              {csvColumns.length > 0 && (
                <>
                  <label className="field-label">Partition Key</label>
                  <select
                    value={partitionKey}
                    onChange={(e) => setPartitionKey(e.target.value)}
                  >
                    {csvColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <button className="btn-full" onClick={onImportCsv}>
                Import CSV
              </button>

              {csvError && <pre className="error-box">{csvError}</pre>}

              {Object.keys(csvPreviewRows).length > 0 && (
                <>
                  <label className="field-label">Preview first rows</label>
                  <pre className="preview-box">
                    {JSON.stringify(csvPreviewRows, null, 2)}
                  </pre>
                </>
              )}
            </Section>

            {csvImportResult?.table && (
              <Section title="Imported Table">
                <pre className="preview-box large">
                  {JSON.stringify(csvImportResult.table, null, 2)}
                </pre>
                <p className="muted-text">
                  {csvImportResult.rows_imported} rows imported
                  {csvImportResult.rows_skipped > 0 &&
                    `, ${csvImportResult.rows_skipped} skipped`}
                </p>
              </Section>
            )}
          </div>
        </aside>

        <main
          className={`app-main ${leftOpen ? "with-left" : ""} ${rightOpen ? "with-right" : ""
            }`}
        >
          <div className="hint-bar">
            <span>
              <strong>Drag +</strong> → add node
            </span>
            <span>
              <strong>Hover</strong> → inspect data
            </span>
            <span>
              <strong>× button</strong> → remove node
            </span>
          </div>

          <div className="ring-stage">
            <TokenRing
              nodes={nodes}
              cluster={clusterData}
              onAddNode={handleAddNode}
              onRemoveNode={handleRemoveNode}
              onMoveNode={handleMoveNode}
              simulationResult={simulationResult}
              csvDistribution={csvDistribution}
            />
            <div className="ring-legend">
              <div className="legend-item">
                <span className="legend-dot node"></span>
                <span>Node</span>
              </div>

              <div className="legend-item">
                <span className="legend-dot primary"></span>
                <span>Primary Replica</span>
              </div>

              <div className="legend-item">
                <span className="legend-dot replica"></span>
                <span>Replica</span>
              </div>

              <div className="legend-item">
                <span className="legend-dot csv"></span>
                <span>CSV Partition Hash</span>
              </div>

              <div className="legend-item">
                <span className="legend-dot down"></span>
                <span>Node Down</span>
              </div>
            </div>
          </div>

          <div className="card-row">
            <DashboardCard title="Output">
              {output ? (
                <div className="json-output">
                  {JSON.stringify(output, null, 2)}
                </div>
              ) : (
                <span className="muted-text">No output yet.</span>
              )}
            </DashboardCard>

            <DashboardCard title="Simulation Settings">
              <label className="field-label">Replication Factor</label>
              <select
                value={replicationFactor}
                onChange={(e) => setReplicationFactor(Number(e.target.value))}
              >
                <option value={1}>RF = 1</option>
                <option value={2}>RF = 2</option>
                <option value={3}>RF = 3</option>
              </select>

              <label className="field-label">Consistency Level</label>
              <select
                value={consistencyLevel}
                onChange={(e) => setConsistencyLevel(e.target.value)}
              >
                <option value="ONE">ONE</option>
                <option value="QUORUM">QUORUM</option>
                <option value="ALL">ALL</option>
              </select>

              <button
                className="btn-full btn-primary"
                onClick={runSimulation}
                disabled={!key || nodes.length === 0}
              >
                ▶ Simulate Write
              </button>
            </DashboardCard>

            <DashboardCard title="Simulation Result">
              {simulationResult ? (
                <div className="simulation-info">
                  <div>
                    <span>Key:</span> {simulationResult.key}
                  </div>
                  <div>
                    <span>Hash:</span> {simulationResult.hash}
                  </div>
                  <div>
                    <span>Primary:</span>{" "}
                    {simulationResult.primaryNode?.id ?? "—"}
                  </div>

                  {simulationResult.replicas.map((n, i) => (
                    <div key={n.id} className="replica-line">
                      {i === 0 ? "★ Primary" : `Replica ${i}`}: {n.id}
                    </div>
                  ))}

                  {consistencyResult && (
                    <div
                      className={`consistency-box ${consistencyResult.success ? "success" : "failed"
                        }`}
                    >
                      <strong>
                        {consistencyResult.success
                          ? "✓ WRITE SUCCESS"
                          : "✗ WRITE FAILED"}
                      </strong>
                      <small>
                        {consistencyResult.consistencyLevel} · needs{" "}
                        {consistencyResult.required} · alive{" "}
                        {consistencyResult.aliveReplicas}/
                        {consistencyResult.required}
                      </small>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted-text">
                  {nodes.length === 0
                    ? "Add nodes first."
                    : "Enter a key on the right and simulate."}
                </p>
              )}
            </DashboardCard>
          </div>

          <div className="card-row">
            <DashboardCard title="Node Failure Sim">
              {nodes.length === 0 ? (
                <p className="muted-text">Add nodes via the ring first.</p>
              ) : (
                nodes.map((node) => (
                  <button
                    key={node.id}
                    className={`btn-full ${node.status === "down" ? "btn-danger" : ""
                      }`}
                    onClick={() => toggleNodeStatus(node.id)}
                  >
                    {node.status === "up" ? "⬇ Disable" : "⬆ Enable"}{" "}
                    {node.id}
                  </button>
                ))
              )}
            </DashboardCard>

            <DashboardCard title="Cluster & Node Health">
              <button
                className="btn-full"
                onClick={() =>
                  getClusterStatus()
                    .then(setClusterStatus)
                    .catch((e) => setClusterStatus({ error: e.message }))
                }
              >
                Cluster Status
              </button>

              {clusterStatus && (
                <pre className="mini-output">
                  {JSON.stringify(clusterStatus, null, 2)}
                </pre>
              )}

              <div className="inline-form">
                <input
                  placeholder="NodeA"
                  value={healthNodeId}
                  onChange={(e) => setHealthNodeId(e.target.value)}
                />
                <button
                  onClick={() =>
                    getNodeHealth(healthNodeId)
                      .then(setNodeStatus)
                      .catch((e) => setNodeStatus({ error: e.message }))
                  }
                >
                  Check
                </button>
              </div>

              {nodeStatus && (
                <pre className="mini-output">
                  {JSON.stringify(nodeStatus, null, 2)}
                </pre>
              )}
            </DashboardCard>

            {replicatedNodes.length > 0 && (
              <DashboardCard title="Distribution / Node">
                {replicatedNodes.map((n) => {
                  const count = replicatedCounts[n] ?? 0;
                  const pct =
                    maxReplicated > 0
                      ? Math.round((count / maxReplicated) * 100)
                      : 0;

                  return (
                    <div key={n} className="distribution-row">
                      <div>{n}</div>
                      <div className="distribution-track">
                        <div
                          className="distribution-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div>{count}</div>
                    </div>
                  );
                })}
              </DashboardCard>
            )}
          </div>
        </main>

        <aside className="sidebar sidebar-right" style={sidebarStyle(rightOpen, "right")}>
          <CollapseBtn
            open={rightOpen}
            onClick={() => setRightOpen((o) => !o)}
            side="right"
          />

          <div className="sidebar-inner">
            <Section title="Write / Read">
              <label className="field-label">Key</label>
              <input
                placeholder="e.g. user:42"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />

              <label className="field-label">Value</label>
              <input
                placeholder="e.g. Alice"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />

              <button
                className="btn-full"
                onClick={() =>
                  writeData(key, value)
                    .then((r) => {
                      setOutput(r);
                      fetchCluster();
                    })
                    .catch((e) => setOutput({ error: e.message }))
                }
              >
                Write
              </button>

              <button
                className="btn-full"
                onClick={() =>
                  readData(key)
                    .then(setOutput)
                    .catch((e) => setOutput({ error: e.message }))
                }
              >
                Read
              </button>
            </Section>

            <Section title="Delete">
              <label className="field-label">Key</label>
              <input
                placeholder="key to delete"
                value={deleteKey}
                onChange={(e) => setDeleteKey(e.target.value)}
              />

              <button
                className="btn-full btn-danger"
                onClick={() =>
                  deleteData(deleteKey)
                    .then((r) => {
                      setOutput(r);
                      fetchCluster();
                    })
                    .catch((e) => setOutput({ error: e.message }))
                }
              >
                Delete
              </button>
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}