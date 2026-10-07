import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createSocket } from "node:dgram";
import {
  buildWakeDatagram,
  createMicrolinkSocket,
  observeHttp,
  replyAccepted,
  sendWakeHttp,
  sendWakeUdp,
  signWake,
  MICROLINK_DEFAULT_PORT,
} from "./microlink.ts";

/**
 * The reference wake authority is deployed firmware: its wire protocol is pinned
 * byte-for-byte here. The transcript, the four header names, the UDP datagram
 * text, and the observer parse are compatibility surfaces — a change here is
 * a breaking change to every deployed device. No test touches a real network:
 * fetch and the UDP socket are seams, and the one loopback datagram test uses
 * a real bound socket on 127.0.0.1.
 */

const SECRET_HEX = "00112233445566778899aabbccddeeff";
const FIXED_TS = 1_700_000_000;
const FIXED_NONCE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

/** Independent golden: recompute the HMAC over the exact transcript in the test. */
function expectedSignature(transcript: string): string {
  return createHmac("sha256", Buffer.from(SECRET_HEX, "hex")).update(transcript, "utf8").digest("hex");
}

function fixedClock(now: () => number) {
  return { now, nonce: () => FIXED_NONCE };
}

/** A socket seam that captures the sent datagram and replies from a script. */
function scriptedSocket(replies: (Buffer | null)[]) {
  const sent: { packet: Buffer; port: number; address: string }[] = [];
  return {
    sent,
    socket: {
      send: async (packet: Buffer, port: number, address: string) => {
        sent.push({ packet, port, address });
      },
      receive: async () => replies.shift() ?? null,
      close: () => {},
    },
  };
}

test("signWake pins the deployed transcript and HMAC byte-for-byte", () => {
  const body = "";
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const transcript = `POST\n/v1/wake\n${FIXED_TS}\n${FIXED_NONCE}\n${digest}`;
  const sig = signWake(SECRET_HEX, "POST", "/v1/wake", body, fixedClock(() => FIXED_TS));

  assert.equal(sig.ts, "1700000000", "the timestamp is unix seconds, as a decimal string");
  assert.equal(sig.nonce, FIXED_NONCE);
  assert.equal(sig.nonce.length, 32, "the nonce is 32 hex chars");
  assert.equal(sig.digest, digest);
  assert.equal(sig.digest, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256 of the empty body");
  assert.equal(sig.authorization, `Microlink-HMAC ${expectedSignature(transcript)}`);
  assert.match(sig.authorization, /^Microlink-HMAC [0-9a-f]{64}$/);
  assert.equal(sig.authorization.includes(SECRET_HEX), false, "the signature never carries the raw secret");
});

test("signWake honors legacy authority wire names for deployed authorities", async () => {
  const body = "";
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const transcript = `POST\n/v1/wake\n${FIXED_TS}\n${FIXED_NONCE}\n${digest}`;
  // pinned legacy authority names
  const legacy = { scheme: "Cyril-HMAC", headerPrefix: "X-Cyril-", ...fixedClock(() => FIXED_TS) };

  const sig = signWake(SECRET_HEX, "POST", "/v1/wake", body, legacy);
  assert.equal(sig.authorization, `Cyril-HMAC ${expectedSignature(transcript)}`, "the transcript is unchanged; only the label differs");

  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const http = sendWakeHttp("192.0.2.5", 48320, SECRET_HEX, { fetchImpl, ...legacy }).then((accepted) => {
    assert.equal(accepted, true);
    assert.deepEqual(seen[0].init.headers, {
      "X-Cyril-Timestamp": sig.ts,
      "X-Cyril-Nonce": sig.nonce,
      "X-Cyril-Content-SHA256": sig.digest,
      Authorization: sig.authorization,
    });
  });
  const udp = sendWakeUdp("192.0.2.5", 48320, SECRET_HEX, {
    socketFactory: () => scriptedSocket([Buffer.from('{"accepted":true}\n', "utf8")]).socket,
    ...legacy,
  }).then((accepted) => assert.equal(accepted, true, "the datagram carries the legacy scheme token"));
  await Promise.all([http, udp]);
});

test("a live nonce and clock still produce a well-formed signature", () => {
  const sig = signWake(SECRET_HEX);
  assert.match(sig.ts, /^\d+$/);
  assert.match(sig.nonce, /^[0-9a-f]{32}$/);
  assert.match(sig.authorization, /^Microlink-HMAC [0-9a-f]{64}$/);
  const digest = createHash("sha256").update("").digest("hex");
  assert.notEqual(sig.ts, String(FIXED_TS), "the default clock is real time, not the test fixture");
});

test("sendWakeHttp speaks the four headers exactly and accepts only 2xx", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const accepted = await sendWakeHttp("192.0.2.5", 48320, SECRET_HEX, {
    fetchImpl,
    ...fixedClock(() => FIXED_TS),
  });
  assert.equal(accepted, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `http://192.0.2.5:${MICROLINK_DEFAULT_PORT}/v1/wake`);
  assert.equal(seen[0].init.method, "POST");
  const sig = signWake(SECRET_HEX, "POST", "/v1/wake", "", fixedClock(() => FIXED_TS));
  assert.deepEqual(seen[0].init.headers, {
    "X-Wake-Timestamp": sig.ts,
    "X-Wake-Nonce": sig.nonce,
    "X-Wake-Content-SHA256": sig.digest,
    Authorization: sig.authorization,
  });

  const rejected = await sendWakeHttp("192.0.2.5", 48320, SECRET_HEX, {
    fetchImpl: (async () => new Response(null, { status: 403 })) as typeof fetch,
  });
  assert.equal(rejected, false, "non-2xx is not accepted");
  const crashed = await sendWakeHttp("192.0.2.5", 48320, SECRET_HEX, {
    fetchImpl: (async () => {
      throw new Error("connect ECONNREFUSED 192.0.2.5:48320");
    }) as typeof fetch,
  });
  assert.equal(crashed, false, "a failed fetch is a failed transport, not a throw");
});

