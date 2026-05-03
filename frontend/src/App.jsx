import { useState } from "react";
import {
  addNode,
  removeNode,
  writeData,
  readData,
  getCluster,
} from "./services/api";

function App() {
  const [nodeId, setNodeId] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [output, setOutput] = useState(null);

  return (
    <div style={{ padding: 20 }}>
      <h1>Cassandra Simulator</h1>

      {/* Node controls */}
      <h2>Nodes</h2>
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

      {/* Data controls */}
      <h2>Data</h2>
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

      {/* Cluster */}
      <h2>Cluster</h2>
      <button onClick={() => getCluster().then(setOutput)}>
        Show Cluster
      </button>

      {/* Output */}
      <h2>Output</h2>
      <pre>{JSON.stringify(output, null, 2)}</pre>
    </div>
  );
}

export default App;