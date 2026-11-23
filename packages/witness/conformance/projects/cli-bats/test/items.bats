setup() {
  PATH="$BATS_TEST_DIRNAME/../cli:$PATH"
}

@test "lists items" {
  run kit-items list
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'apple\npear')" ]
}

@test "item name" {
  run kit-items get 1
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
