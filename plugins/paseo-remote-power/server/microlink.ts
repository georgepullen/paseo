import { createHash, createHmac, randomBytes } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { z } from "zod";

/**
 * The microlink wake-authority wire protocol (ESP32-S3 firmware), spoken
 * byte-exactly:
 *
 *   transcript  = `POST\n/v1/wake\n<unix-seconds>\n<nonce-32hex>\n<sha256hex-of-body>`
 *   signature   = HMAC-SHA256(secret, transcript) hex   (secret = raw bytes from hex)
 *   auth header = `<scheme> <signature>` (default scheme `Microlink-HMAC`)
 *
 * HTTP wake: POST to `http://<host>:<port>/v1/wake` with the four
 * `<headerPrefix>*` headers plus Authorization and an empty body; any 2xx is
 * accepted. UDP wake (tailnet): a single datagram
 * `POST /v1/wake\n<ts>\n<nonce>\n<digest>\n<scheme> <sig>`; the one-line
 * JSON reply's `accepted` decides. Observer (unsigned): GET /v1/observer
 * returns one-line JSON with `target_awake`.
 *
 * Scheme and header names are configurable per host (defaults
 * `Microlink-HMAC` / `X-Wake-`); legacy authorities override both.
 *
 * The hex secret arrives through the same tokens.json mechanism the http
 * transport uses (`secretRef` → resolveToken). It is key material only: no
 * log line, error message, or return value ever carries it — the wire
 * functions report failure as `false`/`null` and swallow causes.
 */

export const MICROLINK_DEFAULT_PORT = 48320;
/** Bounded wait for the UDP reply line, per the firmware's response cadence. */
export const MICROLINK_UDP_REPLY_TIMEOUT_MS = 6_000;
export const MICROLINK_OBSERVER_TIMEOUT_MS = 6_000;
/** Mirrors the engine's TRANSPORT_TIMEOUT_MS (kept here to avoid an import cycle). */
export const MICROLINK_TRANSPORT_TIMEOUT_MS = 30_000;

const WAKE_TARGET = "/v1/wake";
const OBSERVER_TARGET = "/v1/observer";

/** One-line JSON reply to a UDP wake: `{"accepted":true|false, …}`. */
const WakeReplySchema = z.object({ accepted: z.boolean() });

/** Wake-authority observer payload (schema string not consumed); only `target_awake` is used. */
const ObserverPayloadSchema = z.object({ target_awake: z.boolean() });

export interface WakeSignature {
  ts: string;
  nonce: string;
  digest: string;
  authorization: string;
}

export interface SignWakeOptions {
  /** Unix-seconds clock seam, so tests pin exact transcripts. */
  now?: () => number;
  /** 32-hex nonce seam, so tests pin exact transcripts. */
  nonce?: () => string;
  /** Authorization scheme token; defaults to "Microlink-HMAC". */
  scheme?: string;
  /** Wire header prefix; defaults to "X-Wake-". */
  headerPrefix?: string;
}

/** Neutral wire names; legacy authorities override both per host. */
export const MICROLINK_DEFAULT_SCHEME = "Microlink-HMAC";
export const MICROLINK_DEFAULT_HEADER_PREFIX = "X-Wake-";

/**
 * Build the four signed wake fields for a transcript over `method`+`target`
 * and `body`. The scheme token and header names default to the neutral
 * `Microlink-HMAC` / `X-Wake-` values; set them per host for older firmware.
 */
export function signWake(
  secretHex: string,
  method = "POST",
  target = WAKE_TARGET,
  body = "",
  options: SignWakeOptions = {},
): WakeSignature {
  const ts = String(Math.floor((options.now ?? (() => Date.now() / 1000))()));
  const nonce = (options.nonce ?? (() => randomBytes(16).toString("hex")))();
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const transcript = `${method}\n${target}\n${ts}\n${nonce}\n${digest}`;
  const signature = createHmac("sha256", Buffer.from(secretHex, "hex")).update(transcript, "utf8").digest("hex");
  return { ts, nonce, digest, authorization: `${options.scheme ?? MICROLINK_DEFAULT_SCHEME} ${signature}` };
}

/** Minimal UDP surface for the wake datagram, so tests capture bytes and forge replies. */
export interface MicrolinkSocket {
  send(packet: Buffer, port: number, address: string): Promise<void>;
  /** The next inbound datagram, or null once `timeoutMs` elapses. */
  receive(timeoutMs: number): Promise<Buffer | null>;
  close(): void;
}

