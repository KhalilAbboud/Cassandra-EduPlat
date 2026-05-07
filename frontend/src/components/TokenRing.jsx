function TokenRing({
    nodes = [],
    simulationResult = null,
    csvDistribution = [],
}) {
    const size = 420;
    const center = size / 2;
    const radius = 135;

    const defaultNodes =
        nodes.length > 0
            ? nodes
            : [
                { id: "NodeA", token: 3000, status: "up" },
                { id: "NodeB", token: 6500, status: "up" },
                { id: "NodeC", token: 9000, status: "up" },
            ];

    const sortedNodes = [...defaultNodes].sort((a, b) => a.token - b.token);

    const replicas = simulationResult?.replicas ?? [];
    const replicaIds = replicas.map((node) => node.id);
    const primaryId = simulationResult?.primaryNode?.id;

    const getPosition = (token, r = radius) => {
        const angle = (token / 10000) * 2 * Math.PI - Math.PI / 2;

        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle),
            angle,
        };
    };

    const describeArc = (startToken, endToken) => {
        const start = getPosition(startToken);
        const end = getPosition(endToken);

        const largeArcFlag = endToken - startToken > 5000 ? 1 : 0;

        return `
      M ${start.x} ${start.y}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}
    `;
    };

    return (
        <div className="ring-wrapper">
            <svg width={size} height={size} className="token-ring">
                <defs>
                    <marker
                        id="arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="5"
                        refY="3"
                        orient="auto"
                    >
                        <path d="M0,0 L0,6 L6,3 z" className="arrow-head" />
                    </marker>
                </defs>

                {/* Ownership ranges */}
                {sortedNodes.map((node, index) => {
                    const previousNode =
                        index === 0
                            ? sortedNodes[sortedNodes.length - 1]
                            : sortedNodes[index - 1];

                    const startToken = previousNode.token;
                    const endToken = node.token;

                    const adjustedEnd =
                        endToken < startToken ? endToken + 10000 : endToken;

                    const arcPath = describeArc(startToken, adjustedEnd);

                    return (
                        <path
                            key={`range-${node.id}`}
                            d={arcPath}
                            className={`ownership-arc ownership-${index}`}
                        />
                    );
                })}

                {/* Base ring */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="2"
                />

                {/* Direction arrow */}
                <path
                    d={`M ${center - 60} ${center - 160}
              A 160 160 0 0 1 ${center + 85} ${center - 135}`}
                    fill="none"
                    className="clockwise-arrow"
                    markerEnd="url(#arrow)"
                />

                <text
                    x={center}
                    y={center - 178}
                    textAnchor="middle"
                    className="clockwise-label"
                >
                    clockwise lookup
                </text>

                {/* Center explanation */}
                <text x={center} y={center - 10} textAnchor="middle" className="ring-center-title">
                    Token Ring
                </text>
                <text x={center} y={center + 15} textAnchor="middle" className="ring-center-subtitle">
                    partition key → hash → node
                </text>

                {/* CSV data points */}
                {csvDistribution.map((item, index) => {
                    const pos = getPosition(item.hash, radius - 35);

                    return (
                        <g key={`${item.rowId}-${index}`}>
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r="6"
                                className="csv-data-point"
                            />
                            <text
                                x={pos.x}
                                y={pos.y - 10}
                                textAnchor="middle"
                                className="csv-data-label"
                            >
                                {item.partitionValue}
                            </text>
                        </g>
                    );
                })}

                {/* Manual key hash point */}
                {simulationResult?.hash !== undefined && (
                    <g>
                        <circle
                            cx={getPosition(simulationResult.hash, radius - 18).x}
                            cy={getPosition(simulationResult.hash, radius - 18).y}
                            r="9"
                            className="manual-hash-point"
                        />
                        <text
                            x={getPosition(simulationResult.hash, radius - 18).x}
                            y={getPosition(simulationResult.hash, radius - 18).y - 14}
                            textAnchor="middle"
                            className="hash-label"
                        >
                            hash {simulationResult.hash}
                        </text>
                    </g>
                )}

                {/* Nodes */}
                {sortedNodes.map((node) => {
                    const pos = getPosition(node.token);
                    const isPrimary = node.id === primaryId;
                    const isReplica = replicaIds.includes(node.id);
                    const isDown = node.status === "down";

                    let nodeClass = "ring-node";

                    if (isReplica) nodeClass += " replica-node";
                    if (isPrimary) nodeClass += " primary-node";
                    if (isDown) nodeClass += " down-node";

                    return (
                        <g key={node.id}>
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={isPrimary ? 30 : 24}
                                className={nodeClass}
                            />

                            {isDown && (
                                <line
                                    x1={pos.x - 16}
                                    y1={pos.y - 16}
                                    x2={pos.x + 16}
                                    y2={pos.y + 16}
                                    className="down-cross"
                                />
                            )}

                            <text x={pos.x} y={pos.y + 5} textAnchor="middle" className="ring-label">
                                {node.id}
                            </text>

                            <text x={pos.x} y={pos.y + 44} textAnchor="middle" className="token-label">
                                token {node.token}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <div className="ring-legend">
                <span><b className="dot yellow"></b> CSV row hash</span>
                <span><b className="dot blue"></b> Primary replica</span>
                <span><b className="dot green"></b> Replica</span>
                <span><b className="dot red"></b> Node down</span>
            </div>
        </div>
    );
}

export default TokenRing;