load test_helper

@test "runs from PATH" {
  run itemsctl list
  [ "$status" -eq 0 ]
}
