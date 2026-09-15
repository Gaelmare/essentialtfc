#!/usr/bin/env bash
#set -euo pipefail

# Make the zip, then use newest zip in current directory
packwiz cf export
newest_zip=$(ls -t -- *.zip 2>/dev/null | head -n1 || true)
if [[ -z "$newest_zip" ]]; then
  echo "No zip files found" >&2
  exit 1
fi

sed -e "/^Mod List:$/,$ d" README.md > README.md.tmp 
echo "Mod List:" >> README.md.tmp
packwiz list | sed -e 's/^/- /' >> README.md.tmp
mv README.md.tmp README.md

echo "Updated README.md"

SUMMARY="The pack I'd actually want to play if I was playing Vanilla TFC in 1.21."
if [[ ! "$newest_zip" == *"VitalTFC"* ]]; then
  echo "Not a VitalTFC zip, skipping TFCT update"
  ESSTFC=true
  SUMMARY="The pack I would recommend to a beginner vanilla TFC player in 1.21."
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
# add resource pack in manually
tmpzip=$(mktemp -u --suffix=.zip)
mkdir -p $tmpdir/overrides/resourcepacks && \
cp resourcepacks/Vexxed\ Visuals\ -\ TFC\ Canes.zip $tmpdir/overrides/resourcepacks/
(cd "$tmpdir" && zip -r -q "$tmpzip" .)
mv -f "$tmpzip" "$newest_zip"

zip -d "$newest_zip" overrides/icon.png
zip -u "$newest_zip" icon.png
echo "Updated $newest_zip"

if [[ "$ESSTFC" == "true" ]]; then
  echo "Not a VitalTFC zip, skipping TFCT update"
  exit 0
fi

tfczip="${newest_zip/VitalTFC/TFCT}"
cp "$newest_zip" $tfczip
zip -d "$tfczip" overrides/mods/voxy-0.2.16-beta+1.21.11.jar
zip -d "$tfczip" overrides/kubejs/server_scripts/main_server.js
echo "Updated $tfczip"

