import asyncio
import logging
import chromadb
from config import settings

logger = logging.getLogger("vector_store")

_chroma_client = None

def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        logger.info(f"Initializing ChromaDB PersistentClient at {settings.CHROMA_PERSIST_DIR}...")
        _chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return _chroma_client

def _collection_name(agent_id: str) -> str:
    return f"{settings.COLLECTION_PREFIX}{agent_id}"

def _temp_collection_name(resource_id: str) -> str:
    return f"{settings.COLLECTION_PREFIX}{settings.TEMP_COLLECTION_PREFIX}{resource_id}"

def sync_store_chunks(agent_id: str, resource_id: str, chunks: list[str], embeddings: list[list[float]]) -> int:
    if not chunks:
        return 0
    
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=_collection_name(agent_id))
    
    ids = [f"{resource_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"resource_id": resource_id, "chunk_index": i} for i in range(len(chunks))]
    
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )
    return len(chunks)

async def store_chunks(agent_id: str, resource_id: str, chunks: list[str], embeddings: list[list[float]]) -> int:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, sync_store_chunks, agent_id, resource_id, chunks, embeddings
    )

def sync_query_chunks(agent_id: str, query_embedding: list[float], n_results: int = None) -> list[str]:
    if n_results is None:
        n_results = settings.RAG_TOP_K
    client = get_chroma_client()
    col_name = _collection_name(agent_id)
    
    # Check if collection exists first to avoid exception
    try:
        collection = client.get_collection(name=col_name)
    except Exception:
        logger.warning(f"ChromaDB collection {col_name} does not exist. Returning empty results.")
        return []
        
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results
    )
    
    if results and "documents" in results and results["documents"]:
        return results["documents"][0]
    return []

async def query_chunks(agent_id: str, query_embedding: list[float], n_results: int = None) -> list[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, sync_query_chunks, agent_id, query_embedding, n_results
    )

def sync_delete_resource_chunks(agent_id: str, resource_id: str) -> None:
    client = get_chroma_client()
    col_name = _collection_name(agent_id)
    
    try:
        collection = client.get_collection(name=col_name)
        collection.delete(where={"resource_id": resource_id})
        logger.info(f"Deleted chunks for resource_id {resource_id} from collection {col_name}")
    except Exception as e:
        logger.warning(f"Failed to delete resource {resource_id} from ChromaDB: {e}")

async def delete_resource_chunks(agent_id: str, resource_id: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, sync_delete_resource_chunks, agent_id, resource_id
    )

def sync_migrate_resource_chunks(temp_agent_id: str, target_agent_id: str, resource_id: str) -> None:
    client = get_chroma_client()
    temp_col = _collection_name(temp_agent_id)
    target_col = _collection_name(target_agent_id)
    
    try:
        temp_collection = client.get_collection(name=temp_col)
        target_collection = client.get_or_create_collection(name=target_col)
        
        results = temp_collection.get(
            where={"resource_id": resource_id},
            include=["embeddings", "documents", "metadatas"]
        )
        
        if results and results["ids"]:
            target_collection.add(
                ids=results["ids"],
                embeddings=results["embeddings"],
                metadatas=results["metadatas"],
                documents=results["documents"]
            )
            temp_collection.delete(ids=results["ids"])
            logger.info(f"Successfully migrated chunks for resource_id {resource_id} from {temp_col} to {target_col}")
    except Exception as e:
        logger.error(f"Failed to migrate resource {resource_id} chunks: {e}")

async def migrate_resource_chunks(temp_agent_id: str, target_agent_id: str, resource_id: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, sync_migrate_resource_chunks, temp_agent_id, target_agent_id, resource_id
    )
