from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_scoped_db
from scoped_db import ScopedDB

router = APIRouter(prefix="/v1/knowledge-bases", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


class SearchResult(BaseModel):
    results: list[dict]


@router.post("/{kb_id}/search", response_model=SearchResult)
async def search_knowledge_base(
    kb_id: UUID,
    body: SearchRequest,
    db: Annotated[ScopedDB, Depends(get_scoped_db)],
):
    raise HTTPException(status_code=501, detail="Search not yet implemented")
