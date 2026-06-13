FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Ensure storage directories exist inside the container
RUN mkdir -p uploads chroma_db

EXPOSE 8000

# Start server using Uvicorn with single worker to keep ChromaDB lock simple
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
