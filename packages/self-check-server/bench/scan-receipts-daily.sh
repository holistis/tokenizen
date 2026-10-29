#!/usr/bin/env bash
# scan-receipts-daily.sh: the daily run of the public list of delivered scan reports.
#
#   bench/scan-receipts-daily.sh <feed-url> <logdir>
#
# Reads the feed, adds the reports that are not in the list yet (bench/scan-receipts.mjs fetch), writes the head of the list and stamps it with
# OpenTimestamps when something was added (only a hash leaves the machine). A stamp is pending at first; `ots upgrade <file>.ots` some hours
# later makes it confirmed, and until then it is not an anchor. OTS=/path/to/ots overrides the command.
# Exit status: 0 fine, 1 a step failed, 3 a report has a different hash than when it was logged (the list is left as it was).
set -uo pipefail
feed="${1:?usage: scan-receipts-daily.sh feed-url logdir}"
dir="${2:?usage: scan-receipts-daily.sh feed-url logdir}"
here="$(cd "$(dirname "$0")" && pwd)"
ots="${OTS:-ots}"
mkdir -p "$dir"
log="$dir/scan-receipts.jsonl"
before="$(cat "$log" 2>/dev/null | wc -l)"
node "$here/scan-receipts.mjs" fetch --feed="$feed" --log="$log"; status=$?
[ "$status" -ne 0 ] && [ "$status" -ne 3 ] && { echo "FAILED: fetch" >&2; exit 1; }
after="$(cat "$log" 2>/dev/null | wc -l)"
if [ "$after" -gt "$before" ]; then
  day="$(date -u +%Y%m%d-%H%M)"
  node "$here/scan-receipts.mjs" head --log="$log" --out="$dir/head-$day.txt" || { echo "FAILED: head" >&2; exit 1; }
  "$ots" stamp "$dir/head-$day.txt" || { echo "FAILED: stamp (is ots installed?)" >&2; exit 1; }
  echo "stamped: $dir/head-$day.txt.ots (upgrade it in a few hours: $ots upgrade $dir/head-$day.txt.ots)"
fi
exit "$status"
