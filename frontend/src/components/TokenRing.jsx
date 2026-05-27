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
      { val: 0n, label: "0" },
      { val: 2305843009213693952n, label: "2.3e18" },
      { val: 4611686018427387904n, label: "4.6e18" },
      { val: 6917529027641081856n, label: "6.9e18" },
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
      try { return detectPartitioner(BigInt(String(tok))); } catch { /* skip */ }
    }
  }
  return "murmur3";
}

function darkenColor(hex, percent = 20) {
  if (!hex || !hex.startsWith('#')) return hex;
  let num = parseInt(hex.replace("#", ""), 16),
    amt = Math.round(2.55 * percent),
    R = Math.max(0, Math.min(255, (num >> 16) - amt)),
    G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) - amt)),
    B = Math.max(0, Math.min(255, (num & 0x0000FF) - amt));
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

const PALETTE = { x: 55, y: 645 };
const NODE_COLORS = ["#20B2AA", "#f76a6a", "#6af7b8", "#f7c76a", "#6ab8f7", "#f76ac8", "#a8f76a", "#f7a86a"];

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
    return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) };
  }
  return { tokToAngle, angleToTok, ringXY };
}

function distCenter(x, y) { return Math.sqrt((x - CX) ** 2 + (y - CY) ** 2); }

function getPrimaryToken(node) {
  if (node.tokens && node.tokens.length > 0) return BigInt(String(node.tokens[0]));
  if (node.token != null) return typeof node.token === "bigint" ? node.token : BigInt(String(node.token));
  return 0n;
}

