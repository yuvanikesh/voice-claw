import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from services import sarvam

logger = logging.getLogger("stt_router")

router = APIRouter()

@router.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    agent_id: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail={"error": "Invalid file", "detail": "Audio file is empty"})
            
        # Parse format from filename or content type
        audio_format = "webm"
        filename = audio.filename or ""
        if "." in filename:
            audio_format = filename.split(".")[-1]
        elif audio.content_type:
            audio_format = audio.content_type.split("/")[-1]
            
        # Call Sarvam AI STT
        result = await sarvam.speech_to_text_translate(audio_bytes, audio_format=audio_format)
        
        return {
            "text": result.get("transcript", ""),
            "source_lang": result.get("source_language_code", "en-IN"),
            "agent_id": agent_id
        }
    except sarvam.SarvamAPIError as e:
        logger.error(f"Sarvam API error in STT: {e.detail}")
        raise HTTPException(status_code=502, detail={"error": "Sarvam API error", "detail": str(e)})
    except Exception as e:
        logger.error(f"Unexpected error in STT router: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "Server error", "detail": str(e)})
