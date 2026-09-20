# Imagen del backend, con el panel web dentro.
#
# El contexto de construcción es la RAÍZ del repositorio, no esta carpeta:
# el servidor compila también `src/data/`, que es la lógica de negocio que
# comparte con la app.
#
#   docker build -f server/Dockerfile \
#     --build-arg EXPO_PUBLIC_API_URL=https://urkiolacarservice.com \
#     -t urkiola-api .
#
# En Render: Dockerfile `server/Dockerfile`, contexto la raíz, y
# `EXPO_PUBLIC_API_URL` como build arg cuando se quiera servir también el panel web.

# ---------------------------------------------------------------- el panel
# Se compila aquí dentro porque `EXPO_PUBLIC_API_URL` se incrusta al
# compilar: la web tiene que saber a qué dirección hablar. Sin esa variable
# no se compila nada y la imagen queda como API a secas.
FROM node:22-alpine AS web
WORKDIR /app
ARG EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN if [ -n "$EXPO_PUBLIC_API_URL" ]; then \
      npx expo export --platform web --output-dir dist --clear; \
    else \
      mkdir -p dist && echo 'Sin EXPO_PUBLIC_API_URL: imagen sin panel web.'; \
    fi

# ------------------------------------------------------------- el servidor
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --no-audit --no-fund
COPY src/data ./src/data
COPY server ./server
RUN cd server && npm run build

# ---------------------------------------------------------------- imagen
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV URKIOLA_WEB=/app/dist

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=web /app/dist ./dist

# No arranca como root.
USER node
EXPOSE 8080
CMD ["node", "server/dist/server/src/index.js"]
