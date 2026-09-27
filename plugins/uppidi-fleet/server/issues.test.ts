import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleUppidiIssues } from "./issues.js";
import { setFetchForTest, setTokenResolverForTest } from "./forgejo-api.js";

interface JsonLike {
  json: () => Promise<unknown>;
}

function jsonResponse(body: unknown): JsonLike {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as JsonLike;
}

/**
 * #724: without the repo in the RPC input the issues read silently resolved to
 * a default repository, so every non-default entry in the dashboard's repo
 * dropdown filtered a list the server had never served.
 */
describe("issues read resolves the requested repository (#724)", () => {
  afterEach(() => {
    setFetchForTest(null);
    setTokenResolverForTest(null);
    delete process.env.FORGEJO_HOST;
  });

  it("fetches the non-default repo the caller named, not the default", async () => {
    const paths: string[] = [];
    setTokenResolverForTest(async () => "test-token");
    setFetchForTest(async (input: string) => {
      paths.push(String(input).replace(/^https?:\/\/[^/]+/, ""));
      return jsonResponse([
        {
          number: 5001,
          title: "non-default repo issue",
          state: "open",
          html_url: "https://forge.example/xpufx-org/2fado/issues/5001",
          updated_at: "2026-09-25T10:00:00Z",
          labels: [],
        },
      ]);
    });

    const res = await handleUppidiIssues({ state: "open", repo: "xpufx-org/2fado" });
    assert.deepEqual(
      paths,
      ["/api/v1/repos/xpufx-org/2fado/issues?state=open&limit=50"],
      "the request must target the repo the caller named",
    );
    assert.equal(res.repo, "xpufx-org/2fado");
    assert.equal(res.ok, true);
    assert.equal(res.issues[0]?.repo, "2fado");
  });

  it("defaults to the plugin's default repo only when no repo was passed", async () => {
    const paths: string[] = [];
    setTokenResolverForTest(async () => "test-token");
    setFetchForTest(async (input: string) => {
      paths.push(String(input).replace(/^https?:\/\/[^/]+/, ""));
      return jsonResponse([]);
    });

    const res = await handleUppidiIssues({ state: "open" });
    assert.equal(paths[0], "/api/v1/repos/xpufx-org/paseo/issues?state=open&limit=50");
    assert.equal(res.repo, "xpufx-org/paseo");
    assert.deepEqual(res.issues, []);
  });

  it("surfaces an HTTP rejection as ok:false with the error, not as a blank list", async () => {
    setTokenResolverForTest(async () => "test-token");
    setFetchForTest(async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({ message: "token does not have required scope" }),
    }));

    const res = await handleUppidiIssues({ state: "open", repo: "xpufx-org/2fado" });
    assert.equal(res.ok, false);
    assert.equal(res.issues.length, 0);
    assert.match(String(res.error ?? ""), /403/);
    assert.match(String(res.error ?? ""), /scope/);
  });
});
