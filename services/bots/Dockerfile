FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core packages/core
COPY services/bots services/bots
RUN pnpm install --frozen-lockfile --filter @batchelor/bots...
RUN pnpm --filter @batchelor/bots build

FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
WORKDIR /app/services/bots
CMD ["node", "dist/index.js"]
