import logging
import httpx
from sqlalchemy import select
from config import settings
from database import AsyncSessionLocal
from models import Agent
from services import embeddings, vector_store

logger = logging.getLogger("rag_service")

class RAGError(Exception):
    pass

async def query_knowledge_base(agent_id: str, query_text: str, history: list[dict] = []) -> str:
    # 1. Fetch Agent configuration from database
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalars().first()
        if not agent:
            raise RAGError(f"Agent with ID {agent_id} not found in database.")
        
        business_name = agent.business_name
        restrictions = agent.restrictions

    try:
        # 2. Embed query_text
        query_vectors = await embeddings.embed_chunks([query_text])
        if not query_vectors:
            raise RAGError("Failed to calculate embedding for the search query.")
        query_vector = query_vectors[0]

        # 3. Retrieve top 4 matching document chunks from ChromaDB
        chunks = await vector_store.query_chunks(agent_id, query_vector, n_results=4)
        context = "\n\n".join(chunks) if chunks else "No background information available."

        # 4. Formulate System Prompt
        system_prompt = (
            f"You are a helpful voice assistant for {business_name}. "
            f"Answer using only the context below. Be concise — max 2 sentences. "
            f"Never make up information not in the context."
        )
        if restrictions:
            system_prompt += f" Restrictions: {restrictions}"
        system_prompt += f"\n\nContext:\n{context}"

        # 5. Build conversation history messages (limit to last 4 turns)
        history_messages = []
        for turn in history[-4:]:
            role = turn.get("role", "user")
            content = turn.get("content") or turn.get("text") or ""
            history_messages.append({"role": role, "content": content})

        # Assemble full list of message logs
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history_messages)
        messages.append({"role": "user", "content": query_text})

        # 6. Make request to Sarvam Chat Completion API
        url = "https://api.sarvam.ai/chat/completions"
        headers = {
            "API-Subscription-Key": settings.SARVAM_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "model": "sarvam-m",
            "messages": messages,
            "max_tokens": 200,
            "temperature": 0.3
        }

        logger.info(f"Submitting RAG query to Sarvam Chat completions for agent {agent_id}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                raise RAGError(f"Sarvam Chat completions API error {response.status_code}: {response.text}")
            
            res_data = response.json()
            choices = res_data.get("choices", [])
            if not choices:
                raise RAGError("Empty response choices from Sarvam Chat completions.")
            
            answer = choices[0].get("message", {}).get("content", "")
            return answer.strip()

    except Exception as e:
        logger.error(f"Error executing RAG query for agent {agent_id}: {e}")
        raise RAGError(f"RAG query execution failed: {e}")
