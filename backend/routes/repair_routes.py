"""
routes/repair_routes.py

Endpoints for the two high-priority educational features:
  1. Hinted Handoff  — GET  /{cluster}/hints
  2. Read Repair     — GET  /{cluster}/repair-stats

Both parse real Cassandra diagnostics (nodetool tpstats, nodetool info)
and return structured JSON suitable for the React panels.
"""

from __future__ import annotations

import re
from typing import Optional
from fastapi import APIRouter, HTTPException
from services.dockerService import client          # same docker client used elsewhere

router = APIRouter(prefix="/repair", tags=["Hinted Handoff & Read Repair"])


# ─── Docker helpers (mirrors pattern from token_routes.py) ───────────────────

def _get_running_container(cluster_name: str):
    network_name = f"cassandra-net-{cluster_name}"
    for c in client.containers.list():
        c.reload()
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {}):
            return c
    raise Exception(f"No running container found for cluster '{cluster_name}'")


def _build_ip_to_name(cluster_name: str) -> dict:
    network_name = f"cassandra-net-{cluster_name}"
    mapping = {}
    for c in client.containers.list(all=True):
        c.reload()
        networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
        if network_name in networks:
            ip = networks[network_name].get("IPAddress", "")
            if ip:
                mapping[ip] = c.name
    return mapping


def _get_all_containers(cluster_name: str):
    """Return all containers (running or stopped) in the cluster network."""
    network_name = f"cassandra-net-{cluster_name}"
    result = []
    for c in client.containers.list(all=True):
        c.reload()
        if network_name in c.attrs.get("NetworkSettings", {}).get("Networks", {}):
            result.append(c)
    return result


# ─── nodetool tpstats parser ─────────────────────────────────────────────────

def _parse_tpstats(output: str) -> dict:
    """
    Extract HintedHandoff-related metrics from `nodetool tpstats` output.

    Relevant lines look like:
        HintedHandoff          0         0       0       0       0
        HintsService           0         0       0       0       0

    We also look for the "Message type" table lower down for hints in flight.
    Returns:
        {
            "hints_in_progress":  int,
            "hints_completed":    int,
            "hints_blocked":      int,
            "raw": str             # full tpstats output
        }
    """
    result = {
        "hints_in_progress": 0,
        "hints_completed":   0,
        "hints_blocked":     0,
    }

    for line in output.splitlines():
        stripped = line.strip()
        # Match lines like: "HintedHandoff   0   1234   0   0   5"
        # Columns: Pool Name | Active | Pending | Completed | Blocked | All time blocked
        if stripped.startswith("HintedHandoff") or stripped.startswith("HintsService"):
            parts = re.split(r"\s{2,}", stripped)
            if len(parts) >= 4:
                try:
                    result["hints_in_progress"] += int(parts[1])   # Active
                    result["hints_completed"]    += int(parts[3])   # Completed
                except ValueError:
                    pass
            if len(parts) >= 5:
                try:
                    result["hints_blocked"] += int(parts[4])
                except ValueError:
                    pass

    return result


def _parse_nodetool_info(output: str) -> dict:
    """
    Parse `nodetool info` for pending hints count.
    Looks for:  Pending Hints   : 42
    """
    for line in output.splitlines():
        m = re.match(r"\s*Pending Hints\s*:\s*(\d+)", line, re.IGNORECASE)
        if m:
            return {"pending_hints": int(m.group(1))}
    return {"pending_hints": 0}


# ─── /hints endpoint ─────────────────────────────────────────────────────────

@router.get("/{cluster_name}/hints")
def get_hints(cluster_name: str):
    """
    Returns pending hint counts per offline node, plus raw tpstats.

    Response shape:
    {
        "cluster_name": "TestCluster",
        "hints": [
            {
                "target_node": "NodeB",
                "key":         "key-001",         # simulated from pending count
                "coordinator": "NodeA",
                "mutation_ts": null
            },
            ...
        ],
        "total_pending":  12,
        "tpstats":        { "hints_in_progress": 0, "hints_completed": 42, ... },
        "raw_tpstats":    "..."
    }
    """
    try:
        container   = _get_running_container(cluster_name)
        ip_to_name  = _build_ip_to_name(cluster_name)
        all_conts   = _get_all_containers(cluster_name)

        # --- tpstats ---
        tp_result = container.exec_run("nodetool tpstats")
        raw_tpstats = tp_result.output.decode(errors="replace") if tp_result.exit_code == 0 else ""
        tpstats = _parse_tpstats(raw_tpstats)

        # --- nodetool info for pending hints ---
        info_result = container.exec_run("nodetool info")
        raw_info    = info_result.output.decode(errors="replace") if info_result.exit_code == 0 else ""
        info        = _parse_nodetool_info(raw_info)
        total_pending = info["pending_hints"] or tpstats["hints_in_progress"]

        # --- Which nodes are down? ---
        down_nodes = []
        for c in all_conts:
            if c.status != "running":
                down_nodes.append(c.name)

        # Build a hint entry per down node.
        # Cassandra doesn't expose per-key hint details via nodetool; we synthesise
        # plausible entries from the aggregate count so the UI has something to show.
        hints = []
        if down_nodes and total_pending > 0:
            per_node = max(1, total_pending // len(down_nodes))
            running_name = container.name
            for dn in down_nodes:
                for i in range(per_node):
                    hints.append({
                        "target_node": dn,
                        "key":         f"hint-{dn}-{i+1}",
                        "coordinator": running_name,
                        "mutation_ts": None,
                    })
        elif down_nodes:
            # Even if tpstats shows 0, show placeholder so the UI knows nodes are down
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


# ─── /repair-stats endpoint ──────────────────────────────────────────────────

def _parse_read_repair_stats(tpstats_output: str) -> dict:
    """
    Extract ReadRepairStage metrics from tpstats.
    Lines look like:
        ReadRepairStage   0   0   1234   0   0
    """
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


@router.get("/{cluster_name}/repair-stats")
def get_repair_stats(cluster_name: str):
    """
    Returns ReadRepairStage metrics from nodetool tpstats.

    Response shape:
    {
        "cluster_name":      "TestCluster",
        "total_read_repairs": 42,
        "read_repair_stage":  { "active": 0, "pending": 0, "completed": 42, "blocked": 0 },
        "repairs":            [],      # populated by frontend after simulated repairs
        "raw_tpstats":        "..."
    }
    """
    try:
        container = _get_running_container(cluster_name)

        tp_result   = container.exec_run("nodetool tpstats")
        raw_tpstats = tp_result.output.decode(errors="replace") if tp_result.exit_code == 0 else ""

        rr_stats    = _parse_read_repair_stats(raw_tpstats)
        total       = rr_stats["completed"]

        return {
            "cluster_name":       cluster_name,
            "total_read_repairs": total,
            "read_repair_stage":  rr_stats,
            "repairs":            [],   # frontend tracks individual repair events
            "raw_tpstats":        raw_tpstats,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))