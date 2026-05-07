// NOTE: CSV visualization/import is added to this page
import { useMemo, useState } from "react";
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
import "./App.css";
import {
  simulatePlacement,
  checkConsistency,
  hashKey,
} from "./utils/cassandraSimulation";

function App() {
  const [nodeId, setNodeId] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [deleteKey, setDeleteKey] = useState("");

  const [output, setOutput] = useState(null);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [clusterStatus, setClusterStatus] = useState(null);

  const [csvFile, setCsvFile] = useState(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [partitionKey, setPartitionKey] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvColumnNames, setCsvColumnNames] = useState("");

  const replicatedCountsPerNode = csvImportResult?.replicated_counts_per_node ?? {};
  const replicatedNodes = useMemo(() => Object.keys(replicatedCountsPerNode).sort(), [replicatedCountsPerNode]);
  const maxReplicated = useMemo(() => {
    const values = Object.values(replicatedCountsPerNode);
    return values.length ? Math.max(...values) : 0;
  }, [replicatedCountsPerNode]);

  const [simulatedNodes, setSimulatedNodes] = useState([
    { id: "NodeA", token: 3000, status: "up" },
    { id: "NodeB", token: 6500, status: "up" },
    { id: "NodeC", token: 9000, status: "up" },
  ]);

  const [replicationFactor, setReplicationFactor] = useState(2);
  const [consistencyLevel, setConsistencyLevel] = useState("QUORUM");
  const [simulationResult, setSimulationResult] = useState(null);
  const [consistencyResult, setConsistencyResult] = useState(null);
  const [csvDistribution, setCsvDistribution] = useState([]);



  const toggleNodeStatus = (nodeId) => {
    setSimulatedNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? { ...node, status: node.status === "up" ? "down" : "up" }
          : node
      )
    );
  };

  const runEducationalSimulation = () => {
    const result = simulatePlacement({
      key,
      nodes: simulatedNodes,
      replicationFactor,
    });

    setSimulationResult(result);

    if (result?.replicas) {
      const consistency = checkConsistency({
        replicas: result.replicas,
        consistencyLevel,
      });

      setConsistencyResult(consistency);
    }
  };

  return (
    <div className="app-container">
      <h1 className="app-title">CassandraEdu Simulator</h1>

      <div className="app-layout">

        {/* LEFT PANEL */}
        <div className="panel">
          <h2>Control Panel</h2>

          <h3>Nodes</h3>
          <input
            placeholder="Node ID"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
          />
          <button onClick={() => addNode(nodeId).then(setOutput)}>
            Add Node
          </button>
          <button onClick={() => removeNode(nodeId).then(setOutput)}>
            Remove Node
          </button>

          <h3>Data</h3>
          <input
            placeholder="Key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button onClick={() => writeData(key, value).then(setOutput)}>
            Write
          </button>
          <button onClick={() => readData(key).then(setOutput)}>
            Read
          </button>

          <h3>Cluster</h3>
          <button onClick={() => getCluster().then(setOutput)}>
            Show Cluster
          </button>

          <h3>Node Health</h3>
          <button
            onClick={() =>
              getNodeHealth(nodeId)
                .then(setNodeStatus)
                .catch(setNodeStatus)
            }
          >
            Check Node
          </button>

          <h3>Cluster Status</h3>
          <button onClick={() => getClusterStatus().then(setClusterStatus)}>
            Refresh Cluster Status
          </button>


          <h3>Educational Simulation</h3>

          <label>Replication Factor</label>
          <select
            value={replicationFactor}
            onChange={(e) => setReplicationFactor(Number(e.target.value))}
          >
            <option value={1}>RF = 1</option>
            <option value={2}>RF = 2</option>
            <option value={3}>RF = 3</option>
          </select>

          <label>Consistency Level</label>
          <select
            value={consistencyLevel}
            onChange={(e) => setConsistencyLevel(e.target.value)}
          >
            <option value="ONE">ONE</option>
            <option value="QUORUM">QUORUM</option>
            <option value="ALL">ALL</option>
          </select>

          <button className="simulation-button" onClick={runEducationalSimulation}>
            Simulate Cassandra Write
          </button>

          <h4>Node Failure Simulation</h4>

          {simulatedNodes.map((node) => (
            <button key={node.id} onClick={() => toggleNodeStatus(node.id)}>
              {node.status === "up" ? "Disable" : "Enable"} {node.id}
            </button>
          ))}

          <h3>CSV Import</h3>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={csvHasHeader}
              onChange={(e) => {
                setCsvHasHeader(e.target.checked);
                setCsvPreviewRows({});
                setCsvImportResult(null);
              }}
            />
            CSV has header row
          </label>

          {!csvHasHeader && (
            <input
              placeholder="Column names (e.g. ID;firstname;lastname;status)"
              value={csvColumnNames}
              onChange={(e) => {
                setCsvColumnNames(e.target.value);
                setCsvPreviewRows({});
              }}
            />
          )}

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0] ?? null;
              setCsvFile(file);
              setCsvError("");
              setCsvImportResult(null);
              setCsvPreviewRows({});
              if (!file) return;

              const text = await file.text();
              const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
              if (lines.length === 0) { setCsvError("Empty CSV."); return; }

              const firstLine = lines[0];
              const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

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
                  const width = lines[0].split(delimiter).length;
                  headers = Array.from({ length: width }, (_, i) => `col${i + 1}`);
                }
              }
              setCsvColumns(headers);
              setPartitionKey(headers[0] ?? "");

              const tableName = file.name.replace(/\.csv$/i, "") || "ImportedTable";
              const tableRows = {};

              for (let i = 0; i < Math.min(dataLines.length, 12); i++) {
                const parts = dataLines[i].split(delimiter).map((c) => c.trim());
                if (!parts[0]) continue;
                const rowId = /^\d+$/.test(parts[0]) ? `row${parts[0]}` : parts[0];
                const rowObj = {};
                headers.forEach((h, idx) => {
                  if (parts[idx] !== undefined && parts[idx] !== "") rowObj[h] = parts[idx];
                });
                tableRows[rowId] = rowObj;
              }

              if (Object.keys(tableRows).length === 0) {
                setCsvError("Could not parse preview.");
                return;
              }
              setCsvPreviewRows({ [tableName]: tableRows });
            }}
          />

          {csvColumns.length > 0 && (
            <>
              <h4>Choose Partition Key</h4>

              <select
                value={partitionKey}
                onChange={(e) => setPartitionKey(e.target.value)}
              >
                {csvColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            onClick={async () => {
              if (!csvFile) {
                setCsvError("Please choose a CSV file first.");
                return;
              }

              if (!partitionKey) {
                setCsvError("Please choose a partition key.");
                return;
              }

              setCsvError("");

              try {
                const text = await csvFile.text();
                const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

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
                    const width = lines[0].split(delimiter).length;
                    headers = Array.from({ length: width }, (_, i) => `col${i + 1}`);
                  }
                }

                const table = {};
                const distribution = [];

                dataLines.forEach((line, index) => {
                  const parts = line.split(delimiter).map((c) => c.trim());

                  const row = {};
                  headers.forEach((header, idx) => {
                    row[header] = parts[idx] ?? "";
                  });

                  const rowId = `row${index + 1}`;
                  table[rowId] = row;

                  const partitionValue = row[partitionKey];

                  if (!partitionValue) return;

                  const placement = simulatePlacement({
                    key: String(partitionValue),
                    nodes: simulatedNodes,
                    replicationFactor,
                  });

                  distribution.push({
                    rowId,
                    partitionValue,
                    hash: placement?.hash,
                    primaryNode: placement?.primaryNode?.id,
                    replicas: placement?.replicas ?? [],
                  });
                });

                const localResult = {
                  table,
                  rows_imported: Object.keys(table).length,
                  rows_skipped: 0,
                };

                setCsvImportResult(localResult);
                setOutput(localResult);
                setCsvDistribution(distribution);
              } catch (e) {
                setCsvError(e?.message ?? "CSV import failed");
              }
            }}
          >
            Import CSV
          </button>

          {csvError ? <pre>{csvError}</pre> : null}

          {Object.keys(csvPreviewRows).length > 0 && (
            <>
              <h4>Preview (first rows)</h4>
              <pre style={{ maxHeight: "260px", overflow: "auto" }}>
                {JSON.stringify(csvPreviewRows, null, 2)}
              </pre>
            </>
          )}

          <h3>Delete Data</h3>
          <input
            placeholder="Key to delete"
            value={deleteKey}
            onChange={(e) => setDeleteKey(e.target.value)}
          />
          <button onClick={() => deleteData(deleteKey).then(setOutput)}>
            Delete
          </button>
        </div>

        {/* RIGHT PANEL */}
        <div className="panel">
          <h2>Token Ring Visualization</h2>

          {/* token ring */}
          <div className="ring-box">
            <TokenRing
              nodes={simulatedNodes}
              simulationResult={simulationResult}
              csvDistribution={csvDistribution}
            />
          </div>
          <h3>Educational Explanation</h3>

          {simulationResult ? (
            <div className="educational-box">
              <p>
                <strong>Key:</strong> {simulationResult.key}
              </p>

              <p>
                <strong>Hash:</strong> {simulationResult.hash}
              </p>

              <p>
                <strong>Primary Replica:</strong>{" "}
                {simulationResult.primaryNode?.id ?? "None"}
              </p>

              <h4>Replicas</h4>

              <ul>
                {simulationResult.replicas.map((node, index) => (
                  <li key={node.id}>
                    {index === 0 ? "Primary" : "Replica"}: {node.id}
                  </li>
                ))}
              </ul>

              {consistencyResult && (
                <>
                  <h4>Consistency Level</h4>

                  <p>
                    CL {consistencyResult.consistencyLevel} requires{" "}
                    {consistencyResult.required} replica response(s).
                  </p>

                  <p>
                    Alive replicas:
                    {" "}
                    {consistencyResult.aliveReplicas}/
                    {consistencyResult.required}
                  </p>

                  <p>
                    <strong>
                      {consistencyResult.success
                        ? "WRITE SUCCESS"
                        : "WRITE FAILED"}
                    </strong>
                  </p>
                </>
              )}
            </div>
          ) : (
            <p>
              Insert a key and run the educational simulation.
            </p>
          )}

          <h3>CSV Visualization (replication distribution)</h3>
          <div style={{ display: "grid", gap: "10px" }}>
            {replicatedNodes.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Import a CSV to see distribution per node.</div>
            ) : (
              replicatedNodes.map((n) => {
                const count = replicatedCountsPerNode[n] ?? 0;
                const width = maxReplicated > 0 ? Math.round((count / maxReplicated) * 100) : 0;
                return (
                  <div key={n} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px", gap: "10px", alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>{n}</div>
                    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
                      <div style={{ width: `${width}%`, background: "var(--accent-bg)", height: "18px" }} />
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "monospace" }}>{count}</div>
                  </div>
                );
              })
            )}
          </div>

          <h3>Output</h3>
          <pre>{JSON.stringify(output, null, 2)}</pre>

          <h3>Node Status</h3>
          <pre>{JSON.stringify(nodeStatus, null, 2)}</pre>

          <h3>Cluster Status</h3>
          <pre>{JSON.stringify(clusterStatus, null, 2)}</pre>

          {csvImportResult?.table ? (
            <>
              <h3>Imported Table</h3>
              <pre style={{ maxHeight: "400px", overflow: "auto" }}>
                {JSON.stringify(csvImportResult.table, null, 2)}
              </pre>
              <p style={{ opacity: 0.7 }}>
                {csvImportResult.rows_imported} rows imported
                {csvImportResult.rows_skipped > 0 && `, ${csvImportResult.rows_skipped} skipped`}
              </p>
            </>
          ) : null}
        </div>

      </div>
    </div>
  );
}


export default App;
