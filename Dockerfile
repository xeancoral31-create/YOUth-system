FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server ci && npm --prefix client ci

COPY server ./server
COPY client ./client

RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV BGCYOUTH_DATA_DIR=/app/storage

VOLUME ["/app/storage"]
EXPOSE 4000

CMD ["npm", "start"]
