trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  echo "${s%"${s##*[![:space:]]}"}"
}
