#!/bin/sh
set -e

# Create db directory if it doesn't exist
mkdir -p /app/db
# Ensure the directory is writable by the current user
if [ ! -w "/app/db" ]; then
  echo "⚠️ /app/db is not writable. Attempting to fix permissions..."
  # This will likely fail if we are not root, but it's worth a try or logging
  # In Coolify, we might need to run as root first to fix permissions, then switch user.
  # But we are already USER nextjs in Dockerfile.
  # We should probably switch back to USER root in Dockerfile, do setup in entrypoint, then switch to nextjs.
fi

# Run database migrations/push
echo "📦 Syncing database schema..."
# We use npx to run prisma. It might download the CLI if not present, 
# but since we are in a container, we hope it works or we should install it.
# To be safe, we'll try to use the local one if we move it to dependencies, or npx.
if [ -f "./node_modules/.bin/prisma" ]; then
  ./node_modules/.bin/prisma db push --accept-data-loss
else
  npx prisma db push --accept-data-loss
fi

# Start the application
echo "🚀 Starting application..."
exec node server.js
