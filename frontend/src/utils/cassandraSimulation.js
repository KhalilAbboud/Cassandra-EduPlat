export function hashKey(key) {
    let h = 0x811c9dc5; // FNV-1a — distributes sequential keys much more evenly
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
        h = h >>> 0;
    }
    return h % 10000;
}

export function simulatePlacement({ key, nodes, replicationFactor }) {
    if (!key || nodes.length === 0) return null;

    const hash = hashKey(key);

    const aliveNodes = nodes.filter((n) => n.status === "up");

    if (aliveNodes.length === 0) {
        return {
            key,
            hash,
            primaryNode: null,
            replicas: [],
        };
    }

    const sortedNodes = [...aliveNodes].sort(
        (a, b) => a.token - b.token
    );

    const primaryIndex = sortedNodes.findIndex(
        (node) => hash <= node.token
    );

    const startIndex = primaryIndex === -1 ? 0 : primaryIndex;

    const replicas = [];

    for (
        let i = 0;
        i < Math.min(replicationFactor, sortedNodes.length);
        i++
    ) {
        replicas.push(
            sortedNodes[(startIndex + i) % sortedNodes.length]
        );
    }

    return {
        key,
        hash,
        primaryNode: replicas[0],
        replicas,
    };
}

export function checkConsistency({
    replicas,
    consistencyLevel,
}) {
    const aliveReplicas = replicas.filter(
        (node) => node.status === "up"
    ).length;

    const totalReplicas = replicas.length;

    let required = 1;

    if (consistencyLevel === "QUORUM") {
        required = Math.floor(totalReplicas / 2) + 1;
    }

    if (consistencyLevel === "ALL") {
        required = totalReplicas;
    }

    return {
        consistencyLevel,
        aliveReplicas,
        required,
        success: aliveReplicas >= required,
    };
}