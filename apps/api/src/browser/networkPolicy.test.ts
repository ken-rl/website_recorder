import assert from "node:assert/strict";
import test from "node:test";
import { addressCategory, assertAddressAllowed } from "./networkPolicy.js";

const lockedDown = { allowLocalhost: false, allowPrivateNetworks: false };

test("classifies public, private, loopback, and IPv6 addresses", () => {
  assert.equal(addressCategory("8.8.8.8"), "public");
  assert.equal(addressCategory("127.0.0.1"), "loopback");
  assert.equal(addressCategory("10.20.30.40"), "private");
  assert.equal(addressCategory("172.31.4.5"), "private");
  assert.equal(addressCategory("192.168.1.2"), "private");
  assert.equal(addressCategory("::1"), "loopback");
  assert.equal(addressCategory("fd12::1"), "private");
  assert.equal(addressCategory("2606:4700:4700::1111"), "public");
});

test("blocks private and cloud metadata addresses in hosted mode", () => {
  assert.throws(() => assertAddressAllowed("127.0.0.1", "localhost", lockedDown), /blocked loopback/);
  assert.throws(() => assertAddressAllowed("10.0.0.8", "internal.test", lockedDown), /blocked private/);
  assert.throws(
    () => assertAddressAllowed("169.254.169.254", "metadata.test", { allowLocalhost: true, allowPrivateNetworks: true }),
    /metadata/,
  );
});

test("allows explicit local development targets without opening private networks", () => {
  const local = { allowLocalhost: true, allowPrivateNetworks: false };
  assert.doesNotThrow(() => assertAddressAllowed("127.0.0.1", "localhost", local));
  assert.throws(() => assertAddressAllowed("192.168.1.5", "nas.local", local), /blocked private/);
});
