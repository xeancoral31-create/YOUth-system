FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV BGCYOUTH_DATA_DIR=/app/storage

VOLUME ["/app/storage"]
EXPOSE 3000

CMD ["npm", "start"]
