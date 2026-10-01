FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
RUN addgroup -S app && adduser -S app -G app
# Use the same generated client and schema tools for database setup and API.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/prisma.config.ts ./prisma.config.ts
COPY --chown=app:app package*.json ./
COPY --chown=app:app entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER app
EXPOSE 4000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
