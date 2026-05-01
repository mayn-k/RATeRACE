FROM node:20-slim

# Chromium runtime deps required by Puppeteer on Render/Docker
RUN apt-get update && apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
  libcairo2 fonts-liberation \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure Puppeteer downloads its own Chromium bundle
ENV PUPPETEER_SKIP_DOWNLOAD=false

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

# Memory note: Render free instance is 512 MB — close Puppeteer pages aggressively after each render
CMD ["node", "server.js"]
