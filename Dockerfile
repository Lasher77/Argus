# --- Frontend bauen ---
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Backend bauen ---
FROM node:20-alpine AS backend
WORKDIR /backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# --- Laufzeit (ein einziger App-Container) ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=backend /backend/dist ./dist
COPY --from=backend /backend/drizzle ./drizzle
COPY --from=frontend /frontend/dist ./public
EXPOSE 3000
CMD ["node", "dist/index.js"]
