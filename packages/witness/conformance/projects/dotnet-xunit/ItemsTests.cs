using System.Net.Http.Json;
using Xunit;

namespace Kit;

public record Item(int Id, string Name);

public class ItemsTests
{
    static readonly HttpClient Http = new() { BaseAddress = new Uri(Environment.GetEnvironmentVariable("WITNESS_APP_URL") ?? "http://127.0.0.1:8080"), Timeout = Timeout.InfiniteTimeSpan };

    [Fact]
    public async Task ListsItems()
    {
        var r = await Http.GetAsync("/api/items", TestContext.Current.CancellationToken);
        Assert.Equal(200, (int)r.StatusCode);
        var items = await r.Content.ReadFromJsonAsync<Item[]>(TestContext.Current.CancellationToken);
        Assert.Equal(["apple", "pear"], items!.Select(i => i.Name));
    }

    [Fact]
    public async Task ItemName()
    {
        var item = await Http.GetFromJsonAsync<Item>("/api/items/1", TestContext.Current.CancellationToken);
        Assert.Equal("banana", item!.Name);
    }

    [Fact(Skip = "kit: always skipped")]
    public void Skipped() { }

    [Fact]
    public async Task Hangs()
    {
        Assert.SkipUnless(Environment.GetEnvironmentVariable("WITNESS_KIT_HANG") == "1", "kit: hangs only when WITNESS_KIT_HANG=1");
        await Http.GetAsync("/api/hang");
    }
}
