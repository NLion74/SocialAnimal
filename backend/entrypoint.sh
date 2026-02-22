#!/bin/sh
set -e

echo "Waiting for database to be ready..."
while ! nc -z db 5432; do
  sleep 1
done
echo "Database is ready"

echo "Running Prisma migrations..."
if npx prisma migrate deploy; then
  echo "Migrations completed successfully"
else
  echo "ERROR: Migration failed!" >&2
  exit 1
fi

echo "Starting application..."
exec node dist/index.js
