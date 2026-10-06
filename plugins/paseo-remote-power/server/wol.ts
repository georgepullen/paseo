import { createSocket, type Socket } from "node:dgram";
import type { WolTransport } from "../shared/registry.ts";

/**
 * Wake-on-LAN: build and deliver the standard magic packet — six 0xFF bytes
 * followed by the target MAC repeated sixteen times (102 bytes total). Fire
 * and forget: UDP has no acknowledgement, so a successful send means the
 * datagram left the machine, not that anything woke up; the wake engine
 * verifies reachability separately.
 */

export const MAGIC_PACKET_LENGTH = 6 + 16 * 6;
export const DEFAULT_WOL_PORT = 9;
export const DEFAULT_WOL_BROADCAST = "255.255.255.255";

/** Parse a MAC address ("00:11:22:33:44:55", "00-11-…", or bare hex) into its six bytes. */
export function parseMacAddress(mac: string): Buffer | null {
  const hex = mac.replace(/[:.-]/g, "");
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

/** The 102-byte magic packet: 6 × 0xFF then the MAC sixteen times. */
export function buildMagicPacket(mac: string): Buffer | null {
  const address = parseMacAddress(mac);
  if (!address) return null;
  const packet = Buffer.alloc(MAGIC_PACKET_LENGTH, 0xff);
  for (let repeat = 0; repeat < 16; repeat++) {
    address.copy(packet, 6 + repeat * 6);
  }
  return packet;
}

/** Minimal socket surface the sender needs, so tests can capture the datagram. */
export interface UdpSender {
  send(packet: Buffer, port: number, address: string): Promise<void>;
  close(): void;
}

export function createUdpSender(): UdpSender {
  const socket: Socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.bind(() => {
    try {
      socket.setBroadcast(true);
    } catch {
      // Broadcast permission is best-effort; unicast targets still work.
    }
  });
  return {
    send: (packet, port, address) => {
      let resolve!: () => void;
      let reject!: (cause: Error) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      socket.send(packet, port, address, (cause) => (cause ? reject(cause) : resolve()));
      return promise;
    },
    close: () => socket.close(),
  };
}

export interface SendMagicPacketOptions {
  port?: number;
  host?: string;
  sender?: UdpSender;
}

/**
 * Deliver a magic packet for the transport. Resolves true when the datagram
 * was handed to the OS; false on any send failure or an unparseable MAC.
 */
export async function sendMagicPacket(transport: WolTransport, options: SendMagicPacketOptions = {}): Promise<boolean> {
  const packet = buildMagicPacket(transport.mac);
  if (!packet) return false;
  const sender = options.sender ?? createUdpSender();
  try {
    await sender.send(packet, options.port ?? DEFAULT_WOL_PORT, transport.host ?? options.host ?? DEFAULT_WOL_BROADCAST);
    return true;
  } catch {
    return false;
  } finally {
    sender.close();
  }
}
