import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(tags=["feedback"])

PORTAL_ROLES = {"owner", "admin", "manager", "marketing", "staff", "viewer"}
OWNER_ROLES  = {"owner", "admin"}

def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in PORTAL_ROLES:
        raise HTTPException(status_code=403, detail="Tenant access only")
    return current_user

def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


class FeedbackSubmit(BaseModel):
    q1: Optional[bool] = None
    q2: Optional[bool] = None
    q3: Optional[bool] = None
    star_rating: int = 5
    comment: Optional[str] = None
    owner_name: Optional[str] = None
    user_role: Optional[str] = None


class InteractionLog(BaseModel):
    action: str
    page: Optional[str] = None
    metadata: Optional[dict] = None


class SuggestionCreate(BaseModel):
    title: str
    description: str
    category: str = "feature"
    priority: str = "medium"


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

    role = body.user_role or current_user.get("role", "owner")
    row = await db.fetchrow(
        """INSERT INTO tenant_feedback
               (tenant_id, restaurant_name, owner_name, q1_overall, q2_easy_to_use,
                q3_effective, star_rating, comment, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
           RETURNING id, status, created_at""",
        tenant_id,
        tenant["name"],
        body.owner_name or "",
        body.q1,
        body.q2,
        body.q3,
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


# ── Interaction logging ───────────────────────────────────────────────────────

@router.post("/portal/interaction")
async def log_interaction(
    body: InteractionLog,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    await db.execute(
        """INSERT INTO user_interactions (tenant_id, user_role, action, page, metadata)
           VALUES ($1, $2, $3, $4, $5)""",
        current_user["tenant_id"],
        current_user.get("role", "owner"),
        body.action[:100],
        (body.page or "")[:100],
        json.dumps(body.metadata or {}),
    )
    return {"ok": True}


# ── Admin: review feedback ────────────────────────────────────────────────────

@router.get("/admin/feedback")
async def list_all_feedback(
    status: Optional[str] = None,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    if status:
        rows = await db.fetch(
            "SELECT * FROM tenant_feedback WHERE status=$1 ORDER BY created_at DESC", status
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM tenant_feedback ORDER BY created_at DESC"
        )
    return [dict(r) for r in rows]


@router.patch("/admin/feedback/{feedback_id}/approve")
async def approve_feedback(feedback_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE tenant_feedback SET status='approved', approved_at=NOW() WHERE id=$1 RETURNING id, status",
        feedback_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return dict(row)


@router.patch("/admin/feedback/{feedback_id}/reject")
async def reject_feedback(feedback_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE tenant_feedback SET status='rejected', approved_at=NULL WHERE id=$1 RETURNING id, status",
        feedback_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return dict(row)


# ── Admin: improvement suggestions ───────────────────────────────────────────

@router.get("/admin/suggestions")
async def list_suggestions(
    status: Optional[str] = None,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    if status:
        rows = await db.fetch(
            "SELECT * FROM improvement_suggestions WHERE status=$1 ORDER BY created_at DESC", status
        )
    else:
        rows = await db.fetch("SELECT * FROM improvement_suggestions ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/admin/suggestions")
async def create_suggestion(
    body: SuggestionCreate,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        """INSERT INTO improvement_suggestions (title, description, category, priority, source)
           VALUES ($1, $2, $3, $4, 'admin') RETURNING *""",
        body.title, body.description, body.category, body.priority,
    )
    return dict(row)


@router.patch("/admin/suggestions/{suggestion_id}/approve")
async def approve_suggestion(suggestion_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE improvement_suggestions SET status='approved', reviewed_at=NOW() WHERE id=$1 RETURNING id, status",
        suggestion_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return dict(row)


@router.patch("/admin/suggestions/{suggestion_id}/reject")
async def reject_suggestion(suggestion_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE improvement_suggestions SET status='rejected', reviewed_at=NOW() WHERE id=$1 RETURNING id, status",
        suggestion_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return dict(row)


@router.get("/admin/insights")
async def get_insights(current_user=Depends(_require_admin), db=Depends(get_db)):
    feedback_stats = await db.fetchrow(
        """SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status='pending') AS pending,
            COUNT(*) FILTER (WHERE status='approved') AS approved,
            ROUND(AVG(star_rating)::numeric, 2) AS avg_rating,
            COUNT(*) FILTER (WHERE q1_overall = TRUE) AS q1_yes,
            COUNT(*) FILTER (WHERE q2_easy_to_use = TRUE) AS q2_yes,
            COUNT(*) FILTER (WHERE q3_effective = TRUE) AS q3_yes
           FROM tenant_feedback"""
    )
    recent_comments = await db.fetch(
        """SELECT restaurant_name, comment, star_rating, created_at
           FROM tenant_feedback
           WHERE comment IS NOT NULL AND comment <> ''
           ORDER BY created_at DESC LIMIT 10"""
    )
    top_interactions = await db.fetch(
        """SELECT action, page, COUNT(*) AS count
           FROM user_interactions
           GROUP BY action, page
           ORDER BY count DESC LIMIT 15"""
    )
    return {
        "feedback": dict(feedback_stats) if feedback_stats else {},
        "recent_comments": [dict(r) for r in recent_comments],
        "top_interactions": [dict(r) for r in top_interactions],
    }


# ── Public: approved testimonials for the landing page ───────────────────────

@router.get("/public/testimonials")
async def public_testimonials(db=Depends(get_db)):
    rows = await db.fetch(
        """SELECT restaurant_name, owner_name, star_rating, comment,
                  q1_overall, q2_easy_to_use, q3_effective, approved_at
           FROM tenant_feedback
           WHERE status='approved' AND comment IS NOT NULL AND comment <> ''
           ORDER BY approved_at DESC LIMIT 12""",
    )
    return [dict(r) for r in rows]
