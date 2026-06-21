/**
 * DocPanel.jsx — CassandraEdu Simulator Documentation
 *
 * HOW TO INTEGRATE IN App.jsx:
 * ─────────────────────────────
 * 1. Import this component:
 *      import DocPanel from "./components/DocPanel";
 *
 * 2. Add a state for the doc panel toggle (in App()):
 *      const [docOpen, setDocOpen] = useState(false);
 *
 * 3. Add a "?" button in the <header> (next to the Reset button):
 *      <button
 *        onClick={() => setDocOpen(o => !o)}
 *        title="Open documentation"
 *        style={{
 *          fontSize: 10, padding: "3px 10px", cursor: "pointer",
 *          background: "rgba(24,180,200,0.10)", border: "1px solid rgba(24,180,200,0.4)",
 *          color: "#18B4C8", borderRadius: 5, fontFamily: "inherit", fontWeight: 600,
 *          transition: "background 0.15s",
 *        }}
 *        onMouseEnter={e => e.currentTarget.style.background = "rgba(24,180,200,0.25)"}
 *        onMouseLeave={e => e.currentTarget.style.background = "rgba(24,180,200,0.10)"}
 *      >
 *        ? Docs
 *      </button>
 *
 * 4. Render inside the flex body area (e.g. right after the right sidebar div):
 *      {docOpen && (
 *        <DocPanel onClose={() => setDocOpen(false)} />
 *      )}
 *
 * The panel renders as an overlay drawer from the right, above both sidebars.
 */

import { useState } from "react";

// ── Design tokens (mirrors index.css :root) ──────────────────────────────────
const T = {
  bg:           "#1E2D3D",
  bgCard:       "#243447",
  border:       "#2E4560",
  text:         "#A8BED0",
  textH:        "#EDF2F7",
  accent:       "#18B4C8",
  accentBlue:   "#1287A8",
  accentBg:     "rgba(18, 135, 168, 0.15)",
  accentBorder: "rgba(24, 180, 200, 0.4)",
  codeBg:       "#162333",
  red:          "#f76a6a",
  redBg:        "rgba(247,106,106,0.12)",
  redBorder:    "rgba(247,106,106,0.35)",
  green:        "#6af7b8",
  greenBg:      "rgba(106,247,184,0.10)",
  yellow:       "#f7c76a",
};

// ── Shared micro-components ──────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase",
    color: T.accent, fontWeight: 700, marginBottom: 10, marginTop: 20,
    paddingBottom: 5, borderBottom: `1px solid ${T.border}`,
    fontFamily: "'Inter', system-ui, sans-serif",
  }}>
    {children}
  </div>
);

const Pill = ({ children, color = T.accent }) => (
  <span style={{
    display: "inline-block", fontSize: 9, fontWeight: 700, letterSpacing: 1,
    textTransform: "uppercase", padding: "2px 7px", borderRadius: 10,
    background: `${color}20`, border: `1px solid ${color}60`, color,
    marginRight: 4, marginBottom: 2,
    fontFamily: "'Inter', system-ui, sans-serif",
  }}>
    {children}
  </span>
);

const Code = ({ children }) => (
  <code style={{
    fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace",
    fontSize: 11, padding: "2px 6px", borderRadius: 4,
    background: T.codeBg, border: `1px solid ${T.border}`, color: T.accent,
  }}>
    {children}
  </code>
);

const InfoBox = ({ icon = "💡", children, color = T.accent }) => (
  <div style={{
    background: `${color}10`, border: `1px solid ${color}40`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 7, padding: "9px 12px", marginBottom: 10,
    display: "flex", gap: 8, alignItems: "flex-start",
  }}>
    <span style={{ fontSize: 14, lineHeight: 1.3 }}>{icon}</span>
    <div style={{ fontSize: 11, color: T.text, lineHeight: 1.65, flex: 1 }}>{children}</div>
  </div>
);

