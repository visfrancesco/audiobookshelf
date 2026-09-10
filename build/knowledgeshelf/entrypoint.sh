#!/bin/sh
set -eu
umask 027
export SHELF_HTTP_PORT="${PORT:-80}"
export ROUTER_BASE_PATH="${ROUTER_BASE_PATH:-/audiobookshelf}"
export LARAVEL_STORAGE_PATH="${CONFIG_PATH:-/config}/knowledgeshelf-web"
export KNOWLEDGESHELF_BACKEND_URL="http://127.0.0.1:3333"
export APP_NAME=KnowledgeShelf APP_ENV=production APP_DEBUG=false
export SESSION_DRIVER=file SESSION_ENCRYPT=true CACHE_STORE=file LOG_CHANNEL=stderr
export SESSION_COOKIE=knowledgeshelf_session
(umask 022; mkdir -p "${CONFIG_PATH:-/config}")
chgrp nobody "${CONFIG_PATH:-/config}"
chmod g+x "${CONFIG_PATH:-/config}"
mkdir -p "$LARAVEL_STORAGE_PATH/framework/cache/data" "$LARAVEL_STORAGE_PATH/framework/sessions" "$LARAVEL_STORAGE_PATH/framework/views" "$LARAVEL_STORAGE_PATH/logs"
if [ -z "${APP_KEY:-}" ]; then
    shelf_key_file="${CONFIG_PATH:-/config}/knowledgeshelf-web.key"
    if [ ! -s "$shelf_key_file" ]; then
        php85 -r 'echo "base64:".base64_encode(random_bytes(32));' > "$shelf_key_file"
        chmod 600 "$shelf_key_file"
    fi
    APP_KEY="$(cat "$shelf_key_file")"
    export APP_KEY
fi
chown -R nobody:nobody "$LARAVEL_STORAGE_PATH"
chmod 700 "$LARAVEL_STORAGE_PATH"
cd /app/web
php85 artisan config:cache
php85 artisan route:cache
php85 artisan view:cache
chown -R root:nobody /app/web/bootstrap/cache
chmod -R g+rX /app/web/bootstrap/cache
chmod 640 /app/web/bootstrap/cache/config.php
chown -R nobody:nobody "$LARAVEL_STORAGE_PATH"
cd /app
exec supervisord -c /etc/knowledgeshelf/supervisord.conf
