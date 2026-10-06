import { test } from "node:test";
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { buildMagicPacket, parseMacAddress, sendMagicPacket, MAGIC_PACKET_LENGTH, DEFAULT_WOL_PORT } from "./wol.ts";

/**
 * The WoL magic packet is a wire format: six 0xFF bytes followed by the target
 * MAC repeated sixteen times, 102 bytes total. The bytes are pinned exactly,
 * and a loopback send must deliver them verbatim.
 */

function expectedPacket(macHex: string): Buffer {
  const address = Buffer.from(macHex, "hex");
  const packet = Buffer.alloc(MAGIC_PACKET_LENGTH, 0xff);
  for (let repeat = 0; repeat < 16; repeat++) {
    address.copy(packet, 6 + repeat * 6);
  }
  return packet;
}

function receiveOne(port: number): Promise<{ packet: Buffer; info: { address: string; port: number } }> {
  // Real-socket integration: dgram offers no fake-clock seam, so the only way
  // to fail loudly on a lost datagram is a platform-timer guard (2s).
  let resolve!: (value: { packet: Buffer; info: { address: string; port: number } }) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<{ packet: Buffer; info: { address: string; port: number } }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const socket = createSocket("udp4");
  const guard = setTimeout(() => {
    socket.close();
    reject(new Error("no datagram arrived"));
  }, 2000);
  socket.on("error", (cause) => {
    clearTimeout(guard);
    reject(cause);
  });
  socket.on("message", (packet, info) => {
    clearTimeout(guard);
    socket.close();
    resolve({ packet, info });
  });
  socket.bind(port, "127.0.0.1", () => {});
  return promise;
}

test("the magic packet for a MAC is exactly 6 x FF + the MAC sixteen times", () => {
  const packet = buildMagicPacket("00:11:22:33:44:55");
  assert.ok(packet, "a valid MAC builds a packet");
  assert.equal(packet.length, 102);
  const expected = expectedPacket("001122334455");
  assert.ok(packet.equals(expected), "bytes must match the WoL wire format");
  assert.equal(packet.subarray(0, 6).toString("hex"), "ffffffffffff");
  for (let repeat = 0; repeat < 16; repeat++) {
    assert.equal(packet.subarray(6 + repeat * 6, 12 + repeat * 6).toString("hex"), "001122334455");
  }
});

test("MAC parsing accepts every common separator spelling", () => {
  assert.deepEqual(parseMacAddress("aa:bb:cc:dd:ee:ff"), Buffer.from("aabbccddeeff", "hex"));
  assert.deepEqual(parseMacAddress("AA-BB-CC-DD-EE-FF"), Buffer.from("aabbccddeeff", "hex"));
  assert.deepEqual(parseMacAddress("aabbccddeeff"), Buffer.from("aabbccddeeff", "hex"));
  assert.equal(parseMacAddress("aa:bb:cc:dd:ee"), null, "five pairs is not a MAC");
  assert.equal(parseMacAddress("zz:bb:cc:dd:ee:ff"), null, "hex pairs only");
  assert.equal(buildMagicPacket("hello"), null, "an invalid MAC builds no packet");
});

test("a sent packet arrives on the wire byte-for-byte", async () => {
  const port = 40_000 + Math.floor(Math.random() * 10_000);
  const receiving = receiveOne(port);
  const sent = await sendMagicPacket(
    { type: "wol", mac: "00:11:22:33:44:55", host: "127.0.0.1" },
    { port, sender: undefined },
  );
  assert.equal(sent, true, "loopback send must succeed");
  const { packet } = await receiving;
  assert.ok(packet.equals(expectedPacket("001122334455")));
  assert.equal(DEFAULT_WOL_PORT, 9, "WoL stays on the discard port by default");
});
