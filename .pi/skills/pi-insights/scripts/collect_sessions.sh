#!/bin/bash
# Pi Session Collector
# Collects metadata from Pi session files for insights analysis

# Check multiple possible session locations
SESSIONS_DIRS=(
    "${HOME}/.pi/agent/sessions"
    "${HOME}/projects/.pi/sessions"
)

# Find the first existing directory with files
SESSIONS_DIR=""
for dir in "${SESSIONS_DIRS[@]}"; do
    if [ -d "$dir" ] && find "$dir" -name "*.jsonl" -type f 2>/dev/null | head -1 | grep -q .; then
        SESSIONS_DIR="$dir"
        break
    fi
done

if [ -z "$SESSIONS_DIR" ]; then
    echo "No sessions directory found. Checked:"
    for dir in "${SESSIONS_DIRS[@]}"; do
        echo "  - $dir"
    done
    exit 1
fi

echo "=== Pi Session Collection ==="
echo "Directory: $SESSIONS_DIR"
echo ""

# Count sessions
session_count=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "Total session files: $session_count"

# Get date range
first_file=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f 2>/dev/null | sort | head -1)
last_file=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f 2>/dev/null | sort -r | head -1)

if [ -n "$first_file" ]; then
    first_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$first_file" 2>/dev/null || stat -c "%y" "$first_file" 2>/dev/null | cut -d' ' -f1)
    last_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$last_file" 2>/dev/null || stat -c "%y" "$last_file" 2>/dev/null | cut -d' ' -f1)
    echo "Date range: $first_date to $last_date"
fi
echo ""

# List working directories with session counts
echo "=== Working Directories ==="
for dir in "$SESSIONS_DIR"/*/; do
    if [ -d "$dir" ]; then
        count=$(find "$dir" -maxdepth 1 -name "*.jsonl" -type f 2>/dev/null | wc -l)
        if [ "$count" -gt 0 ]; then
            name=$(basename "$dir")
            echo "  $name: $count sessions"
        fi
    fi
done
echo ""

# Token summary
total_size=$(du -ch "$SESSIONS_DIR"/*/*.jsonl 2>/dev/null | tail -1 | cut -f1)
if [ -n "$total_size" ]; then
    echo "Total session data: $total_size"
fi
echo ""

# Sample a recent session
echo "=== Most Recent Session (first 10 entries) ==="
if [ -n "$last_file" ]; then
    echo "File: $(basename "$last_file")"
    echo ""
    head -10 "$last_file" | while read line; do
        echo "$line" | jq -r 'if .type == "message" then "[\(.message.role)] \(.message.content[0].text // "...")" else "[\(.type)]" end' 2>/dev/null || echo "$line" | cut -c1-200
    done
fi