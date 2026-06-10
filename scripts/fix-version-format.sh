#!/bin/bash
VERSION_FILE="VERSION"
if [ -f "$VERSION_FILE" ]; then
  CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '\r\n[:space:]')
  # 4자리에서 3자리로 변경 (x.y.z.w -> x.y.z)
  if printf '%s' "$CURRENT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    NEW_VERSION=$(echo "$CURRENT_VERSION" | cut -d. -f1-3)
    echo "$NEW_VERSION" > "$VERSION_FILE"
    echo "Fixed VERSION: $CURRENT_VERSION -> $NEW_VERSION"
  fi
fi