// ── Scenario step block ──────────────────────────────────────────────────────
const Step = ({ n, title, where, what, why, tip, warn }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 8, marginBottom: 6, overflow: "hidden",
    }}>
      {/* header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
          background: T.accentBg, border: `1px solid ${T.accentBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: T.accent,
        }}>
          {n}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.textH,
          fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: T.accent, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* expanded body */}
      {open && (
        <div style={{ padding: "0 12px 12px 44px", borderTop: `1px solid ${T.border}` }}>
          {where && (
            <div style={{ marginTop: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
                color: T.accentBlue, fontWeight: 700, marginRight: 6 }}>
                Where
              </span>
              {where}
            </div>
          )}
          {what && (
            <div style={{ marginTop: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
                color: T.accentBlue, fontWeight: 700, marginRight: 6 }}>
                What to do
              </span>
              <div style={{ fontSize: 11, color: T.text, lineHeight: 1.65, marginTop: 3 }}>{what}</div>
            </div>
          )}
          {why && (
            <div style={{ marginTop: 8 }}>
              <InfoBox icon="💡">{why}</InfoBox>
            </div>
          )}
          {tip && (
            <div style={{ marginTop: 4 }}>
              <InfoBox icon="✅" color={T.green}>{tip}</InfoBox>
            </div>
          )}
          {warn && (
            <div style={{ marginTop: 4 }}>
              <InfoBox icon="⚠️" color={T.yellow}>{warn}</InfoBox>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Concept card ─────────────────────────────────────────────────────────────
const ConceptCard = ({ title, icon, children, pills = [] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 8, marginBottom: 6, overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "9px 12px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.textH,
          fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: T.accent, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${T.border}` }}>
          {pills.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 6 }}>
              {pills.map(p => <Pill key={p}>{p}</Pill>)}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main DocPanel ────────────────────────────────────────────────────────────
export default function DocPanel({ onClose }) {
  const [tab, setTab] = useState("guide");   // "guide" | "concepts" | "glossary"

  const TABS = [
    { id: "guide",    label: "🗺 Guided Scenarios" },
    { id: "concepts", label: "📚 Core Concepts" },
    { id: "glossary", label: "🔤 Glossary" },
  ];

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: 400, zIndex: 50,
      background: "#1A2B3C",        // slightly deeper than --bg for contrast
      borderLeft: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 32px rgba(0,0,0,0.45)",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: T.text,
    }}>

      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div style={{
        height: 48, flexShrink: 0, display: "flex", alignItems: "center",
        padding: "0 16px", borderBottom: `1px solid ${T.border}`,
        background: T.bgCard, gap: 10,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent,
          letterSpacing: 1, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          CassandraEdu
        </span>
        <span style={{ fontSize: 10, color: "#5A7A96", letterSpacing: 2, textTransform: "uppercase" }}>
          Docs
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto", background: "none", border: "none",
            color: "#5A7A96", cursor: "pointer", fontSize: 18,
            lineHeight: 1, padding: "0 2px", fontFamily: "inherit",
          }}
          title="Close documentation"
        >
          ×
        </button>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 2, padding: "8px 12px 0",
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        background: T.bgCard,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "5px 4px", fontSize: 10, cursor: "pointer",
            background: tab === t.id ? T.accentBg : "transparent",
            border: "none",
            borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
            color: tab === t.id ? T.accent : "#5A7A96",
            fontWeight: tab === t.id ? 700 : 400,
            fontFamily: "inherit", letterSpacing: 0.8,
            transition: "all 0.15s", marginBottom: 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "14px 14px 24px",
        scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent`,
      }}>

        {/* ══════════════════ GUIDED SCENARIOS TAB ══════════════════════ */}
        {tab === "guide" && (
          <>
            <InfoBox icon="🎓">
              Follow these 9 scenarios in order for a complete tour of Cassandra concepts.
              Click any step to expand its instructions.
            </InfoBox>

            <SectionLabel>Setup the cluster</SectionLabel>

            <Step
              n={1}
              title="Create Node A"
              where={<><Pill>Left sidebar</Pill> → <strong style={{ color: T.textH }}>Ring / drag</strong></>}
              what={
                <>
                  Click anywhere on the token ring to place <Code>NodeA</Code> at a position, or drag from
                  the ring border to choose a specific token slot. The node will appear in "joining" state
                  (spinning) while Cassandra bootstraps. Wait until the status badge turns <span style={{ color: T.green }}>UP</span>.
                </>
              }
              why={
                "A Cassandra node owns a segment of the 2⁶⁴ token ring. When NodeA joins, it receives its token range and starts the gossip protocol with itself. Watch the gossip arcs appear on the ring."
              }
              tip="The header shows ⟳ while waiting for tokens. Once tokens are assigned the loading message disappears."
            />

            <Step
              n={2}
              title="Create Node B"
              where={<><Pill>Token ring</Pill> — click at the opposite position (~180° away)</>}
              what={
                <>
                  Add a second node. Cassandra will rebalance token ownership between the two nodes.
                  You'll see gossip arcs between NodeA and NodeB, and the ring segments visually resize.
                </>
              }
              why={
                "With two nodes the ring is split in half. Each node becomes a replica for the other's tokens when RF ≥ 2. This is the minimum for any fault-tolerance. Notice how the gossip protocol now propagates state updates between the two nodes."
              }
              tip="For realistic scenarios, add 3 nodes. RF=2 with 2 nodes means ALL consistency, not QUORUM."
            />

            <SectionLabel>Load data</SectionLabel>

            <Step
              n={3}
              title="Import Data from CSV"
              where={<><Pill>Left sidebar</Pill> → <strong style={{ color: T.textH }}>Schema Mode: CSV Auto</strong> → <strong style={{ color: T.textH }}>Data Entry</strong></>}
              what={
                <>
                  Switch to <strong style={{ color: T.textH }}>CSV Auto</strong> mode, upload a CSV file (e.g. a list of products or users),
                  choose your partition key column, then click <Code>Import CSV</Code>.
                  The simulator auto-creates the keyspace and table, then inserts each row into real Cassandra containers.
                </>
              }
              why={
                "The partition key is hashed (Murmur3 by default) to a token, which determines which node becomes the coordinator and which nodes store replicas. The ring lights up row by row as data arrives."
              }
              tip="After import, the right panel shows each row's token hash and its replica nodes. Hover a node on the ring to see how many rows it owns."
              warn="CSV columns must match table schema if a manual schema was already created."
            />

            <SectionLabel>Read & Write</SectionLabel>

            <Step
              n={4}
              title="Write to the Cluster — Node interaction"
              where={<><Pill>Left sidebar</Pill> → <strong style={{ color: T.textH }}>Data Entry → Manual Data</strong></>}
              what={
                <>
                  In Manual mode, fill in the <Code>id</Code> and <Code>value</Code> fields, choose a
                  <strong style={{ color: T.textH }}> Consistency Level</strong> (ONE / QUORUM / ALL), pick
                  an <strong style={{ color: T.textH }}>Entry Node</strong>, and click <Code>Write</Code>.
                  Watch the animated write flow: <Pill>RAW</Pill><Pill>HASH</Pill><Pill>RING</Pill><Pill>NODES</Pill>.
                </>
              }
              why={
                "The entry node acts as coordinator — it hashes the partition key, locates the replica nodes on the ring, and forwards the write to each replica. With QUORUM the write is acknowledged when ⌈RF/2⌉+1 replicas confirm. The CoordinatorModal popup explains live which node coordinated and which received replicas."
              }
              tip="Try the same write with ONE vs QUORUM vs ALL to see how latency and fault-tolerance trade off."
            />

            <Step
              n={5}
              title="Read from the Cluster"
              where={<><Pill>Left sidebar</Pill> → <strong style={{ color: T.textH }}>Read Data</strong></>}
              what={
                <>
                  Enter an <Code>id</Code> to look up. The coordinator contacts the replica nodes
                  determined by the token, compares digests (if CL &gt; ONE), and returns the
                  most recent value. The response shows which nodes were contacted.
                </>
              }
              why={
                "Cassandra reads use a speculative execution model — the coordinator sends a full request to one replica and digest requests to others, then reconciles. With QUORUM it waits for ⌈RF/2⌉+1 matching responses. Read-path includes the bloom filter, key cache, and SSTable lookup."
              }
            />

            <SectionLabel>Fault tolerance</SectionLabel>

            <Step
              n={6}
              title="Take a Node Down and Recover with Hinted Handoff"
              where={<><Pill>Token ring</Pill> → click a node → Stop | <Pill>Right panel</Pill> → Hinted Handoff tab</>}
              what={
                <>
                  1. Click a node on the ring and press <Code>Stop node</Code> to bring it down (status turns <span style={{ color: T.red }}>DOWN</span>).<br /><br />
                  2. Write new data with CL=ONE or QUORUM while the node is down.<br /><br />
                  3. Open the <strong style={{ color: T.textH }}>Hinted Handoff</strong> panel — it shows hints queued for the downed node.<br /><br />
                  4. Restart the node. Cassandra delivers the buffered hints automatically.
                </>
              }
              why={
                "When a replica is unavailable the coordinator stores a 'hint' — a timestamped copy of the write — locally. Once the target node recovers, hints are replayed so it catches up without manual repair. The Hinted Handoff panel makes these buffered hints visible in real time."
              }
              tip="Hints are kept for cassandra.max_hint_window_in_ms (3 hours by default). If the node is down longer, use nodetool repair instead."
              warn="Hints do NOT count toward the consistency level acknowledgement — the write is still served by the live replicas."
            />

            <Step
              n={7}
              title="Read from a Down Node — CAP Theorem"
              where={<><Pill>Left sidebar</Pill> → Read → choose CL=ALL or CL=QUORUM with too few nodes UP</>}
              what={
                <>
                  With a node still DOWN, attempt a read with <Code>ALL</Code> consistency (or QUORUM when
                  fewer than ⌈RF/2⌉+1 nodes are up). The request will fail and the <strong style={{ color: T.red }}>CAP Error Modal</strong> appears.
                </>
              }
              why={
                "CAP theorem: in the presence of a network Partition, a system must choose between Consistency and Availability. Cassandra defaults to AP — it stays Available and relaxes Consistency. The modal shows you exactly how the tunable consistency level maps to the C-vs-A dial: ONE favors A, ALL favors C, QUORUM is the middle ground."
              }
              tip="Switch to CL=ONE and retry — the read succeeds from a live replica, demonstrating Cassandra's AP choice."
            />

            <Step
              n={8}
              title="Try Read Repair"
              where={<><Pill>Right panel</Pill> → Read Repair tab</>}
              what={
                <>
                  After bringing the node back up, navigate to the <strong style={{ color: T.textH }}>Read Repair</strong> panel.
                  Trigger a read for a key that was written while the node was down.
                  The panel shows digest comparison and which replicas were stale.
                </>
              }
              why={
                "Read Repair is Cassandra's passive anti-entropy mechanism. When a read returns different versions from different replicas, the coordinator sends the latest version back to the stale replicas. This happens transparently at read time and is controlled by read_repair_chance in the table options."
              }
              tip="Combine Hinted Handoff (step 6) + Read Repair (step 8) to see the full eventual consistency recovery cycle."
            />

            <SectionLabel>Cleanup</SectionLabel>

            <Step
              n={9}
              title="Reset the Cluster"
              where={<><Pill>Header</Pill> → <Code>⟳ Reset Cluster</Code> button (top right)</>}
              what={
                <>
                  Click <Code>Reset Cluster</Code>. This calls <Code>DELETE /cluster/{"{name}"}</Code> on the backend,
                  destroys all Docker containers, clears the registry, and resets all frontend state.
                </>
              }
              why={
                "Each Docker container is a real Cassandra process on the cassandra-net bridge network. Reset ensures no orphaned containers and reclaims ports. It also resets gossip state, token assignments, and the keyspace — clean slate for the next experiment."
              }
              warn="All data in the real Cassandra containers is permanently deleted on reset."
            />
          </>
        )}

        {/* ══════════════════ CORE CONCEPTS TAB ════════════════════════ */}
        {tab === "concepts" && (
          <>
            <InfoBox icon="📖">
              Expand any concept to read a short explanation and see how it maps to the simulator UI.
            </InfoBox>

            <SectionLabel>Data distribution</SectionLabel>

            <ConceptCard title="Token Ring" icon="🔵" pills={["Consistent Hashing", "Partition Key"]}>
              Cassandra distributes data across nodes using a <strong>consistent hashing ring</strong>.
              Each node owns a range of tokens on the 2⁶⁴ integer ring. The partition key of every row is
              hashed (Murmur3 by default) to a token, and the row is stored on the node whose token
              range covers that value.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> the circular SVG is the
              live token ring. Arc segments show each node's range; colour intensity shows replication load.
            </ConceptCard>

            <ConceptCard title="Replication Factor (RF)" icon="📋" pills={["SimpleStrategy", "NetworkTopologyStrategy"]}>
              RF controls how many copies of each row exist. With RF=2, every write goes to 2 nodes —
              the primary replica and the next clockwise node. With RF=3 (recommended for production)
              any 1 node can fail without data loss.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> change RF in the Schema Mode
              panel. After a write you'll see exactly which RF nodes received the row highlighted on the ring.
            </ConceptCard>

            <SectionLabel>Consistency</SectionLabel>

            <ConceptCard title="Consistency Levels" icon="⚖️" pills={["ONE", "QUORUM", "ALL"]}>
              CL is a per-operation tunable that sets how many replica ACKs are required before the
              coordinator returns success:
              <ul style={{ margin: "8px 0 0 16px", padding: 0, lineHeight: 1.9 }}>
                <li><Code>ONE</Code> — fastest, weakest. 1 replica must respond.</li>
                <li><Code>QUORUM</Code> — ⌈RF/2⌉+1 replicas. Balanced.</li>
                <li><Code>ALL</Code> — every replica must respond. Strongest, no fault tolerance.</li>
              </ul>
              <br />
              Strong consistency requires CL_write + CL_read &gt; RF.
            </ConceptCard>

            <ConceptCard title="CAP Theorem" icon="🔺" pills={["AP System", "Tunable"]}>
              CAP says a distributed system can guarantee at most 2 of: <strong>C</strong>onsistency,
              <strong>A</strong>vailability, <strong>P</strong>artition tolerance. Cassandra is an
              <strong> AP system</strong> — it stays available during partitions but may serve stale data.
              Tunable CL lets you shift on the C↔A spectrum per query.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> when you read with ALL while a
              node is down, the CAP Error Modal visualises exactly why consistency was sacrificed.
            </ConceptCard>

            <SectionLabel>Fault tolerance & repair</SectionLabel>

            <ConceptCard title="Gossip Protocol" icon="🗣" pills={["Peer-to-Peer", "Eventual Consistency"]}>
              Nodes exchange state (status, load, schema version) via gossip every second. Each node
              contacts 1–3 random peers and propagates the freshest state it knows. After O(log N) rounds
              every node has a consistent view of the cluster.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> gossip arcs animate on the ring
              in real time, showing the direction and target of each gossip exchange.
            </ConceptCard>

            <ConceptCard title="Hinted Handoff" icon="📬" pills={["Write-path", "Temporary buffer"]}>
              When a write targets a downed replica, the coordinator stores a <em>hint</em> — a small
              descriptor (key + mutation) — in its local hints table. When the target node recovers, hints
              are streamed to it so it catches up with missed writes automatically.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> the Hinted Handoff panel lists
              queued hints per node and shows delivery status after node restart.
            </ConceptCard>

            <ConceptCard title="Read Repair" icon="🔧" pills={["Anti-entropy", "Read-path"]}>
              During a CL &gt; ONE read, the coordinator fetches a full response from one replica and digests
              from the others. If digests differ, it fetches full data from all, picks the newest (by
              timestamp), returns it to the client, and silently pushes the update to stale replicas.
              <br /><br />
              <strong style={{ color: T.textH }}>In the simulator:</strong> the Read Repair panel reveals
              which replicas were stale and what mutation was replayed.
            </ConceptCard>
          </>
        )}

        {/* ══════════════════ GLOSSARY TAB ═════════════════════════════ */}
        {tab === "glossary" && (
          <>
            <InfoBox icon="🔤">
              Quick-reference for terms used throughout the simulator.
            </InfoBox>

            {[
              ["Coordinator", "The node a client connects to for a read or write. It routes the request to the correct replica(s) based on the partition key's token and the consistency level."],
              ["Partition Key", "The column(s) used to hash a row to a token. Rows with the same partition key are stored together on the same node(s)."],
              ["Token", "A 64-bit integer derived by hashing the partition key. Determines which node owns a row."],
              ["Replica", "A node that stores a copy of a given partition. The number of replicas equals RF."],
              ["RF — Replication Factor", "How many nodes store each partition. RF=1 means no redundancy; RF=3 is the production standard."],
              ["CL — Consistency Level", "Per-operation setting for how many replicas must acknowledge before success: ONE, QUORUM, ALL."],
              ["QUORUM", "⌈RF/2⌉+1. For RF=3: 2. Balances latency and fault tolerance. Guarantees strong consistency when CL_write and CL_read are both QUORUM."],
              ["Murmur3", "The default hash function used to map a partition key string to a token. Produces well-distributed, non-cryptographic hashes."],
              ["SimpleStrategy", "Replication strategy that places replicas on the next N-1 clockwise nodes on the ring. For single-datacenter use only."],
              ["NetworkTopologyStrategy", "Replication strategy aware of racks and datacenters. Preferred for production multi-DC deployments."],
              ["Gossip", "Peer-to-peer protocol where nodes periodically exchange state information. Used for failure detection and membership tracking."],
              ["Hint", "A buffered write stored by the coordinator when a target replica is unreachable. Delivered when the replica recovers."],
              ["Read Repair", "Background consistency check during reads: if replicas disagree, the coordinator pushes the latest version to stale replicas."],
              ["Bloom Filter", "A probabilistic data structure on each SSTable used to quickly determine if a partition key might exist, avoiding unnecessary disk reads."],
              ["SSTable", "Sorted String Table — Cassandra's immutable on-disk storage file. Multiple SSTables per node are periodically merged via compaction."],
              ["nodetool", "CLI tool for operating a Cassandra node: status, repair, removenode, compaction, etc."],
              ["CQL", "Cassandra Query Language — SQL-like syntax for interacting with Cassandra (CREATE KEYSPACE, INSERT, SELECT, …)."],
              ["Keyspace", "Top-level namespace in Cassandra, analogous to a database. Replication is configured per keyspace."],
              ["CAP Theorem", "Distributed systems theorem: Consistency, Availability, Partition-tolerance — pick 2. Cassandra is AP with tunable C."],
            ].map(([term, def]) => (
              <div key={term} style={{
                borderBottom: `1px solid ${T.border}`, padding: "9px 0",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 3,
                  fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  {term}
                </div>
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.65 }}>{def}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: "8px 14px",
        borderTop: `1px solid ${T.border}`,
        background: T.bgCard,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.accent,
          letterSpacing: 1, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          CassandraEdu
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#5A7A96" }}>
          Apache Cassandra™
        </span>
      </div>
    </div>
  );
}