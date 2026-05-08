from core.ring import HashRing
from core.node import Node

class Cluster:
    def __init__(self, replication_factor=3):
        self.ring = HashRing()
        self.replication_factor = replication_factor

    def add_node(self, node_id):
        node = Node(node_id)
        self.ring.add_node(node)

    def get_replicas(self, key):
        replicas = []
        h = self.ring.nodes

        if not h:
            return []

        primary = self.ring.get_node(key)
        start_index = next(i for i, (_, n) in enumerate(h) if n == primary)

        for i in range(self.replication_factor):
            node = h[(start_index + i) % len(h)][1]
            replicas.append(node)

        return replicas

    def put(self, key, value):
        replicas = self.get_replicas(key)
        for node in replicas:
            node.store(key, value)

    def get(self, key):
        replicas = self.get_replicas(key)
        for node in replicas:
            value = node.get(key)
            if value:
                return value
        return None