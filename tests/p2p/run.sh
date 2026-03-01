#!/bin/bash
set -euo pipefail

NODE_A="http://nodea:3000"
NODE_B="http://nodeb:3000"
NODE_C="http://nodec:3000"
LOG="/logs/p2p-test.log"

mkdir -p /logs
: > "$LOG"

PASSED=0
FAILED=0
REQ_NUM=0

log() {
  echo "$1" | tee -a "$LOG"
}

# Wrapper around curl that logs the full request and response
api() {
  REQ_NUM=$((REQ_NUM + 1))
  local method="GET"
  local url=""
  local data=""
  local headers=()
  local extra_curl_args=()
  local silent_output=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -X) method="$2"; shift 2 ;;
      -d) data="$2"; shift 2 ;;
      -H) headers+=("$2"); shift 2 ;;
      --status-only) silent_output=true; shift ;;
      *) url="$1"; shift ;;
    esac
  done

  echo "" >> "$LOG"
  echo "──────────────────────────────────────" >> "$LOG"
  echo "REQUEST #${REQ_NUM}  $(date '+%H:%M:%S')" >> "$LOG"
  echo "${method} ${url}" >> "$LOG"
  for h in "${headers[@]+"${headers[@]}"}"; do
    echo "  Header: ${h}" >> "$LOG"
  done
  if [ -n "$data" ]; then
    echo "  Body: $(echo "$data" | jq -c . 2>/dev/null || echo "$data")" >> "$LOG"
  fi

  local curl_args=(-s -w "\n%{http_code}")
  for h in "${headers[@]+"${headers[@]}"}"; do
    curl_args+=(-H "$h")
  done
  if [ -n "$data" ]; then
    curl_args+=(-X "$method" -d "$data")
  elif [ "$method" != "GET" ]; then
    curl_args+=(-X "$method")
  fi
  curl_args+=("$url")

  local raw_output
  raw_output=$(curl "${curl_args[@]}" 2>/dev/null) || true

  local http_code
  http_code=$(echo "$raw_output" | tail -n1)
  local body
  body=$(echo "$raw_output" | sed '$d')

  echo "RESPONSE: HTTP ${http_code}" >> "$LOG"
  if [ -n "$body" ]; then
    echo "$body" | jq . >> "$LOG" 2>/dev/null || echo "$body" >> "$LOG"
  fi
  echo "──────────────────────────────────────" >> "$LOG"

  if [ "$silent_output" = true ]; then
    echo "$http_code"
  else
    echo "$body"
  fi
}

pass() {
  PASSED=$((PASSED + 1))
  log "  PASS: $1"
}

fail() {
  FAILED=$((FAILED + 1))
  log "  FAIL: $1"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass "$label"
  else
    fail "$label (expected='$expected', got='$actual')"
  fi
}

assert_not_empty() {
  local label="$1" value="$2"
  if [ -n "$value" ] && [ "$value" != "null" ]; then
    pass "$label"
  else
    fail "$label (value was empty or null)"
  fi
}

log ""
log "========================================"
log "  AnimeDB P2P Integration Test"
log "  $(date)"
log "========================================"
log ""

# ── 1. Wait for both nodes ──
log "[1] Waiting for nodes..."

wait_for() {
  local url="$1" name="$2"
  for i in $(seq 1 30); do
    if curl -sf "$url/api/config" > /dev/null 2>&1; then
      log "  $name is ready"
      return 0
    fi
    sleep 2
  done
  log "  $name failed to start"
  exit 1
}

wait_for "$NODE_A" "NodeA"
wait_for "$NODE_B" "NodeB"
wait_for "$NODE_C" "NodeC"
log ""

# ── 2. Verify instance identity ──
log "[2] Verifying instance identity..."

NET_A=$(api "$NODE_A/api/networking")
NET_B=$(api "$NODE_B/api/networking")
NET_C=$(api "$NODE_C/api/networking")

INSTANCE_ID_A=$(echo "$NET_A" | jq -r '.instanceId')
INSTANCE_ID_B=$(echo "$NET_B" | jq -r '.instanceId')
INSTANCE_ID_C=$(echo "$NET_C" | jq -r '.instanceId')
NAME_A=$(echo "$NET_A" | jq -r '.instanceName')
NAME_B=$(echo "$NET_B" | jq -r '.instanceName')
NAME_C=$(echo "$NET_C" | jq -r '.instanceName')
EXT_URL_A=$(echo "$NET_A" | jq -r '.externalUrl')
EXT_URL_B=$(echo "$NET_B" | jq -r '.externalUrl')
EXT_URL_C=$(echo "$NET_C" | jq -r '.externalUrl')

