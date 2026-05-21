import os
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile
import edge_tts

router = APIRouter()

class TTSRequest(BaseModel):
    text: str
    voice: str = "id-ID-ArdiNeural" # Indonesian male voice by default

@router.post("/tts")
async def generate_tts(req: TTSRequest):
    """Generate TTS audio from text using edge-tts."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    
    try:
        # Create a temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        temp_file.close()
        
        # Clean text for TTS (remove markdown bold, italic, headers)
        clean_text = req.text.replace("**", "").replace("*", "").replace("#", "")
        
        communicate = edge_tts.Communicate(clean_text, req.voice)
        await communicate.save(temp_file.name)
        
        return FileResponse(temp_file.name, media_type="audio/mpeg", filename="podcast.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
