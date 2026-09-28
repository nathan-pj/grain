#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/build/Grain.app"
CONTENTS="$APP/Contents"
BACKEND="$CONTENTS/Resources/backend"
RUNTIME="$CONTENTS/Resources/runtime"
NODE_VERSION="v24.21.0"
NODE_ARCHIVE="node-$NODE_VERSION-darwin-arm64.tar.gz"
NODE_URL="https://nodejs.org/dist/$NODE_VERSION/$NODE_ARCHIVE"
NODE_CACHE="$ROOT/build/cache"

cd "$ROOT"
if [ ! -d node_modules ]; then npm ci; fi
npm run build
python3 - "$ROOT" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve()
for item in (root / "build/backend", root / "build/Grain.app"):
    if item.exists() and root in item.resolve().parents:
        shutil.rmtree(item)
PY
npm run build:server

mkdir -p "$CONTENTS/MacOS" "$BACKEND" "$RUNTIME/bin" "$NODE_CACHE"
cp native/Info.plist "$CONTENTS/Info.plist"
cp native/Grain.icns "$CONTENTS/Resources/Grain.icns"
cp -R dist "$BACKEND/dist"
cp -R build/backend/server "$BACKEND/server"
cp -R build/backend/src "$BACKEND/src"
cp package.json package-lock.json "$BACKEND/"

npm ci --omit=dev --ignore-scripts --prefix "$BACKEND"

if [ ! -f "$NODE_CACHE/$NODE_ARCHIVE" ]; then
  curl --fail --location --silent --show-error "$NODE_URL" --output "$NODE_CACHE/$NODE_ARCHIVE"
fi
curl --fail --location --silent --show-error "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" --output "$NODE_CACHE/SHASUMS256.txt"
(cd "$NODE_CACHE" && grep "  $NODE_ARCHIVE\$" SHASUMS256.txt | shasum -a 256 -c -)
tar -xzf "$NODE_CACHE/$NODE_ARCHIVE" -C "$NODE_CACHE"
cp "$NODE_CACHE/node-$NODE_VERSION-darwin-arm64/bin/node" "$RUNTIME/bin/node"
cp "$NODE_CACHE/node-$NODE_VERSION-darwin-arm64/LICENSE" "$RUNTIME/LICENSE"
chmod 755 "$RUNTIME/bin/node"

xcrun swiftc native/Images.swift -parse-as-library -O -target arm64-apple-macos14.0 \
  -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
  -o "$CONTENTS/MacOS/Images"
codesign --force --deep --sign - "$APP"

mkdir -p "$ROOT/release"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ROOT/release/Grain-macOS-arm64.zip"
shasum -a 256 "$ROOT/release/Grain-macOS-arm64.zip" > "$ROOT/release/Grain-macOS-arm64.zip.sha256"
echo "$APP"