assert_eq "NodeA instance name" "NodeA" "$NAME_A"
assert_eq "NodeB instance name" "NodeB" "$NAME_B"
assert_eq "NodeC instance name" "NodeC" "$NAME_C"
assert_not_empty "NodeA instance ID" "$INSTANCE_ID_A"
assert_not_empty "NodeB instance ID" "$INSTANCE_ID_B"
assert_not_empty "NodeC instance ID" "$INSTANCE_ID_C"
assert_eq "NodeA external URL" "http://nodea:3000" "$EXT_URL_A"
assert_eq "NodeB external URL" "http://nodeb:3000" "$EXT_URL_B"
assert_eq "NodeC external URL" "http://nodec:3000" "$EXT_URL_C"

UNIQUE_IDS=true
if [ "$INSTANCE_ID_A" = "$INSTANCE_ID_B" ] || [ "$INSTANCE_ID_A" = "$INSTANCE_ID_C" ] || [ "$INSTANCE_ID_B" = "$INSTANCE_ID_C" ]; then
  UNIQUE_IDS=false
fi
if [ "$UNIQUE_IDS" = true ]; then
  pass "All instance IDs are unique"
else
  fail "Instance IDs should be unique"
fi
log ""

# ── 3. Create API keys ──
log "[3] Creating API keys..."

KEY_A_RESPONSE=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "test-key-for-B"}' "$NODE_A/api/keys")
KEY_A=$(echo "$KEY_A_RESPONSE" | jq -r '.key')
KEY_A_ID=$(echo "$KEY_A_RESPONSE" | jq -r '.id')

assert_not_empty "NodeA key generated" "$KEY_A"

KEY_B_RESPONSE=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "test-key-for-A"}' "$NODE_B/api/keys")
KEY_B=$(echo "$KEY_B_RESPONSE" | jq -r '.key')

assert_not_empty "NodeB key generated" "$KEY_B"

KEY_LIST_A=$(api "$NODE_A/api/keys")
KEY_COUNT_A=$(echo "$KEY_LIST_A" | jq 'length')
assert_eq "NodeA has 1 key listed" "1" "$KEY_COUNT_A"

LISTED_KEY_HAS_NO_RAW=$(echo "$KEY_LIST_A" | jq -r '.[0].key // "absent"')
assert_eq "Listed key does not expose raw key" "absent" "$LISTED_KEY_HAS_NO_RAW"
log ""

# ── 4. Test federation auth ──
log "[4] Testing federation auth..."

AUTH_FAIL=$(api --status-only "$NODE_A/api/federation/library")
assert_eq "No auth returns 401" "401" "$AUTH_FAIL"

AUTH_BAD=$(api --status-only -H "Authorization: Bearer bad_key" "$NODE_A/api/federation/library")
assert_eq "Bad key returns 401" "401" "$AUTH_BAD"

AUTH_OK=$(api --status-only -H "Authorization: Bearer $KEY_A" "$NODE_A/api/federation/library")
assert_eq "Valid key returns 200" "200" "$AUTH_OK"
log ""

# ── 5. Check federation library response ──
log "[5] Checking federation library response..."

LIB_A=$(api -H "Authorization: Bearer $KEY_A" "$NODE_A/api/federation/library")
LIB_A_NAME=$(echo "$LIB_A" | jq -r '.instanceName')
LIB_A_ID=$(echo "$LIB_A" | jq -r '.instanceId')
LIB_A_ITEMS=$(echo "$LIB_A" | jq '.items | length')

assert_eq "Federation returns instance name" "NodeA" "$LIB_A_NAME"
assert_eq "Federation returns instance ID" "$INSTANCE_ID_A" "$LIB_A_ID"
assert_eq "Library is empty initially" "0" "$LIB_A_ITEMS"
log ""

# ── 6. Add peers (bidirectional) ──
log "[6] Adding peers..."

ADD_A_ON_B=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeA\", \"url\": \"$NODE_A\", \"api_key\": \"$KEY_A\"}" \
  "$NODE_B/api/peers")
