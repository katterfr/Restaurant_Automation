"""
accounting/routes.py — REST API endpoints for accounting data.
Mounts at /accounting/*
"""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path

from accounting.cash_flow import get_cash_flow_statement
from accounting.pnl import get_pnl_statement
from accounting.loss_gain import get_loss_gain_summary
from accounting.ledger import get_account_balances
from accounting.spreadsheet import generate_workbook
from orchestrator.config import settings

router = APIRouter(prefix="/accounting", tags=["accounting"])


@router.get("/balances")
async def account_balances():
    return await get_account_balances()


@router.get("/pnl")
async def pnl(
    start: date = Query(default=date.today().replace(day=1)),
    end:   date = Query(default=date.today()),
):
    return await get_pnl_statement(start, end)


@router.get("/cash-flow")
async def cash_flow(
    start: date = Query(default=date.today().replace(day=1)),
    end:   date = Query(default=date.today()),
):
    return await get_cash_flow_statement(start, end)


@router.get("/loss-gain")
async def loss_gain(
    start: date = Query(default=date.today().replace(day=1)),
    end:   date = Query(default=date.today()),
):
    return await get_loss_gain_summary(start, end)


@router.get("/report/download")
async def download_report(
    start: date = Query(default=date.today().replace(day=1)),
    end:   date = Query(default=date.today()),
):
    """Generate and download an XLSX accounting workbook."""
    out_path = Path("reports") / f"report_{start}_{end}.xlsx"
    try:
        path = await generate_workbook(
            start_date=start,
            end_date=end,
            restaurant_name=settings.restaurant_name,
            output_path=out_path,
        )
        return FileResponse(
            path=str(path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=path.name,
        )
    except Exception as e:
        raise HTTPException(500, f"Report generation failed: {e}")
