## CassandraEdu Simulator
- Frontend: React/Vite on port 5173
- Backend: FastAPI on port 8000
- Stack: Docker-in-Docker, real Cassandra containers on cassandra-net

## File structure
- backend/services/dockerService.py — Docker container management
- backend/services/node_service.py — node CRUD + wait logic
- backend/services/data_service.py — CQL read/write via cassandra-driver
- backend/routes/node_routes.py, cluster_routes.py, data_routes.py
- frontend/src/components/TokenRing.jsx — interactive SVG ring
- frontend/src/App.jsx — main UI
- frontend/src/services/api.js — API calls

## Known issues solved
- updates will come soon to this, or it might get removed
