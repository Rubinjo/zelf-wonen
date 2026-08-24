FROM python:3.12 AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN python -m pip install --no-cache-dir uv==0.9.5

WORKDIR /app
COPY pyproject.toml ./
# uv.lock is optional during early development; prefer --frozen once committed.
RUN uv sync --no-dev

COPY app ./app

FROM python:3.12 AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY --from=builder /app /app

# The cron service is a long-lived loop, not an HTTP server.
ENTRYPOINT ["/app/.venv/bin/python", "-m", "app.main"]
CMD ["run"]
