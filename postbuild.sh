#!/usr/bin/env bash
set -euo pipefail
SUMMARY="Testing TFCT Test"

# Find newest zip in current directory
newest_zip=$(ls -t -- *.zip 2>/dev/null | head -n1 || true)
if [[ -z "$newest_zip" ]]; then
  echo "No zip files found" >&2
  exit 1
fi

tmpdir=$(mktemp -d)
#trap 'rm -rf "$tmpdir"' EXIT

# Unzip into temp dir
unzip -q "$newest_zip" -d "$tmpdir"

# Locate manifest.json
manifest=$(find "$tmpdir" -type f -iname manifest.json -print -quit || true)
if [[ -z "$manifest" ]]; then
  echo "manifest.json not found in $newest_zip" >&2
  exit 1
fi

# Insert description line after the line containing "author"
# This keeps indentation of the author line if possible.
awk -v summary="$SUMMARY" '
  /"author"/ {
    print;
    # determine leading whitespace from current line
    match($0, /^[ \t]*/);
    lead = substr($0, RSTART, RLENGTH);
    print lead "\"description\": \"" summary "\",";
    next
  }
  { print }
' "$manifest" > "$manifest".tmp && mv "$manifest".tmp "$manifest"

# Rezip contents, preserving paths. Create temp zip then overwrite original.
tmpzip=$(mktemp -u --suffix=.zip)
(cd "$tmpdir" && zip -r -q "$tmpzip" .)
mv -f "$tmpzip" "$newest_zip"

#zip -d "$newest_zip" overrides/mods/voxy-0.2.16-beta+1.21.11.jar
zip -d "$newest_zip" overrides/icon.png
zip -u "$newest_zip" icon.png
echo "Updated $newest_zip"
