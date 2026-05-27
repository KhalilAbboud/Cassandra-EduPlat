import { useEffect, useRef, useState } from "react";

// ── CAP Triangle SVG ──────────────────────────────────────────────────────────
function CAPTriangle({ highlighted }) {
  const pts = {
    C: { x: 150, y: 20 },
    A: { x: 30,  y: 200 },
    P: { x: 270, y: 200 },
  };
  const colors = {
    C: highlighted === "C" ? "#f76a6a" : "rgba(255,255,255,0.15)",
    A: highlighted === "A" ? "#6af7b8" : "rgba(255,255,255,0.15)",
    P: highlighted === "P" ? "#facc15" : "rgba(255,255,255,0.15)",
  };
  const edgeColor = (a, b) =>
    highlighted === a || highlighted === b ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)";

  return (
    <svg viewBox="0 0 300 230" style={{ width: 200, height: 150, flexShrink: 0 }}>
      <line x1={pts.C.x} y1={pts.C.y} x2={pts.A.x} y2={pts.A.y} stroke={edgeColor("C","A")} strokeWidth={1.5} />
      <line x1={pts.C.x} y1={pts.C.y} x2={pts.P.x} y2={pts.P.y} stroke={edgeColor("C","P")} strokeWidth={1.5} />
      <line x1={pts.A.x} y1={pts.A.y} x2={pts.P.x} y2={pts.P.y}
        stroke={edgeColor("A","P")} strokeWidth={2.5}
        strokeDasharray={highlighted === "C" ? "0" : "5 3"} />
      {highlighted === "C" && (
        <polygon
          points={`${pts.C.x},${pts.C.y} ${pts.A.x},${pts.A.y} ${pts.P.x},${pts.P.y}`}
          fill="rgba(247,106,106,0.04)" stroke="none" />
      )}
      {Object.entries(pts).map(([key, pos]) => (
        <g key={key}>
          <circle cx={pos.x} cy={pos.y} r={22}
            fill={highlighted === key ? `${colors[key]}22` : "rgba(255,255,255,0.03)"}
            stroke={colors[key]} strokeWidth={highlighted === key ? 2 : 1} />
          <text x={pos.x} y={pos.y - 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fontWeight="800" fill={colors[key]}
            fontFamily="'JetBrains Mono', monospace">{key}</text>
          <text x={pos.x} y={pos.y + 10} textAnchor="middle" dominantBaseline="middle"
            fontSize={6.5} fill={`${colors[key]}99`}
            fontFamily="'JetBrains Mono', monospace">
            {key === "C" ? "Consistency" : key === "A" ? "Availability" : "Partition"}
          </text>
        </g>
      ))}
      {highlighted === "C" && (
        <g>
          <line x1={pts.C.x-10} y1={pts.C.y-10} x2={pts.C.x+10} y2={pts.C.y+10} stroke="#f76a6a" strokeWidth={2.5} />
          <line x1={pts.C.x+10} y1={pts.C.y-10} x2={pts.C.x-10} y2={pts.C.y+10} stroke="#f76a6a" strokeWidth={2.5} />
        </g>
      )}
      <text x={150} y={215} textAnchor="middle" fontSize={8}
        fill="rgba(255,255,255,0.2)" fontFamily="'JetBrains Mono', monospace">
        Cassandra guarantees AP
      </text>
    </svg>
  );
}

// ── Animated ring mini-view ────────────────────────────────────────────────────
function MiniRing({ deadNodeIds = [], affectedKey, nodeColors = {}, allNodes = [] }) {
  const W = 200, H = 200, CX = 100, CY = 100, R = 70;
  const positions = allNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / allNodes.length - Math.PI / 2;
    return {
      ...n,
      x: CX + R * Math.cos(angle),
      y: CY + R * Math.sin(angle),
      color: nodeColors[n.id] ?? "#20B2AA",
      dead: deadNodeIds.includes(n.id),
    };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 140, height: 140, flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} />
      {positions.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={18}
            fill={n.dead ? "rgba(247,106,106,0.08)" : `${n.color}18`}
            stroke={n.dead ? "#f76a6a" : n.color}
            strokeWidth={n.dead ? 2 : 1.5}
            strokeDasharray={n.dead ? "4 2" : "0"} />
          <text x={n.x} y={n.y - 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontWeight="800"
            fill={n.dead ? "#f76a6a" : n.color}
            fontFamily="'JetBrains Mono', monospace">
            {n.id.replace("Node", "")}
          </text>
          {n.dead && (
            <>
              <line x1={n.x-6} y1={n.y-6} x2={n.x+6} y2={n.y+6} stroke="#f76a6a" strokeWidth={2} />
              <line x1={n.x+6} y1={n.y-6} x2={n.x-6} y2={n.y+6} stroke="#f76a6a" strokeWidth={2} />
            </>
          )}
        </g>
      ))}
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize={7}
        fill="rgba(255,255,255,0.2)" fontFamily="'JetBrains Mono', monospace">
        key="{affectedKey}"
      </text>
      <text x={CX} y={CY + 7} textAnchor="middle" fontSize={6}
        fill="#f76a6a" fontFamily="'JetBrains Mono', monospace">
        inaccessible
      </text>
    </svg>
  );
}

