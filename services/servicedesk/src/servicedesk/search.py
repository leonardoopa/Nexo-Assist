"""Small lexical search (accent-insensitive, plural-tolerant, IDF-weighted) for articles and tickets."""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from typing import TypeVar

T = TypeVar("T")

_STOPWORDS = frozenset(
    "a o as os um uma uns umas de da do das dos e em no na nos nas para por com sem que se ao aos "
    "meu minha meus minhas seu sua seus suas esse essa isso este esta isto foi estou ser tem tenho "
    "nao mais muito ja ainda quando como qual quais pra pro desde".split()
)


def _strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _stem(token: str) -> str:
    """Drop the most common Portuguese plural endings so "senhas" matches "senha"."""
    if len(token) > 4 and token.endswith("oes"):
        return token[:-3] + "ao"
    if len(token) > 4 and token.endswith("ns"):
        return token[:-2] + "m"
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    plain = _strip_accents(text.lower())
    return [_stem(token) for token in re.findall(r"[a-z0-9]+", plain) if token not in _STOPWORDS and len(token) > 1]


def rank(
    docs: Sequence[T],
    query: str,
    fields: Callable[[T], Mapping[str, str]],
    weights: Mapping[str, float],
) -> list[tuple[T, float]]:
    """Score `docs` against `query`; the score is 1.0 when every query term hits the heaviest field."""
    query_tokens = set(tokenize(query))
    if not query_tokens or not docs:
        return []
    indexed = [{name: set(tokenize(text)) for name, text in fields(doc).items()} for doc in docs]
    document_frequency: Counter[str] = Counter()
    for doc_fields in indexed:
        document_frequency.update(set().union(*doc_fields.values()))

    total = len(docs)

    def idf(token: str) -> float:
        frequency = document_frequency[token]
        return math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))

    # Words that appear nowhere in the corpus must not drag the score down: the asker may simply
    # use a word the articles never use.
    known = [token for token in query_tokens if document_frequency[token] > 0]
    if not known:
        return []
    ceiling = sum(idf(token) for token in known) * max(weights.values())
    ranked: list[tuple[T, float]] = []
    for doc, doc_fields in zip(docs, indexed, strict=True):
        score = sum(
            idf(token) * max((weights[name] for name, tokens in doc_fields.items() if token in tokens), default=0.0)
            for token in known
        )
        if score > 0:
            ranked.append((doc, round(score / ceiling, 3)))
    ranked.sort(key=lambda pair: pair[1], reverse=True)
    return ranked
