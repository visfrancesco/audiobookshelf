ARG NUSQLITE3_DIR="/usr/local/lib/nusqlite3"
ARG NUSQLITE3_PATH="${NUSQLITE3_DIR}/libnusqlite3.so"

### Build the Laravel assets and production PHP dependencies ###
FROM node:22-alpine AS build-web-assets
WORKDIR /web
COPY web/package*.json ./
RUN CYPRESS_INSTALL_BINARY=0 npm ci
COPY web/resources ./resources
COPY web/vite.config.js ./
RUN npm run build

FROM node:22-alpine AS build-web
RUN apk add --no-cache php85 php85-phar php85-openssl php85-mbstring php85-dom php85-tokenizer php85-xml php85-xmlwriter php85-fileinfo php85-session php85-curl php85-pdo php85-iconv
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /web
COPY web/ ./
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && php85 /usr/local/bin/composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader --no-scripts \
    && php85 artisan package:discover \
    && chmod -R a+rX /web
COPY --from=build-web-assets /web/public/build ./public/build
RUN chmod -R a+rX /web/public

### STAGE 1: Build server ###
FROM node:22-alpine AS build-server

ARG NUSQLITE3_DIR
ARG TARGETPLATFORM

ENV NODE_ENV=production

RUN apk add --no-cache --update \
  curl \
  make \
  python3 \
  g++ \
  unzip

WORKDIR /server
COPY index.js package* /server
COPY /server /server/server

RUN case "$TARGETPLATFORM" in \
  "linux/amd64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-musl-x64.zip" ;; \
  "linux/arm64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-musl-arm64.zip" ;; \
  *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
  esac && \
  unzip /tmp/library.zip -d $NUSQLITE3_DIR && \
  rm /tmp/library.zip

RUN npm ci --only=production

### STAGE 2: Create minimal runtime image ###
FROM node:22-alpine

ARG NUSQLITE3_DIR
ARG NUSQLITE3_PATH

# Install only runtime dependencies
RUN apk add --no-cache --update \
  tzdata \
  ffmpeg \
  python3 \
  py3-pip \
  poppler-utils \
  tini \
  caddy \
  supervisor \
  php85 \
  php85-fpm \
  php85-mbstring \
  php85-openssl \
  php85-session \
  php85-fileinfo \
  php85-dom \
  php85-tokenizer \
  php85-xml \
  php85-xmlwriter \
  php85-curl \
  php85-pdo \
  php85-iconv

COPY tools/requirements-knowledge.txt /tmp/requirements-knowledge.txt
RUN python3 -m venv /opt/knowledge-tools \
  && /opt/knowledge-tools/bin/pip install --no-cache-dir -r /tmp/requirements-knowledge.txt \
  && rm /tmp/requirements-knowledge.txt
ENV PATH="/opt/knowledge-tools/bin:${PATH}"
LABEL org.opencontainers.image.title="KnowledgeShelf"
LABEL org.opencontainers.image.description="KnowledgeShelf audiobook, video and document narration server, based on Audiobookshelf"

WORKDIR /app

# Copy compiled frontend and server from build stages
COPY --from=build-web /web /app/web
COPY build/knowledgeshelf /etc/knowledgeshelf
COPY build/knowledgeshelf/php.ini /etc/php85/conf.d/99-knowledgeshelf.ini
COPY --from=build-server /server /app
COPY --from=build-server ${NUSQLITE3_PATH} ${NUSQLITE3_PATH}

EXPOSE 80

ENV PORT=80
ENV NODE_ENV=production
ENV CONFIG_PATH="/config"
ENV METADATA_PATH="/metadata"
ENV SOURCE="docker"
ENV NUSQLITE3_DIR=${NUSQLITE3_DIR}
ENV NUSQLITE3_PATH=${NUSQLITE3_PATH}

ENTRYPOINT ["tini", "--"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-80}/healthcheck" || exit 1
CMD ["/etc/knowledgeshelf/entrypoint.sh"]