PEER_A_ON_B_ID=$(echo "$ADD_A_ON_B" | jq -r '.id')
PEER_A_ON_B_INST=$(echo "$ADD_A_ON_B" | jq -r '.instance_id')

assert_not_empty "Peer A added on B" "$PEER_A_ON_B_ID"
assert_eq "Peer stores NodeA's instance ID" "$INSTANCE_ID_A" "$PEER_A_ON_B_INST"

ADD_B_ON_A=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeB\", \"url\": \"$NODE_B\", \"api_key\": \"$KEY_B\"}" \
  "$NODE_A/api/peers")
PEER_B_ON_A_ID=$(echo "$ADD_B_ON_A" | jq -r '.id')
PEER_B_ON_A_INST=$(echo "$ADD_B_ON_A" | jq -r '.instance_id')

assert_not_empty "Peer B added on A" "$PEER_B_ON_A_ID"
assert_eq "Peer stores NodeB's instance ID" "$INSTANCE_ID_B" "$PEER_B_ON_A_INST"
log ""

# ── 7. Browse peer library ──
log "[7] Browsing peer library..."

BROWSE_A_FROM_B=$(api "$NODE_B/api/peers/$PEER_A_ON_B_ID/library")
BROWSE_NAME=$(echo "$BROWSE_A_FROM_B" | jq -r '.instanceName')
BROWSE_ITEMS=$(echo "$BROWSE_A_FROM_B" | jq '.items | length')

assert_eq "Browse returns NodeA's name" "NodeA" "$BROWSE_NAME"
assert_eq "Browse returns 0 items (empty library)" "0" "$BROWSE_ITEMS"
log ""

# ── 8. Peer listing ──
log "[8] Verifying peer listings..."

PEERS_ON_B=$(api "$NODE_B/api/peers")
PEER_COUNT_B=$(echo "$PEERS_ON_B" | jq 'length')
PEER_B_HAS_INSTANCE_ID=$(echo "$PEERS_ON_B" | jq -r '.[0].instance_id')
PEER_B_LAST_SEEN=$(echo "$PEERS_ON_B" | jq -r '.[0].last_seen')
PEER_B_NO_KEY=$(echo "$PEERS_ON_B" | jq -r '.[0].api_key // "absent"')

assert_eq "NodeB has 1 peer" "1" "$PEER_COUNT_B"
assert_not_empty "Peer has instance_id" "$PEER_B_HAS_INSTANCE_ID"
assert_not_empty "Peer has last_seen" "$PEER_B_LAST_SEEN"
assert_eq "Peer listing hides api_key" "absent" "$PEER_B_NO_KEY"
log ""

# ── 8b. Auto-sync (PATCH auto_replicate) ──
log "[8b] Testing auto-sync PATCH..."

PATCH_ENABLE=$(api -X PATCH -H "Content-Type: application/json" \
  -d '{"auto_replicate": true}' \
  "$NODE_B/api/peers/$PEER_A_ON_B_ID")
PATCH_AUTO=$(echo "$PATCH_ENABLE" | jq -r '.auto_replicate')
PATCH_SYNC_LIB=$(echo "$PATCH_ENABLE" | jq -r '.sync_library_id')
# SQLite returns 1/0 for INTEGER
assert_eq "PATCH enables auto_replicate" "1" "$PATCH_AUTO"
assert_eq "sync_library_id is null when not set" "null" "$PATCH_SYNC_LIB"

PEERS_AFTER_PATCH=$(api "$NODE_B/api/peers")
PEER_AUTO=$(echo "$PEERS_AFTER_PATCH" | jq -r '.[0].auto_replicate')
assert_eq "GET peers returns auto_replicate" "1" "$PEER_AUTO"

PATCH_DISABLE=$(api -X PATCH -H "Content-Type: application/json" \
  -d '{"auto_replicate": false}' \
  "$NODE_B/api/peers/$PEER_A_ON_B_ID")
PATCH_AUTO_OFF=$(echo "$PATCH_DISABLE" | jq -r '.auto_replicate')
assert_eq "PATCH disables auto_replicate" "0" "$PATCH_AUTO_OFF"
log ""

# ── 9. Announce (simulate URL change) ──
log "[9] Testing announce..."

