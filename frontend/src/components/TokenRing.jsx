import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const W = 700, H = 700, CX = 350, CY = 350;
const RING_R = 220;
const NODE_R = 28;
const SNAP_THR = 60;

const PARTITIONERS = {
  murmur3: {
    name: "Murmur3",
    MIN: -9223372036854775808n,
    MAX: 9223372036854775807n,
    RANGE: 18446744073709551616n,
    ticks: [
      { val: -9223372036854775808n, label: "-9.2e18" },
      { val: -6917529027641081856n, label: "-6.9e18" },
      { val: -4611686018427387904n, label: "-4.6e18" },
      { val: -2305843009213693952n, label: "-2.3e18" },
      { val: 0n,                   label: "0"       },
      { val: 2305843009213693952n,  label: "2.3e18"  },
      { val: 4611686018427387904n,  label: "4.6e18"  },
      { val: 6917529027641081856n,  label: "6.9e18"  },
    ],
  },
  md5: {
    name: "MD5",
    MIN: 0n,
    MAX: 170141183460469231731687303715884105727n,
    RANGE: 170141183460469231731687303715884105728n,
    ticks: (() => {
      const STEP = 170141183460469231731687303715884105728n / 8n;
      return Array.from({ length: 8 }, (_, i) => {
        const val = STEP * BigInt(i);
        const exp = Number(val) / 1e38;
        return { val, label: i === 0 ? "0" : `${exp.toFixed(1)}e38` };
      });
    })(),
  },
};

function detectPartitioner(tokenVal) {
  if (tokenVal < 0n) return "murmur3";
  if (tokenVal > 9223372036854775807n) return "md5";
  return "murmur3";
}

function getPartitionerFromNodes(nodes) {
  for (const node of nodes) {
    if (!node.tokens || node.tokens.length === 0) continue;
    for (const tok of node.tokens) {
      try {
        const big = BigInt(String(tok));
        return detectPartitioner(big);
      } catch { /* skip */ }
    }
  }
  return "murmur3";
}

const PALETTE = { x: 55, y: 645 };

const NODE_COLORS = [
  "#20B2AA", "#f76a6a", "#6af7b8", "#f7c76a",
  "#6ab8f7", "#f76ac8", "#a8f76a", "#f7a86a",
];

function makeMath(p) {
  const { MIN, RANGE } = p;

  function tokToAngle(tok) {
    const t = typeof tok === "bigint" ? tok : BigInt(String(tok));
    const shifted = t - MIN;
    const normalized = Number((shifted * 1_000_000n) / RANGE) / 1_000_000;
    return normalized * 2 * Math.PI - Math.PI / 2;
  }

  function angleToTok(angle) {
    const normalized = ((angle + Math.PI / 2) / (2 * Math.PI) + 1) % 1;
    const steps = BigInt(Math.round(normalized * 1_000_000_000));
    return MIN + (RANGE * steps / 1_000_000_000n);
  }

  function ringXY(tok) {
    const angle = tokToAngle(tok);
    return {
      x: CX + RING_R * Math.cos(angle),
      y: CY + RING_R * Math.sin(angle),
    };
  }

  return { tokToAngle, angleToTok, ringXY };
}

function distCenter(x, y) {
  return Math.sqrt((x - CX) ** 2 + (y - CY) ** 2);
}

function getPrimaryToken(node) {
  if (node.tokens && node.tokens.length > 0) {
    return BigInt(String(node.tokens[0]));
  }
  if (node.token != null) {
    return typeof node.token === "bigint" ? node.token : BigInt(String(node.token));
  }
  return 0n;
}

function fmtToken(t) {
  const n = Number(t);
  if (!isFinite(n)) return String(t).slice(0, 12) + "…";
  if (Math.abs(n) > 1e15) return (n / 1e18).toFixed(1) + "e18";
  if (Math.abs(n) > 1e35) return (n / 1e38).toFixed(1) + "e38";
  return String(t);
}

