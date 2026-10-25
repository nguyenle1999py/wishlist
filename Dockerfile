FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8765
ENV DATABASE_PATH=/data/wishlist.db
ENV UPLOAD_DIR=/data/uploads
ENV DATA_DIR=/data

RUN mkdir -p /data/uploads
EXPOSE 8765
CMD ["node", "server/index.js"]
