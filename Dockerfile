# Stage 1: Build the Noir circuit
FROM rust:1.75-slim AS noir-builder

# Install dependencies for Noir
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install noirup and nargo (latest stable)
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:${PATH}"
RUN noirup

# Copy circuit source
WORKDIR /circuit
COPY circuits/obsidian_batch_verifier/ .

# Compile the circuit
RUN nargo compile

# Stage 2: Build the TypeScript application
FROM node:20-slim AS ts-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 3: Production runtime
FROM node:20-slim AS runtime

# Install dependencies for WASM support
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled TypeScript
COPY --from=ts-builder /app/dist ./dist

# Copy compiled Noir circuit
COPY --from=noir-builder /circuit/target ./circuits/obsidian_batch_verifier/target

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Start the server
CMD ["node", "dist/index.js"]
