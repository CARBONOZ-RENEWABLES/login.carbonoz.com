#!/usr/bin/env bash
# Trim the ingest stream (default `ingest:readings`) to what every consumer
# group has finished with. Runs on the Redis host from a systemd timer
# (ingest-stream-trim.timer); safe to run by hand at any time.
#
# Redis is the temporary buffer, MongoDB the store. The Carbonoz bridge XACKs
# an entry only after every reading in it is stored in MongoDB (or recorded as
# a dead letter), so for each group:
#   - pending > 0: entries older than its oldest pending entry are processed;
#   - pending = 0: entries up to its last-delivered-id are processed.
# The trim point is the LOWEST of those over all groups (a slow or stopped
# group holds everything back), further limited to entries older than
# RETENTION_DAYS. XACK does not delete anything; only XTRIM does.
#
# Memory pressure (used_memory >= PRESSURE_PCT % of maxmemory): retention is
# ignored and every processed entry is trimmed. Unprocessed entries are never
# trimmed, whatever their age or the memory state.
#
# Race-free: group positions only move forward (unless an admin runs
# XGROUP SETID), so a position read before XTRIM is still safe after it.
#
# Refuses (exit 2) when the stream or its groups are missing: without a group
# nothing can tell which entries were processed.
#
# Environment (credentials only from the environment, never arguments):
#   REDIS_HOST      default 127.0.0.1
#   REDIS_PORT      default 6379
#   REDIS_USER      ACL user (recommended: a trim-only user, see docs)
#   REDISCLI_AUTH   password, read by redis-cli from the environment
#   STREAM          default ingest:readings
#   EXPECT_GROUPS   comma-separated groups that must exist (e.g. carbonoz-bridge)
#   RETENTION_DAYS  processed entries kept this long, default 7
#   PRESSURE_PCT    default 70
#   DRY_RUN=1       report only
#
# Exit: 0 ok; 1 Redis error; 2 refused (no stream/group); 3 memory still at
# or above PRESSURE_PCT after trimming (the backlog is unprocessed: check the
# bridge) - systemd marks the run failed so monitoring sees it.
set -euo pipefail

REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6379}
STREAM=${STREAM:-ingest:readings}
RETENTION_DAYS=${RETENTION_DAYS:-7}
PRESSURE_PCT=${PRESSURE_PCT:-70}
DRY_RUN=${DRY_RUN:-0}
EXPECT_GROUPS=${EXPECT_GROUPS:-}

log() { echo "ingest-stream-trim stream=$STREAM $*"; }
die() {
  log "$2" >&2
  exit "$1"
}

for n in RETENTION_DAYS PRESSURE_PCT REDIS_PORT; do
  [[ ${!n} =~ ^[0-9]+$ ]] || die 2 "refused: $n must be a whole number"
done

CLI=(redis-cli --raw --no-auth-warning -h "$REDIS_HOST" -p "$REDIS_PORT")
[ -n "${REDIS_USER:-}" ] && CLI+=(--user "$REDIS_USER")

# One command; output on stdout. Redis error replies (also printed with exit
# status 0 by some redis-cli versions) become exit 1, or 2 for a missing key.
r() {
  local out
  if ! out=$("${CLI[@]}" "$@" 2>&1); then
    die 1 "error: redis-cli $1 failed: $(head -n1 <<<"$out")"
  fi
  if [[ $(head -n1 <<<"$out") =~ ^(\(error\)\ )?(ERR|NOPERM|NOAUTH|WRONGPASS|WRONGTYPE|NOGROUP|OOM|LOADING|BUSY|MISCONF|READONLY|MASTERDOWN)\  ]]; then
    case $out in
      *"no such key"*) die 2 "refused: stream does not exist" ;;
      *) die 1 "error: $1: $(head -n1 <<<"$out")" ;;
    esac
  fi
  printf '%s\n' "$out"
}

