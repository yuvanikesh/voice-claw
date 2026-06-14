# Stage 1: Build the Vite frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json tsconfig.json vite.config.ts server.ts index.html ./
COPY src ./src
COPY assets ./assets
RUN npm ci
RUN npm run build

# Stage 2: Final deployment container
FROM python:3.11-slim

# Install Node.js runtime and curl
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend requirements and install dependencies
COPY voiceclaw-backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Bake sentence-transformer embedding model into image to avoid downloads on startup
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy backend source code
COPY voiceclaw-backend ./backend

# Copy built frontend assets and dependencies from Stage 1
COPY --from=frontend-builder /app/dist ./dist
COPY --from=frontend-builder /app/package.json ./package.json
COPY --from=frontend-builder /app/node_modules ./node_modules

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Ensure persistence directories exist inside the container
RUN mkdir -p /data/uploads /data/chroma_db

# Default environment variables for SQLite and ChromaDB data persistence
ENV DATABASE_URL="sqlite:////data/voiceclaw.db"
ENV CHROMA_PERSIST_DIR="/data/chroma_db"
ENV UPLOAD_DIR="/data/uploads"
ENV BACKEND_URL="http://127.0.0.1:8000"
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["/app/start.sh"]