ANNOUNCE_RES=$(api -X POST \
  -H "Authorization: Bearer $KEY_B" \
  -H "Content-Type: application/json" \
  -d "{\"instanceId\": \"$INSTANCE_ID_A\", \"url\": \"http://nodea-new:9999\"}" \
  "$NODE_B/api/federation/announce")

ANNOUNCE_UPDATED=$(echo "$ANNOUNCE_RES" | jq -r '.updated')
assert_eq "Announce updates peer URL" "true" "$ANNOUNCE_UPDATED"

PEERS_ON_B_AFTER=$(api "$NODE_B/api/peers")
UPDATED_URL=$(echo "$PEERS_ON_B_AFTER" | jq -r '.[0].url')
assert_eq "Peer URL updated after announce" "http://nodea-new:9999" "$UPDATED_URL"

# Restore original URL
api -X POST \
  -H "Authorization: Bearer $KEY_B" \
  -H "Content-Type: application/json" \
  -d "{\"instanceId\": \"$INSTANCE_ID_A\", \"url\": \"$NODE_A\"}" \
  "$NODE_B/api/federation/announce" > /dev/null

PEERS_ON_B_RESTORED=$(api "$NODE_B/api/peers")
RESTORED_URL=$(echo "$PEERS_ON_B_RESTORED" | jq -r '.[0].url')
assert_eq "Peer URL restored" "http://nodea:3000" "$RESTORED_URL"
log ""

# ── 10. Resolve (gossip) ──
log "[10] Testing resolve..."

RESOLVE_RES=$(api -H "Authorization: Bearer $KEY_A" \
  "$NODE_A/api/federation/resolve/$INSTANCE_ID_B")
RESOLVE_URL=$(echo "$RESOLVE_RES" | jq -r '.url')
RESOLVE_NAME=$(echo "$RESOLVE_RES" | jq -r '.name')

assert_eq "Resolve returns NodeB's URL" "http://nodeb:3000" "$RESOLVE_URL"
assert_eq "Resolve returns NodeB's name" "NodeB" "$RESOLVE_NAME"
log ""

# ── 11. Networking endpoint ──
log "[11] Testing networking endpoint..."

NET_INFO=$(api "$NODE_A/api/networking")
NET_INST_ID=$(echo "$NET_INFO" | jq -r '.instanceId')
NET_EXT_URL=$(echo "$NET_INFO" | jq -r '.externalUrl')

assert_eq "Networking returns instance ID" "$INSTANCE_ID_A" "$NET_INST_ID"
assert_eq "Networking returns external URL" "http://nodea:3000" "$NET_EXT_URL"
log ""

# ── 12. External URL override ──
log "[12] Testing external URL override..."

SET_URL_RES=$(api -X PUT -H "Content-Type: application/json" \
  -d '{"url": "http://custom.example.com:3000"}' \
  "$NODE_A/api/networking/external-url")
SET_URL=$(echo "$SET_URL_RES" | jq -r '.externalUrl')
assert_eq "External URL set" "http://custom.example.com:3000" "$SET_URL"

CLEAR_URL_RES=$(api -X PUT -H "Content-Type: application/json" \
  -d '{"url": null}' \
  "$NODE_A/api/networking/external-url")
CLEAR_URL=$(echo "$CLEAR_URL_RES" | jq -r '.externalUrl')
assert_eq "External URL cleared" "null" "$CLEAR_URL"

# Restore
api -X PUT -H "Content-Type: application/json" \
  -d '{"url": "http://nodea:3000"}' \
  "$NODE_A/api/networking/external-url" > /dev/null
log ""

# ── 13. Key revocation ──
log "[13] Testing key revocation..."

api -X DELETE "$NODE_A/api/keys/$KEY_A_ID" > /dev/null

REVOKED_STATUS=$(api --status-only -H "Authorization: Bearer $KEY_A" "$NODE_A/api/federation/library")
assert_eq "Revoked key returns 401" "401" "$REVOKED_STATUS"

KEY_A_NEW_RES=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "replacement-key"}' "$NODE_A/api/keys")
KEY_A_NEW=$(echo "$KEY_A_NEW_RES" | jq -r '.key')
assert_not_empty "Replacement key created" "$KEY_A_NEW"
log ""

# ── 14. Peer deletion ──
log "[14] Testing peer deletion..."

