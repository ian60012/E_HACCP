FROM python:3.11-slim

WORKDIR /app

RUN useradd --create-home --uid 10001 mcp

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ehaccp_mcp ./ehaccp_mcp

USER mcp

EXPOSE 8765

CMD ["python", "-m", "ehaccp_mcp"]
