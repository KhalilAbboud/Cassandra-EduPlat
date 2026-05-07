from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal, Optional
from services.cassandraService import (
    create_keyspace, list_keyspaces,
    create_table, list_tables,
    insert_data, select_data
)

router = APIRouter(prefix="/data", tags=["Data"])

ConsistencyType = Literal["ONE", "QUORUM", "ALL"]
StrategyType = Literal["SimpleStrategy", "NetworkTopologyStrategy"]

# ─── Models ─────────────────────────────────────────────────────────

class KeyspaceCreate(BaseModel):
    keyspace_name: str
    replication_factor: int = 1
    strategy: StrategyType = "SimpleStrategy"

class TableCreate(BaseModel):
    table_name: str
    columns: dict           # {"col_name": "TYPE"} ex: {"id": "UUID", "name": "TEXT"}
    partition_key: list[str]
    clustering_key: list[str] = []

class InsertData(BaseModel):
    data: dict              # {"col": "value"}
    write_consistency: ConsistencyType = "QUORUM"

class SelectData(BaseModel):
    filters: Optional[dict] = {}
    read_consistency: ConsistencyType = "QUORUM"


# ─── Keyspace routes ────────────────────────────────────────────────

@router.post("/{cluster_name}/keyspace")
def create_keyspace_route(cluster_name: str, payload: KeyspaceCreate):
    return create_keyspace(
        cluster_name=cluster_name,
        keyspace_name=payload.keyspace_name,
        replication_factor=payload.replication_factor,
        strategy=payload.strategy
    )

@router.get("/{cluster_name}/keyspaces")
def list_keyspaces_route(cluster_name: str):
    return list_keyspaces(cluster_name)


# ─── Table routes ───────────────────────────────────────────────────

@router.post("/{cluster_name}/{keyspace_name}/table")
def create_table_route(cluster_name: str, keyspace_name: str, payload: TableCreate):
    return create_table(
        cluster_name=cluster_name,
        keyspace_name=keyspace_name,
        table_name=payload.table_name,
        columns=payload.columns,
        partition_key=payload.partition_key,
        clustering_key=payload.clustering_key
    )

@router.get("/{cluster_name}/{keyspace_name}/tables")
def list_tables_route(cluster_name: str, keyspace_name: str):
    return list_tables(cluster_name, keyspace_name)


# ─── Data routes ────────────────────────────────────────────────────

@router.post("/{cluster_name}/{keyspace_name}/{table_name}/insert")
def insert_data_route(cluster_name: str, keyspace_name: str, table_name: str, payload: InsertData):
    return insert_data(
        cluster_name=cluster_name,
        keyspace_name=keyspace_name,
        table_name=table_name,
        data=payload.data,
        write_consistency=payload.write_consistency
    )

@router.post("/{cluster_name}/{keyspace_name}/{table_name}/select")
def select_data_route(cluster_name: str, keyspace_name: str, table_name: str, payload: SelectData):
    return select_data(
        cluster_name=cluster_name,
        keyspace_name=keyspace_name,
        table_name=table_name,
        filters=payload.filters,
        read_consistency=payload.read_consistency
    )