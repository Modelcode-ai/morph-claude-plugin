require "rails_helper"

RSpec.describe "Orders API", type: :request do
  it "lists orders" do
    get "/api/orders"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq([])
  end
end
