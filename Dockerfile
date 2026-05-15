FROM node:20-slim

# Chromium runtime deps required by Puppeteer
RUN apt-get update && apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
  libcairo2 fonts-liberation \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=false
# Tell copyTemplates.js where to find rate-card.html and assets/
ENV FRONTEND_PUBLIC_PATH=/app/frontend-public

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .
# Copy Puppeteer template source files from the frontend
COPY frontend/public/rate-card.html /app/frontend-public/rate-card.html
COPY frontend/public/assets/        /app/frontend-public/assets/

EXPOSE 8080

# npm start runs prestart (copyTemplates.js) then node server.js
CMD ["npm", "start"]
