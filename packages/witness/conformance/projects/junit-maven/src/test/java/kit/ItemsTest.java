package kit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class ItemsTest {
  static final String APP = System.getenv().getOrDefault("WITNESS_APP_URL", "http://127.0.0.1:8080");

  static String current;

  @BeforeEach
  void name(TestInfo info) {
    current = info.getTestClass().map(Class::getName).orElse("") + "#" + info.getTestMethod().map(m -> m.getName()).orElse("");
  }

  static String json(String s) {
    return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
  }

  /** Witness evidence: append what this test saw to its timeline (a no-op outside witness). */
  static void recordHttp(String method, String url, int status, String body) {
    String root = System.getenv("WITNESS_ARTIFACTS");
    if (root == null || current == null) return;
    try {
      Path dir = Path.of(root, current.replaceAll("[^\\w.@-]+", "_"));
      Files.createDirectories(dir);
      String line = "{\"v\":1,\"kind\":\"http\",\"data\":{\"method\":" + json(method) + ",\"url\":" + json(url) + ",\"status\":" + status + ",\"response\":{\"body\":" + json(body) + "}}}\n";
      Files.writeString(dir.resolve("evidence.jsonl"), line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    } catch (Exception e) {
      // evidence must never fail a test
    }
  }

  static HttpResponse<String> get(String path) throws Exception {
    HttpResponse<String> r = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(APP + path)).build(), HttpResponse.BodyHandlers.ofString());
    recordHttp("GET", APP + path, r.statusCode(), r.body());
    return r;
  }

  @Test
  void listsItems() throws Exception {
    HttpResponse<String> r = get("/api/items");
    assertEquals(200, r.statusCode());
    assertTrue(r.body().contains("\"apple\"") && r.body().contains("\"pear\""), r.body());
  }

  @Test
  void itemName() throws Exception {
    String body = get("/api/items/1").body();
    assertEquals("{\"id\":1,\"name\":\"banana\"}", body);
  }

  @Test
  @Disabled("kit: always skipped")
  void skipped() throws Exception {
    get("/api/items");
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "WITNESS_KIT_HANG", matches = "1")
  void hangs() throws Exception {
    get("/api/hang");
  }
}
