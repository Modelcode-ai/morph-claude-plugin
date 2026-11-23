package kit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class ItemsTest {
  static final String APP = System.getenv().getOrDefault("WITNESS_APP_URL", "http://127.0.0.1:8080");

  static HttpResponse<String> get(String path) throws Exception {
    return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(APP + path)).build(), HttpResponse.BodyHandlers.ofString());
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