test("sendWakeUdp puts the exact datagram on the wire and reads the reply line", async () => {
  const sig = signWake(SECRET_HEX, "POST", "/v1/wake", "", fixedClock(() => FIXED_TS));
  const expectedDatagram = `POST /v1/wake\n${sig.ts}\n${sig.nonce}\n${sig.digest}\n${sig.authorization}`;
  assert.equal(buildWakeDatagram(sig), expectedDatagram, "the datagram template is pinned");

  const ok = scriptedSocket([Buffer.from('{"accepted":true}\n', "utf8")]);
  const accepted = await sendWakeUdp("wake.tailnet.net", 48320, SECRET_HEX, {
    socketFactory: () => ok.socket,
    ...fixedClock(() => FIXED_TS),
  });
  assert.equal(accepted, true);
  assert.equal(ok.sent.length, 1);
  assert.equal(ok.sent[0].packet.toString("utf8"), expectedDatagram, "the datagram left byte-for-byte");
  assert.equal(ok.sent[0].port, 48320);
  assert.equal(ok.sent[0].address, "wake.tailnet.net");

  const refused = scriptedSocket([Buffer.from('{"accepted":false}', "utf8")]);
  assert.equal(await sendWakeUdp("wake.tailnet.net", 48320, SECRET_HEX, { socketFactory: () => refused.socket }), false);

  const silent = scriptedSocket([null]);
  assert.equal(
    await sendWakeUdp("wake.tailnet.net", 48320, SECRET_HEX, { socketFactory: () => silent.socket, replyTimeoutMs: 1 }),
    false,
    "no reply before the timeout is not an accept",
  );

  const broken = scriptedSocket([Buffer.from("garbage log line {\"accepted\":true} trailing", "utf8")]);
  assert.equal(await sendWakeUdp("wake.tailnet.net", 48320, SECRET_HEX, { socketFactory: () => broken.socket }), true, "the reply parse tolerates noise around the accepted line");
});

test("replyAccepted parses the reply line tolerantly", () => {
  assert.equal(replyAccepted(Buffer.from('{"accepted":true}\n', "utf8")), true);
  assert.equal(replyAccepted(Buffer.from('{"accepted":false}\n', "utf8")), false);
  assert.equal(replyAccepted(Buffer.from('{"accepted": "true"}', "utf8")), false, "accepted is a JSON boolean, not a string");
  assert.equal(replyAccepted(Buffer.from("noise {\"accepted\":true} noise", "utf8")), true);
  assert.equal(replyAccepted(Buffer.from("total garbage", "utf8")), false);
  assert.equal(replyAccepted(null), false);
});

test("observeHttp exposes targetAwake and answers null when the observer is silent", async () => {
  const jsonResponse = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });

  const up = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => jsonResponse('{"target_awake":true,"schema":"microlink-wake-observer-v1"}')) as typeof fetch,
  });
  assert.deepEqual(up, { targetAwake: true });

  const down = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => jsonResponse('{"target_awake":false,"schema":"microlink-wake-observer-v1"}')) as typeof fetch,
  });
  assert.deepEqual(down, { targetAwake: false });

  const malformed = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => jsonResponse("<html>not json</html>")) as typeof fetch,
  });
  assert.equal(malformed, null, "an unparseable body is no answer");

  const missingField = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => jsonResponse('{"schema":"microlink-wake-observer-v1"}')) as typeof fetch,
  });
  assert.equal(missingField, null, "no target_awake boolean is no answer");

  const httpError = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => jsonResponse("{}", 500)) as typeof fetch,
  });
  assert.equal(httpError, null, "a non-2xx observer is no answer");

  const unreachable = await observeHttp("192.0.2.5", 48320, {
    fetchImpl: (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch,
  });
  assert.equal(unreachable, null, "an unreachable observer is no answer");
});

test("a microlink wake over real loopback delivers the pinned datagram", async () => {
  const receiver = createSocket("udp4");
  const seen: { text: string; address: string }[] = [];
  let port = 0;
  const bound = new Promise<void>((resolveBind) => {
    receiver.on("message", (packet, info) => {
      seen.push({ text: packet.toString("utf8"), address: info.address });
      receiver.send(Buffer.from('{"accepted":true}\n'), info.port, info.address);
    });
    receiver.bind(0, "127.0.0.1", () => {
      port = receiver.address().port;
      resolveBind();
    });
  });
  await bound;
  try {
    const sig = signWake(SECRET_HEX, "POST", "/v1/wake", "", fixedClock(() => FIXED_TS));
    const accepted = await sendWakeUdp("127.0.0.1", port, SECRET_HEX, {
      socketFactory: createMicrolinkSocket,
      ...fixedClock(() => FIXED_TS),
      replyTimeoutMs: 2_000,
    });
    assert.equal(accepted, true, "the firmware's accept line ends the wake");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].text, buildWakeDatagram(sig), "the loopback datagram is byte-identical to the pin");
  } finally {
    receiver.close();
  }
});
