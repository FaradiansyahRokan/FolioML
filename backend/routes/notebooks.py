import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database.connection import get_db
from utils.auth import get_current_user

router = APIRouter()

class NotebookSyncRequest(BaseModel):
    id: str
    data: dict

@router.get("/notebooks")
def list_notebooks(user_id: str = Depends(get_current_user)):
    """Fetch all notebooks for the user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, data FROM user_notebooks WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
        
    notebooks = []
    for r in rows:
        try:
            notebooks.append(json.loads(r["data"]))
        except:
            pass
    return notebooks

@router.put("/notebooks/{notebook_id}")
def save_notebook(notebook_id: str, request: NotebookSyncRequest, user_id: str = Depends(get_current_user)):
    """Save or update a notebook state."""
    if request.id != notebook_id:
        raise HTTPException(status_code=400, detail="ID mismatch")
        
    now = datetime.utcnow().isoformat() + "Z"
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO user_notebooks (id, user_id, data, updated_at) 
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at''',
            (notebook_id, user_id, json.dumps(request.data), now)
        )
    return {"status": "success"}

@router.delete("/notebooks/{notebook_id}")
def delete_notebook(notebook_id: str, user_id: str = Depends(get_current_user)):
    """Delete a notebook."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_notebooks WHERE id = ? AND user_id = ?", (notebook_id, user_id))
    return {"status": "success"}
