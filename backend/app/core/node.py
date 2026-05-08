class Node:
    def __init__(self, node_id):
        self.id = node_id
        self.data = {}

    def store(self, key, value):
        self.data[key] = value

    def get(self, key):
        return self.data.get(key)