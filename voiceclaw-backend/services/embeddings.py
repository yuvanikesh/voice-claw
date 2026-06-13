import asyncio
import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("embeddings_service")

# Global singleton model reference
_model = None

def get_model():
    global _model
    if _model is None:
        logger.info("Initializing SentenceTransformer model 'all-MiniLM-L6-v2'...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model

def sync_encode(chunks: list[str]) -> list[list[float]]:
    model = get_model()
    embeddings = model.encode(chunks)
    # Ensure conversion from numpy array to native python lists
    if hasattr(embeddings, "tolist"):
        return embeddings.tolist()
    return [list(map(float, vec)) for vec in embeddings]

async def embed_chunks(chunks: list[str]) -> list[list[float]]:
    if not chunks:
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, sync_encode, chunks)
