import { useCallback, useEffect, useRef, useState } from "react";

const ACCENT = "#20B2AA";
const AMBER  = "#f59e0b";
const GREEN  = "#22c55e";
const RED    = "#ef4444";

const card  = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
const h3s   = { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: "0 0 10px" };
const mono  = { fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11 };

// ─── Hint bubble SVG animation ──────────────────────────────────────────────

function HintFlowSVG({ hints, nodes, replayingHint }) {
  const W = 340, H = 110;
  if (!hints.length || nodes.length < 2) return null;

  const downNodeId  = hints[0]?.target_node;
  const downNode    = nodes.find(n => n.id === downNodeId) ?? nodes[0];
  const coordNode   = nodes.find(n => n.id !== downNode.id) ?? nodes[1];

  const coordX = 80,  coordY = H / 2;
  const downX  = 260, downY  = H / 2;

  const isReplaying = replayingHint != null;
  const progress    = replayingHint?.progress ?? 0;
  const dotX        = coordX + (downX - coordX) * progress;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <style>{`
          @keyframes hhPulse { 0%,100%{opacity:0.6} 50%{opacity:0.15} }
          .hh-pulse { animation: hhPulse 1.8s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Dashed line between nodes */}
      <line x1={coordX + 22} y1={coordY} x2={downX - 22} y2={downY}
        stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} strokeDasharray="5 4" />

      {/* Coordinator node */}
      <circle cx={coordX} cy={coordY} r={20} fill="rgba(32,178,170,0.12)" stroke={ACCENT} strokeWidth={1.5} />
      <text x={coordX} y={coordY - 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={9} fontWeight={700} fill={ACCENT}>{coordNode?.id ?? "Coord"}</text>
      <text x={coordX} y={coordY + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize={7} fill="rgba(255,255,255,0.35)">coordinator</text>

      {/* Hint storage badge */}
      {hints.length > 0 && (
        <g>
          <rect x={coordX - 14} y={coordY - 36} width={28} height={16} rx={4}
            fill={AMBER + "33"} stroke={AMBER} strokeWidth={0.8} />
          <text x={coordX} y={coordY - 27} textAnchor="middle" dominantBaseline="middle"
            fontSize={7.5} fontWeight={700} fill={AMBER}>{hints.length} hint{hints.length > 1 ? "s" : ""}</text>
        </g>
      )}

      {/* Down node */}
      <circle cx={downX} cy={downY} r={20}
        fill={isReplaying ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)"}
        stroke={isReplaying ? GREEN : RED} strokeWidth={1.5}
        className={!isReplaying ? "hh-pulse" : ""} />
      <text x={downX} y={downY - 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={9} fontWeight={700} fill={isReplaying ? GREEN : RED}>{downNode?.id ?? "Node"}</text>
      <text x={downX} y={downY + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize={7} fill={isReplaying ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.5)"}>
        {isReplaying ? "recovering…" : "offline"}
      </text>

      {/* Flying dot during replay */}
      {isReplaying && progress > 0 && progress < 1 && (
        <circle cx={dotX} cy={coordY} r={5} fill={AMBER} opacity={0.9} />
      )}

      {/* Labels */}
      <text x={W / 2} y={14} textAnchor="middle" fontSize={8}
        fill="rgba(255,255,255,0.25)" letterSpacing={1}>HINTED HANDOFF</text>
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * HintedHandoffPanel
 *
 * Props:
 *   clusterName  — string
 *   nodes        — array of { id, status, ip }
 *   getHints     — async (clusterName) => { hints: [{target_node, key, mutation_ts, coordinator}], raw_tpstats: string }
 *   startNode    — async (nodeName, clusterName) => void   (triggers recovery)
 */
export default function HintedHandoffPanel({ clusterName, nodes, getHints, startNode }) {
  const [hints, setHints]           = useState([]);
  const [rawStats, setRawStats]      = useState("");
  const [loading, setLoading]        = useState(false);
  const [error, setError]            = useState("");
  const [replayingHint, setReplaying] = useState(null);   // { targetNode, progress }
  const [log, setLog]                = useState([]);
  const [expanded, setExpanded]      = useState(false);
  const intervalRef                  = useRef(null);
  const mountedRef                   = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const pushLog = useCallback((msg, color = "rgba(255,255,255,0.5)") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLog(prev => [{ ts, msg, color }, ...prev].slice(0, 40));
  }, []);

  const fetchHints = useCallback(async () => {
    if (!clusterName || !getHints) return;
    try {
      setLoading(true); setError("");
      const data = await getHints(clusterName);
      if (!mountedRef.current) return;
      const newHints = data?.hints ?? [];
      setHints(newHints);
      setRawStats(data?.raw_tpstats ?? "");
      if (newHints.length > 0) pushLog(`${newHints.length} hint(s) pending for ${[...new Set(newHints.map(h => h.target_node))].join(", ")}`, AMBER);
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clusterName, getHints, pushLog]);

  // Poll every 4s when there are down nodes
  useEffect(() => {
    const downNodes = nodes.filter(n => n.status !== "up");
    if (downNodes.length === 0) { clearInterval(intervalRef.current); return; }
    fetchHints();
    intervalRef.current = setInterval(fetchHints, 4000);
    return () => clearInterval(intervalRef.current);
  }, [nodes, fetchHints]);

  const handleRecover = useCallback(async (targetNodeId) => {
    if (!startNode) return;
    pushLog(`Starting recovery for ${targetNodeId}…`, ACCENT);
    pushLog(`Waiting for container to boot up... (can take 15-30s)`, "rgba(255,255,255,0.4)");
    try {
      const nodeHints = hints.filter(h => h.target_node === targetNodeId);
      let i = 0;
      const startTime = performance.now();
      const TOTAL = 3500;

      const animate = (now) => {
        const t = Math.min((now - startTime) / TOTAL, 1);
        if (mountedRef.current) setReplaying({ targetNode: targetNodeId, progress: t });
        if (t < 1) requestAnimationFrame(animate);
        else {
          setReplaying(null);
          pushLog(`✓ ${nodeHints.length} hint(s) replayed to ${targetNodeId}`, GREEN);
          setHints(prev => prev.filter(h => h.target_node !== targetNodeId));
        }
      };
      requestAnimationFrame(animate);

      await startNode(targetNodeId, clusterName);
      for (const hint of nodeHints) {
        await new Promise(r => setTimeout(r, 300));
        pushLog(`  → replaying key "${hint.key}" to ${targetNodeId}`, AMBER);
        i++;
      }
    } catch (e) {
      setReplaying(null);
      pushLog(`✗ Recovery failed: ${e.message}`, RED);
    }
  }, [hints, startNode, clusterName, pushLog]);

  const downNodes  = [...new Set(hints.map(h => h.target_node))];
  const aliveNodes = nodes.filter(n => n.status === "up");

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={h3s}>⚡ HINTED HANDOFF</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>polling…</span>}
          <button onClick={fetchHints}
            style={{ fontSize: 10, padding: "3px 8px", background: "transparent", border: "1px solid rgba(32,178,170,0.3)", borderRadius: 5, color: ACCENT, cursor: "pointer" }}>
            ↻ refresh
          </button>
        </div>
      </div>

      {/* Educational blurb */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 10, padding: "8px 10px", background: "rgba(245,158,11,0.05)", borderLeft: `2px solid ${AMBER}44`, borderRadius: 4 }}>
        When a replica is <span style={{ color: AMBER }}>offline</span>, the coordinator stores the write locally as a <em>hint</em>. Once the node comes back up, the hint is <span style={{ color: GREEN }}>replayed</span> — guaranteeing eventual consistency with no data loss.
      </div>

      {error && (
        <div style={{ fontSize: 10, color: RED, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* SVG visualisation */}
      <HintFlowSVG hints={hints} nodes={aliveNodes} replayingHint={replayingHint} />

      {/* Status bar */}
      <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, padding: "8px 10px", background: "rgba(245,158,11,0.06)", borderRadius: 6, border: `1px solid ${AMBER}22` }}>
          <div style={{ fontSize: 8, color: AMBER, letterSpacing: 1, marginBottom: 3 }}>PENDING HINTS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: hints.length > 0 ? AMBER : "rgba(255,255,255,0.2)", ...mono }}>{hints.length}</div>
        </div>
        <div style={{ flex: 1, padding: "8px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: `1px solid ${RED}22` }}>
          <div style={{ fontSize: 8, color: RED, letterSpacing: 1, marginBottom: 3 }}>NODES OFFLINE</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: downNodes.length > 0 ? RED : "rgba(255,255,255,0.2)", ...mono }}>{downNodes.length}</div>
        </div>
      </div>

      {/* Per-node hint table */}
      {hints.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {downNodes.map(nodeId => {
            const nodeHints = hints.filter(h => h.target_node === nodeId);
            const isReplaying = replayingHint?.targetNode === nodeId;
            return (
              <div key={nodeId} style={{ marginBottom: 8, padding: "8px 10px", background: "rgba(239,68,68,0.06)", borderRadius: 7, border: `1px solid ${RED}22` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: RED, ...mono }}>{nodeId}</span>
                  <span style={{ fontSize: 9, color: AMBER }}>{nodeHints.length} hint{nodeHints.length > 1 ? "s" : ""} stored</span>
                </div>
                <div style={{ maxHeight: 80, overflowY: "auto", marginBottom: 8 }}>
                  {nodeHints.map((h, i) => (
                    <div key={i} style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", display: "flex", gap: 8, marginBottom: 2, ...mono }}>
                      <span style={{ color: AMBER, minWidth: 60 }}>{h.key ?? `key-${i}`}</span>
                      <span style={{ color: "rgba(255,255,255,0.2)" }}>via {h.coordinator ?? "coordinator"}</span>
                      <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)" }}>{h.mutation_ts ? new Date(h.mutation_ts).toLocaleTimeString() : ""}</span>
                    </div>
                  ))}
                </div>
                <button
                  disabled={isReplaying}
                  onClick={() => handleRecover(nodeId)}
                  style={{
                    width: "100%", padding: "5px 0", fontSize: 10, fontWeight: 700,
                    background: isReplaying ? "rgba(34,197,94,0.12)" : "rgba(34,197,94,0.15)",
                    border: `1px solid ${GREEN}44`,
                    borderRadius: 5, color: GREEN, cursor: isReplaying ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}>
                  {isReplaying ? "⟳ replaying hints…" : `▶ recover ${nodeId} & replay hints`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {hints.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
          {nodes.filter(n => n.status !== "up").length === 0
            ? "All nodes are up — no hints pending."
            : "No hints detected yet. Bring a node down and write data to generate hints."}
        </div>
      )}

      {/* Raw tpstats collapsible */}
      {rawStats && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setExpanded(v => !v)}
            style={{ fontSize: 9, background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 0 }}>
            {expanded ? "▾" : "▸"} raw nodetool tpstats
          </button>
          {expanded && (
            <pre style={{ marginTop: 4, fontSize: 8, color: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 5, overflowX: "auto", maxHeight: 140 }}>
              {rawStats}
            </pre>
          )}
        </div>
      )}

      {/* Activity log */}
      {log.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 110, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          {log.map((entry, i) => (
            <div key={i} style={{ fontSize: 9, color: entry.color, display: "flex", gap: 8, marginBottom: 2, ...mono }}>
              <span style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{entry.ts}</span>
              <span>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}