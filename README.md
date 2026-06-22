# 🟡 CassandraEdu Simulator

An interactive educational platform for learning Apache Cassandra concepts through hands-on experimentation. Built with React, FastAPI, and real Cassandra containers via Docker-in-Docker.

> Developed as part of a Master's project in Data Science & AI at ENSA El Jadida (Chouaib Doukkali University).

---

## Features

- **Cluster Management** — Create, start, stop, and delete Cassandra clusters with a single click
- **Node Control** — Add or remove nodes dynamically, simulate node failures (UP/DOWN)
- **Token Ring Visualization** — Interactive SVG ring showing token ranges and data distribution across nodes
- **Partitioner Selection** — Switch between Murmur3Partitioner, RandomPartitioner, and ByteOrderedPartitioner
- **Keyspace & Table Management** — Create keyspaces with configurable replication strategy (SimpleStrategy / NetworkTopologyStrategy)
- **Data Operations** — Insert and query data with configurable consistency levels (ONE, QUORUM, ALL)
- **Hinted Handoff** — Visualize pending hints when a replica node is down
- **Read Repair** — Monitor and inspect read repair events across nodes
- **CAP Theorem Simulation** — Trigger consistency/availability trade-off scenarios
- **Gossip Protocol** — Observe inter-node gossip communication in real time
- **Guided Scenarios** — 9 built-in educational scenarios with step-by-step instructions

---

## Architecture

```
cassandra-eduPlat/
├── backend/                  # FastAPI application
│   ├── main.py               # App entry point + CORS
│   ├── routes/               # API routes (cluster, node, data, token, repair)
│   ├── services/             # Business logic (Docker, Cassandra, registry)
│   ├── models/               # Pydantic schemas
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React/Vite application
│   ├── src/
│   │   ├── App.jsx           # Main UI
│   │   ├── components/       # TokenRing, DocPanel, panels...
│   │   ├── services/api.js   # API client
│   │   └── utils/            # Token simulation helpers
│   └── Dockerfile
└── docker-compose.yml
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker socket access
- [Docker Compose](https://docs.docker.com/compose/)

### Run with Docker Compose

```bash
git clone https://github.com/your-username/cassandra-eduPlat.git
cd cassandra-eduPlat
docker compose up --build
```

Then open your browser:

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:5173    |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

### Stop the application

```bash
docker compose down
```

---

## API Overview

The backend exposes a RESTful API under `/api/v1`. Key endpoint groups:

| Prefix              | Description                        |
|---------------------|------------------------------------|
| `/api/v1/cluster`   | Create, delete, start/stop clusters |
| `/api/v1/nodes`     | Add, remove, and control nodes     |
| `/api/v1/data`      | Keyspace, table, insert, select    |
| `/api/v1/token`     | Token ring, distribution, gossip   |
| `/api/v1/repair`    | Hinted handoff and read repair     |

Full interactive documentation available at `http://localhost:8000/docs` (Swagger UI).

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | React 18, Vite, SVG animations                  |
| Backend   | FastAPI, Python 3.11, Uvicorn                   |
| Database  | Apache Cassandra (via cassandra-driver)         |
| Infra     | Docker, Docker-in-Docker, Docker Compose        |

---

## Important Notes

- The backend requires access to the Docker socket (`/var/run/docker.sock`) to spawn Cassandra containers dynamically.
- Node recreation after deletion requires `nodetool removenode` — this is handled automatically by the backend.
- For parallel node joins, Cassandra is configured with `cassandra.consistent.rangemovement=false`.

---

## Authors

- **Chaima MATRAG** — [GitHub](https://github.com/ChaimaaMatrag)
- **Ayoub GOUAHSSOUN** — [GitHub](https://github.com/Ayoub-gOu)
- **Khalil ABBOUD** — [GitHub](https://github.com/KhalilAbboud/)

---

## License

This project is for educational purposes. Feel free to use and adapt it for learning or teaching distributed systems concepts.