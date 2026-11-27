// TEST_OVERVIEW: CIMD fetches ignore extension metadata without changing recognized client identity or the shared JSON parser.
package org.keycloak.protocol.oauth2.cimd.clientpolicy.executor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.sun.net.httpserver.HttpServer;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.BiFunction;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.keycloak.Config;
import org.keycloak.connections.httpclient.HttpClientProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.representations.oidc.OIDCClientRepresentation;
import org.keycloak.services.clientpolicy.ClientPolicyException;
import org.keycloak.util.JsonSerialization;

class CimdMetadataTest {
  private HttpServer server;
  private CloseableHttpClient http;
  private ClientIdMetadataDocumentExecutor executor;

  @BeforeEach
  void start() throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.start();
    http = HttpClients.createDefault();
    HttpClientProvider provider = stub(HttpClientProvider.class, (method, args) -> switch (method) {
      case "getHttpClient" -> http;
      case "getMaxConsumedResponseSize" -> 5000L;
      default -> throw new AssertionError(method);
    });
    KeycloakSession session = stub(KeycloakSession.class, (method, args) -> {
      if (method.equals("getProvider") && args[0] == HttpClientProvider.class) return provider;
      throw new AssertionError(method);
    });
    Config.Scope scope = stub(Config.Scope.class, (method, args) -> {
      if (args != null && args.length == 2) return args[1];
      throw new AssertionError(method);
    });
    executor = new ClientIdMetadataDocumentExecutor(
        session, new ClientIdMetadataDocumentExecutorFactoryProviderConfig(scope));
    executor.setupConfiguration(new ClientIdMetadataDocumentExecutor.Configuration());
  }

  @AfterEach
  void stop() throws Exception {
    if (server != null) server.stop(0);
    if (http != null) http.close();
  }

  // TEST_SCENARIO: #21 — the optional field Pi publishes and an unrelated future extension do not prevent fetching a public client's recognized metadata.
  @Test
  void fetchesPiStyleMetadataWithExtensions() throws Exception {
    OIDCClientRepresentation client = fetch("""
        {
          "client_id": "https://pi.dev/oauth/client.json",
          "redirect_uris": ["http://127.0.0.1/callback", "http://localhost/callback"],
          "token_endpoint_auth_method": "none",
          "token_endpoint_auth_methods_supported": ["none"],
          "x_future_extension": {"enabled": true},
          "grant_types": ["authorization_code", "refresh_token"]
        }
        """);
    assertEquals("https://pi.dev/oauth/client.json", client.getClientId());
    assertEquals(List.of("http://127.0.0.1/callback", "http://localhost/callback"), client.getRedirectUris());
    assertEquals("none", client.getTokenEndpointAuthMethod());
    assertEquals(List.of("authorization_code", "refresh_token"), client.getGrantTypes());
  }

  // TEST_SCENARIO: #21 — lenient extension handling still rejects broken JSON and wrong types for recognized metadata.
  @ParameterizedTest
  @ValueSource(strings = {
      "{\"client_id\":",
      "[]",
      "{\"redirect_uris\": {\"callback\": \"http://localhost/callback\"}}",
      "{\"token_endpoint_auth_method\": {\"method\": \"none\"}}"
  })
  void rejectsMalformedOrMistypedMetadata(String body) {
    ClientPolicyException error = assertThrows(ClientPolicyException.class, () -> fetch(body));
    assertEquals("invalid_request", error.getError());
    assertEquals(AbstractClientIdMetadataDocumentExecutor.ERR_METADATA_PARSE_FAILED, error.getErrorDetail());
  }

  // TEST_SCENARIO: #21 — fetching an extended CIMD never makes the shared mapper accept unknown fields elsewhere.
  @Test
  void leavesTheSharedParserStrict() throws Exception {
    String body = "{\"client_id\": \"https://pi.dev/oauth/client.json\", \"x_future_extension\": true}";
    fetch(body);
    assertThrows(UnrecognizedPropertyException.class,
        () -> JsonSerialization.mapper.readValue(body, OIDCClientRepresentation.class));
  }

  // TEST_SCENARIO: #21 — a recognized identity that differs from the requested document remains invalid.
  @Test
  void rejectsADifferentClientIdentity() throws Exception {
    OIDCClientRepresentation client = fetch("""
        {"client_id": "https://other.example/client.json", "x_future_extension": true}
        """);
    ClientPolicyException error = assertThrows(ClientPolicyException.class, () ->
        executor.verifyClientMetadata(URI.create("https://pi.dev/oauth/client.json"),
            URI.create("http://127.0.0.1/callback"), client));
    assertEquals(AbstractClientIdMetadataDocumentExecutor.ERR_METADATA_CLIENTID_UNMATCH, error.getErrorDetail());
  }

  // TEST_SCENARIO: #21 — ignoring extensions does not admit a forbidden shared-secret authentication method.
  @Test
  void rejectsSharedSecretAuthentication() throws Exception {
    OIDCClientRepresentation client = fetch("""
        {
          "client_id": "https://pi.dev/oauth/client.json",
          "token_endpoint_auth_method": "client_secret_basic",
          "x_future_extension": true
        }
        """);
    ClientPolicyException error = assertThrows(ClientPolicyException.class, () ->
        executor.verifyClientMetadata(URI.create("https://pi.dev/oauth/client.json"),
            URI.create("http://127.0.0.1/callback"), client));
    assertEquals(AbstractClientIdMetadataDocumentExecutor.ERR_METADATA_NOTALLOWED_CLIENTAUTH, error.getErrorDetail());
  }

  // TEST_SCENARIO: #21 — an ignored field cannot evade the existing response-size limit.
  @Test
  void rejectsAnOversizedDocument() {
    String body = "{\"x_future_extension\": \"" + "x".repeat(6000) + "\"}";
    ClientPolicyException error = assertThrows(ClientPolicyException.class, () -> fetch(body));
    assertEquals(AbstractClientIdMetadataDocumentExecutor.ERR_METADATA_FETCH_FAILED, error.getErrorDetail());
  }

  private OIDCClientRepresentation fetch(String body) throws Exception {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    server.createContext("/client.json", exchange -> {
      try (exchange) {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
      }
    });
    URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/client.json");
    return executor.fetchClientMetadata(uri, false, null).getOidcClientRepresentation();
  }

  private static <T> T stub(Class<T> type, BiFunction<String, Object[], Object> call) {
    return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type},
        (proxy, method, args) -> call.apply(method.getName(), args)));
  }
}
