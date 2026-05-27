import { useCallback, useEffect, useRef, useState } from "react";

const ACCENT = "#20B2AA";
const AMBER  = "#f59e0b";
const GREEN  = "#22c55e";
const RED    = "#ef4444";
const BLUE   = "#60a5fa";
const PURPLE = "#a78bfa";

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 };
const h3s  = { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: "0 0 10px" };
const mono = { fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11 };

// ─── Phase labels ────────────────────────────────────────────────────────────
const PHASES = [
  { id: "idle",    label: "Idle" },
  { id: "digest",  label: "① Digest Request" },
  { id: "compare", label: "② Compare Digests" },
  { id: "fetch",   label: "③ Full Data Fetch" },
  { id: "repair",  label: "④ Write Repair" },
  { id: "done",    label: "✓ Repaired" },
];

// ─── Animated SVG scene ──────────────────────────────────────────────────────
function ReadRepairSVG({ nodes, phase, staleNodeId, progress }) {
  const W = 340, H = 160;
  if (!nodes || nodes.length < 2) return null;

  // Layout: coordinator left, replicas spread right
  const coord = { x: 60, y: H / 2, label: nodes[0]?.id ?? "C", role: "coordinator" };
  const replicas = nodes.slice(0, 3).map((n, i) => ({
    x: 220,
    y: 40 + i * 60,
    label: n.id,
    stale: n.id === staleNodeId,
  }));

  const isActive = phase !== "idle" && phase !== "done";
  const dot = (fromX, fromY, toX, toY, p, color = AMBER) => {
    const x = fromX + (toX - fromX) * p;
    const y = fromY + (toY - fromY) * p;
    return <circle key={`dot-${fromX}-${toX}`} cx={x} cy={y} r={5} fill={color} opacity={0.9} />;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <style>{`
          @keyframes rrPulse { 0%,100%{opacity:0.5} 50%{opacity:0.1} }
          .rr-stale { animation: rrPulse 1.4s ease-in-out infinite; }
          @keyframes rrGlow  { 0%,100%{opacity:1} 50%{opacity:0.5} }
          .rr-glow  { animation: rrGlow 0.8s ease-in-out infinite; }
        `}</style>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.2)" />
        </marker>
      </defs>

      {/* Lines from coordinator to replicas */}
      {replicas.map((r, i) => (
        <line key={i} x1={coord.x + 22} y1={coord.y} x2={r.x - 22} y2={r.y}
          stroke={r.stale && phase === "repair" ? RED + "55" : "rgba(255,255,255,0.08)"}
          strokeWidth={r.stale && phase === "repair" ? 1.5 : 1}
          strokeDasharray="4 3" />
      ))}

      {/* Coordinator */}
      <circle cx={coord.x} cy={coord.y} r={22}
        fill="rgba(32,178,170,0.10)" stroke={ACCENT} strokeWidth={1.5} />
      <text x={coord.x} y={coord.y - 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fontWeight={700} fill={ACCENT}>{coord.label}</text>
      <text x={coord.x} y={coord.y + 9} textAnchor="middle" dominantBaseline="middle"
        fontSize={6.5} fill="rgba(255,255,255,0.3)">coord</text>

      {/* Digest badge */}
      {(phase === "compare" || phase === "fetch" || phase === "repair") && (
        <g>
          <rect x={coord.x - 16} y={coord.y - 42} width={32} height={16} rx={4}
            fill="rgba(96,165,250,0.15)" stroke={BLUE} strokeWidth={0.8} />
          <text x={coord.x} y={coord.y - 33} textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fill={BLUE}>digests</text>
        </g>
      )}

      {/* Replica nodes */}
      {replicas.map((r, i) => {
        const color = r.stale ? RED : GREEN;
        const isStaleAndRepair = r.stale && phase === "repair";
        return (
          <g key={i}>
            <circle cx={r.x} cy={r.y} r={20}
              fill={r.stale ? "rgba(239,68,68,0.10)" : "rgba(34,197,94,0.08)"}
              stroke={color} strokeWidth={1.5}
              className={r.stale && phase !== "done" && phase !== "idle" ? "rr-stale" : ""} />
            <text x={r.x} y={r.y - 2} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight={700} fill={color}>{r.label}</text>
            <text x={r.x} y={r.y + 9} textAnchor="middle" dominantBaseline="middle"
              fontSize={6.5} fill={r.stale ? RED + "99" : "rgba(255,255,255,0.25)"}>
              {r.stale ? (phase === "done" ? "repaired ✓" : "stale data") : "up to date"}
            </text>

            {/* Digest label on each node during digest phase */}
            {(phase === "digest" || phase === "compare") && (
              <text x={r.x + 24} y={r.y} textAnchor="start" dominantBaseline="middle"
                fontSize={6.5} fill={r.stale ? RED + "99" : "rgba(255,255,255,0.2)"}>
                {r.stale ? "d=0xAA…" : "d=0xFF…"}
              </text>
            )}
          </g>
        );
      })}

      {/* Mismatch label */}
      {phase === "compare" && (
        <g>
          <rect x={120} y={H / 2 - 12} width={80} height={20} rx={4}
            fill="rgba(247,106,106,0.12)" stroke={RED + "55"} strokeWidth={1} />
          <text x={160} y={H / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fontWeight={700} fill={RED}>MISMATCH!</text>
        </g>
      )}

      {/* Flying dots for different phases */}
      {phase === "digest" && replicas.map((r, i) =>
        dot(coord.x + 22, coord.y, r.x - 22, r.y, progress, BLUE)
      )}
      {phase === "fetch" && (() => {
        const stale = replicas.find(r => r.stale);
        if (!stale) return null;
        return dot(coord.x + 22, coord.y, stale.x - 22, stale.y, progress, AMBER);
      })()}
      {phase === "repair" && (() => {
        const stale = replicas.find(r => r.stale);
        if (!stale) return null;
        return dot(coord.x + 22, coord.y, stale.x - 22, stale.y, progress, GREEN);
      })()}

      <text x={W / 2} y={14} textAnchor="middle" fontSize={8}
        fill="rgba(255,255,255,0.2)" letterSpacing={1}>READ REPAIR</text>
    </svg>
  );
}

// ─── Phase progress bar ──────────────────────────────────────────────────────
function PhaseBar({ phase }) {
  const idx = PHASES.findIndex(p => p.id === phase);
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
      {PHASES.filter(p => p.id !== "idle").map((p, i) => {
        const done    = i < idx;
        const current = PHASES[idx]?.id === p.id;
        return (
          <div key={p.id} style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              height: 3, borderRadius: 2,
              background: done ? GREEN : current ? AMBER : "rgba(255,255,255,0.08)",
              marginBottom: 3, transition: "background 0.3s",
            }} />
            <span style={{
              fontSize: 7, color: done ? GREEN : current ? AMBER : "rgba(255,255,255,0.2)",
              fontWeight: current ? 700 : 400, transition: "color 0.3s",
              display: "block", lineHeight: 1.2,
            }}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * ReadRepairPanel
 *
 * Props:
 *   clusterName     — string
 *   nodes           — array of { id, status }
 *   readData        — async (filters, cl, ks, tbl, cluster) => result
 *   keyspaceName    — string
 *   tableName       — string
 *   consistencyLevel— string  (should be QUORUM to trigger read repair)
 *   getRepairStats  — async (clusterName) => { repairs: [{key, stale_node, repaired_at}], total_read_repairs: number }
 */
export default function ReadRepairPanel({
  clusterName,
  nodes,
  readData,
  keyspaceName,
  tableName,
  consistencyLevel,
  getRepairStats,
}) {
  const [phase, setPhase]         = useState("idle");
  const [progress, setProgress]   = useState(0);
  const [staleNodeId, setStaleNodeId] = useState(null);
  const [repairLog, setRepairLog] = useState([]);
  const [stats, setStats]         = useState({ total: 0, repairs: [] });
  const [filterKey, setFilterKey] = useState("");
  const [running, setRunning]     = useState(false);
  const [error, setError]         = useState("");
  const mountedRef                = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const pushLog = useCallback((msg, color = "rgba(255,255,255,0.5)") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setRepairLog(prev => [{ ts, msg, color }, ...prev].slice(0, 50));
  }, []);

  // Fetch repair stats from backend periodically
  useEffect(() => {
    if (!getRepairStats || !clusterName) return;
    const fetch = async () => {
      try {
        const data = await getRepairStats(clusterName);
        if (mountedRef.current) setStats({ total: data.total_read_repairs ?? 0, repairs: data.repairs ?? [] });
      } catch { /* silent */ }
    };
    fetch();
    const id = setInterval(fetch, 6000);
    return () => clearInterval(id);
  }, [clusterName, getRepairStats]);

  // Animate through read-repair phases
  const runReadRepair = useCallback(async () => {
    if (running || !readData) return;
    setRunning(true);
    setError("");

    const aliveNodes = nodes.filter(n => n.status === "up");
    if (aliveNodes.length < 2) {
      setError("Need at least 2 UP nodes to demonstrate read repair.");
      setRunning(false);
      return;
    }

    // Pick a random node to pretend is stale
    const stale = aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
    setStaleNodeId(stale.id);

    const animatePhase = (phaseId, durationMs) =>
      new Promise(resolve => {
        setPhase(phaseId);
        setProgress(0);
        const start = performance.now();
        const tick  = (now) => {
          const t = Math.min((now - start) / durationMs, 1);
          if (mountedRef.current) setProgress(t);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });

    try {
      // Phase 1 — Digest requests sent to all replicas
      pushLog("Coordinator sends digest requests to all replicas…", BLUE);
      await animatePhase("digest", 1200);

      // Phase 2 — Compare digests
      pushLog(`Digest mismatch detected on ${stale.id}!`, RED);
      setPhase("compare");
      await new Promise(r => setTimeout(r, 900));

      // Phase 3 — Full data fetch from stale node
      pushLog(`Full data request sent to ${stale.id} for reconciliation…`, AMBER);
      await animatePhase("fetch", 1100);

      // Actually do the read in the background
      const filters = filterKey.trim() ? { [keyspaceName]: filterKey.trim() } : {};
      try {
        await readData(filters, consistencyLevel ?? "QUORUM", keyspaceName, tableName, clusterName);
      } catch { /* read errors are expected in degraded clusters */ }

      // Phase 4 — Write repair to stale node
      pushLog(`Repair write sent to ${stale.id} with latest version…`, GREEN);
      await animatePhase("repair", 1300);

      // Done
      setPhase("done");
      pushLog(`✓ Read repair complete — ${stale.id} is now consistent`, GREEN);
      setStats(prev => ({ ...prev, total: prev.total + 1, repairs: [{ key: filterKey || "(all)", stale_node: stale.id, repaired_at: new Date().toISOString() }, ...prev.repairs].slice(0, 20) }));

      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      pushLog(`✗ Error: ${e.message}`, RED);
      setError(e.message);
    } finally {
      if (mountedRef.current) {
        setPhase("idle");
        setProgress(0);
        setStaleNodeId(null);
        setRunning(false);
      }
    }
  }, [running, nodes, readData, filterKey, clusterName, keyspaceName, tableName, consistencyLevel, pushLog]);

  const aliveNodes = nodes.filter(n => n.status === "up").slice(0, 3);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={h3s}>🔍 READ REPAIR</span>
        <div style={{ fontSize: 9, color: PURPLE, background: "rgba(167,139,250,0.1)", border: `1px solid ${PURPLE}33`, borderRadius: 4, padding: "2px 7px" }}>
          {stats.total} repair{stats.total !== 1 ? "s" : ""} total
        </div>
      </div>

      {/* Educational blurb */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 10, padding: "8px 10px", background: "rgba(96,165,250,0.05)", borderLeft: `2px solid ${BLUE}44`, borderRadius: 4 }}>
        During a <span style={{ color: BLUE }}>QUORUM read</span>, the coordinator sends <em>digest requests</em> to all replicas. If digests <span style={{ color: RED }}>don't match</span>, it fetches full data and <span style={{ color: GREEN }}>writes the latest version</span> back to stale replicas — transparent to the client.
      </div>

      {/* Phase progress bar */}
      <PhaseBar phase={phase} />

      {/* SVG visualisation */}
      <ReadRepairSVG nodes={aliveNodes} phase={phase} staleNodeId={staleNodeId} progress={progress} />

      {error && (
        <div style={{ fontSize: 10, color: RED, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Controls */}
      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
        <input
          value={filterKey}
          onChange={e => setFilterKey(e.target.value)}
          placeholder="partition key to read (optional)"
          style={{
            flex: 1, padding: "6px 10px", fontSize: 10, background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.7)",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={runReadRepair}
          disabled={running || aliveNodes.length < 2}
          style={{
            padding: "6px 14px", fontSize: 10, fontWeight: 700,
            background: running ? "rgba(32,178,170,0.08)" : "rgba(32,178,170,0.15)",
            border: `1px solid ${ACCENT}44`, borderRadius: 6, color: ACCENT,
            cursor: running || aliveNodes.length < 2 ? "not-allowed" : "pointer",
            whiteSpace: "nowrap", transition: "all 0.2s",
          }}>
          {running ? "⟳ running…" : "▶ simulate read repair"}
        </button>
      </div>

      {aliveNodes.length < 2 && (
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
          Need at least 2 UP nodes to simulate read repair.
        </div>
      )}

      {/* Recent repairs list */}
      {stats.repairs.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          <div style={{ fontSize: 9, letterSpacing: 1, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>RECENT REPAIRS</div>
          {stats.repairs.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 3, ...mono }}>
              <span style={{ color: GREEN }}>✓</span>
              <span style={{ color: AMBER, minWidth: 70 }}>{r.key}</span>
              <span>→ {r.stale_node}</span>
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)" }}>
                {r.repaired_at ? new Date(r.repaired_at).toLocaleTimeString() : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Activity log */}
      {repairLog.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          {repairLog.map((entry, i) => (
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