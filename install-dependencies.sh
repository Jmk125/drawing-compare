#!/bin/bash

# PDF Drawing Comparator - Dependency Installation Script
# This script installs the required system packages for PDF to image conversion

echo "Installing PDF conversion dependencies..."

# Update package list
sudo apt-get update

# Install poppler-utils (includes pdftoppm for PDF to image conversion)
echo "Installing poppler-utils..."
sudo apt-get install -y poppler-utils

echo ""
echo "Installation complete!"
echo ""
echo "Testing pdftoppm installation..."
if command -v pdftoppm &> /dev/null; then
    echo "✓ pdftoppm is installed and ready"
    pdftoppm -v
else
    echo "✗ pdftoppm installation failed"
    exit 1
fi

echo ""
echo "You can now start the server with: npm start"
