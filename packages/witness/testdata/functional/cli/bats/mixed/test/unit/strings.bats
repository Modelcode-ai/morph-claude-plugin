load '../../lib/strings'

@test "trims both ends" {
  run trim "  a  "
  [ "$output" = "a" ]
}
