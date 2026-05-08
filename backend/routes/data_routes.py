from fastapi import APIRouter
from models.keyspace import KeyspaceCreate, KeyspaceResponse
from models.table import TableCreate, TableResponse
from models.data import InsertData, SelectData
from services.cassandraService import (
    create_keyspace, list_keyspaces,
    create_table, list_tables,
    insert_data, select_data
)

router = APIRouter(prefix="/data", tags=["Data"])

# ─── Keyspace routes ────────────────────────────────────────────────

@router.post("/{cluster_name}/keyspace", response_model=KeyspaceResponse)
def create_keyspace_route(cluster_name: str, payload: KeyspaceCreate):
    return create_keyspace(
        cluster_name=cluster_name,
        keyspace_name=payload.keyspace_name,
        replication_factor=payload.replication_factor,
        strategy=payload.strategy
    )

@router.get("/{cluster_name}/keyspaces", response_model=list[str])
def list_keyspaces_route(cluster_name: str):
    return list_keyspaces(cluster_name)


# ─── Table routes ───────────────────────────────────────────────────

@router.post("/{cluster_name}/{keyspace_name}/table", response_model=TableResponse)
def create_table_route(cluster_name: str, keyspace_name: str, payload: TableCreate):
    return create_table(
        cluster_name=cluster_name,
        keyspace_name=keyspace_name,
        table_name=payload.table_name,
        columns=payload.columns,
        partition_key=payload.partition_key,
        clustering_key=payload.clustering_key
    )

@router.get("/{cluster_name}/{keyspace_name}/tables", response_model=list[str])
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