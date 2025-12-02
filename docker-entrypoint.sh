#!/bin/sh
set -e

# Create db directory if it doesn't exist (though Docker volume handles this, permissions might be tricky)
mkdir -p /app/db

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
