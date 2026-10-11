FROM node:24.11.0-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY apps/server ./apps/server
COPY packages ./packages
RUN npm run build:server

FROM node:24.11.0-alpine3.22 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DOMINO_DATA_DIR=/app/data
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist/server/main.mjs /app/main.mjs
USER node
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "/app/main.mjs"]
