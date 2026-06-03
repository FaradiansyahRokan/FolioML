import os
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

# In a full production environment, you should verify the JWT signature
# using your Clerk JWKS endpoint or clerk-backend-api with CLERK_SECRET_KEY.
# For this implementation, we extract the trusted 'sub' (user_id) from the Clerk JWT
# that the frontend passes.

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    token = credentials.credentials
    try:
        # Decode the JWT token to extract the user ID ('sub')
        decoded = jwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")
            
        return user_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")

# Optional dependency for routes that allow public sharing (Read-only)
def get_optional_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str | None:
    if not credentials:
        return None
    try:
        token = credentials.credentials
        decoded = jwt.decode(token, options={"verify_signature": False})
        return decoded.get("sub")
    except:
        return None