DEL_STATUS=$(api --status-only -X DELETE "$NODE_B/api/peers/$PEER_A_ON_B_ID")
assert_eq "Peer deleted returns 204" "204" "$DEL_STATUS"

PEERS_AFTER_DEL=$(api "$NODE_B/api/peers")
PEER_COUNT_AFTER=$(echo "$PEERS_AFTER_DEL" | jq 'length')
assert_eq "NodeB has 0 peers after delete" "0" "$PEER_COUNT_AFTER"
log ""

# ── 15. Three-node mesh setup ──
log "[15] Setting up 3-node mesh..."

# Clean up leftover peer from previous sections
api -X DELETE "$NODE_A/api/peers/$PEER_B_ON_A_ID" > /dev/null 2>&1 || true

# Create fresh API keys on each node
MESH_KEY_A=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "mesh-key"}' "$NODE_A/api/keys" | jq -r '.key')
MESH_KEY_B=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "mesh-key"}' "$NODE_B/api/keys" | jq -r '.key')
MESH_KEY_C=$(api -X POST -H "Content-Type: application/json" \
  -d '{"label": "mesh-key"}' "$NODE_C/api/keys" | jq -r '.key')

assert_not_empty "Mesh key A created" "$MESH_KEY_A"
assert_not_empty "Mesh key B created" "$MESH_KEY_B"
assert_not_empty "Mesh key C created" "$MESH_KEY_C"

# Build full mesh: each node adds the other two as peers
# A -> B, A -> C
MESH_A_B_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeB\", \"url\": \"$NODE_B\", \"api_key\": \"$MESH_KEY_B\"}" \
  "$NODE_A/api/peers" | jq -r '.id')
MESH_A_C_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeC\", \"url\": \"$NODE_C\", \"api_key\": \"$MESH_KEY_C\"}" \
  "$NODE_A/api/peers" | jq -r '.id')
assert_not_empty "A linked to B" "$MESH_A_B_ID"
assert_not_empty "A linked to C" "$MESH_A_C_ID"

# B -> A, B -> C
MESH_B_A_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeA\", \"url\": \"$NODE_A\", \"api_key\": \"$MESH_KEY_A\"}" \
  "$NODE_B/api/peers" | jq -r '.id')
MESH_B_C_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeC\", \"url\": \"$NODE_C\", \"api_key\": \"$MESH_KEY_C\"}" \
  "$NODE_B/api/peers" | jq -r '.id')
assert_not_empty "B linked to A" "$MESH_B_A_ID"
assert_not_empty "B linked to C" "$MESH_B_C_ID"

# C -> A, C -> B
MESH_C_A_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeA\", \"url\": \"$NODE_A\", \"api_key\": \"$MESH_KEY_A\"}" \
  "$NODE_C/api/peers" | jq -r '.id')
MESH_C_B_ID=$(api -X POST -H "Content-Type: application/json" \
  -d "{\"name\": \"NodeB\", \"url\": \"$NODE_B\", \"api_key\": \"$MESH_KEY_B\"}" \
  "$NODE_C/api/peers" | jq -r '.id')
assert_not_empty "C linked to A" "$MESH_C_A_ID"
assert_not_empty "C linked to B" "$MESH_C_B_ID"

# Verify mesh connectivity
A_PEER_COUNT=$(api "$NODE_A/api/peers" | jq 'length')
B_PEER_COUNT=$(api "$NODE_B/api/peers" | jq 'length')
C_PEER_COUNT=$(api "$NODE_C/api/peers" | jq 'length')
assert_eq "A has 2 peers" "2" "$A_PEER_COUNT"
assert_eq "B has 2 peers" "2" "$B_PEER_COUNT"
assert_eq "C has 2 peers" "2" "$C_PEER_COUNT"

# Verify cross-node library browsing works
BROWSE_C_FROM_A=$(api "$NODE_A/api/peers/$MESH_A_C_ID/library" | jq -r '.instanceName')
assert_eq "A can browse C's library" "NodeC" "$BROWSE_C_FROM_A"
log ""

# ── 16. Node goes offline, changes address, comes back ──
log "[16] Simulating node offline + address change..."

# NodeC changes its external URL (simulates coming back on a new IP/port)
api -X PUT -H "Content-Type: application/json" \
  -d '{"url": "http://nodec-new:5000"}' \
  "$NODE_C/api/networking/external-url" > /dev/null

