FROM cgr.dev/chainguard/python:3.12-dev AS builder

USER root
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN python -m pip install --no-cache-dir uv==0.9.5

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app

FROM cgr.dev/chainguard/python:3.12 AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /app /app

USER nonroot
EXPOSE 8000

ENTRYPOINT ["/app/.venv/bin/python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
