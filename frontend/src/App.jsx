import { useState } from "react";
import {
  addNode,
  removeNode,
  writeData,
  readData,
  getCluster,
  getNodeHealth,
  getClusterStatus,
  deleteData,
} from "./services/api";
import TokenRing from "./components/TokenRing";
import "./App.css";

function App() {
  const [nodeId, setNodeId] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [deleteKey, setDeleteKey] = useState("");

  const [output, setOutput] = useState(null);
  const [nodeStatus, setNodeStatus] = useState(null);
  const [clusterStatus, setClusterStatus] = useState(null);

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

          <div className="ring-box">
            <TokenRing />
          </div>

          <h3>Output</h3>
          <pre>{JSON.stringify(output, null, 2)}</pre>

          <h3>Node Status</h3>
          <pre>{JSON.stringify(nodeStatus, null, 2)}</pre>

          <h3>Cluster Status</h3>
          <pre>{JSON.stringify(clusterStatus, null, 2)}</pre>
        </div>

      </div>
    </div>
  );
}

export default App;