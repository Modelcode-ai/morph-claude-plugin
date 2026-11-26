RSpec.describe "items api" do
  it "lists items" do
    r = get("/api/items")
    expect(r.code).to eq("200")
    expect(JSON.parse(r.body).map { |i| i["name"] }).to eq(%w[apple pear])
  end

  it "item name" do
    expect(JSON.parse(get("/api/items/1").body)["name"]).to eq("banana")
  end

  it "skipped" do
    skip "kit: always skipped"
  end

  it "hangs" do
    skip "kit: hangs only when WITNESS_KIT_HANG=1" unless ENV["WITNESS_KIT_HANG"] == "1"
    get("/api/hang")
  end
end
