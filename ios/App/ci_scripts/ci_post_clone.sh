#!/bin/sh

set -eu
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

echo "Repository root: $CI_PRIMARY_REPOSITORY_PATH"
cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "Node version:"
node --version

echo "npm version:"
npm --version

if [ -f package-lock.json ]; then
  echo "Installing JavaScript dependencies with npm ci..."
  npm ci
else
  echo "package-lock.json not found; using npm install..."
  npm install
fi

echo "Syncing Capacitor iOS dependencies..."
npx cap sync ios

echo "Verifying required Capacitor package directories..."

for package_path in \
  "node_modules/@capacitor/share" \
  "node_modules/@capacitor/app" \
  "node_modules/@capacitor/browser" \
  "node_modules/@capacitor/push-notifications" \
  "node_modules/@revenuecat/purchases-capacitor"
do
  if [ ! -d "$package_path" ]; then
    echo "ERROR: Missing required package: $package_path"
    exit 1
  fi
done

echo "Xcode Cloud dependency setup complete."
