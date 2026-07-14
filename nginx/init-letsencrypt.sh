#!/bin/bash
set -e

DOMAIN="chatapp.ibrahimmarangoz.com"
EMAIL="marangozibrahim49@gmail.com"

echo "Creating dummy certificate for $DOMAIN..."
docker compose run --rm --entrypoint "/bin/sh -c '\
  apk add --no-cache openssl >/dev/null && \
  mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
  -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
  -subj /CN=localhost'" certbot

echo "Starting nginx..."
docker compose up -d nginx

echo "Deleting dummy certificate..."
docker compose run --rm --entrypoint "/bin/sh -c '\
  rm -rf /etc/letsencrypt/live/$DOMAIN \
  /etc/letsencrypt/archive/$DOMAIN \
  /etc/letsencrypt/renewal/$DOMAIN.conf'" certbot

echo "Requesting real certificate..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d $DOMAIN --email $EMAIL --agree-tos --no-eff-email" certbot

echo "Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "Done. https://$DOMAIN should be live."