// ── Consistency level explainer ───────────────────────────────────────────────
function ConsistencyExplainer({ consistencyLevel, replicationFactor, nodes }) {
  const upNodes = nodes.filter(n => n.status === "up").length;
  const totalNodes = nodes.length;

  const needed = {
    ONE: 1,
    QUORUM: Math.floor(replicationFactor / 2) + 1,
    ALL: replicationFactor,
  }[consistencyLevel] ?? 1;

  const canAchieve = upNodes >= needed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
        With <strong style={{ color: "#facc15" }}>Consistency Level = {consistencyLevel}</strong>,
        Cassandra must receive a response from at least{" "}
        <strong style={{ color: "#fff" }}>{needed} node{needed > 1 ? "s" : ""}</strong> (out of RF={replicationFactor}).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {["ONE", "QUORUM", "ALL"].map(cl => {
          const req = { ONE: 1, QUORUM: Math.floor(replicationFactor / 2) + 1, ALL: replicationFactor }[cl];
          const ok = upNodes >= req;
          const active = cl === consistencyLevel;
          return (
            <div key={cl} style={{
              padding: "8px 10px", borderRadius: 7, textAlign: "center",
              background: active ? (ok ? "rgba(106,247,184,0.08)" : "rgba(247,106,106,0.08)") : "rgba(255,255,255,0.03)",
              border: `1px solid ${active ? (ok ? "#6af7b8" : "#f76a6a") : "rgba(255,255,255,0.07)"}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: active ? (ok ? "#6af7b8" : "#f76a6a") : "rgba(255,255,255,0.3)" }}>{cl}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                {req} node{req > 1 ? "s" : ""} required
              </div>
              <div style={{ fontSize: 9, marginTop: 4, color: ok ? "#6af7b8" : "#f76a6a" }}>
                {ok ? "✓ achievable" : "✗ not achievable"}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        padding: "8px 12px", borderRadius: 6,
        background: "rgba(106,247,184,0.05)", border: "1px solid rgba(106,247,184,0.15)",
        fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1.7,
      }}>
        💡 Fix: switch to <strong style={{ color: "#6af7b8" }}>ONE</strong> to read even with {upNodes}/{totalNodes} nodes UP,
        or add more nodes and increase RF.
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function CAPErrorModal({ error, onClose, onRetry }) {
  const [phase, setPhase] = useState(0);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 800);
    return () => clearInterval(t);
  }, []);

  if (!error) return null;

  const {
    message = "",
    queriedKey = "",
    replicationFactor = 1,
    consistencyLevel = "QUORUM",
    nodes = [],
    affectedEntry = null,
    deadNodes = [],
    nodeColors = {},
  } = error;

  // Detect error type
  const isConsistencyError = message.toLowerCase().includes("consistency") ||
    message.toLowerCase().includes("consistency level") ||
    message.toLowerCase().includes("not achievable");
  const isUnavailableError = message.toLowerCase().includes("unavailable") ||
    message.toLowerCase().includes("nohost") ||
    message.toLowerCase().includes("no host") ||
    message.toLowerCase().includes("500");

  const deadNodeIds = deadNodes.map(n => n.id);
  const affectedReplicas = affectedEntry?.replicas ?? [];
  const primaryNodeId = affectedEntry?.primaryNode ?? affectedReplicas[0]?.id ?? null;

  const ACCENT = "#20B2AA";

  const overlay = {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.92)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(6px)",
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
  };

  const modal = {
    background: "#080810",
    border: "1px solid rgba(247,106,106,0.25)",
    borderLeft: "3px solid #f76a6a",
    borderRadius: 12,
    padding: "24px 26px",
    width: "min(96vw, 700px)",
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  };

  const tabBtn = (active) => ({
    fontFamily: "inherit", fontSize: 10, padding: "5px 12px",
    borderRadius: 5,
    border: `1px solid ${active ? "#f76a6a" : "rgba(255,255,255,0.08)"}`,
    background: active ? "rgba(247,106,106,0.1)" : "transparent",
    color: active ? "#f76a6a" : "rgba(255,255,255,0.35)",
    cursor: "pointer", letterSpacing: 1,
  });

  const upNodes = nodes.filter(n => n.status === "up");

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 8, flexShrink: 0,
            background: "rgba(247,106,106,0.1)", border: "1px solid rgba(247,106,106,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
            boxShadow: pulse ? "0 0 18px rgba(247,106,106,0.35)" : "none",
            transition: "box-shadow 0.8s",
          }}>⚠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f76a6a", letterSpacing: 1 }}>
              READ FAILURE
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
              {isConsistencyError ? "Consistency level not achievable" : "Node(s) unreachable"}
              {" · "}RF={replicationFactor} · {upNodes.length}/{nodes.length} nodes UP
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 18, padding: 0,
          }}>✕</button>
        </div>

        {/* ── Error box ── */}
        <div style={{
          background: "rgba(247,106,106,0.05)", border: "1px solid rgba(247,106,106,0.2)",
          borderRadius: 7, padding: "10px 13px",
          fontSize: 10, color: "#f76a6a", lineHeight: 1.8,
        }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
            CASSANDRA ERROR
          </div>
          <div>{message || "Read failed"}</div>
          {queriedKey && queriedKey !== "(all)" && (
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.5)" }}>
              Queried key: <strong style={{ color: "#facc15" }}>"{queriedKey}"</strong>
            </div>
          )}
          {/* Node status quick view */}
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {nodes.map(n => (
              <span key={n.id} style={{
                fontSize: 9, padding: "2px 7px", borderRadius: 4,
                background: n.status === "up" ? "rgba(106,247,184,0.1)" : "rgba(247,106,106,0.1)",
                border: `1px solid ${n.status === "up" ? "rgba(106,247,184,0.3)" : "rgba(247,106,106,0.3)"}`,
                color: n.status === "up" ? "#6af7b8" : "#f76a6a",
              }}>
                {n.id} {n.status === "up" ? "●" : "✕"}
              </span>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={tabBtn(phase === 0)} onClick={() => setPhase(0)}>① What happened</button>
          <button style={tabBtn(phase === 1)} onClick={() => setPhase(1)}>
            {isConsistencyError ? "② Consistency Levels" : "② Why?"}
          </button>
          <button style={tabBtn(phase === 2)} onClick={() => setPhase(2)}>③ CAP Theorem</button>
        </div>

        {/* ── Phase 0: What happened ── */}
        {phase === 0 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {nodes.length > 0 && (
              <MiniRing
                deadNodeIds={deadNodeIds}
                affectedKey={queriedKey}
                nodeColors={nodeColors}
                allNodes={nodes}
              />
            )}
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
              {isConsistencyError ? (
                <>
                  <Step num="1" color="#facc15"
                    title={`Read requested: key "${queriedKey}"`}
                    desc={`Consistency level = ${consistencyLevel} → Cassandra must contact ${
                      { ONE: 1, QUORUM: Math.floor(replicationFactor / 2) + 1, ALL: replicationFactor }[consistencyLevel] ?? "?"
                    } replica(s) to respond.`}
                  />
                  <Step num="2" color="#f76a6a"
                    title={`Only ${upNodes.length}/${nodes.length} nodes UP`}
                    desc={`Not enough replicas available to satisfy the requested consistency level.`}
                  />
                  <Step num="3" color="#f76a6a"
                    title="Read fails — Consistency not achievable"
                    desc={`With RF=${replicationFactor} and ${upNodes.length} node(s) UP, ${consistencyLevel} is impossible. Try ONE to read anyway.`}
                  />
                </>
              ) : (
                <>
                  <Step num="1" color="#facc15"
                    title={`Key "${queriedKey}" stored with RF=${replicationFactor}`}
                    desc={primaryNodeId
                      ? `The hash placed this key on ${primaryNodeId} (+ replicas if RF > 1).`
                      : "The Murmur3 hash determined the responsible node(s)."}
                  />
                  <Step num="2" color="#f76a6a"
                    title={deadNodeIds.length > 0
                      ? `${deadNodeIds.join(", ")} removed from cluster`
                      : "Node(s) unreachable"}
                    desc="Cassandra can no longer reach enough replicas to respond."
                  />
                  <Step num="3" color="#f76a6a"
                    title="Read fails"
                    desc={`With RF=${replicationFactor} and ${upNodes.length}/${nodes.length} nodes UP, the data is inaccessible.`}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Phase 1: Why / Consistency ── */}
        {phase === 1 && (
          isConsistencyError ? (
            <ConsistencyExplainer
              consistencyLevel={consistencyLevel}
              replicationFactor={replicationFactor}
              nodes={nodes}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ExplainBlock
                icon="🔢"
                title={`RF = ${replicationFactor} = single point of failure`}
                color="#f76a6a"
                desc={`With RF=${replicationFactor}, each piece of data only exists on ${replicationFactor} node${replicationFactor > 1 ? "s" : ""}. If those nodes go down, the data becomes inaccessible. To survive the loss of one node with RF=2, you need at least 2 nodes UP.`}
              />
              <ExplainBlock
                icon="🔁"
                title="How to prevent this?"
                color="#6af7b8"
                desc="Increase the RF. With RF=3 and 3 nodes, Cassandra can lose 1 node and continue serving data (with consistency level ONE or QUORUM)."
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
                {[{ rf: 1, survive: 0, color: "#f76a6a" }, { rf: 2, survive: 0, color: "#f7c76a" }, { rf: 3, survive: 1, color: "#6af7b8" }].map(r => (
                  <div key={r.rf} style={{
                    background: `${r.color}08`, border: `1px solid ${r.color}30`,
                    borderRadius: 7, padding: "10px 12px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: r.color }}>RF={r.rf}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                      survives {r.survive} failure{r.survive !== 1 ? "s" : ""}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 4 }}>
                      {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: i < r.rf ? r.color : "rgba(255,255,255,0.08)",
                        }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── Phase 2: CAP Theorem ── */}
        {phase === 2 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <CAPTriangle highlighted="C" />
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
                The CAP theorem states that a distributed system can only guarantee{" "}
                <strong style={{ color: "#fff" }}>2 of the 3</strong> properties simultaneously:
              </div>
              <CAPRow letter="C" color="#f76a6a" label="Consistency"
                desc="All nodes see the same data at the same time." sacrificed />
              <CAPRow letter="A" color="#6af7b8" label="Availability"
                desc="The cluster always responds, even during failures." />
              <CAPRow letter="P" color="#facc15" label="Partition Tolerance"
                desc="The system continues even if nodes can no longer communicate." />
              <div style={{
                marginTop: 4, padding: "8px 12px", borderRadius: 6,
                background: "rgba(32,178,170,0.06)", border: "1px solid rgba(32,178,170,0.2)",
                fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.7,
              }}>
                <span style={{ color: ACCENT, fontWeight: 700 }}>Cassandra chooses AP.</span>{" "}
                It stays available and partition-tolerant, but sacrifices consistency when replicas are insufficient.{" "}
                {isConsistencyError
                  ? `Here, ${consistencyLevel} requires too many nodes UP to be guaranteed.`
                  : `The data on ${deadNodeIds.join(", ") || "the dead node"} is inaccessible → C sacrificed.`
                }
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          {phase < 2 && (
            <button onClick={() => setPhase(p => p + 1)} style={{
              fontFamily: "inherit", fontSize: 10, padding: "7px 16px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer",
            }}>Next →</button>
          )}
          {onRetry && (
            <button onClick={onRetry} style={{
              fontFamily: "inherit", fontSize: 10, padding: "7px 16px",
              borderRadius: 6, border: `1px solid ${ACCENT}`,
              background: "rgba(32,178,170,0.1)", color: ACCENT, cursor: "pointer",
            }}>↺ Retry</button>
          )}
          <button onClick={onClose} style={{
            fontFamily: "inherit", fontSize: 10, padding: "7px 16px",
            borderRadius: 6, border: "1px solid rgba(247,106,106,0.4)",
            background: "rgba(247,106,106,0.08)", color: "#f76a6a", cursor: "pointer",
          }}>Close</button>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Step({ num, color, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: `${color}22`, border: `1px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color,
      }}>{num}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function ExplainBlock({ icon, title, color, desc }) {
  return (
    <div style={{
      background: `${color}06`, border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`, borderRadius: 7, padding: "10px 13px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 5 }}>{icon} {title}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{desc}</div>
    </div>
  );
}

function CAPRow({ letter, color, label, desc, sacrificed }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: sacrificed ? 1 : 0.7 }}>
      <div style={{
        width: 26, height: 26, borderRadius: 5, flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, color, position: "relative",
      }}>
        {letter}
        {sacrificed && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#f76a6a", fontWeight: 900,
          }}>✕</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 1 }}>
          {label} {sacrificed && <span style={{ color: "#f76a6a", fontSize: 9 }}>— sacrificed</span>}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}