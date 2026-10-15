#!/usr/bin/env bash
# Robot expressions (ADR 0060): docs/brand/robot/robot-<name>.png (transparent originals)
# → public/robot/robot-<name>-sm.webp (96 px tall, avisos y diálogos)
#   public/robot/robot-<name>-lg.webp (288 px tall, estados vacíos)
# Needs cwebp (brew install webp). Usage: scripts/robot-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for src in docs/brand/robot/robot-*.png; do
  name=$(basename "$src" .png)
  cwebp -quiet -q 90 -alpha_q 100 -m 6 -resize 0 96 "$src" -o "public/robot/${name}-sm.webp"
  cwebp -quiet -q 90 -alpha_q 100 -m 6 -resize 0 288 "$src" -o "public/robot/${name}-lg.webp"
done