// Easing function: ease-out cubic
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function TokenRing({
  nodes = [],
  leavingNodes = [],
  cluster = {},
  nodeDataMap = {},
  onAddNode,
  onRemoveNode,
  disabled = false,
  simulationResult,
  csvDistribution = [],
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);

  const [palDragging, setPalDragging] = useState(false);
  const [ghostXY, setGhostXY] = useState(PALETTE);
  const [snapToken, setSnapToken] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipPx, setTooltipPx] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);

  // ── Animation state: for each csv point, track current animated position ──
  // animPoints: Array of { id, x, y, targetX, targetY, done }
  const [animPoints, setAnimPoints] = useState([]);
  const animFrameRef = useRef(null);
  const prevDistributionLengthRef = useRef(0);

  const partitionerKey = useMemo(() => getPartitionerFromNodes(nodes), [nodes]);
  const partitioner = PARTITIONERS[partitionerKey];
  const { tokToAngle, angleToTok, ringXY } = useMemo(() => makeMath(partitioner), [partitioner]);

  const nodeColorMap = useMemo(() => {
    const map = {};
    nodes.forEach((n, i) => { map[n.id] = NODE_COLORS[i % NODE_COLORS.length]; });
    return map;
  }, [nodes]);

  // ── When csvDistribution changes, animate each newly added point ──────────
  useEffect(() => {
    const prevLen = prevDistributionLengthRef.current;
    const newLen = csvDistribution.length;

    // Reset animation when distribution is cleared
    if (newLen === 0) {
      prevDistributionLengthRef.current = 0;
      setAnimPoints([]);
      return;
    }

    // New points added since last render
    if (newLen > prevLen) {
      const ANIM_DURATION = 1200; // ms per point

      for (let i = prevLen; i < newLen; i++) {
        const row = csvDistribution[i];
        if (row.hash == null) continue;

        let targetX = CX, targetY = CY;
        try {
          const pos = ringXY(BigInt(String(row.hash)));
          targetX = pos.x;
          targetY = pos.y;
        } catch { continue; }

        const startTime = performance.now();
        const pointId = `${row.rowId}-${i}`;

        // Add point starting from center
        setAnimPoints(prev => [
          ...prev,
          { id: pointId, x: CX, y: CY, targetX, targetY, done: false }
        ]);

        // Animate it toward target
        const animate = (now) => {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / ANIM_DURATION, 1);
          const ease = easeOut(t);

          const x = CX + (targetX - CX) * ease;
          const y = CY + (targetY - CY) * ease;
          const done = t >= 1;

          setAnimPoints(prev =>
            prev.map(p =>
              p.id === pointId
                ? { ...p, x: done ? targetX : x, y: done ? targetY : y, done }
                : p
            )
          );

          if (!done) {
            requestAnimationFrame(animate);
          }
        };

        requestAnimationFrame(animate);
      }

      prevDistributionLengthRef.current = newLen;
    }
  }, [csvDistribution, ringXY]);

  const getSvgXY = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }, []);

  const onPaletteMD = useCallback((e) => {
    if (nodes.length >= 6 || disabled) return;
    e.preventDefault();
    setPalDragging(true);
    setGhostXY(getSvgXY(e));
    setSnapToken(null);

    const onMove = (ev) => {
      const { x, y } = getSvgXY(ev);
      setGhostXY({ x, y });
      if (Math.abs(distCenter(x, y) - RING_R) < SNAP_THR) {
        setSnapToken(angleToTok(Math.atan2(y - CY, x - CX)));
      } else {
        setSnapToken(null);
      }
    };

    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPalDragging(false);
      setSnapToken(null);
      const { x, y } = getSvgXY(ev);
      if (Math.abs(distCenter(x, y) - RING_R) < SNAP_THR) {
        onAddNode?.(angleToTok(Math.atan2(y - CY, x - CX)));
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [nodes, disabled, getSvgXY, onAddNode, angleToTok]);

  const onNodeEnter = useCallback((id, e) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredId(id);
    setTooltipPx(getSvgXY(e));
  }, [getSvgXY]);

  const onNodeLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => setHoveredId(null), 200);
  }, []);

  const sortedNodes = useMemo(() =>
    [...nodes].sort((a, b) => {
      const ta = getPrimaryToken(a);
      const tb = getPrimaryToken(b);
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    }), [nodes]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}
        onMouseLeave={() => { if (!palDragging) setHoveredId(null); }}
      >
        <defs>
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.1; } }
            @keyframes fadeOut { to { opacity: 0; transform: scale(1.3); } }
            .node-leaving { animation: fadeOut 0.6s ease forwards; }
          `}</style>
        </defs>

        {/* Ring */}
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2} />

        {/* Partitioner label */}
        <text x={CX + RING_R + 10} y={CY - RING_R - 10}
          fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="start">
          {partitioner.name}Partitioner
        </text>

        {/* Ticks */}
        {partitioner.ticks.map((tick, i) => {
          const { x, y } = ringXY(tick.val);
          const angle = tokToAngle(tick.val);
          const lx = CX + (RING_R + 22) * Math.cos(angle);
          const ly = CY + (RING_R + 22) * Math.sin(angle);
          return (
            <g key={i}>
              <line x1={x} y1={y}
                x2={CX + (RING_R - 8) * Math.cos(angle)}
                y2={CY + (RING_R - 8) * Math.sin(angle)}
                stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fill="rgba(255,255,255,0.15)">{tick.label}</text>
            </g>
          );
        })}

        {/* Vnode arcs */}
        {(() => {
          const allTokens = [];
          nodes.forEach(node => {
            if (node.status === "joining" || !node.tokens?.length) return;
            node.tokens.forEach(tok => {
              try { allTokens.push({ tok: BigInt(String(tok)), nodeId: node.id }); }
              catch { /* skip */ }
            });
          });
          if (allTokens.length < 2) return null;
          allTokens.sort((a, b) => a.tok < b.tok ? -1 : a.tok > b.tok ? 1 : 0);
          return allTokens.map((entry, i) => {
            const prev = allTokens[(i - 1 + allTokens.length) % allTokens.length];
            const color = nodeColorMap[entry.nodeId] ?? "#20B2AA";
            const startAngle = tokToAngle(prev.tok);
            const endAngle = tokToAngle(entry.tok);
            let delta = endAngle - startAngle;
            if (delta < 0) delta += 2 * Math.PI;
            if (delta > Math.PI * 1.99) return null;
            const start = { x: CX + RING_R * Math.cos(startAngle), y: CY + RING_R * Math.sin(startAngle) };
            const end = { x: CX + RING_R * Math.cos(endAngle), y: CY + RING_R * Math.sin(endAngle) };
            const large = delta > Math.PI ? 1 : 0;
            const d = `M ${start.x} ${start.y} A ${RING_R} ${RING_R} 0 ${large} 1 ${end.x} ${end.y}`;
            return (
              <path key={`vnode-arc-${entry.nodeId}-${String(entry.tok)}`}
                d={d} fill="none" stroke={color} strokeWidth={8} opacity={0.22} />
            );
          });
        })()}

        {/* Token dots */}
        {nodes.map((node) => {
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          if (!node.tokens?.length || node.status === "joining") return null;
          return node.tokens.map((tok, i) => {
            try {
              const pos = ringXY(BigInt(String(tok)));
              return (
                <circle key={`tok-${node.id}-${i}`}
                  cx={pos.x} cy={pos.y} r={i === 0 ? 5 : 3.5}
                  fill={color} opacity={i === 0 ? 0.9 : 0.5} />
              );
            } catch { return null; }
          });
        })}

        {/* ── CSV animated points ── */}
        {animPoints.map((p) => (
          <g key={p.id}>
            {/* Trail line from center while animating */}
            {!p.done && (
              <line
                x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="#facc15" strokeWidth={1} opacity={0.2}
                strokeDasharray="3 3"
              />
            )}
            {/* The point itself */}
            <circle
              cx={p.x} cy={p.y}
              r={p.done ? 3 : 4}
              fill="#facc15"
              stroke="#ca8a04"
              strokeWidth={p.done ? 1 : 1.5}
              opacity={p.done ? 0.75 : 1}
            />
          </g>
        ))}

        {/* Simulation hash point */}
        {simulationResult?.hash != null && (() => {
          try {
            const pos = ringXY(BigInt(String(simulationResult.hash)));
            return (
              <g>
                <circle cx={pos.x} cy={pos.y} r={6} fill="#facc15" stroke="#ca8a04" strokeWidth={2} />
                <text x={pos.x} y={pos.y - 14} textAnchor="middle" fontSize={9} fill="#facc15" fontWeight="700">
                  hash:{String(simulationResult.hash).slice(0, 10)}…
                </text>
              </g>
            );
          } catch { return null; }
        })()}

        {/* Simulation replica lines */}
        {simulationResult?.replicas?.length > 0 && simulationResult.primaryNode && (() => {
          const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
          return simulationResult.replicas.map((replica, i) => {
            try {
              const hashPos = ringXY(BigInt(String(simulationResult.hash)));
              const nodePos = ringXY(getPrimaryToken(replica));
              return (
                <line key={`sim-line-${i}`}
                  x1={hashPos.x} y1={hashPos.y} x2={nodePos.x} y2={nodePos.y}
                  stroke={colors[i % colors.length]} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
              );
            } catch { return null; }
          });
        })()}

        {/* Nodes */}
        {nodes.map((node) => {
          const primaryTok = getPrimaryToken(node);
          const pos = ringXY(primaryTok);
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          const isHovered = hoveredId === node.id;
          const isDown = node.status === "down";
          const isJoining = node.status === "joining";
          const isPrimary = simulationResult?.primaryNode?.id === node.id;
          const displayColor = isDown ? "#555" : color;
          const csvBadge = nodeDataMap[node.id]?.length ?? 0;

          const tokenRange = (() => {
            if (sortedNodes.length <= 1 || isJoining) return "";
            const idx = sortedNodes.findIndex(n => n.id === node.id);
            const prev = sortedNodes[(idx - 1 + sortedNodes.length) % sortedNodes.length];
            return `${fmtToken(getPrimaryToken(prev))} → ${fmtToken(primaryTok)}`;
          })();

          return (
            <g key={node.id}
              onMouseEnter={e => onNodeEnter(node.id, e)}
              onMouseLeave={onNodeLeave}
              style={{ cursor: isDown ? "not-allowed" : "pointer" }}
            >
              {isPrimary && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 8}
                  fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" opacity={0.7} />
              )}
              {isJoining && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 10}
                  fill="none" stroke="#f7c76a" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
                  style={{ animation: "spin 3s linear infinite", transformOrigin: `${pos.x}px ${pos.y}px` }} />
              )}
              <circle cx={pos.x} cy={pos.y} r={NODE_R}
                fill={isDown ? "#13132a" : `${displayColor}22`}
                stroke={displayColor} strokeWidth={isPrimary ? 2.5 : 1.5} />
              {isJoining && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R}
                  fill="transparent" stroke={color} strokeWidth={1.5}
                  strokeDasharray="5 5" opacity={0.4}
                  style={{ animation: "pulse 2s ease-in-out infinite" }} />
              )}
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fontWeight="800" fill={isDown ? "#666" : displayColor}
                style={{ pointerEvents: "none" }}>
                {isJoining ? "⟳" : node.id.replace("Node", "")}
              </text>
              <text x={pos.x} y={pos.y + 14} textAnchor="middle" dominantBaseline="middle"
                fontSize={7} fill={`${displayColor}88`} style={{ pointerEvents: "none" }}>
                {isJoining ? "" : node.id}
              </text>
              <text x={pos.x} y={pos.y + NODE_R + 13} textAnchor="middle"
                fontSize={7} fill={isJoining ? "#f7c76a99" : "rgba(255,255,255,0.25)"}
                style={{ pointerEvents: "none" }}>
                {isJoining ? "polling tokens..." : tokenRange}
              </text>
              {node.tokens?.length > 0 && !isJoining && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={pos.x - 17} cy={pos.y - 17} r={9} fill={`${color}88`} />
                  <text x={pos.x - 17} y={pos.y - 17} textAnchor="middle"
                    dominantBaseline="middle" fontSize={7} fontWeight="bold" fill="white">
                    {node.tokens.length}t
                  </text>
                </g>
              )}
              {csvBadge > 0 && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={pos.x + 17} cy={pos.y - 17} r={9} fill={color} />
                  <text x={pos.x + 17} y={pos.y - 17} textAnchor="middle"
                    dominantBaseline="middle" fontSize={7.5} fontWeight="bold" fill="white">
                    {csvBadge}
                  </text>
                </g>
              )}
              {isHovered && !isJoining && (
                <g onClick={e => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ cursor: "pointer" }}>
                  <circle cx={pos.x + 17} cy={pos.y + 17} r={9} fill="#f76a6a" opacity={0.9} />
                  <text x={pos.x + 17} y={pos.y + 17} textAnchor="middle"
                    dominantBaseline="middle" fontSize={13} fill="white" style={{ pointerEvents: "none" }}>×</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Leaving nodes */}
        {leavingNodes.map((node) => {
          const pos = ringXY(getPrimaryToken(node));
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          return (
            <g key={`leaving-${node.id}`} style={{ pointerEvents: "none" }}>
              <circle cx={pos.x} cy={pos.y} r={NODE_R}
                fill={`${color}22`} stroke={color} strokeWidth={1.5} className="node-leaving" />
              <circle cx={pos.x} cy={pos.y} r={NODE_R + 12}
                fill="none" stroke="#f76a6a" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} className="node-leaving" />
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fontWeight="800" fill={color} className="node-leaving">
                {node.id.replace("Node", "")}
              </text>
              <text x={pos.x} y={pos.y + NODE_R + 13} textAnchor="middle"
                fontSize={7.5} fill="#f76a6a99" className="node-leaving">leaving...</text>
            </g>
          );
        })}

        {/* Snap preview */}
        {snapToken !== null && (() => {
          const pos = ringXY(snapToken);
          return (
            <circle cx={pos.x} cy={pos.y} r={NODE_R}
              fill="rgba(32,178,170,0.2)" stroke="#20B2AA" strokeWidth={1.5} strokeDasharray="5 3"
              style={{ pointerEvents: "none" }} />
          );
        })()}

        {/* Palette ghost */}
        {palDragging && (
          <circle cx={ghostXY.x} cy={ghostXY.y} r={NODE_R}
            fill="rgba(32,178,170,0.5)" stroke="#20B2AA" strokeWidth={1.5}
            style={{ pointerEvents: "none" }} />
        )}

        {/* Palette */}
        {!palDragging && (
          <g onMouseDown={onPaletteMD} style={{
            cursor: (nodes.length >= 6 || disabled) ? "not-allowed" : "grab",
            opacity: (nodes.length >= 6 || disabled) ? 0.3 : 1
          }}>
            <circle cx={PALETTE.x} cy={PALETTE.y} r={NODE_R}
              fill="rgba(32,178,170,0.15)" stroke="#20B2AA" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={PALETTE.x} y={PALETTE.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={22} fill="#20B2AA" fontWeight="300">+</text>
            <text x={PALETTE.x} y={PALETTE.y + NODE_R + 14} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
              {nodes.length >= 6 ? "max 6 nodes" : disabled ? "wait..." : "drag to ring"}
            </text>
          </g>
        )}

        {/* Center label */}
        <text x={CX} y={CY - 10} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.2)" letterSpacing={2}>TOKEN RING</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.15)">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}
        </text>
        {nodes.length === 0 && (
          <text x={CX} y={CY + 26} textAnchor="middle" fontSize={8} fill="rgba(32,178,170,0.5)">drag + to start</text>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredId && (() => {
        const node = nodes.find(n => n.id === hoveredId);
        if (!node) return null;
        const data = nodeDataMap[hoveredId] ?? [];
        const color = nodeColorMap[hoveredId] ?? "#20B2AA";
        const ww = wrapRef.current?.clientWidth ?? 400;
        const wh = wrapRef.current?.clientHeight ?? 400;
        const flipX = tooltipPx.x > ww * 0.65;
        const flipY = tooltipPx.y > wh * 0.70;
        const backendInfo = cluster[hoveredId];

        return (
          <div
            onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
            onMouseLeave={onNodeLeave}
            style={{
              position: "absolute",
              left: tooltipPx.x + (flipX ? -240 : 20),
              top: tooltipPx.y + (flipY ? -280 : 10),
              width: 230, maxHeight: 320, overflowY: "auto",
              background: "#0d0d1a",
              border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`,
              borderRadius: 8, padding: "12px 14px", zIndex: 30,
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              fontSize: 11, fontFamily: "'JetBrains Mono','Fira Code',monospace",
            }}>
            <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{node.id}</div>
            <div style={{ color: `${color}99`, fontSize: 10, marginBottom: 4 }}>
              {node.status ?? "up"} · {node.tokens?.length ?? 0} tokens · {partitioner.name}
            </div>
            {backendInfo && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 8, borderBottom: `1px solid ${color}22`, paddingBottom: 6 }}>
                <div>IP: {backendInfo.ip || "—"}</div>
                <div>Status: {backendInfo.status || "—"}</div>
                <div>DC: {backendInfo.datacenter || "—"} / {backendInfo.rack || "—"}</div>
                {node.tokens?.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: `${color}88`, marginBottom: 2 }}>Tokens ({node.tokens.length}):</div>
                    {node.tokens.slice(0, 4).map((t, i) => (
                      <div key={i} style={{ fontSize: 8, opacity: 0.7 }}>{String(t)}</div>
                    ))}
                    {node.tokens.length > 4 && (
                      <div style={{ fontSize: 8, opacity: 0.5 }}>+{node.tokens.length - 4} more…</div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
              DATA ({data.length} {data.length === 1 ? "entry" : "entries"})
            </div>
            {data.length === 0
              ? <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>no data stored</div>
              : data.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 3 }}>
                  <span style={{ color, minWidth: 0, flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.key}</span>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>→</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(item.value).slice(0, 30)}{String(item.value).length > 30 ? "…" : ""}
                  </span>
                </div>
              ))
            }
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.15)", fontSize: 9, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
              hover × to remove
            </div>
          </div>
        );
      })()}
    </div>
  );
}