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

// MD5 (RandomPartitioner) range: 0 to 2^127 - 1
const MD5_MIN = 0n;
const MD5_RANGE = 170141183460469231731687303715884105728n;

/**
 * FNV-1a hash scaled to Murmur3 range.
 * Used as frontend-only fallback when backend hash is unavailable.
 */
function hashFnv1a(key) {
  let h = 0x811c9dc5n;
  const FNV_PRIME = 0x01000193n;
  const MOD32 = 0x100000000n;
  for (let i = 0; i < key.length; i++) {
    h ^= BigInt(key.charCodeAt(i));
    h = (h * FNV_PRIME) % MOD32;
  }
  return h * (MURMUR3_RANGE / MOD32) + MURMUR3_MIN;
}

/**
 * Simple JS MD5-like hash for frontend fallback.
 * Not cryptographically identical to real MD5 but produces well-distributed
 * 128-bit values in the RandomPartitioner range.
 */
function hashMd5Fallback(key) {
  // Use a simple but well-distributed hash for the MD5 range
  let h1 = 0x811c9dc5n;
  let h2 = 0x01000193n;
  let h3 = 0xdeadbeefn;
  let h4 = 0xcafebaben;
  const MOD32 = 0x100000000n;

  for (let i = 0; i < key.length; i++) {
    const ch = BigInt(key.charCodeAt(i));
    h1 = ((h1 ^ ch) * 0x01000193n) % MOD32;
    h2 = ((h2 ^ ch) * 0x01000037n) % MOD32;
    h3 = ((h3 ^ ch) * 0x010000dbn) % MOD32;
    h4 = ((h4 ^ ch) * 0x01000063n) % MOD32;
  }

  // Combine into a 128-bit value in MD5 range
  const combined = (h1 * (MOD32 * MOD32 * MOD32)) + (h2 * (MOD32 * MOD32)) + (h3 * MOD32) + h4;
  return combined % MD5_RANGE;
}

function hashXxHashFallback(key) {
  // Mock xxHash logic matching backend deterministic mock
  // Backend takes first 16 chars of MD5 hex
  let h1 = 0x811c9dc5n;
  const MOD32 = 0x100000000n;
  for (let i = 0; i < key.length; i++) {
    h1 = ((h1 ^ BigInt(key.charCodeAt(i))) * 0x01000193n) % MOD32;
  }
  // This isn't perfect MD5 but serves as a deterministic alternative hash
  return (h1 * (MURMUR3_RANGE / MOD32)) + MURMUR3_MIN;
}

/**
 * Hash a key using the specified hashing type.
 * @param {string} key - The partition key value
 * @param {string} hashingType - "murmur3" or "md5" or "fnv1a" or "xxhash"
 * @returns {BigInt} The hash value
 */
export function hashKey(key, hashingType = "murmur3") {
  if (hashingType === "md5") {
    return hashMd5Fallback(key);
  } else if (hashingType === "fnv1a") {
    return hashFnv1a(key);
  } else if (hashingType === "xxhash") {
    return hashXxHashFallback(key);
  }
  return hashFnv1a(key); // Default murmur3 fallback is fnv1a scaled
}

export function simulatePlacement({ key, nodes, replicationFactor, precomputedHash, hashingType = "murmur3" }) {
  if (!key || nodes.length === 0) return null;

  const hash = precomputedHash != null ? BigInt(precomputedHash) : hashKey(key, hashingType);
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