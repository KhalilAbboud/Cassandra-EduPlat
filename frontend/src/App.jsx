import { useEffect, useState } from "react";
import axios from "axios";

export default function App() {
  const [cluster, setCluster] = useState({});
  const [nodeId, setNodeId] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const fetchCluster = async () => {
    const res = await axios.get("http://localhost:8000/cluster");
    setCluster(res.data);
  };

  useEffect(() => {
    fetchCluster();
  }, []);

  const addNode = async () => {
    await axios.post("http://localhost:8000/node/add", { id: nodeId });
    fetchCluster();
  };

  const writeData = async () => {
    await axios.post("http://localhost:8000/data/write", { key, value });
    fetchCluster();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Cassandra Simulator</h1>

      <div>
        <input placeholder="Node ID" onChange={(e) => setNodeId(e.target.value)} />
        <button onClick={addNode}>Add Node</button>
      </div>

      <div>
        <input placeholder="Key" onChange={(e) => setKey(e.target.value)} />
        <input placeholder="Value" onChange={(e) => setValue(e.target.value)} />
        <button onClick={writeData}>Write Data</button>
      </div>

      <h2>Cluster</h2>
      <div style={{ display: "flex", gap: 20 }}>
        {Object.entries(cluster).map(([node, data]) => (
          <div key={node} style={{ border: "1px solid black", padding: 10 }}>
            <h3>{node}</h3>
            {data.map((d, i) => (
              <div key={i}>{d.key}: {d.value}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

