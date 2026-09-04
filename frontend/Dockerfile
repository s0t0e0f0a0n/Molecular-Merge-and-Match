# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_BASE_PATH=/ so the app is served from the root (no repo sub-path)
RUN VITE_BASE_PATH=/ npm run build

# Serve stage — nginx proxies /api/ to the backend container
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
