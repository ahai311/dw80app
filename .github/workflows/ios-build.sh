#!/bin/bash
set -e

echo "=== iOS Build Script ==="
echo "Building iOS app..."

# Install dependencies
pod install

# Build
xcodebuild -workspace *.xcworkspace \
  -scheme "${SCHEME:-App}" \
  -configuration Release \
  -archivePath build/App.xcarchive \
  archive

# Export IPA
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/output

echo "=== Build Complete ==="
ls -la build/output/*.ipa
