require "rails_helper"

RSpec.describe Order do
  it "sums its lines" do
    expect(Order.new(lines: [1, 2]).total).to eq(3)
  end
end
