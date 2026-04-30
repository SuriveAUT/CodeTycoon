# Multi-stage build for Dev Tycoon
FROM node:20-alpine AS builder

WORKDIR /app

# Install frontend dependencies
COPY package*.json ./
RUN npm install

# Copy all files and build frontend
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend source
COPY backend/ ./backend/

# Expose port (default 3005)
EXPOSE 3005

# Environment variables
ENV PORT=3005
ENV NODE_ENV=production

# Run the unified server
CMD ["node", "backend/server.js"]
