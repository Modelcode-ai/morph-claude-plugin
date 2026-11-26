require "json"
require "net/http"

APP = ENV.fetch("WITNESS_APP_URL", "http://127.0.0.1:8080")

require "fileutils"

RSpec.configure { |c| c.before { |example| $current_example = example } }

# Witness evidence: append what this test saw to its timeline (a no-op outside witness).
def record(kind, data)
  root = ENV["WITNESS_ARTIFACTS"]
  return unless root && $current_example
  key = "#{$current_example.file_path.delete_prefix("./")} > #{$current_example.full_description}"
  dir = File.join(root, key.gsub(/[^\w.@-]+/, "_"))
  FileUtils.mkdir_p(dir)
  File.open(File.join(dir, "evidence.jsonl"), "a") { |f| f.puts(JSON.generate({ v: 1, kind: kind, data: data })) }
end

def get(path)
  r = Net::HTTP.get_response(URI("#{APP}#{path}"))
  record("http", { method: "GET", url: "#{APP}#{path}", status: r.code.to_i, response: { body: r.body } })
  r
end