# Stream ids compare as (ms, seq).
id_lt() {
  local a_ms=${1%-*} a_seq=${1#*-} b_ms=${2%-*} b_seq=${2#*-}
  ((a_ms < b_ms || (a_ms == b_ms && a_seq < b_seq)))
}

# --- groups: name, pending, last-delivered-id (flat key/value lines) -------
groups=$(r XINFO GROUPS "$STREAM" | tr -d '\r' | awk '
  NR % 2 == 1 { key = $0; next }
  key == "name" { if (name != "") print name, pending, last; name = $0; pending = ""; last = "" }
  key == "pending" { pending = $0 }
  key == "last-delivered-id" { last = $0 }
  END { if (name != "") print name, pending, last }')

[ -n "$groups" ] || die 2 "refused: no consumer group, cannot tell processed entries"

if [ -n "$EXPECT_GROUPS" ]; then
  IFS=, read -ra want <<<"$EXPECT_GROUPS"
  for g in "${want[@]}"; do
    awk -v g="$g" '$1 == g { found = 1 } END { exit !found }' <<<"$groups" ||
      die 2 "refused: expected group $g is missing"
  done
fi

floor=""
detail=""
while read -r name pending last; do
  [[ $pending =~ ^[0-9]+$ && $last =~ ^[0-9]+-[0-9]+$ ]] ||
    die 1 "error: cannot read position of group $name"
  if ((pending > 0)); then
    # XPENDING summary: count, smallest pending id, largest, consumers.
    safe=$(r XPENDING "$STREAM" "$name" | tr -d '\r' | sed -n 2p)
    [[ $safe =~ ^[0-9]+-[0-9]+$ ]] || die 1 "error: cannot read pending of group $name"
  else
    safe=$last
  fi
  detail+=" group=$name pending=$pending safe=$safe"
  if [ -z "$floor" ] || id_lt "$safe" "$floor"; then floor=$safe; fi
done <<<"$groups"

# --- retention and memory pressure -----------------------------------------
mem=$(r INFO memory | tr -d '\r')
used=$(awk -F: '$1 == "used_memory" { print $2 }' <<<"$mem")
max=$(awk -F: '$1 == "maxmemory" { print $2 }' <<<"$mem")
pressure() { [ "${max:-0}" -gt 0 ] && ((used * 100 >= max * PRESSURE_PCT)); }

now_ms=$(($(date +%s) * 1000))
cutoff="$((now_ms - RETENTION_DAYS * 86400000))-0"
if pressure; then
  minid=$floor
  why="memory ${used}/${max} >= ${PRESSURE_PCT}%: all processed entries"
elif id_lt "$cutoff" "$floor"; then
  minid=$cutoff
  why="processed entries older than ${RETENTION_DAYS}d"
else
  minid=$floor
  why="all processed entries (none newer than ${RETENTION_DAYS}d)"
fi

before=$(r XLEN "$STREAM")
if [ "$DRY_RUN" = 1 ]; then
  log "dry-run length=$before minid=$minid ($why)$detail"
  exit 0
fi

# XTRIM MINID keeps minid itself and everything newer.
removed=$(r XTRIM "$STREAM" MINID "$minid")
log "trimmed=$removed length=$((before - removed)) minid=$minid ($why)$detail"

# A group position older than the retention window: no entry finished for
# that long (consumer stopped, or no new data). Nothing unprocessed is
# trimmed; flagged for whoever owns the consumer.
if id_lt "$floor" "$cutoff"; then
  log "WARN: group position $floor is older than ${RETENTION_DAYS}d; check the consumers and the sender" >&2
fi

mem=$(r INFO memory | tr -d '\r')
used=$(awk -F: '$1 == "used_memory" { print $2 }' <<<"$mem")
if pressure; then
  die 3 "ALERT: memory ${used}/${max} still >= ${PRESSURE_PCT}% after trimming processed entries; check the bridge and other keys"
fi
