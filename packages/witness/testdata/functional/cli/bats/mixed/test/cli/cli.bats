@test "lists items" {
  run "$BATS_TEST_DIRNAME/../../bin/itemsctl" list
  [ "$status" -eq 0 ]
  [ "$output" = "apple" ]
}
