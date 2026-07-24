#!/bin/sh

set -euo pipefail

echo "Repository root: $CI_PRIMARY_REPOSITORY_PATH"
cd "$CI_PRIMARY_REPOSITORY_PATH"

export HOMEBREW_NO_AUTO_UPDATE=1

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Installing Node with Homebrew..."
  brew install node
fi

# Homebrew may install binaries under /opt/homebrew/bin on Apple Silicon.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "Node path:"
command -v node

echo "Node version:"
node --version

echo "npm path:"
command -v npm

echo "npm version:"
npm --version

if [ -f package-lock.json ]; then
  echo "Installing JavaScript dependencies with npm ci..."
  npm ci
else
  echo "ERROR: package-lock.json not found."
  exit 1
fi

echo "Syncing Capacitor iOS dependencies..."
npx cap sync ios

echo "Verifying required Capacitor package directories..."

required_packages="
node_modules/@capacitor/share
node_modules/@capacitor/app
node_modules/@capacitor/browser
node_modules/@capacitor/push-notifications
node_modules/@revenuecat/purchases-capacitor
"

for package_path in $required_packages; do
  if [ ! -d "$package_path" ]; then
    echo "ERROR: Missing required package: $package_path"
    exit 1
  fi

  echo "Found: $package_path"
done

echo "Xcode Cloud dependency setup complete."
