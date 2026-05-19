from fastapi import APIRouter, HTTPException
from models.token import (
    EndpointsRequest, EndpointsResponse,
    RingResponse, DistributionResponse
)
from services.tokenService import get_endpoints, get_token_ring, get_data_distribution, explain_partition

router = APIRouter(prefix="/token", tags=["Token & Partitioning"])


@router.post("/{cluster_name}/{keyspace}/{table}/endpoints", response_model=EndpointsResponse)
def endpoints(cluster_name: str, keyspace: str, table: str, body: EndpointsRequest):
    """
    Retourne les nœuds responsables d'une partition key.
    Utilise nodetool getendpoints — inclut les réplicas selon le RF.
    """
    try:
        nodes = get_endpoints(cluster_name, keyspace, table, body.partition_key)
        return EndpointsResponse(
            keyspace=keyspace,
            table=table,
            partition_key=body.partition_key,
            endpoints=nodes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_name}/ring", response_model=RingResponse)
def ring(cluster_name: str):
    """
    Retourne le token ring complet du cluster.
    Montre la distribution des token ranges par nœud.
    """
    try:
        nodes = get_token_ring(cluster_name)
        return RingResponse(cluster_name=cluster_name, nodes=nodes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{cluster_name}/distribution", response_model=DistributionResponse)
def distribution(cluster_name: str):
    """
    Retourne le owns% et la charge par nœud.
    Permet de visualiser l'équilibre de la distribution des données.
    """
    try:
        nodes = get_data_distribution(cluster_name)
        return DistributionResponse(cluster_name=cluster_name, nodes=nodes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cluster_name}/{keyspace}/{table}/explain")
def explain(cluster_name: str, keyspace: str, table: str, body: EndpointsRequest):
    """
    Explique le cheminement d'une partition key dans le ring Murmur3.
    Retourne le hash, le nœud responsable, et les réplicas.
    """
    try:
        result = explain_partition(cluster_name, keyspace, table, body.partition_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))