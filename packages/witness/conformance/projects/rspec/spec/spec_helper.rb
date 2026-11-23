require "json"
require "net/http"

APP = ENV.fetch("WITNESS_APP_URL", "http://127.0.0.1:8080")

def get(path)
  Net::HTTP.get_response(URI("#{APP}#{path}"))
end