# The PUT triggers auto-announce to all of C's peers (A and B)
sleep 1

# Verify A received the announce and updated C's URL
A_C_URL=$(api "$NODE_A/api/peers" | jq -r ".[] | select(.id == \"$MESH_A_C_ID\") | .url")
assert_eq "A has C's new URL after announce" "http://nodec-new:5000" "$A_C_URL"

# Verify B also received the announce
B_C_URL=$(api "$NODE_B/api/peers" | jq -r ".[] | select(.id == \"$MESH_B_C_ID\") | .url")
assert_eq "B has C's new URL after announce" "http://nodec-new:5000" "$B_C_URL"

# NodeC "stabilises" on its final new address
api -X PUT -H "Content-Type: application/json" \
  -d '{"url": "http://nodec-final:4000"}' \
  "$NODE_C/api/networking/external-url" > /dev/null
sleep 1

A_C_URL2=$(api "$NODE_A/api/peers" | jq -r ".[] | select(.id == \"$MESH_A_C_ID\") | .url")
assert_eq "A tracks C's final URL" "http://nodec-final:4000" "$A_C_URL2"

B_C_URL2=$(api "$NODE_B/api/peers" | jq -r ".[] | select(.id == \"$MESH_B_C_ID\") | .url")
assert_eq "B tracks C's final URL" "http://nodec-final:4000" "$B_C_URL2"

# Restore C to its real address
api -X PUT -H "Content-Type: application/json" \
  -d '{"url": "http://nodec:3000"}' \
  "$NODE_C/api/networking/external-url" > /dev/null
sleep 1

A_C_RESTORED=$(api "$NODE_A/api/peers" | jq -r ".[] | select(.id == \"$MESH_A_C_ID\") | .url")
assert_eq "A has C's restored URL" "http://nodec:3000" "$A_C_RESTORED"
log ""

# ── 17. Gossip resolve: A has stale URL for C, asks B ──
log "[17] Testing gossip resolve with stale record..."

# Corrupt A's record for C by sending a fake announce with C's instance ID
api -X POST \
  -H "Authorization: Bearer $MESH_KEY_A" \
  -H "Content-Type: application/json" \
  -d "{\"instanceId\": \"$INSTANCE_ID_C\", \"url\": \"http://dead-host:9999\"}" \
  "$NODE_A/api/federation/announce" > /dev/null

# Verify A now has the wrong URL for C
A_C_STALE=$(api "$NODE_A/api/peers" | jq -r ".[] | select(.id == \"$MESH_A_C_ID\") | .url")
assert_eq "A has stale URL for C" "http://dead-host:9999" "$A_C_STALE"

# B still has the correct URL for C
B_C_GOOD=$(api "$NODE_B/api/peers" | jq -r ".[] | select(.id == \"$MESH_B_C_ID\") | .url")
assert_eq "B still has correct URL for C" "http://nodec:3000" "$B_C_GOOD"

# A uses gossip resolve: queries B for C's current URL
RESOLVE_RES=$(api -X POST "$NODE_A/api/peers/$MESH_A_C_ID/resolve")
RESOLVE_OK=$(echo "$RESOLVE_RES" | jq -r '.resolved')
RESOLVE_VIA=$(echo "$RESOLVE_RES" | jq -r '.via')
assert_eq "Gossip resolved C" "true" "$RESOLVE_OK"
assert_eq "Resolved via B" "NodeB" "$RESOLVE_VIA"

# Verify A's record for C is now fixed
A_C_FIXED=$(api "$NODE_A/api/peers" | jq -r ".[] | select(.id == \"$MESH_A_C_ID\") | .url")
assert_eq "A's URL for C fixed via gossip" "http://nodec:3000" "$A_C_FIXED"

# Verify A can browse C's library again after fix
BROWSE_AFTER_FIX=$(api "$NODE_A/api/peers/$MESH_A_C_ID/library" | jq -r '.instanceName')
assert_eq "A can browse C after resolve" "NodeC" "$BROWSE_AFTER_FIX"
log ""

# ── Summary ──
TOTAL=$((PASSED + FAILED))
log "========================================"
log "  Results: $PASSED/$TOTAL passed"
if [ "$FAILED" -gt 0 ]; then
  log "  $FAILED FAILED"
  log "========================================"
  exit 1
else
  log "  All tests passed!"
  log "========================================"
  exit 0
fi
