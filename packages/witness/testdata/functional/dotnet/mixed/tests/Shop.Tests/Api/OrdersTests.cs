using System.Net;
using Xunit;

namespace Shop.Tests.Api;

public class OrdersTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task ListsOrders()
    {
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/orders");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
