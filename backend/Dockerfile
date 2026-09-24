# ---- deps: install all dependencies (incl. dev for the TypeScript build)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript to dist/
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled output + SQL migrations
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 4000
# Migrations and the demo seed run on startup (see src/index.ts).
CMD ["node", "dist/index.js"]
