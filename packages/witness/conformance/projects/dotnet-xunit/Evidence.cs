using System.Text.Json;
using System.Text.RegularExpressions;
using Xunit;

namespace Kit;

/// <summary>Witness evidence: appends every HTTP exchange of the running test to its timeline (a no-op outside witness).</summary>
public sealed class EvidenceHandler() : DelegatingHandler(new HttpClientHandler())
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var response = await base.SendAsync(request, ct);
        var root = Environment.GetEnvironmentVariable("WITNESS_ARTIFACTS");
        var test = TestContext.Current.TestMethod is { } m ? $"{m.TestClass.TestClassName}#{m.MethodName}" : null;
        if (string.IsNullOrEmpty(root) || test is null) return response;
        await response.Content.LoadIntoBufferAsync(ct);
        var line = JsonSerializer.Serialize(new { v = 1, kind = "http", data = new { method = request.Method.Method, url = request.RequestUri?.ToString(), status = (int)response.StatusCode, response = new { body = await response.Content.ReadAsStringAsync(ct) } } });
        var dir = Path.Combine(root, Regex.Replace(test, @"[^\w.@-]+", "_"));
        Directory.CreateDirectory(dir);
        await File.AppendAllTextAsync(Path.Combine(dir, "evidence.jsonl"), line + "\n", ct);
        return response;
    }
}
