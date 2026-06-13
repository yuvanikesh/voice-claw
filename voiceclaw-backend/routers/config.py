import logging
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Agent, Resource
from services import vector_store

logger = logging.getLogger("config_router")

router = APIRouter()

class ConfigRequest(BaseModel):
    business_name: str
    business_type: str
    primary_language: str
    greeting: str
    restrictions: str
    top_faqs: List[str]
    resource_ids: List[str]

@router.post("/config")
async def create_agent_config(
    request: ConfigRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        agent_id = str(uuid.uuid4())
        
        # Create and insert agent record
        agent = Agent(
            id=agent_id,
            business_name=request.business_name,
            business_type=request.business_type,
            primary_language=request.primary_language,
            greeting=request.greeting,
            restrictions=request.restrictions,
            top_faqs=request.top_faqs
        )
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        
        # Link resource records in DB and migrate their vectors in ChromaDB
        for r_id in request.resource_ids:
            res_result = await db.execute(select(Resource).where(Resource.id == r_id))
            resource = res_result.scalars().first()
            if resource:
                resource.agent_id = agent_id
                # Migrate vector store chunks to agent_id collection from temp_r_id
                await vector_store.migrate_resource_chunks(
                    temp_agent_id=f"temp_{r_id}",
                    target_agent_id=agent_id,
                    resource_id=r_id
                )
                
        await db.commit()
        
        return {
            "agent_id": agent_id
        }
    except Exception as e:
        logger.error(f"Error creating agent config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "Database error", "detail": str(e)})