export function createMicrolinkSocket(): MicrolinkSocket {
  const socket: Socket = createSocket({ type: "udp4", reuseAddr: true });
  let deliver: ((packet: Buffer) => void) | null = null;
  socket.on("message", (packet) => {
    const waiting = deliver;
    deliver = null;
    waiting?.(packet);
  });
  // An ICMP unreachable or similar surfaces as a socket 'error' event, not a
  // send-callback failure. It must never become an unhandled 'error' (that
  // crashes the process), and a pending receive can give up: no reply is coming.
  socket.on("error", () => {
    const waiting = deliver;
    deliver = null;
    waiting?.(Buffer.alloc(0));
  });
  // Bind so the authority has a return address for the reply line.
  socket.bind(() => {});
  return {
    send: (packet, port, address) =>
      new Promise((resolve, reject) => {
        socket.send(packet, port, address, (cause) => (cause ? reject(cause) : resolve()));
      }),
    receive: (timeoutMs) =>
      new Promise((resolve) => {
        const guard = setTimeout(() => {
          deliver = null;
          resolve(null);
        }, timeoutMs);
        deliver = (packet) => {
          clearTimeout(guard);
          resolve(packet);
        };
      }),
    close: () => {
      try {
        socket.close();
      } catch {
        // already closed
      }
    },
  };
}

export interface SendWakeOptions extends SignWakeOptions {
  fetchImpl?: typeof fetch;
  socketFactory?: () => MicrolinkSocket;
  /** How long to wait for the UDP reply line before giving up. */
  replyTimeoutMs?: number;
}

/** Signed HTTP wake. True iff the authority answered 2xx. Never throws. */
export async function sendWakeHttp(
  host: string,
  port: number,
  secretHex: string,
  options: SendWakeOptions = {},
): Promise<boolean> {
  const { ts, nonce, digest, authorization } = signWake(secretHex, "POST", WAKE_TARGET, "", options);
  const prefix = options.headerPrefix ?? MICROLINK_DEFAULT_HEADER_PREFIX;
  try {
    const response = await (options.fetchImpl ?? fetch)(`http://${host}:${port}${WAKE_TARGET}`, {
      method: "POST",
      headers: {
        [`${prefix}Timestamp`]: ts,
        [`${prefix}Nonce`]: nonce,
        [`${prefix}Content-SHA256`]: digest,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(MICROLINK_TRANSPORT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The wire datagram: `POST /v1/wake\n<ts>\n<nonce>\n<digest>\n<scheme> <sig>`. */
export function buildWakeDatagram(signature: WakeSignature): string {
  return `POST ${WAKE_TARGET}\n${signature.ts}\n${signature.nonce}\n${signature.digest}\n${signature.authorization}`;
}

/** `accepted` from the reply line: real JSON first, then a tolerant text scan. */
export function replyAccepted(reply: Buffer | null): boolean {
  if (reply === null) return false;
  const text = reply.toString("utf8");
  try {
    const parsed = WakeReplySchema.safeParse(JSON.parse(text));
    if (parsed.success && parsed.data.accepted) return true;
  } catch {
    // Not JSON — the firmware may append a newline or log noise; scan the text.
  }
  return /"accepted"\s*:\s*true/.test(text);
}

/** Signed UDP wake: one datagram, one reply line. Never throws. */
export async function sendWakeUdp(
  host: string,
  port: number,
  secretHex: string,
  options: SendWakeOptions = {},
): Promise<boolean> {
  try {
    const datagram = buildWakeDatagram(signWake(secretHex, "POST", WAKE_TARGET, "", options));
    const socket = (options.socketFactory ?? createMicrolinkSocket)();
    try {
      await socket.send(Buffer.from(datagram, "utf8"), port, host);
      const reply = await socket.receive(options.replyTimeoutMs ?? MICROLINK_UDP_REPLY_TIMEOUT_MS);
      return replyAccepted(reply);
    } finally {
      socket.close();
    }
  } catch {
    return false;
  }
}

export interface ObserverReport {
  targetAwake: boolean;
}

export interface ObserverOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Unsigned observer read. Null means "no answer" — fetch failure, non-2xx, or
 * an unparseable body — never an error carrying host or request detail.
 */
export async function observeHttp(host: string, port: number, options: ObserverOptions = {}): Promise<ObserverReport | null> {
  try {
    const response = await (options.fetchImpl ?? fetch)(`http://${host}:${port}${OBSERVER_TARGET}`, {
      method: "GET",
      signal: AbortSignal.timeout(options.timeoutMs ?? MICROLINK_OBSERVER_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const report = ObserverPayloadSchema.safeParse(await response.json());
    if (!report.success) return null;
    return { targetAwake: report.data.target_awake };
  } catch {
    return null;
  }
}
