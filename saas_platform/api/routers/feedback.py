from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(tags=["feedback"])

PORTAL_ROLES = {"owner", "admin", "manager", "marketing", "staff", "viewer"}

def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in PORTAL_ROLES:
        raise HTTPException(status_code=403, detail="Tenant access only")
    return current_user

def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


class FeedbackSubmit(BaseModel):
    q1_overall: Optional[bool] = None
    q2_easy_to_use: Optional[bool] = None
    q3_effective: Optional[bool] = None
    star_rating: int = 5
    comment: Optional[str] = None
    owner_name: Optional[str] = None


# ── Restaurant portal: submit feedback ────────────────────────────────────────

@router.post("/portal/feedback")
async def submit_feedback(
    body: FeedbackSubmit,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    tenant_id = current_user["tenant_id"]
    tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if not 1 <= body.star_rating <= 5:
        raise HTTPException(status_code=400, detail="star_rating must be 1–5")

    row = await db.fetchrow(
        """INSERT INTO tenant_feedback
               (tenant_id, restaurant_name, owner_name, q1_overall, q2_easy_to_use,
                q3_effective, star_rating, comment, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
           RETURNING id, status, created_at""",
        tenant_id,
        tenant["name"],
        body.owner_name or "",
        body.q1_overall,
        body.q2_easy_to_use,
        body.q3_effective,
        body.star_rating,
        (body.comment or "").strip() or None,
    )
    return {"id": row["id"], "status": row["status"], "created_at": str(row["created_at"])}


@router.get("/portal/feedback/mine")
async def my_feedback(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM tenant_feedback WHERE tenant_id=$1 ORDER BY created_at DESC",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


# ── Admin: review feedback ────────────────────────────────────────────────────

@router.get("/admin/feedback")
async def list_all_feedback(
    status: Optional[str] = None,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    if status:
        rows = await db.fetch(
            "SELECT * FROM tenant_feedback WHERE status=$1 ORDER BY created_at DESC",
            status,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM tenant_feedback ORDER BY created_at DESC"
        )
    return [dict(r) for r in rows]


@router.patch("/admin/feedback/{feedback_id}/approve")
async def approve_feedback(
    feedback_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE tenant_feedback
           SET status='approved', approved_at=NOW()
           WHERE id=$1
           RETURNING id, status""",
        feedback_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"id": row["id"], "status": row["status"]}


@router.patch("/admin/feedback/{feedback_id}/reject")
async def reject_feedback(
    feedback_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        """UPDATE tenant_feedback
           SET status='rejected', approved_at=NULL
           WHERE id=$1
           RETURNING id, status""",
        feedback_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"id": row["id"], "status": row["status"]}


# ── Public: approved testimonials for the landing page ───────────────────────

@router.get("/public/testimonials")
async def public_testimonials(db=Depends(get_db)):
    rows = await db.fetch(
        """SELECT restaurant_name, owner_name, star_rating, comment,
                  q1_overall, q2_easy_to_use, q3_effective, approved_at
           FROM tenant_feedback
           WHERE status='approved' AND comment IS NOT NULL AND comment <> ''
           ORDER BY approved_at DESC
           LIMIT 12""",
    )
    return [dict(r) for r in rows]
