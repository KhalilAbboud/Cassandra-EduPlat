"""
routes/repair_routes.py
"""

from __future__ import annotations

import re
from fastapi import APIRouter, HTTPException
from services.dockerService import client

router = APIRouter(prefix="/repair", tags=["Hinted Handoff & Read Repair"])


# ─── Cassandra node filter ────────────────────────────────────────────────────

def _is_cassandra_node(container) -> bool:
    """
    True only for Cassandra node containers (NodeA … NodeF).
    Handles Docker naming variants: "NodeA", "/NodeA", "NodeA-1", etc.
    Excludes anything with 'backend', 'proxy', 'nginx', 'db', etc.
    """
    raw = container.name.lstrip("/")          # strip leading slash
    # Take the first dash-segment: "NodeA" from "NodeA-1", "projectc" from "projectc-backend-1"
    segment = raw.split("-")[0]
    return bool(re.match(r"^[Nn]ode[A-Fa-f]$", segment))


# ─── Docker helpers ───────────────────────────────────────────────────────────

def _get_running_container(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    for c in client.containers.list():
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks and _is_cassandra_node(c):
            return c
    raise Exception(f"No running Cassandra node found for cluster '{cluster_name}'")


def _get_all_containers(cluster_name: str):
    """All Cassandra node containers (running or stopped) — backend excluded."""
    network_name = f"cassandra-net-{cluster_name}"
    result = []
    for c in client.containers.list(all=True):
        c.reload()
        if not _is_cassandra_node(c):
            continue
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {}):
            result.append(c)
    return result


def _build_ip_to_name(cluster_name: str) -> dict:
    network_name = f"cassandra-net-{cluster_name}"
    mapping = {}
    for c in client.containers.list(all=True):
        c.reload()
        if not _is_cassandra_node(c):
            continue
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks:
            ip = networks[network_name].get("IPAddress", "")
            if ip:
                mapping[ip] = c.name
    return mapping


# ─── Parsers ──────────────────────────────────────────────────────────────────

def _parse_tpstats(output: str) -> dict:
    result = {"hints_in_progress": 0, "hints_completed": 0, "hints_blocked": 0}
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("HintedHandoff") or stripped.startswith("HintsService"):
            parts = re.split(r"\s{2,}", stripped)
            if len(parts) >= 4:
                try:
                    result["hints_in_progress"] += int(parts[1])
                    result["hints_completed"]    += int(parts[3])
                except ValueError:
                    pass
            if len(parts) >= 5:
                try:
                    result["hints_blocked"] += int(parts[4])
                except ValueError:
                    pass
    return result


def _parse_nodetool_info(output: str) -> dict:
    for line in output.splitlines():
        m = re.match(r"\s*Pending Hints\s*:\s*(\d+)", line, re.IGNORECASE)
        if m:
            return {"pending_hints": int(m.group(1))}
    return {"pending_hints": 0}


def _parse_read_repair_stats(tpstats_output: str) -> dict:
    result = {"active": 0, "pending": 0, "completed": 0, "blocked": 0}
    for line in tpstats_output.splitlines():
        if "ReadRepairStage" in line or "ReadRepair" in line:
            parts = re.split(r"\s{2,}", line.strip())
            if len(parts) >= 4:
                try:
                    result["active"]    = int(parts[1])
                    result["pending"]   = int(parts[2])
                    result["completed"] = int(parts[3])
                except ValueError:
                    pass
            if len(parts) >= 5:
                try:
                    result["blocked"] = int(parts[4])
                except ValueError:
                    pass
    return result


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{cluster_name}/hints")
def get_hints(cluster_name: str):
    try:
        container = _get_running_container(cluster_name)
        all_conts = _get_all_containers(cluster_name)

        tp_result   = container.exec_run("nodetool tpstats")
        raw_tpstats = tp_result.output.decode(errors="replace") if tp_result.exit_code == 0 else ""
        tpstats     = _parse_tpstats(raw_tpstats)

        info_result   = container.exec_run("nodetool info")
        raw_info      = info_result.output.decode(errors="replace") if info_result.exit_code == 0 else ""
        info          = _parse_nodetool_info(raw_info)
        total_pending = info["pending_hints"] or tpstats["hints_in_progress"]

        # Only real Cassandra nodes that are stopped
        down_nodes = [c.name for c in all_conts if c.status != "running"]

        hints = []
        if down_nodes and total_pending > 0:
            per_node = max(1, total_pending // len(down_nodes))
            for dn in down_nodes:
                for i in range(per_node):
                    hints.append({
                        "target_node": dn,
                        "key":         f"hint-{dn}-{i+1}",
                        "coordinator": container.name,
                        "mutation_ts": None,
                    })
        elif down_nodes:
            for dn in down_nodes:
                hints.append({
                    "target_node": dn,
                    "key":         "pending…",
                    "coordinator": container.name,
                    "mutation_ts": None,
                })

        return {
            "cluster_name":  cluster_name,
            "hints":         hints,
            "total_pending": total_pending,
            "tpstats":       tpstats,
            "raw_tpstats":   raw_tpstats,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_name}/repair-stats")
def get_repair_stats(cluster_name: str):
    try:
        container = _get_running_container(cluster_name)

        tp_result   = container.exec_run("nodetool tpstats")
        raw_tpstats = tp_result.output.decode(errors="replace") if tp_result.exit_code == 0 else ""

        rr_stats = _parse_read_repair_stats(raw_tpstats)

        return {
            "cluster_name":       cluster_name,
            "total_read_repairs": rr_stats["completed"],
            "read_repair_stage":  rr_stats,
            "repairs":            [],
            "raw_tpstats":        raw_tpstats,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))