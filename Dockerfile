FROM node:20-slim

WORKDIR /app

# Install first for a stable layer cache.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build both sides.
COPY server ./server
COPY client ./client
RUN npm run build

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["npm", "start"]
