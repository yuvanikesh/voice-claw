import asyncio
import logging
from sentence_transformers import SentenceTransformer
from config import settings

logger = logging.getLogger("embeddings_service")

# Global singleton model reference
_model = None

def get_model():
    global _model
    if _model is None:
        model_name = settings.EMBEDDING_MODEL
        logger.info(f"Initializing SentenceTransformer model '{model_name}'...")
        _model = SentenceTransformer(model_name)
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