function fmtToken(t) {
  const n = Number(t);
  if (!isFinite(n)) return String(t).slice(0, 12) + "…";
  if (Math.abs(n) > 1e15) return (n / 1e18).toFixed(1) + "e18";
  return String(t);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

export default function TokenRing({
  nodes = [], leavingNodes = [], cluster = {}, nodeDataMap = {},
  onAddNode, onRemoveNode, disabled = false,
  csvDistribution = [], writeFlowAnim = null, gossipAnim = null,
  hashingType = null,  
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [palDragging, setPalDragging] = useState(false);
  const [ghostXY, setGhostXY] = useState(PALETTE);
  const [snapToken, setSnapToken] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPx, setTooltipPx] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);
  const hoverDelayRef = useRef(null);
  const isHoveringMenuRef = useRef(false);
  const [animPoints, setAnimPoints] = useState([]);
  const prevDistributionLengthRef = useRef(0);

  const partitionerKey = useMemo(() => {
  if (hashingType && PARTITIONERS[hashingType]) return hashingType;  // prop en priorité
  return getPartitionerFromNodes(nodes);                              // fallback auto-detect
}, [nodes, hashingType]);
  const partitioner = PARTITIONERS[partitionerKey];
  const { tokToAngle, angleToTok, ringXY } = useMemo(() => makeMath(partitioner), [partitioner]);
  const nodeColorMap = useMemo(() => {
    const map = {};
    nodes.forEach((n, i) => { map[n.id] = NODE_COLORS[i % NODE_COLORS.length]; });
    return map;
  }, [nodes]);

  useEffect(() => {
    const prevLen = prevDistributionLengthRef.current;
    const newLen = csvDistribution.length;
    if (newLen === 0) { prevDistributionLengthRef.current = 0; setAnimPoints([]); return; }
    if (newLen > prevLen) {
      for (let i = prevLen; i < newLen; i++) {
        const row = csvDistribution[i];
        if (row.hash == null) continue;
        let targetX = CX, targetY = CY;
        try { const pos = ringXY(BigInt(String(row.hash))); targetX = pos.x; targetY = pos.y; } catch { continue; }
        const startTime = performance.now();
        const pointId = `${row.rowId}-${i}`;
        setAnimPoints(prev => [...prev, { id: pointId, x: CX, y: CY, targetX, targetY, done: false }]);
        const ANIM_DURATION = 1200;
        const animate = (now) => {
          const t = Math.min((now - startTime) / ANIM_DURATION, 1);
          const ease = easeOut(t);
          const x = CX + (targetX - CX) * ease;
          const y = CY + (targetY - CY) * ease;
          const done = t >= 1;
          setAnimPoints(prev => prev.map(p => p.id === pointId ? { ...p, x: done ? targetX : x, y: done ? targetY : y, done } : p));
          if (!done) requestAnimationFrame(animate);
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
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
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
      if (Math.abs(distCenter(x, y) - RING_R) < SNAP_THR) setSnapToken(angleToTok(Math.atan2(y - CY, x - CX)));
      else setSnapToken(null);
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPalDragging(false); setSnapToken(null);
      const { x, y } = getSvgXY(ev);
      if (Math.abs(distCenter(x, y) - RING_R) < SNAP_THR) onAddNode?.(angleToTok(Math.atan2(y - CY, x - CX)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [nodes, disabled, getSvgXY, onAddNode, angleToTok]);

  const onNodeEnter = useCallback((id, e) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current);
    setHoveredId(id); setTooltipPx(getSvgXY(e)); setTooltipVisible(false);
    hoverDelayRef.current = setTimeout(() => setTooltipVisible(true), 700);
  }, [getSvgXY]);

  const onNodeLeave = useCallback(() => {
    if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (isHoveringMenuRef.current) return;
      setHoveredId(null); setTooltipVisible(false);
    }, 1200);
  }, []);

  const onMenuLeave = useCallback(() => {
    isHoveringMenuRef.current = false;
    if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current);
    hoverTimeoutRef.current = setTimeout(() => { setHoveredId(null); setTooltipVisible(false); }, 200);
  }, []);

  const sortedNodes = useMemo(() =>
    [...nodes].sort((a, b) => { const ta = getPrimaryToken(a), tb = getPrimaryToken(b); return ta < tb ? -1 : ta > tb ? 1 : 0; }), [nodes]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", userSelect: "none" }}
        onMouseLeave={() => { if (!palDragging) onNodeLeave(); }}>
        <defs>
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.1; } }
            @keyframes fadeOut { to { opacity: 0; transform: scale(1.3); } }
            .node-leaving { animation: fadeOut 0.6s ease forwards; }
            @keyframes gossipRipple { 0% { r: 28; opacity: 0.7; } 100% { r: 52; opacity: 0; } }
          `}</style>
        </defs>

        {/* Ring */}
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(200,210,220,0.18)" strokeWidth={2.5} />
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />

        <text x={CX + RING_R + 10} y={CY - RING_R - 10} fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="start">
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
              <line x1={x} y1={y} x2={CX + (RING_R - 8) * Math.cos(angle)} y2={CY + (RING_R - 8) * Math.sin(angle)} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="rgba(255,255,255,0.15)">{tick.label}</text>
            </g>
          );
        })}

        {/* Vnode arcs */}
        {(() => {
          const allTokens = [];
          nodes.forEach(node => {
            if (node.status === "joining" || !node.tokens?.length) return;
            node.tokens.forEach(tok => {
              try { allTokens.push({ tok: BigInt(String(tok)), nodeId: node.id }); } catch { /* skip */ }
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
            return <path key={`arc-${entry.nodeId}-${String(entry.tok)}`} d={`M ${start.x} ${start.y} A ${RING_R} ${RING_R} 0 ${large} 1 ${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth={8} opacity={0.22} style={{ pointerEvents: "none" }} />;
          });
        })()}

        {/* Token dots */}
        {nodes.map(node => {
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          if (!node.tokens?.length || node.status === "joining") return null;
          return node.tokens.map((tok, i) => {
            try {
              const pos = ringXY(BigInt(String(tok)));
              return <circle key={`tok-${node.id}-${i}`} cx={pos.x} cy={pos.y} r={i === 0 ? 5 : 3.5} fill={color} opacity={i === 0 ? 0.9 : 0.5} style={{ pointerEvents: "none" }} />;
            } catch { return null; }
          });
        })}

        {/* CSV anim points */}
        {animPoints.map(p => (
          <g key={p.id} style={{ pointerEvents: "none" }}>
            {!p.done && <line x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="#facc15" strokeWidth={1} opacity={0.2} strokeDasharray="3 3" />}
            <circle cx={p.x} cy={p.y} r={p.done ? 3 : 4} fill="#facc15" stroke="#ca8a04" strokeWidth={p.done ? 1 : 1.5} opacity={p.done ? 0.75 : 1} />
          </g>
        ))}

        {/* Write flow animation */}
        {writeFlowAnim && (() => {
          try {
            const { key: rawKey, hash, replicas, progress: p } = writeFlowAnim;
            const hashBig = BigInt(String(hash));
            const hashPos = ringXY(hashBig);
            const hashLabel = String(hash).slice(0, 12) + (String(hash).length > 12 ? "…" : "");
            const replicaColors = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
            const P1 = 0.2, P2 = 0.45, P3 = 0.65, P4 = 1.0;
            const rawOpacity = p < P1 ? easeOut(p / P1) : p < P2 ? 1 - easeOut((p - P1) / (P2 - P1)) : 0;
            const hashLabelOpacity = p < P1 ? 0 : p < P2 ? easeOut((p - P1) / (P2 - P1)) : p < P3 ? 1 : 0;
            const dotPhase = p < P2 ? 0 : p < P3 ? easeOut((p - P2) / (P3 - P2)) : 1;
            const dotX = CX + (hashPos.x - CX) * dotPhase;
            const dotY = CY + (hashPos.y - CY) * dotPhase;
            const showDot = p >= P2 && p < P3;
            const ringMarkerOpacity = p >= P3 ? Math.min((p - P3) / 0.05, 1) : 0;
            const replicaPhase = p < P3 ? 0 : easeOut((p - P3) / (P4 - P3));
            return (
              <g style={{ pointerEvents: "none" }}>
                {rawOpacity > 0 && (
                  <g opacity={rawOpacity}>
                    <rect x={CX - 55} y={CY - 18} width={110} height={26} rx={5} fill="#0a0a14" stroke="rgba(250,204,21,0.4)" strokeWidth={1} />
                    <text x={CX} y={CY - 4} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="rgba(255,255,255,0.5)" letterSpacing={1}>RAW KEY</text>
                    <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="700" fill="#facc15">"{rawKey}"</text>
                  </g>
                )}
                {hashLabelOpacity > 0 && (
                  <g opacity={hashLabelOpacity}>
                    <rect x={CX - 65} y={CY - 22} width={130} height={34} rx={5} fill="#0a0a14" stroke="rgba(56,189,248,0.5)" strokeWidth={1} />
                    <text x={CX} y={CY - 7} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="rgba(255,255,255,0.4)" letterSpacing={2}>HASH(key)</text>
                    <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="700" fill="#38bdf8">{hashLabel}</text>
                  </g>
                )}
                {showDot && <line x1={CX} y1={CY} x2={dotX} y2={dotY} stroke="#38bdf8" strokeWidth={1.5} opacity={0.3} strokeDasharray="4 3" />}
                {showDot && (
                  <circle cx={dotX} cy={dotY} r={5} fill="#38bdf8" stroke="#0ea5e9" strokeWidth={1.5}>
                    <animate attributeName="r" values="4;7;4" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                )}
                {ringMarkerOpacity > 0 && (
                  <g opacity={ringMarkerOpacity}>
                    <circle cx={hashPos.x} cy={hashPos.y} r={7} fill="#facc15" stroke="#ca8a04" strokeWidth={2} />
                    <text x={hashPos.x} y={hashPos.y - 16} textAnchor="middle" fontSize={8} fill="#facc15" fontWeight="700">H({hashLabel.slice(0, 8)})</text>
                  </g>
                )}
                {p >= P3 && replicas.map((replica, i) => {
                  const nodePos = ringXY(getPrimaryToken(replica));
                  const color = replicaColors[i % replicaColors.length];
                  const rx = hashPos.x + (nodePos.x - hashPos.x) * replicaPhase;
                  const ry = hashPos.y + (nodePos.y - hashPos.y) * replicaPhase;
                  const done = replicaPhase >= 0.98;
                  return (
                    <g key={`flow-${i}`}>
                      <line x1={hashPos.x} y1={hashPos.y} x2={rx} y2={ry} stroke={color} strokeWidth={1.5} opacity={0.4} strokeDasharray="3 2" />
                      <circle cx={rx} cy={ry} r={done ? 5 : 6} fill={color} opacity={done ? 0.85 : 1}>
                        {!done && <animate attributeName="r" values="4;7;4" dur="0.5s" repeatCount="indefinite" />}
                      </circle>
                      {done && <circle cx={nodePos.x} cy={nodePos.y} r={NODE_R + 4} fill="none" stroke={color} strokeWidth={2} opacity={0.6}><animate attributeName="opacity" values="0.6;0" dur="0.8s" fill="freeze" /><animate attributeName="r" from={NODE_R + 4} to={NODE_R + 18} dur="0.8s" fill="freeze" /></circle>}
                      {i === 0 && done && <text x={nodePos.x} y={nodePos.y - NODE_R - 18} textAnchor="middle" fontSize={8} fill={color} fontWeight="700" opacity={0.9}>★ PRIMARY</text>}
                    </g>
                  );
                })}
              </g>
            );
          } catch { return null; }
        })()}

        {/* ── Gossip animation en phases: SOURCE → INFO → PROPAGATION ── */}
        {gossipAnim && (() => {
          try {
            const { from, to, fromData, toData, progress: p } = gossipAnim;
            const fromPos = ringXY(getPrimaryToken(from));
            const toPos = ringXY(getPrimaryToken(to));

            // Phases
            const P1 = 0.25;  // Affiche le nœud source + ses infos gossip
            const P2 = 0.55;  // Paquet voyage de from → to
            const P3 = 1.0;   // Réception + ripple sur le nœud destinataire

            // Phase 0→P1: label source apparait
            const srcOpacity = p < P1 ? easeOut(p / P1) : p < P2 ? 1 - easeOut((p - P1) / (P2 - P1)) : 0;

            // Phase P1→P2: paquet voyage
            const travelPhase = p < P1 ? 0 : p < P2 ? easeOut((p - P1) / (P2 - P1)) : 1;
            const px2 = fromPos.x + (toPos.x - fromPos.x) * travelPhase;
            const py2 = fromPos.y + (toPos.y - fromPos.y) * travelPhase;
            const showPacket = p >= P1 && p < P2;

            // Phase P2→P3: réception
            const recvOpacity = p >= P2 ? easeOut((p - P2) / (P3 - P2)) : 0;
            const showRipple = p >= P2;

            const GOSSIP_COLOR = "#a78bfa";

            return (
              <g style={{ pointerEvents: "none" }}>
                {/* Phase 1 : label SOURCE avec heartbeat */}
                {srcOpacity > 0 && (
                  <g opacity={srcOpacity}>
                    <rect
                      x={fromPos.x - 60} y={fromPos.y - NODE_R - 48}
                      width={120} height={40} rx={5}
                      fill="#0a0a14" stroke={`${GOSSIP_COLOR}66`} strokeWidth={1}
                    />
                    <text x={fromPos.x} y={fromPos.y - NODE_R - 38} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)" letterSpacing={1}>GOSSIP FROM</text>
                    <text x={fromPos.x} y={fromPos.y - NODE_R - 24} textAnchor="middle" fontSize={10} fontWeight="700" fill={GOSSIP_COLOR}>{from.id}</text>
                    <text x={fromPos.x} y={fromPos.y - NODE_R - 12} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.35)">
                      gen:{fromData?.generation ?? "?"} · hb:{fromData?.heartbeat ?? "?"}
                    </text>
                  </g>
                )}

                {/* Ligne de trajet */}
                {showPacket && (
                  <line x1={fromPos.x} y1={fromPos.y} x2={px2} y2={py2}
                    stroke={GOSSIP_COLOR} strokeWidth={1} opacity={0.25} strokeDasharray="3 3" />
                )}

                {/* Paquet gossip en voyage */}
                {showPacket && (
                  <g>
                    <circle cx={px2} cy={py2} r={5} fill={GOSSIP_COLOR} opacity={0.9}>
                      <animate attributeName="r" values="4;6;4" dur="0.4s" repeatCount="indefinite" />
                    </circle>
                    {/* Label flottant sur le paquet */}
                    <rect x={px2 - 28} y={py2 - 22} width={56} height={16} rx={3} fill="#0a0a14" opacity={0.85} />
                    <text x={px2} y={py2 - 13} textAnchor="middle" fontSize={7} fill={GOSSIP_COLOR}>
                      hb:{fromData?.heartbeat ?? "?"}
                    </text>
                  </g>
                )}

                {/* Phase 3 : réception sur le nœud destinataire */}
                {showRipple && (
                  <g opacity={recvOpacity}>
                    {/* Ripple d'arrivée */}
                    <circle cx={toPos.x} cy={toPos.y} r={NODE_R + 6}
                      fill="none" stroke={GOSSIP_COLOR} strokeWidth={2}>
                      <animate attributeName="r" from={NODE_R + 4} to={NODE_R + 22} dur="0.7s" fill="freeze" />
                      <animate attributeName="opacity" values="0.8;0" dur="0.7s" fill="freeze" />
                    </circle>
                    {/* Label destinataire avec info reçue */}
                    <rect
                      x={toPos.x - 65} y={toPos.y - NODE_R - 52}
                      width={130} height={44} rx={5}
                      fill="#0a0a14" stroke={`${GOSSIP_COLOR}88`} strokeWidth={1.5}
                    />
                    <text x={toPos.x} y={toPos.y - NODE_R - 43} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)" letterSpacing={1}>RECEIVED BY</text>
                    <text x={toPos.x} y={toPos.y - NODE_R - 29} textAnchor="middle" fontSize={10} fontWeight="700" fill={GOSSIP_COLOR}>{to.id}</text>
                    <text x={toPos.x} y={toPos.y - NODE_R - 16} textAnchor="middle" fontSize={7.5} fill="#6af7b8">
                      ✓ gen:{toData?.generation ?? "?"} · hb:{toData?.heartbeat ?? "?"}
                    </text>
                    <text x={toPos.x} y={toPos.y - NODE_R - 5} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.3)">
                      {toData?.status ?? ""} · {toData?.dc ?? ""}
                    </text>
                  </g>
                )}

                {/* Point d'arrivée fixe */}
                {p >= P2 && (
                  <circle cx={toPos.x} cy={toPos.y} r={5} fill={GOSSIP_COLOR} opacity={Math.min(recvOpacity, 0.8)} />
                )}
              </g>
            );
          } catch { return null; }
        })()}

        {/* Nodes */}
        {nodes.map(node => {
          const primaryTok = getPrimaryToken(node);
          const pos = ringXY(primaryTok);
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          const isHovered = hoveredId === node.id;
          const isDown = node.status === "down";
          const isJoining = node.status === "joining";
          const displayColor = isDown ? "#555" : color;
          const csvBadge = nodeDataMap[node.id]?.length ?? 0;
          const tokenRange = (() => {
            if (sortedNodes.length <= 1 || isJoining) return "";
            const idx = sortedNodes.findIndex(n => n.id === node.id);
            const prev = sortedNodes[(idx - 1 + sortedNodes.length) % sortedNodes.length];
            return `${fmtToken(getPrimaryToken(prev))} → ${fmtToken(primaryTok)}`;
          })();
          // Highlight si ce nœud est actif dans le gossip
          const isGossipActive = gossipAnim && (gossipAnim.from?.id === node.id || gossipAnim.to?.id === node.id);

          return (
            <g key={node.id} onMouseEnter={e => onNodeEnter(node.id, e)} onMouseLeave={onNodeLeave} style={{ cursor: isDown ? "not-allowed" : "pointer" }}>
              {isGossipActive && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 6}
                  fill="none" stroke="#a78bfa" strokeWidth={1.5} opacity={0.4} strokeDasharray="4 3" />
              )}
              {isJoining && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 10}
                  fill="none" stroke="#f7c76a" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}
                  style={{ animation: "spin 3s linear infinite", transformOrigin: `${pos.x}px ${pos.y}px` }} />
              )}
              <circle cx={pos.x} cy={pos.y} r={NODE_R} fill={isDown ? "#13132a" : `${displayColor}22`} stroke={displayColor} strokeWidth={1.5} />
              {isJoining && <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="transparent" stroke={color} strokeWidth={1.5} strokeDasharray="5 5" opacity={0.4} style={{ animation: "pulse 2s ease-in-out infinite" }} />}
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight="800"
                fill={isDown ? "#555" : darkenColor(displayColor, 20)}
                stroke="#000" strokeWidth="2.5" paintOrder="stroke" strokeLinejoin="round"
                style={{ pointerEvents: "none" }}>
                {isJoining ? "⟳" : node.id.replace("Node", "")}
              </text>
              <text x={pos.x} y={pos.y + 14} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight="700"
                fill={isDown ? "#444" : darkenColor(displayColor, 25)}
                stroke="#000" strokeWidth="1.5" paintOrder="stroke" strokeLinejoin="round"
                style={{ pointerEvents: "none" }}>
                {isJoining ? "" : node.id}
              </text>
              <text x={pos.x} y={pos.y + NODE_R + 13} textAnchor="middle" fontSize={7}
                fill={isJoining ? "#f7c76a99" : "rgba(255,255,255,0.25)"} style={{ pointerEvents: "none" }}>
                {isJoining ? "polling tokens..." : tokenRange}
              </text>
              {node.tokens?.length > 0 && !isJoining && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={pos.x - 17} cy={pos.y - 17} r={9} fill={`${color}88`} />
                  <text x={pos.x - 17} y={pos.y - 17} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight="bold" fill="white">{node.tokens.length}t</text>
                </g>
              )}
              {csvBadge > 0 && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={pos.x + 17} cy={pos.y - 17} r={9} fill={color} />
                  <text x={pos.x + 17} y={pos.y - 17} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fontWeight="bold" fill="white">{csvBadge}</text>
                </g>
              )}
              {isHovered && tooltipVisible && !isJoining && (
                <g onClick={e => { e.stopPropagation(); onRemoveNode?.(node.id); }} onMouseDown={e => e.stopPropagation()} style={{ cursor: "pointer" }}>
                  <circle cx={pos.x + 17} cy={pos.y + 17} r={9} fill="#f76a6a" opacity={0.9} />
                  <text x={pos.x + 17} y={pos.y + 17} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="white" style={{ pointerEvents: "none" }}>×</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Leaving nodes */}
        {leavingNodes.map(node => {
          const pos = ringXY(getPrimaryToken(node));
          const color = nodeColorMap[node.id] ?? "#20B2AA";
          return (
            <g key={`leaving-${node.id}`} style={{ pointerEvents: "none" }}>
              <circle cx={pos.x} cy={pos.y} r={NODE_R} fill={`${color}22`} stroke={color} strokeWidth={1.5} className="node-leaving" />
              <circle cx={pos.x} cy={pos.y} r={NODE_R + 12} fill="none" stroke="#f76a6a" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} className="node-leaving" />
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight="800" fill={color} className="node-leaving">{node.id.replace("Node", "")}</text>
              <text x={pos.x} y={pos.y + NODE_R + 13} textAnchor="middle" fontSize={7.5} fill="#f76a6a99" className="node-leaving">leaving...</text>
            </g>
          );
        })}

        {snapToken !== null && (() => {
          const pos = ringXY(snapToken);
          return <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="rgba(32,178,170,0.2)" stroke="#20B2AA" strokeWidth={1.5} strokeDasharray="5 3" style={{ pointerEvents: "none" }} />;
        })()}

        {palDragging && <circle cx={ghostXY.x} cy={ghostXY.y} r={NODE_R} fill="rgba(32,178,170,0.5)" stroke="#20B2AA" strokeWidth={1.5} style={{ pointerEvents: "none" }} />}

        {!palDragging && (
          <g onMouseDown={onPaletteMD} style={{ cursor: (nodes.length >= 6 || disabled) ? "not-allowed" : "grab", opacity: (nodes.length >= 6 || disabled) ? 0.3 : 1 }}>
            <circle cx={PALETTE.x} cy={PALETTE.y} r={NODE_R} fill="rgba(32,178,170,0.15)" stroke="#20B2AA" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={PALETTE.x} y={PALETTE.y} textAnchor="middle" dominantBaseline="middle" fontSize={22} fill="#20B2AA" fontWeight="300">+</text>
            <text x={PALETTE.x} y={PALETTE.y + NODE_R + 14} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">{nodes.length >= 6 ? "max 6 nodes" : disabled ? "wait..." : "drag to ring"}</text>
          </g>
        )}

        <text x={CX} y={CY - 10} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.2)" letterSpacing={2}>TOKEN RING</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.15)">{nodes.length} node{nodes.length !== 1 ? "s" : ""}</text>
        {nodes.length === 0 && <text x={CX} y={CY + 26} textAnchor="middle" fontSize={8} fill="rgba(32,178,170,0.5)">drag + to start</text>}
      </svg>

      {/* Tooltip */}
      {hoveredId && tooltipVisible && (() => {
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
            onMouseEnter={() => { isHoveringMenuRef.current = true; if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
            onMouseLeave={onMenuLeave}
            style={{ position: "absolute", left: tooltipPx.x + (flipX ? -240 : 20), top: tooltipPx.y + (flipY ? -280 : 10), width: 230, maxHeight: 320, overflowY: "auto", background: "#0d0d1a", border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "12px 14px", zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", fontSize: 11, fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
            <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{node.id}</div>
            <div style={{ color: `${color}99`, fontSize: 10, marginBottom: 4 }}>{node.status ?? "up"} · {node.tokens?.length ?? 0} tokens · {partitioner.name}</div>
            {backendInfo && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 8, borderBottom: `1px solid ${color}22`, paddingBottom: 6 }}>
                <div>IP: {backendInfo.ip || "—"}</div>
                <div>Status: {backendInfo.status || "—"}</div>
                <div>DC: {backendInfo.datacenter || "—"} / {backendInfo.rack || "—"}</div>
                {node.tokens?.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: `${color}88`, marginBottom: 2 }}>Tokens ({node.tokens.length}):</div>
                    {node.tokens.slice(0, 4).map((t, i) => <div key={i} style={{ fontSize: 8, opacity: 0.7 }}>{String(t)}</div>)}
                    {node.tokens.length > 4 && <div style={{ fontSize: 8, opacity: 0.5 }}>+{node.tokens.length - 4} more…</div>}
                  </div>
                )}
              </div>
            )}
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>DATA ({data.length} {data.length === 1 ? "entry" : "entries"})</div>
            {data.length === 0
              ? <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>no data stored</div>
              : data.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 3 }}>
                  <span style={{ color, minWidth: 0, flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.key}</span>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>→</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(item.value).slice(0, 30)}{String(item.value).length > 30 ? "…" : ""}</span>
                </div>
              ))
            }
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.15)", fontSize: 9, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>hover × to remove</div>
          </div>
        );
      })()}
    </div>
  );
}