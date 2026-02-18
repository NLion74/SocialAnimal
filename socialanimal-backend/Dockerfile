FROM node:25-alpine

WORKDIR /app

# Install deps needed for bcrypt
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install ALL deps (including dev for build)
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN npm run build

# Remove dev deps
RUN npm prune --production

EXPOSE 3000

CMD ["npm", "start"]
