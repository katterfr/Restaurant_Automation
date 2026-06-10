from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from core.security import verify_password, hash_password, create_access_token, decode_token
from db.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM users WHERE email = $1", form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({
        "sub": str(user["id"]),
        "tenant": user["tenant_id"],
        "role": user["role"],
        "permissions": user["permissions"] if user["permissions"] else "[]",
        "display_name": user["display_name"] if user["display_name"] else "",
    })
    return TokenResponse(access_token=token)


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {"id": current_user["id"], "email": current_user["email"], "role": current_user["role"]}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    if not verify_password(body.current_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.execute(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        hash_password(body.new_password), current_user["id"],
    )
    return {"message": "Password updated successfully"}
