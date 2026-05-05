function TokenRing({ nodes = [] }) {
    const size = 320;
    const center = size / 2;
    const radius = 110;

    const defaultNodes = nodes.length > 0 ? nodes : ["NodeA", "NodeB", "NodeC"];

    return (
        <svg width={size} height={size} className="token-ring">
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="var(--accent-border)"
                strokeWidth="3"
            />

            {defaultNodes.map((node, index) => {
                const angle = (2 * Math.PI * index) / defaultNodes.length - Math.PI / 2;
                const x = center + radius * Math.cos(angle);
                const y = center + radius * Math.sin(angle);

                return (
                    <g key={node}>
                        <circle cx={x} cy={y} r="22" className="ring-node" />
                        <text x={x} y={y + 5} textAnchor="middle" className="ring-label">
                            {node}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default TokenRing;