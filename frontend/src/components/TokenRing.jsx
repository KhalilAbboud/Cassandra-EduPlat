import { useCallback, useRef, useState } from "react";

const W = 800;
const H = 800;
const CX = 400;
const CY = 400;

const RING_R = 300;
const NODE_R = 30;
const SNAP_THR = 60;
const MAX_TOK = 10000;
const PALETTE = { x: 60, y: 740 };

const NODE_COLORS = [
  "#7c3aed",
  "#dc2626",
  "#16a34a",
  "#f59e0b",
  "#0284c7",
  "#db2777",
  "#65a30d",
  "#ea580c",
];

const TICKS = [0, 1250, 2500, 3750, 5000, 6250, 7500, 8750];

const tokToAngle = (token) =>
  (token / MAX_TOK) * 2 * Math.PI - Math.PI / 2;

const angleToTok = (angle) =>
  Math.round((((angle + Math.PI / 2) / (2 * Math.PI) + 1) % 1) * MAX_TOK);

const ringXY = (token) => ({
  x: CX + RING_R * Math.cos(tokToAngle(token)),
  y: CY + RING_R * Math.sin(tokToAngle(token)),
});

const distCenter = (x, y) => Math.sqrt((x - CX) ** 2 + (y - CY) ** 2);

export default function TokenRing({
  nodes = [],
  cluster = {},
  onAddNode,
  onRemoveNode,
  onMoveNode,
  simulationResult,
  csvDistribution = [],
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const movingIdRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  const [palDragging, setPalDragging] = useState(false);
  const [ghostXY, setGhostXY] = useState(PALETTE);
  const [snapToken, setSnapToken] = useState(null);

  const [movingToken, setMovingToken] = useState(null);

  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipPx, setTooltipPx] = useState({ x: 0, y: 0 });

  const sortedNodes = [...nodes].sort((a, b) => a.token - b.token);

  const primaryId = simulationResult?.primaryNode?.id;
  const highlightedIds = new Set(
    simulationResult?.replicas?.map((replica) => replica.id) ?? []
  );

  const nodeColorMap = {};
  nodes.forEach((node, index) => {
    nodeColorMap[node.id] = NODE_COLORS[index % NODE_COLORS.length];
  });

  const csvCountByNode = {};
  csvDistribution.forEach((item) => {
    item.replicas?.forEach((replica) => {
      csvCountByNode[replica.id] = (csvCountByNode[replica.id] ?? 0) + 1;
    });
  });

  const toSvgXY = useCallback((event) => {
    const rect = svgRef.current?.getBoundingClientRect();

    if (!rect) return { x: 0, y: 0 };

    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const handlePaletteMouseDown = useCallback(
    (event) => {
      if (nodes.length >= 6) return;

      event.preventDefault();

      setPalDragging(true);
      setGhostXY(toSvgXY(event));
    },
    [nodes.length, toSvgXY]
  );

  const handleNodeMouseDown = useCallback((event, nodeId, nodeToken) => {
    event.stopPropagation();

    movingIdRef.current = nodeId;

    setMovingToken(nodeToken);
    setHoveredId(null);
  }, []);

  const handleSvgMouseMove = useCallback(
    (event) => {
      const position = toSvgXY(event);

      if (movingIdRef.current !== null) {
        setMovingToken(
          angleToTok(Math.atan2(position.y - CY, position.x - CX))
        );
        return;
      }

      if (!palDragging) return;

      setGhostXY(position);

      const isNearRing =
        Math.abs(distCenter(position.x, position.y) - RING_R) < SNAP_THR;

      setSnapToken(
        isNearRing
          ? angleToTok(Math.atan2(position.y - CY, position.x - CX))
          : null
      );
    },
    [palDragging, toSvgXY]
  );

  const handleSvgMouseUp = useCallback(() => {
    if (movingIdRef.current !== null) {
      if (movingToken !== null) {
        onMoveNode?.(movingIdRef.current, movingToken);
      }

      movingIdRef.current = null;
      setMovingToken(null);
      return;
    }

    if (!palDragging) return;

    setPalDragging(false);

    if (snapToken !== null) {
      onAddNode?.(snapToken);
    }

    setSnapToken(null);
    setGhostXY(PALETTE);
  }, [movingToken, onMoveNode, palDragging, snapToken, onAddNode]);

  const handleNodeEnter = useCallback((nodeId, event) => {
    if (movingIdRef.current) return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    setHoveredId(nodeId);

    const wrapperRect = wrapRef.current?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
    };

    setTooltipPx({
      x: event.clientX - wrapperRect.left,
      y: event.clientY - wrapperRect.top,
    });
  }, []);

  const handleNodeLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredId(null);
    }, 150);
  }, []);

  const handleNodeMove = useCallback(
    (event) => {
      if (!hoveredId || movingIdRef.current) return;

      const wrapperRect = wrapRef.current?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
      };

      setTooltipPx({
        x: event.clientX - wrapperRect.left,
        y: event.clientY - wrapperRect.top,
      });
    },
    [hoveredId]
  );

  return (
    <div ref={wrapRef} className="token-ring-wrapper">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`token-ring-svg ${palDragging ? "dragging" : ""}`}
        onMouseMove={(event) => {
          handleSvgMouseMove(event);
          handleNodeMove(event);
        }}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        <circle className="ring-glow" cx={CX} cy={CY} r={RING_R + 4} />
        <circle className="ring-base" cx={CX} cy={CY} r={RING_R} />

        {TICKS.map((tick) => {
          const angle = tokToAngle(tick);

          const x1 = CX + (RING_R - 8) * Math.cos(angle);
          const y1 = CY + (RING_R - 8) * Math.sin(angle);
          const x2 = CX + (RING_R + 8) * Math.cos(angle);
          const y2 = CY + (RING_R + 8) * Math.sin(angle);

          const labelX = CX + (RING_R + 24) * Math.cos(angle);
          const labelY = CY + (RING_R + 24) * Math.sin(angle);

          return (
            <g key={tick}>
              <line className="ring-tick" x1={x1} y1={y1} x2={x2} y2={y2} />
              <text
                className="ring-tick-label"
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {sortedNodes.length >= 2 &&
          sortedNodes.map((node, index) => {
            const next = sortedNodes[(index + 1) % sortedNodes.length];

            const displayedToken =
              movingIdRef.current === node.id && movingToken !== null
                ? movingToken
                : node.token;

            const angle1 = tokToAngle(displayedToken);
            const angle2 = tokToAngle(next.token);

            let sweep = angle2 - angle1;
            if (sweep <= 0) sweep += 2 * Math.PI;

            const largeArcFlag = sweep > Math.PI ? 1 : 0;

            const p1 = {
              x: CX + RING_R * Math.cos(angle1),
              y: CY + RING_R * Math.sin(angle1),
            };

            const p2 = {
              x: CX + RING_R * Math.cos(angle2),
              y: CY + RING_R * Math.sin(angle2),
            };

            const color = nodeColorMap[node.id] ?? NODE_COLORS[0];
            const isHighlighted = highlightedIds.has(node.id);

            return (
              <path
                key={`arc-${node.id}`}
                d={`M ${p1.x} ${p1.y} A ${RING_R} ${RING_R} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`}
                fill="none"
                stroke={color}
                className={isHighlighted ? "ring-arc highlighted" : "ring-arc"}
              />
            );
          })}

        {/* CSV HASH POINTS */}
        {csvDistribution.map((item, index) => {
          if (typeof item.hash !== "number") return null;

          const angle = tokToAngle(item.hash);

          const x = CX + (RING_R - 24) * Math.cos(angle);
          const y = CY + (RING_R - 24) * Math.sin(angle);

          const isPrimary =
            item.primaryNode &&
            simulationResult?.primaryNode?.id === item.primaryNode;

          return (
            <g key={`csv-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={5}
                className={`csv-hash-point ${isPrimary ? "primary" : ""}`}
              />

              <text
                x={x}
                y={y - 10}
                textAnchor="middle"
                className="csv-hash-label"
              >
                {String(item.partitionValue).slice(0, 6)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const isMoving = movingIdRef.current === node.id;

          const displayedToken =
            isMoving && movingToken !== null ? movingToken : node.token;

          const position = ringXY(displayedToken);

          const color = nodeColorMap[node.id] ?? NODE_COLORS[0];

          const isPrimary = node.id === primaryId;
          const isReplica = highlightedIds.has(node.id);
          const isDown = node.status === "down";
          const isHovered = hoveredId === node.id && !isMoving;

          const csvBadge = csvCountByNode[node.id] ?? 0;
          const dataLength = (cluster[node.id] ?? []).length;

          return (
            <g
              key={node.id}
              className={`ring-node-group ${isMoving ? "moving" : ""}`}
              onMouseDown={(event) =>
                handleNodeMouseDown(event, node.id, node.token)
              }
              onMouseEnter={(event) => handleNodeEnter(node.id, event)}
              onMouseLeave={handleNodeLeave}
            >
              {isPrimary && (
                <circle
                  className="primary-pulse"
                  cx={position.x}
                  cy={position.y}
                  r={NODE_R + 9}
                  style={{ stroke: color }}
                />
              )}

              <circle
                className={`node-circle ${isPrimary ? "primary" : ""} ${isReplica ? "replica" : ""
                  } ${isDown ? "down" : ""}`}
                cx={position.x}
                cy={position.y}
                r={NODE_R}
                style={{
                  stroke: color,
                  fill: isDown ? "var(--node-down-bg)" : `${color}22`,
                }}
              />

              <text
                className={`node-label ${isDown ? "down" : ""}`}
                x={position.x}
                y={position.y - 2}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fill: isDown ? "var(--text-muted)" : color }}
              >
                {node.id.length > 7 ? node.id.slice(0, 7) : node.id}
              </text>

              {dataLength > 0 && (
                <text
                  className="node-data-count"
                  x={position.x}
                  y={position.y + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fill: color }}
                >
                  {dataLength}k
                </text>
              )}

              <text
                className="node-token-label"
                x={position.x}
                y={position.y + NODE_R + 14}
                textAnchor="middle"
              >
                {displayedToken}
              </text>

              {csvBadge > 0 && (
                <g className="csv-badge">
                  <circle
                    cx={position.x + 17}
                    cy={position.y - 17}
                    r={9}
                    style={{ fill: color }}
                  />
                  <text
                    x={position.x + 17}
                    y={position.y - 17}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {csvBadge}
                  </text>
                </g>
              )}

              {isHovered && (
                <g
                  className="remove-node"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveNode?.(node.id);
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <circle cx={position.x + 17} cy={position.y + 17} r={9} />
                  <text
                    x={position.x + 17}
                    y={position.y + 17}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {snapToken !== null && (() => {
          const position = ringXY(snapToken);

          return (
            <g className="snap-preview">
              <circle cx={position.x} cy={position.y} r={NODE_R} />
              <text
                x={position.x}
                y={position.y + NODE_R + 14}
                textAnchor="middle"
              >
                {snapToken}
              </text>
            </g>
          );
        })()}

        {palDragging && (
          <circle
            className="palette-ghost"
            cx={ghostXY.x}
            cy={ghostXY.y}
            r={NODE_R}
          />
        )}

        {!palDragging && (
          <g
            className={`palette-node ${nodes.length >= 6 ? "disabled" : ""}`}
            onMouseDown={handlePaletteMouseDown}
          >
            <circle cx={PALETTE.x} cy={PALETTE.y} r={NODE_R} />
            <text
              x={PALETTE.x}
              y={PALETTE.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              +
            </text>
            <text
              className="palette-label"
              x={PALETTE.x}
              y={PALETTE.y + NODE_R + 15}
              textAnchor="middle"
            >
              {nodes.length >= 6 ? "max 6 nodes" : "drag to ring"}
            </text>
          </g>
        )}

        <text
          className="ring-center-title"
          x={CX}
          y={CY - 10}
          textAnchor="middle"
        >
          TOKEN RING
        </text>

        <text
          className="ring-center-subtitle"
          x={CX}
          y={CY + 10}
          textAnchor="middle"
        >
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}
        </text>

        {nodes.length === 0 && (
          <text
            className="ring-center-hint"
            x={CX}
            y={CY + 30}
            textAnchor="middle"
          >
            drag + to start
          </text>
        )}
      </svg>

      {hoveredId &&
        movingIdRef.current === null &&
        (() => {
          const node = nodes.find((item) => item.id === hoveredId);
          if (!node) return null;

          const data = cluster[hoveredId] ?? [];
          const color = nodeColorMap[hoveredId] ?? NODE_COLORS[0];

          const wrapperWidth = wrapRef.current?.clientWidth ?? 400;
          const wrapperHeight = wrapRef.current?.clientHeight ?? 400;

          const flipX = tooltipPx.x > wrapperWidth * 0.65;
          const flipY = tooltipPx.y > wrapperHeight * 0.7;

          return (
            <div
              className="ring-tooltip"
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
              }}
              onMouseLeave={handleNodeLeave}
              style={{
                left: tooltipPx.x + (flipX ? -230 : 20),
                top: tooltipPx.y + (flipY ? -260 : 10),
                borderLeftColor: color,
              }}
            >
              <div className="tooltip-title" style={{ color }}>
                {node.id}
              </div>

              <div className="tooltip-meta">
                token: {node.token} · {node.status ?? "up"}
              </div>

              <div className="tooltip-section-title">
                DATA ({data.length} {data.length === 1 ? "entry" : "entries"})
              </div>

              {data.length === 0 ? (
                <div className="tooltip-empty">no data stored</div>
              ) : (
                data.map((item, index) => (
                  <div key={index} className="tooltip-row">
                    <span className="tooltip-key" style={{ color }}>
                      {item.key}
                    </span>
                    <span className="tooltip-arrow">→</span>
                    <span className="tooltip-value">
                      {String(item.value).slice(0, 30)}
                      {String(item.value).length > 30 ? "…" : ""}
                    </span>
                  </div>
                ))
              )}

              <div className="tooltip-footer">
                drag to reposition · hover × to remove
              </div>
            </div>
          );
        })()}
    </div>
  );
}