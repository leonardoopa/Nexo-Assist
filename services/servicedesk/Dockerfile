FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install .

# `docker build --target test` (or the compose "test" profile) runs the suite.
FROM base AS test
RUN pip install ".[dev]"
COPY tests ./tests
CMD ["pytest"]

FROM base AS runtime
RUN useradd --create-home --uid 10001 app && mkdir /data && chown app /data
USER app
ENV SERVICEDESK_DB_PATH=/data/servicedesk.db
EXPOSE 8000
CMD ["uvicorn", "servicedesk.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
