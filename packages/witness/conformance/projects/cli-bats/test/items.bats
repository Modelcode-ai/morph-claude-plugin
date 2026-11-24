setup() {
  PATH="$BATS_TEST_DIRNAME/../cli:$PATH"
}

_json() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}
  printf '"%s"' "$s"
}

# Like bats' run, and appends the command and what it printed to the test's witness evidence (a no-op outside witness).
witness_run() {
  run "$@"
  [ -n "${WITNESS_ARTIFACTS:-}" ] || return 0
  local dir="$WITNESS_ARTIFACTS/$(printf '%s' "$(basename "$BATS_TEST_FILENAME")#$BATS_TEST_DESCRIPTION" | sed -E 's/[^A-Za-z0-9_.@-]+/_/g')"
  local argv="" a
  for a in "$@"; do argv="$argv${argv:+,}$(_json "$a")"; done
  mkdir -p "$dir"
  printf '{"v":1,"kind":"cli","data":{"argv":[%s],"exit":%s,"stdout":%s}}\n' "$argv" "$status" "$(_json "$output")" >> "$dir/evidence.jsonl"
}

@test "lists items" {
  witness_run kit-items list
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'apple\npear')" ]
}

@test "item name" {
  witness_run kit-items get 1
  [ "$status" -eq 0 ]
  [ "$output" = "banana" ]
}

@test "skipped" {
  skip "kit: always skipped"
}

@test "hangs" {
  [ "${WITNESS_KIT_HANG:-}" = "1" ] || skip "kit: hangs only when WITNESS_KIT_HANG=1"
  run kit-items hang
}
