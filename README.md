# Cassandra Education Platform

Cassandra EduPlat is an interactive, visual simulator and educational platform designed to demystify the inner workings of Apache Cassandra. Instead of staring at terminal logs and abstract documentation, this platform lets you *see* and *feel* how a distributed NoSQL database actually behaves in real-time.

Whether you're a student learning distributed systems or an engineer trying to wrap your head around Hinted Handoff, Cassandra EduPlat gives you a sandbox to break things, fix things, and watch the data flow.

---

## What makes this cool?

Ever wondered what happens when a node dies mid-write? Or how `Murmur3Partitioner` actually places data on a ring?

EduPlat boots up *real* Cassandra instances using Docker behind the scenes, but wraps them in a beautiful, highly animated React frontend. When you insert a row, you literally watch the key get hashed, map to a token on the ring, and flow to its replica nodes. 

### Key Features
- **Interactive Token Ring:** Add and remove nodes from the cluster dynamically. Watch them join, bootstrap, and settle into the ring with fluid animations.
- **Visual Data Distribution:** See exactly which nodes own which partitions. Supports Murmur3, MD5, and simulated FNV-1a/xxHash partitioners.
- **Simulate Chaos (Failure Testing):** Click to "Stop" a node. The platform pauses the Docker container, instantly grey-ing it out on the ring.
- **Hinted Handoff in Action:** With a node down, try writing data! A visual "coordinator" node will store the writes as hints. When you "Recover" the dead node, watch the hints replay back to it.
- **Read Repair:** Trigger read operations with tunable Consistency Levels (ONE, QUORUM, ALL) and watch the platform resolve data staleness.
- **CSV Data Import:** Need a lot of data fast? Import a CSV and watch a high-speed cinematic animation as rows fly across the token ring to their respective partitions.
- **Smart Auto-Increment:** Built-in tools for seamless data entry without constantly tracking your primary keys.

---

## Tech Stack

This project bridges the gap between low-level infrastructure and modern UI/UX.

* **Frontend:** React (Vite), native SVG manipulation for high-performance animations, Vanilla CSS.
* **Backend:** Python, FastAPI, Docker SDK for Python (to orchestrate the Cassandra containers), `cassandra-driver`.
* **Infrastructure:** Docker (running the official `cassandra:latest` image).

---

## Getting Started

### Prerequisites
1. **Docker & Docker Compose** (Make sure Docker Desktop is running if you're on Windows/Mac).
2. **Node.js** (v16+)
3. **Python 3.10+**

### 1. Boot up the Backend
The backend needs to orchestrate Docker containers, so it requires access to the Docker socket.

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
or you can use docker compose
```bash
docker-compose up --build
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
or you can use docker compose
```bash
docker-compose up --build
```

### 3. Play!
1. Open `http://localhost:5173`.
2. Name your cluster and click the **Drag +** area to add your first few nodes. (Give them a few seconds to bootstrap and turn green).
3. Under **Setup**, define a keyspace and table schema, then hit **Apply Schema**.
4. Try writing some data manually or importing a CSV.
5. Hover over a node, click the orange `🛑 stop` button to kill it, and try writing more data. Check the **Hints** tab to see Hinted Handoff in action!

---

## Why build this?

Distributed systems are notoriously hard to teach. Concepts like *Consistent Hashing*, *Gossip Protocols*, and *Eventual Consistency* sound great on paper, but are incredibly hard to visualize.

This platform was built to turn those abstract concepts into a visceral, interactive experience. When you see a WriteTimeout error because you requested `QUORUM` but only had 1 node alive, it suddenly clicks.

---

## Contributing
Feel free to fork, break, and improve! We're always looking to add support for more visual algorithms (like Merkle Trees for Anti-Entropy Repair or SSTable compaction visualizers).

*for any help or assistance or contributions email us at [khalil.abboud.1st@gmail.com].*
