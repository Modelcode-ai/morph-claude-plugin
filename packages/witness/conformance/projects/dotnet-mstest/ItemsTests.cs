using System.Net.Http.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Kit;

public record Item(int Id, string Name);

[TestClass]
public class ItemsTests
{
    static readonly HttpClient Http = new() { BaseAddress = new Uri(Environment.GetEnvironmentVariable("WITNESS_APP_URL") ?? "http://127.0.0.1:8080"), Timeout = Timeout.InfiniteTimeSpan };

    [TestMethod]
    public async Task ListsItems()
    {
        var r = await Http.GetAsync("/api/items");
        Assert.AreEqual(200, (int)r.StatusCode);
        var items = await r.Content.ReadFromJsonAsync<Item[]>();
        CollectionAssert.AreEqual(new[] { "apple", "pear" }, items!.Select(i => i.Name).ToArray());
    }

    [TestMethod]
    public async Task ItemName()
    {
        var item = await Http.GetFromJsonAsync<Item>("/api/items/1");
        Assert.AreEqual("banana", item!.Name);
    }

    [TestMethod]
    [Ignore("kit: always skipped")]
    public void Skipped() { }

    [TestMethod]
    public async Task Hangs()
    {
        if (Environment.GetEnvironmentVariable("WITNESS_KIT_HANG") != "1") Assert.Inconclusive("kit: hangs only when WITNESS_KIT_HANG=1");
        await Http.GetAsync("/api/hang");
    }
}
