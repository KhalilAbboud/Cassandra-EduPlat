// ── Token helpers ─────────────────────────────────────────────────────────────

function getPrimaryToken(node) {
  if (node.tokens && node.tokens.length > 0) {
    return BigInt(String(node.tokens[0]));
  }
  if (node.token != null) {
    return typeof node.token === "bigint" ? node.token : BigInt(String(node.token));
  }
  return 0n;
}

const MURMUR3_MIN = -9223372036854775808n;
const MURMUR3_RANGE = 18446744073709551616n;

export function hashKey(key) {
  let h = 0x811c9dc5n;
  const FNV_PRIME = 0x01000193n;
  const MOD32 = 0x100000000n;
  for (let i = 0; i < key.length; i++) {
    h ^= BigInt(key.charCodeAt(i));
    h = (h * FNV_PRIME) % MOD32;
  }
  return h * (MURMUR3_RANGE / MOD32) + MURMUR3_MIN;
}

export function simulatePlacement({ key, nodes, replicationFactor, precomputedHash }) {
  if (!key || nodes.length === 0) return null;

  const hash = precomputedHash != null ? BigInt(precomputedHash) : hashKey(key);
  const aliveNodes = nodes.filter(n => n.status === "up" && n.tokens?.length > 0);

  if (aliveNodes.length === 0) {
    return { key, hash, primaryNode: null, replicas: [] };
  }

  const sortedNodes = [...aliveNodes].sort((a, b) => {
    const ta = getPrimaryToken(a);
    const tb = getPrimaryToken(b);
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  let primaryIndex = sortedNodes.findIndex(n => getPrimaryToken(n) >= hash);
  if (primaryIndex === -1) primaryIndex = 0;

  const replicas = [];
  for (let i = 0; i < Math.min(replicationFactor, sortedNodes.length); i++) {
    replicas.push(sortedNodes[(primaryIndex + i) % sortedNodes.length]);
  }

  return { key, hash, primaryNode: replicas[0], replicas };
}

export function checkConsistency({ replicas, consistencyLevel }) {
  const aliveReplicas = replicas.filter(n => n.status === "up").length;
  const totalReplicas = replicas.length;

  let required = 1;
  if (consistencyLevel === "QUORUM") required = Math.floor(totalReplicas / 2) + 1;
  if (consistencyLevel === "ALL") required = totalReplicas;

  return { consistencyLevel, aliveReplicas, required, success: aliveReplicas >= required };
}