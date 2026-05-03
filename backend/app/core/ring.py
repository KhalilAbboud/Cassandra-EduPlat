import hashlib

def hash_key(key: str) -> int:
    return int(hashlib.md5(key.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self):
        self.nodes = []
        self.ring = {}

    def add_node(self, node):
        h = hash_key(node.id)
        self.nodes.append((h, node))
        self.nodes.sort()

    def remove_node(self, node_id):
        self.nodes = [(h, n) for h, n in self.nodes if n.id != node_id]

    def get_node(self, key):
        h = hash_key(key)
        for node_hash, node in self.nodes:
            if h <= node_hash:
                return node
        return self.nodes[0][1]  # wrap around