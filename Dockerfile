FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

USER pptruser

EXPOSE 3000
CMD ["node", "server.js"]