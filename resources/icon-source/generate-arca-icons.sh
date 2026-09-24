#!/bin/bash
# Rebuild every ARCA app/tray icon from resources/icon-source/arca-symbol.svg.
# Produces: resources/build/{icon.icns,icon.png,icon.ico}, resources/icon.png,
# resources/icon-dev.png, resources/tray/arca-menu-barTemplate{,@2x}.png
# Requires: ImageMagick (brew install imagemagick), macOS iconutil.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SYMBOL="$SCRIPT_DIR/arca-symbol.svg"
BUILD_DIR="$PROJECT_DIR/resources/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

MAGICK_BIN=$(command -v magick || true)
if [ -z "$MAGICK_BIN" ]; then
  echo "Error: ImageMagick is required (brew install imagemagick)." >&2
  exit 1
fi

# Why the canvas inset: macOS expects the rounded tile to sit inside a transparent
# margin, and Windows/Linux crop nothing, so one 1024 master serves every target.
BACKGROUND='#ffffff'
GLYPH_FILL='#09090b'
BORDER='#e4e4e7'
GLYPH_PX=520
GLYPH_OFFSET=$(((1024 - GLYPH_PX) / 2))

sed "s/#ffffff/$GLYPH_FILL/g" "$SYMBOL" > "$TMP_DIR/symbol.svg"
"$MAGICK_BIN" -background none -density 600 "$TMP_DIR/symbol.svg" -resize "${GLYPH_PX}x${GLYPH_PX}" \
  "$TMP_DIR/glyph.png"

"$MAGICK_BIN" -size 1024x1024 xc:none \
  -fill "$BACKGROUND" -stroke "$BORDER" -strokewidth 4 -draw 'roundrectangle 100,100,923,923,185,185' -stroke none \
  "$TMP_DIR/glyph.png" -geometry "+${GLYPH_OFFSET}+${GLYPH_OFFSET}" -composite \
  "$BUILD_DIR/icon.png"
echo "  -> resources/build/icon.png (1024x1024)"

ICONSET_DIR="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"
for slot in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"; do
  set -- $slot
  "$MAGICK_BIN" "$BUILD_DIR/icon.png" -resize "$1x$1" "$ICONSET_DIR/$2"
done
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
echo "  -> resources/build/icon.icns"

# Why the repo script and not ImageMagick: Windows frames must stay PNG-compressed and
# glyph-filled, which config/scripts/trim-windows-icon-source.mjs owns (and gates in tests).
node "$PROJECT_DIR/config/scripts/trim-windows-icon-source.mjs"
echo "  -> resources/build/icon.ico"

"$MAGICK_BIN" "$BUILD_DIR/icon.png" -resize 256x256 "$RESOURCES_DIR/icon.png"
echo "  -> resources/icon.png (256x256)"

# Why the badge: side-by-side dev builds must be distinguishable in the Dock.
"$MAGICK_BIN" "$RESOURCES_DIR/icon.png" \
  -fill '#f97316' -draw 'circle 196,196 196,148' \
  -fill white -pointsize 56 -gravity NorthWest -font '/System/Library/Fonts/Supplemental/Arial Bold.ttf' \
  -annotate +176+168 'D' \
  "$RESOURCES_DIR/icon-dev.png"
echo "  -> resources/icon-dev.png (256x256)"

# Why black with alpha: macOS template images are tinted by the system, so only
# the glyph's coverage matters; any colour in them is discarded.
for size in 18 36; do
  target="$RESOURCES_DIR/tray/arca-menu-barTemplate.png"
  if [ "$size" = 36 ]; then
    target="$RESOURCES_DIR/tray/arca-menu-barTemplate@2x.png"
  fi
  sed "s/#ffffff/$GLYPH_FILL/g" "$SYMBOL" > "$TMP_DIR/symbol.svg"
"$MAGICK_BIN" -background none -density 600 "$TMP_DIR/symbol.svg" -resize "${size}x${size}" \
    -fill black -colorize 100 "$target"
  echo "  -> ${target#"$PROJECT_DIR"/}"
done

echo "Done."
