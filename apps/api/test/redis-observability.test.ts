import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const { logMock } = vi.hoisted(() => ({
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/logger.js", () => ({ logger: logMock }));

// A minimal stand-in for ioredis's Redis client: real enough (a plain
// EventEmitter) to let redis.ts register `.on(...)` listeners and this
// test fire them, without opening an actual connection.
class FakeRedis extends EventEmitter {}

vi.mock("ioredis", () => ({ Redis: FakeRedis }));

const { redis } = await import("../src/lib/redis.js");

describe("redis client observability", () => {
  it("logs an error on a connection error", () => {
    const err = new Error("ECONNREFUSED");
    redis.emit("error", err);
    expect(logMock.error).toHaveBeenCalledWith({ err }, "redis connection error");
  });

  it("logs info on connect", () => {
    redis.emit("connect");
    expect(logMock.info).toHaveBeenCalledWith("redis connected");
  });

  it("logs a warning with the retry delay while reconnecting", () => {
    redis.emit("reconnecting", 250);
    expect(logMock.warn).toHaveBeenCalledWith({ delayMs: 250 }, "redis reconnecting");
  });

  it("logs a warning when the connection ends", () => {
    redis.emit("end");
    expect(logMock.warn).toHaveBeenCalledWith("redis connection closed");
  });
});
