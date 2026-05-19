from pydantic import BaseModel

class TableCreate(BaseModel):
    table_name: str
    columns: dict
    partition_key: list[str]
    clustering_key: list[str] = []

class TableResponse(BaseModel):
    keyspace: str
    table: str
    columns: dict
    partition_key: list[str]
    clustering_key: list[str]