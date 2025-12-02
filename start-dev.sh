#!/bin/bash

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "🛑 Stopping existing Next.js instances..."

# Kill processes by name
# We use || true to suppress errors if no processes are found
pkill -f "next dev" || true
pkill -f "npm run dev" || true

# Kill processes on ports 3000-3010 just to be sure
echo "🔌 Freeing up ports 3000-3010..."
for port in {3000..3010}
do
  # Find PID using lsof, ignore errors, kill -9
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

echo "🧹 Cleaning .next directory to ensure fresh build..."
rm -rf .next

echo "🚀 Starting development server..."
npm run dev
