FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@10.31.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build
CMD ["node", "dist/http.js"]
