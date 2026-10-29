#!/usr/bin/env bash
# cra-weekly.sh: the weekly run of the Signal log, by hand, on the server.
#
#   bench/cra-weekly.sh <repos.txt> <logdir>
#
# repos.txt: one owner/name per line (blank lines and lines starting with # are skipped).
# For every repository one line is added to its log (bench/cra-log.mjs append: the same code as the website), then the heads of all logs are
# written to heads-<date>.txt and that file is stamped with OpenTimestamps (only a hash leaves the machine). A stamp is pending at first;
# run `ots upgrade heads-<date>.txt.ots` some hours later and it becomes confirmed. Until then it is not an anchor.
# OTS=/path/to/ots overrides the command. A repository that fails is reported and does not stop the others; the exit status is then 1.
set -uo pipefail
repos="${1:?usage: cra-weekly.sh repos.txt logdir}"
dir="${2:?usage: cra-weekly.sh repos.txt logdir}"
here="$(cd "$(dirname "$0")" && pwd)"
ots="${OTS:-ots}"
day="$(date -u +%Y%m%d)"
mkdir -p "$dir"
failed=0
while IFS= read -r repo || [ -n "$repo" ]; do
  repo="${repo%%#*}"; repo="$(echo "$repo" | tr -d '[:space:]')"
  [ -z "$repo" ] && continue
  node "$here/cra-log.mjs" append --repo="$repo" --dir="$dir" || { echo "FAILED: $repo" >&2; failed=1; }
done < "$repos"
node "$here/cra-log.mjs" heads --dir="$dir" --out="$dir/heads-$day.txt" || { echo "FAILED: heads" >&2; exit 1; }
"$ots" stamp "$dir/heads-$day.txt" || { echo "FAILED: stamp (is ots installed? see the README)" >&2; exit 1; }
echo "done: $dir/heads-$day.txt and $dir/heads-$day.txt.ots (upgrade it in a few hours: $ots upgrade $dir/heads-$day.txt.ots)"
exit $failed
