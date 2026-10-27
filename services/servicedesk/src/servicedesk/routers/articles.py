from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from .. import service
from ..deps import ConnDep, require_api_key
from ..models import ArticleList, ArticleOut

router = APIRouter(prefix="/v1/articles", tags=["help center"], dependencies=[Depends(require_api_key)])


@router.get("", response_model=ArticleList)
def search_articles(
    conn: ConnDep,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> ArticleList:
    """Ranked articles for a free-text question; each item carries a 0-1 relevance `score`."""
    return service.search_articles(conn, q, limit)


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: str, conn: ConnDep) -> ArticleOut:
    return service.get_article(conn, article_id)
