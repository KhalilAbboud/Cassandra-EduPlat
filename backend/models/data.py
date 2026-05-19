from pydantic import BaseModel
from typing import Literal, Optional

ConsistencyType = Literal["ONE", "QUORUM", "ALL"]

class InsertData(BaseModel):
    data: dict
    write_consistency: ConsistencyType = "QUORUM"

class SelectData(BaseModel):
    filters: Optional[dict] = {}
    read_consistency: ConsistencyType = "QUORUM"