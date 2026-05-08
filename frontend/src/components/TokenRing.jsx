import { useState, useRef, useCallback } from "react";

const W = 800, H = 800, CX = 400, CY = 400;
const RING_R = 300;
const NODE_R = 30;
const SNAP_THR = 60;
const MAX_TOK = 10000;
const PALETTE = { x: 60, y: 740 };

const NODE_COLORS = [
  "#7c6af7", "#f76a6a", "#6af7b8", "#f7c76a",
  "#6ab8f7", "#f76ac8", "#a8f76a", "#f7a86a",
];

const tokToAngle = (t) => (t / MAX_TOK) * 2 * Math.PI - Math.PI / 2;
const angleToTok = (a) => Math.round((((a + Math.PI / 2) / (2 * Math.PI) + 1) % 1) * MAX_TOK);
const ringXY = (tok) => ({
  x: CX + RING_R * Math.cos(tokToAngle(tok)),
  y: CY + RING_R * Math.sin(tokToAngle(tok)),
});
const distCenter = (x, y) => Math.sqrt((x - CX) ** 2 + (y - CY) ** 2);

const TICKS = [0, 1250, 2500, 3750, 5000, 6250, 7500, 8750];

export default function TokenRing({
  nodes = [], cluster = {},
  onAddNode, onRemoveNode, onMoveNode,
  simulationResult, csvDistribution = [],
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);

  // Palette drag (create new node)
  const [palDragging, setPalDragging] = useState(false);
  const [ghostXY, setGhostXY] = useState(PALETTE);
  const [snapToken, setSnapToken] = useState(null);

  // Node drag (reposition) — ref avoids stale closures in mousemove
  const movingIdRef = useRef(null);
  const [movingToken, setMovingToken] = useState(null);

  // Hover tooltip
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipPx, setTooltipPx] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);

  const toSvgXY = useCallback((e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }, []);

  const onPaletteMD = useCallback((e) => {
    if (nodes.length >= 6) return;
    e.preventDefault();
    setPalDragging(true);
    setGhostXY(toSvgXY(e));
  }, [toSvgXY, nodes.length]);

  const onNodeMD = useCallback((e, nodeId, nodeToken) => {
    e.stopPropagation();
    movingIdRef.current = nodeId;
    setMovingToken(nodeToken);
    setHoveredId(null);
  }, []);

  const onSvgMM = useCallback((e) => {
    const pos = toSvgXY(e);

    // Reposition existing node — read ref directly (always fresh)
    if (movingIdRef.current !== null) {
      setMovingToken(angleToTok(Math.atan2(pos.y - CY, pos.x - CX)));
      return;
    }

    // Palette drag
    if (!palDragging) return;
    setGhostXY(pos);
    if (Math.abs(distCenter(pos.x, pos.y) - RING_R) < SNAP_THR) {
      setSnapToken(angleToTok(Math.atan2(pos.y - CY, pos.x - CX)));
    } else {
      setSnapToken(null);
    }
  }, [palDragging, toSvgXY]);

  const onSvgMU = useCallback(() => {
    // Finish node move
    if (movingIdRef.current !== null) {
      if (movingToken !== null) onMoveNode?.(movingIdRef.current, movingToken);
      movingIdRef.current = null;
      setMovingToken(null);
      return;
    }
    // Finish palette drag
    if (!palDragging) return;
    setPalDragging(false);
    if (snapToken !== null) onAddNode?.(snapToken);
    setSnapToken(null);
    setGhostXY(PALETTE);
  }, [palDragging, movingToken, snapToken, onAddNode, onMoveNode]);

  const onNodeEnter = useCallback((id, e) => {
    if (movingIdRef.current) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredId(id);
    const wrap = wrapRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    setTooltipPx({ x: e.clientX - wrap.left, y: e.clientY - wrap.top });
  }, []);

  const onNodeLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredId(null);
    }, 150);
  }, []);

  const onNodeMM = useCallback((e) => {
    if (!hoveredId || movingIdRef.current) return;
    const wrap = wrapRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    setTooltipPx({ x: e.clientX - wrap.left, y: e.clientY - wrap.top });
  }, [hoveredId]);

  // Derived
  const sorted = [...nodes].sort((a, b) => a.token - b.token);
  const highlightSet = new Set(simulationResult?.replicas?.map((r) => r.id) ?? []);
  const primaryId = simulationResult?.primaryNode?.id;
  const csvCountByNode = {};
  csvDistribution.forEach((d) => {
    d.replicas?.forEach((r) => { csvCountByNode[r.id] = (csvCountByNode[r.id] ?? 0) + 1; });
  });
  const nodeColorMap = {};
  nodes.forEach((n, i) => { nodeColorMap[n.id] = NODE_COLORS[i % NODE_COLORS.length]; });

  return (
    <div ref={wrapRef} style={{ position: "relative", userSelect: "none", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", touchAction: "none", cursor: palDragging ? "grabbing" : "default" }}
        onMouseMove={(e) => { onSvgMM(e); onNodeMM(e); }}
        onMouseUp={onSvgMU}
        onMouseLeave={onSvgMU}
      >
        {/* Ring */}
        <circle cx={CX} cy={CY} r={RING_R + 4} fill="none" stroke="rgba(124,106,247,0.08)" strokeWidth={22} />
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2.5} strokeDasharray="6 4" />

        {/* Ticks */}
        {TICKS.map((t) => {
          const a = tokToAngle(t);
          const lx = CX + (RING_R + 24) * Math.cos(a);
          const ly = CY + (RING_R + 24) * Math.sin(a);
          return (
            <g key={t}>
              <line
                x1={CX + (RING_R - 8) * Math.cos(a)} y1={CY + (RING_R - 8) * Math.sin(a)}
                x2={CX + (RING_R + 8) * Math.cos(a)} y2={CY + (RING_R + 8) * Math.sin(a)}
                stroke="rgba(255,255,255,0.18)" strokeWidth={1}
              />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="rgba(255,255,255,0.28)">{t}</text>
            </g>
          );
        })}

        {/* Arc segments */}
        {sorted.length >= 2 && sorted.map((node, i) => {
          const next = sorted[(i + 1) % sorted.length];
          const tok1 = movingIdRef.current === node.id && movingToken !== null ? movingToken : node.token;
          const a1 = tokToAngle(tok1);
          const a2 = tokToAngle(next.token);
          let sweep = a2 - a1; if (sweep <= 0) sweep += 2 * Math.PI;
          const large = sweep > Math.PI ? 1 : 0;
          const p1 = { x: CX + RING_R * Math.cos(a1), y: CY + RING_R * Math.sin(a1) };
          const p2 = { x: CX + RING_R * Math.cos(a2), y: CY + RING_R * Math.sin(a2) };
          const color = nodeColorMap[node.id] ?? "#7c6af7";
          return (
            <path key={`arc-${node.id}`}
              d={`M ${p1.x} ${p1.y} A ${RING_R} ${RING_R} 0 ${large} 1 ${p2.x} ${p2.y}`}
              fill="none"
              stroke={highlightSet.has(node.id) ? color : color + "55"}
              strokeWidth={highlightSet.has(node.id) ? 6 : 3}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isMoving = movingIdRef.current === node.id;
          const displayToken = isMoving && movingToken !== null ? movingToken : node.token;
          const pos = ringXY(displayToken);
          const isPrimary = node.id === primaryId;
          const isDown = node.status === "down";
          const color = nodeColorMap[node.id] ?? "#7c6af7";
          const csvBadge = csvCountByNode[node.id] ?? 0;
          const dataLen = (cluster[node.id] ?? []).length;
          const isHovered = hoveredId === node.id && !isMoving;

          return (
            <g key={node.id}
              style={{ cursor: isMoving ? "grabbing" : "grab" }}
              onMouseDown={(e) => onNodeMD(e, node.id, node.token)}
              onMouseEnter={(e) => onNodeEnter(node.id, e)}
              onMouseLeave={onNodeLeave}
            >
              {isPrimary && (
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 8}
                  fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} />
              )}
              <circle cx={pos.x} cy={pos.y} r={NODE_R}
                fill={isDown ? "#2a2a2a" : `${color}22`}
                stroke={color}
                strokeWidth={isMoving ? 2.5 : isPrimary ? 2.5 : 1.5}
                strokeDasharray={isMoving ? "5 3" : "none"}
              />
              <text x={pos.x} y={pos.y - 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={8.5} fontWeight="700" fill={isDown ? "#666" : color}
                style={{ pointerEvents: "none" }}>
                {node.id.length > 7 ? node.id.slice(0, 7) : node.id}
              </text>
              {dataLen > 0 && (
                <text x={pos.x} y={pos.y + 10} textAnchor="middle" dominantBaseline="middle"
                  fontSize={7} fill={`${color}99`} style={{ pointerEvents: "none" }}>
                  {dataLen}k
                </text>
              )}
              <text x={pos.x} y={pos.y + NODE_R + 13} textAnchor="middle"
                fontSize={7.5} fill="rgba(255,255,255,0.3)" style={{ pointerEvents: "none" }}>
                {displayToken}
              </text>

              {/* CSV badge */}
              {csvBadge > 0 && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={pos.x + 17} cy={pos.y - 17} r={9} fill={color} />
                  <text x={pos.x + 17} y={pos.y - 17} textAnchor="middle"
                    dominantBaseline="middle" fontSize={7.5} fontWeight="bold" fill="white">
                    {csvBadge}
                  </text>
                </g>
              )}

              {/* Remove × button on hover */}
              {isHovered && (
                <g onClick={(e) => { e.stopPropagation(); onRemoveNode?.(node.id); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ cursor: "pointer" }}>
                  <circle cx={pos.x + 17} cy={pos.y + 17} r={9} fill="#f76a6a" opacity={0.9} />
                  <text x={pos.x + 17} y={pos.y + 17} textAnchor="middle"
                    dominantBaseline="middle" fontSize={13} fill="white"
                    style={{ pointerEvents: "none" }}>×</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Snap preview */}
        {snapToken !== null && (() => {
          const pos = ringXY(snapToken);
          return (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={pos.x} cy={pos.y} r={NODE_R}
                fill="rgba(124,106,247,0.2)" stroke="#7c6af7" strokeWidth={1.5} strokeDasharray="5 3" />
              <text x={pos.x} y={pos.y + NODE_R + 13}
                textAnchor="middle" fontSize={8} fill="#7c6af7">{snapToken}</text>
            </g>
          );
        })()}

        {/* Palette ghost */}
        {palDragging && (
          <circle cx={ghostXY.x} cy={ghostXY.y} r={NODE_R}
            fill="rgba(124,106,247,0.5)" stroke="#7c6af7" strokeWidth={1.5}
            style={{ pointerEvents: "none" }} />
        )}

        {/* Palette node */}
        {!palDragging && (
          <g onMouseDown={onPaletteMD} style={{ cursor: nodes.length >= 6 ? "not-allowed" : "grab", opacity: nodes.length >= 6 ? 0.3 : 1 }}>
            <circle cx={PALETTE.x} cy={PALETTE.y} r={NODE_R}
              fill="rgba(124,106,247,0.15)" stroke="#7c6af7" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={PALETTE.x} y={PALETTE.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={22} fill="#7c6af7" fontWeight="300">+</text>
            <text x={PALETTE.x} y={PALETTE.y + NODE_R + 14}
              textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
              {nodes.length >= 6 ? "max 6 nodes" : "drag to ring"}
            </text>
          </g>
        )}

        {/* Center */}
        <text x={CX} y={CY - 10} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.2)" letterSpacing={2}>TOKEN RING</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.15)">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}
        </text>
        {nodes.length === 0 && (
          <text x={CX} y={CY + 26} textAnchor="middle" fontSize={8} fill="rgba(124,106,247,0.5)">drag + to start</text>
        )}
      </svg>

      {/* Tooltip */}
      {hoveredId && movingIdRef.current === null && (() => {
        const node = nodes.find((n) => n.id === hoveredId);
        if (!node) return null;
        const data = cluster[hoveredId] ?? [];
        const color = nodeColorMap[hoveredId] ?? "#7c6af7";
        const ww = wrapRef.current?.clientWidth ?? 400;
        const wh = wrapRef.current?.clientHeight ?? 400;
        const flipX = tooltipPx.x > ww * 0.65;
        const flipY = tooltipPx.y > wh * 0.70;
        return (
          <div
            onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
            onMouseLeave={onNodeLeave}
            style={{
              position: "absolute",
              left: tooltipPx.x + (flipX ? -230 : 20),
              top: tooltipPx.y + (flipY ? -260 : 10),
              width: 210, maxHeight: 260, overflowY: "auto",
              background: "#0d0d1a",
              border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`,
              borderRadius: 8, padding: "12px 14px", zIndex: 30,
              pointerEvents: "auto",
              boxShadow: `0 12px 40px rgba(0,0,0,0.6)`,
              fontSize: 11, fontFamily: "'JetBrains Mono','Fira Code',monospace",
            }}>
            <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{node.id}</div>
            <div style={{ color: `${color}99`, fontSize: 10, marginBottom: 8 }}>
              token: {node.token} · {node.status ?? "up"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
              DATA ({data.length} {data.length === 1 ? "entry" : "entries"})
            </div>
            {data.length === 0
              ? <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>no data stored</div>
              : <>
                {data.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 3 }}>
                    <span style={{ color, minWidth: 0, flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.key}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>→</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {String(item.value).slice(0, 30)}{String(item.value).length > 30 ? "…" : ""}
                    </span>
                  </div>
                ))}
              </>
            }
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.15)", fontSize: 9, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
              drag to reposition · hover × to remove
            </div>
          </div>
        );
      })()}
    </div>
  );
}