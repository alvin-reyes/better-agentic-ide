// @vitest-environment node
// The phone's session machine: schedule.json (which relay-core's scheduler runs too),
// and the phone-side lines of AC2-AC6 against the internal TypeScript responder.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toHex } from "./bytes";
import type { Routed, Session } from "./frame";
import {
  CounterAllocator,
  MAX_COUNTER,
  PhoneSession,
  generateStaticKeypair,
  memoryLastSentStore,
  nextCounterValue,
  staticFromSecret,
  type LastSentStore,
  type PhoneAction,
  type StaticKeypair,
} from "./index";
import * as protocol from "./index";
import { readHs1 } from "./noise";
import { Scheduler, phoneSessionWithLimits, type Cause } from "./session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const schedule: Json = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vectors/schedule.json", import.meta.url)), "utf8"),
);

describe("schedule.json", () => {
  it("its constants are the machine's", () => {
    expect(schedule.constants).toEqual({
      window_ms: protocol.RESTART_WINDOW_MS,
      retry_ms: protocol.RETRY_MS,
      hanging_ms: protocol.HANGING_MS,
      max_age_ms: protocol.MAX_SESSION_AGE_MS,
      max_outstanding: protocol.MAX_OUTSTANDING,
      outstanding_ttl_ms: protocol.OUTSTANDING_TTL_MS,
      nonce_ceiling: protocol.NONCE_CEILING,
    });
  });

  it("every script", () => {
    expect(schedule.scripts.length).toBeGreaterThanOrEqual(20);
    for (const script of schedule.scripts) {
      const s = new Scheduler();
      let starts = 0;
      for (const step of script.steps) {
        const now: number = step.at_mono_ms;
        const at = `${script.name}: ${step.event} at ${now}`;
        const [verb, arg] = step.event.split(":");
        let polled: { start: number | null; hanging: number[] } = { start: null, hanging: [] };
        if (verb === "trigger") polled.start = s.trigger(arg as Cause, now);
        else if (verb === "tick") polled = s.poll(now);
        else if (verb === "hs2_ok") s.adopt(Number(arg), now);
        else if (verb === "sent_nonce") polled.start = s.onSent(Number(arg), now);
        else if (verb === "recv_nonce") polled.start = s.onReceived(Number(arg), now);
        else if (verb === "end") s.end();
        else throw new Error(`unknown event ${step.event}`);
        let started: number | null = null;
        if (polled.start !== null) {
          starts++;
          expect(polled.start, at).toBe(starts);
          started = starts;
          if (step.store_fails !== true) expect(s.begin(polled.start, step.begin_counter ?? starts), at).toBe(true);
        }
        expect(started, `start, ${at}`).toBe(step.expect.start);
        expect(polled.hanging, `hanging, ${at}`).toEqual(step.expect.hanging ?? []);
        if ("session" in step.expect) expect(s.sessionCounter(), `session, ${at}`).toBe(step.expect.session);
        if ("deadline" in step.expect) expect(s.nextDeadline(), `deadline, ${at}`).toBe(step.expect.deadline);
      }
    }
  });

  it("the counter cases", () => {
    for (const c of schedule.counters) {
      if (c.expect === "error") expect(() => nextCounterValue(c.last_sent, c.wall_ms), c.why).toThrow(/exhausted/);
      else expect(nextCounterValue(c.last_sent, c.wall_ms), c.why).toBe(c.expect);
    }
  });
});

// --- A phone against the internal responder ---------------------------------------

const key = (b: number) => new Uint8Array(32).fill(b);

/** The Mac's side, just enough for the phone's tests: the paired static, the last
 *  counter, and the current session. */
class TestMac {
  last: number | null = null;
  session: Session | null = null;
  got: Uint8Array[] = [];
  constructor(
    readonly own: StaticKeypair,
    readonly iM: Uint8Array,
    readonly paired: Uint8Array,
  ) {}

  onHs1(iP: Uint8Array, hs1: Uint8Array): Uint8Array | null {
    const read = readHs1(this.own, this.iM, iP, hs1);
    if (!read || toHex(read.remoteStatic) !== toHex(this.paired)) return null;
    if (this.last !== null && read.counter <= this.last) return null;
    this.last = read.counter;
    const { hs2, session } = read.reply();
    this.session = session;
    return hs2;
  }

  seal(text: string): Uint8Array {
    const sealed = this.session!.seal(new TextEncoder().encode(text));
    if (!sealed.ok) throw new Error(sealed.error);
    return sealed.body;
  }
}

class World {
  mac: TestMac;
  phone: PhoneSession;
  iM = key(1);
  iP = key(2);
  allocator: CounterAllocator;
  wallMs = 1760000000000;
  toMac: Routed[] = [];
  starts: number[] = [];
  storeErrors = 0;
  phoneGot: string[] = [];

  constructor(
    readonly store: LastSentStore = memoryLastSentStore(),
    limits?: Parameters<typeof phoneSessionWithLimits>[4],
  ) {
    const macKey = generateStaticKeypair();
    const phoneKey = generateStaticKeypair();
    this.mac = new TestMac(macKey, this.iM, phoneKey.public);
    this.phone = limits
      ? phoneSessionWithLimits(phoneKey, this.iM, this.iP, macKey.public, limits)
      : new PhoneSession(phoneKey, this.iM, this.iP, macKey.public);
    this.allocator = new CounterAllocator(store);
  }

  async act(actions: PhoneAction[]): Promise<void> {
    for (const a of actions) {
      if (a.kind === "start_handshake") {
        this.starts.push(a.token);
        let counter: number;
        try {
          counter = await this.allocator.next(this.iM, this.wallMs);
        } catch {
          this.storeErrors++;
          continue;
        }
        const r = this.phone.begin(a.token, counter);
        if (r) this.toMac.push(r);
      } else if (a.kind === "send") this.toMac.push(a.routed);
      else if (a.kind === "deliver") this.phoneGot.push(new TextDecoder().decode(a.plaintext));
    }
  }

  /** Delivers every hs1 in flight; the Mac's hs2 go straight back unless dropped. */
  async run(now: number, dropHs2 = false): Promise<Uint8Array[]> {
    const hs2s: Uint8Array[] = [];
    for (const r of this.toMac.splice(0)) {
      expect(toHex(r.peer)).toBe(toHex(this.iM));
      if (r.kind === 1) {
        const hs2 = this.mac.onHs1(this.iP, r.body);
        if (hs2) hs2s.push(hs2);
      } else if (r.kind === 3 && this.mac.session) {
        const got = this.mac.session.open(r.body);
        if (got.kind === "accept") this.mac.got.push(got.plaintext);
      }
    }
    if (!dropHs2) for (const hs2 of hs2s) await this.act(this.phone.onHs2(hs2, now));
    return hs2s;
  }

  async trigger(kind: Parameters<PhoneSession["trigger"]>[0], now: number) {
    await this.act(this.phone.trigger(kind, now));
  }

  async tick(now: number) {
    await this.act(this.phone.poll(now));
  }

  async connect(now: number) {
    await this.trigger("mac_online", now);
    await this.run(now);
    expect(this.phone.sessionId).not.toBeNull();
    expect(toHex(this.phone.sessionId!)).toBe(toHex(this.mac.session!.id));
  }

  /** One frame each way. */
  async framesFlow(now: number): Promise<boolean> {
    const sent = this.phone.send(new TextEncoder().encode("from the phone"), now);
    if (!sent.ok || !this.mac.session) return false;
    const got = this.mac.session.open(sent.routed.body);
    if (got.kind !== "accept") return false;
    const before = this.phoneGot.length;
    await this.act(this.phone.onFrame(this.mac.seal("from the Mac"), now));
    return this.phoneGot.length === before + 1;
  }
}

describe("the phone session against the responder", () => {
  it("connects, and frames flow both ways", async () => {
    const w = new World();
    await w.connect(0);
    expect(await w.framesFlow(1)).toBe(true);
  });

  it("AC2: sends max(now, last_sent + 1), recorded per Mac key before hs1 is sent", async () => {
    const store = memoryLastSentStore();
    const w = new World(store);
    w.wallMs = 42;
    await w.trigger("mac_online", 0);
    expect(await store.get(w.iM)).toBe(42);
    expect(readHs1(w.mac.own, w.iM, w.iP, w.toMac[0].body)!.counter).toBe(42);
    // A clock set back: last_sent + 1.
    w.wallMs = 7;
    await w.tick(10000);
    expect(await store.get(w.iM)).toBe(43);
    await w.run(10000);
    expect(w.phone.sessionId).not.toBeNull();
  });

  it("AC2: a store whose write fails sends no hs1; the start counts, and the next allocation works", async () => {
    let failNext = true;
    const inner = memoryLastSentStore();
    const store: LastSentStore = {
      get: inner.get,
      set: async (id, v) => {
        if (failNext) {
          failNext = false;
          throw new Error("keychain locked");
        }
        await inner.set(id, v);
      },
    };
    const w = new World(store);
    await w.trigger("mac_online", 0);
    expect(w.storeErrors).toBe(1);
    expect(w.toMac).toEqual([]);
    expect(w.phone.nextDeadline()).toBe(10000);
    await w.tick(10000);
    expect(w.starts).toEqual([1, 2]);
    await w.run(10000);
    expect(w.phone.sessionId).not.toBeNull();
  });

  it("AC2: two sessions for one Mac key, triggered together, send distinct counters", async () => {
    const store = memoryLastSentStore();
    const allocator = new CounterAllocator(store);
    const macKey = generateStaticKeypair();
    const phoneKey = generateStaticKeypair();
    for (let i = 0; i < 50; i++) {
      const a = new PhoneSession(phoneKey, key(1), key(2), macKey.public);
      const b = new PhoneSession(phoneKey, key(1), key(2), macKey.public);
      const begin = async (p: PhoneSession) => {
        const [start] = p.trigger("mac_online", 0);
        if (start.kind !== "start_handshake") throw new Error("a start");
        const c = await allocator.next(key(1), 1000);
        expect(p.begin(start.token, c)).not.toBeNull();
        return c;
      };
      const [ca, cb] = await Promise.all([begin(a), begin(b)]);
      expect(ca).not.toBe(cb);
    }
  });

  it("AC2: a rejected set rejects only its own caller; the chain goes on", async () => {
    let calls = 0;
    const inner = memoryLastSentStore();
    const allocator = new CounterAllocator({
      get: inner.get,
      set: async (id, v) => {
        if (calls++ === 1) throw new Error("once");
        await inner.set(id, v);
      },
    });
    const got = await Promise.allSettled([
      allocator.next(key(1), 10),
      allocator.next(key(1), 10),
      allocator.next(key(1), 10),
    ]);
    expect(got.map((g) => g.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(got[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(got[2]).toEqual({ status: "fulfilled", value: 11 });
  });

  it("AC3: one phone with two Macs keeps two counters, and a counter carries over end()", async () => {
    const store = memoryLastSentStore();
    const allocator = new CounterAllocator(store);
    expect(await allocator.next(key(1), 1000)).toBe(1000);
    expect(await allocator.next(key(5), 1000)).toBe(1000);
    expect(await allocator.next(key(1), 1000)).toBe(1001);
    const w = new World(store);
    w.wallMs = 1000;
    await w.connect(0);
    w.phone.end();
    await w.trigger("mac_online", 20000);
    expect(readHs1(w.mac.own, w.iM, w.iP, w.toMac[0].body)!.counter).toBe(1003);
  });

  it("AC4: a replayed hs1 gets no answer, and the phone's session stands", async () => {
    const w = new World();
    await w.trigger("mac_online", 0);
    const hs1 = w.toMac[0].body;
    await w.run(0);
    expect(w.mac.onHs1(w.iP, hs1)).toBeNull();
    expect(await w.framesFlow(1)).toBe(true);
  });

  it("AC4: frames from an old session start no handshake", async () => {
    const w = new World();
    await w.connect(0);
    const old = w.mac.seal("old");
    await w.trigger("foreground", 20000);
    await w.run(20000);
    expect(w.starts.length).toBe(2);
    expect(w.phone.onFrame(old, 20001)).toEqual([]);
    await w.tick(40000);
    expect(w.starts.length).toBe(2);
    expect(await w.framesFlow(40001)).toBe(true);
  });

  it("AC4: two handshakes at once leave the newest, in either hs2 order", async () => {
    for (const bFirst of [false, true]) {
      const w = new World();
      await w.trigger("mac_online", 0);
      await w.tick(10000);
      const hs2s = await w.run(10001, true);
      expect(hs2s.length).toBe(2);
      if (bFirst) hs2s.reverse();
      for (const hs2 of hs2s) await w.act(w.phone.onHs2(hs2, 10002));
      expect(toHex(w.phone.sessionId!)).toBe(toHex(w.mac.session!.id));
      expect(await w.framesFlow(10003)).toBe(true);
    }
  });

  it("AC4: the stuck state: A sent, retry B lost, the Mac answers A; the phone adopts A", async () => {
    const w = new World();
    await w.trigger("mac_online", 0);
    const a = w.toMac.splice(0);
    await w.tick(10000);
    w.toMac.splice(0); // B lost
    w.toMac.push(...a);
    await w.run(10001);
    expect(toHex(w.phone.sessionId!)).toBe(toHex(w.mac.session!.id));
    expect(await w.framesFlow(10002)).toBe(true);
  });

  it("AC4: the lost newer hs2 converges on a fresh handshake, and B raises no second", async () => {
    const w = new World();
    await w.trigger("mac_online", 0);
    await w.tick(10000);
    const [hs2A] = await w.run(10001, true); // the Mac is on B; hs2_B is lost
    const macOnB = toHex(w.mac.session!.id);
    await w.act(w.phone.onHs2(hs2A, 11000));
    expect(toHex(w.phone.sessionId!)).not.toBe(macOnB);
    expect(await w.framesFlow(11001)).toBe(false);
    expect(w.phone.nextDeadline()).toBe(20000);
    await w.tick(20000);
    expect(w.starts).toEqual([1, 2, 3]);
    await w.run(20000);
    expect(toHex(w.phone.sessionId!)).toBe(toHex(w.mac.session!.id));
    expect(await w.framesFlow(20001)).toBe(true);
    await w.tick(30000);
    await w.tick(60000);
    expect(w.starts).toEqual([1, 2, 3]);
  });

  it("AC4: if C's hs2 is lost too, C gets one retry and then the phone waits", async () => {
    const w = new World();
    await w.trigger("mac_online", 0);
    await w.tick(10000);
    const [hs2A] = await w.run(10001, true);
    await w.act(w.phone.onHs2(hs2A, 11000));
    for (const t of [20000, 30000, 40000, 50000, 60000]) {
      await w.tick(t);
      w.toMac.splice(0);
    }
    expect(w.starts).toEqual([1, 2, 3, 4]);
  });

  it("AC5: another session's id is dropped with no action; a bad frame starts a handshake", async () => {
    const w = new World();
    await w.connect(0);
    const body = w.mac.seal("x");
    const other = body.slice();
    other[0] ^= 1;
    expect(w.phone.onFrame(other, 20000)).toEqual([]);
    const bad = w.mac.seal("x");
    bad[bad.length - 1] ^= 1;
    expect(w.phone.onFrame(bad, 20000)).toEqual([{ kind: "start_handshake", token: 2 }]);
    // Again inside the window: deferred, not a second start.
    const bad2 = w.mac.seal("y");
    bad2[20] ^= 1;
    expect(w.phone.onFrame(bad2, 21000)).toEqual([]);
    expect(w.phone.nextDeadline()).toBe(30000);
    // The current session stays usable until a newer one completes.
    expect(await w.framesFlow(21001)).toBe(true);
  });

  it("AC5: each trigger starts a handshake; pull to refresh only with no session", async () => {
    for (const kind of ["mac_online", "foreground", "rehandshake", "pull_to_refresh"] as const) {
      const w = new World();
      await w.trigger(kind, 0);
      expect(w.starts.length, kind).toBe(1);
      await w.run(0);
      expect(await w.framesFlow(1), kind).toBe(true);
    }
    const w = new World();
    await w.connect(0);
    await w.trigger("pull_to_refresh", 20000);
    expect(w.starts.length).toBe(1);
  });

  it("AC5: after 24 h, and at both frame ceilings", async () => {
    const aged = new World(undefined, { maxAgeMs: 100000 });
    await aged.connect(0);
    await aged.tick(99999);
    expect(aged.starts.length).toBe(1);
    await aged.tick(100000);
    expect(aged.starts.length).toBe(2);

    const sent = new World(undefined, { frameCeiling: 2 });
    await sent.connect(0);
    expect(sent.phone.send(Uint8Array.of(0), 20000).ok).toBe(true);
    expect(sent.phone.send(Uint8Array.of(1), 20000).ok).toBe(true);
    expect(sent.phone.send(Uint8Array.of(2), 20000)).toEqual({ ok: false, error: "ceiling" });
    await sent.tick(20000);
    expect(sent.starts.length).toBe(2);

    const recv = new World(undefined, { frameCeiling: 2 });
    await recv.connect(0);
    expect(recv.phone.onFrame(recv.mac.seal("0"), 20000).length).toBe(1);
    expect(recv.phone.onFrame(recv.mac.seal("1"), 20000).map((a) => a.kind)).toEqual(["deliver", "start_handshake"]);
  });

  it("send with no session refuses and raises the trigger for the next poll", async () => {
    const w = new World();
    expect(w.phone.send(Uint8Array.of(1), 0)).toEqual({ ok: false, error: "no_session" });
    expect(w.phone.nextDeadline()).toBe(0);
    await w.tick(0);
    expect(w.starts).toEqual([1]);
  });

  it("AC7: a 60,001-byte plaintext throws a RangeError and raises nothing", async () => {
    const w = new World();
    await w.connect(0);
    expect(() => w.phone.send(new Uint8Array(60001), 1)).toThrow(RangeError);
    expect(w.phone.send(new Uint8Array(60000), 1).ok).toBe(true);
    expect(w.phone.nextDeadline()).toBe(86400000);
  });

  it("a stale begin token returns null: after end(), or after a newer session was adopted", async () => {
    const w = new World();
    const [a] = w.phone.trigger("mac_online", 0);
    if (a.kind !== "start_handshake") throw new Error("a start");
    w.phone.end();
    expect(w.phone.begin(a.token, 1)).toBeNull();

    const v = new World();
    await v.trigger("mac_online", 0);
    const [b] = v.phone.trigger("foreground", 10000);
    if (b.kind !== "start_handshake") throw new Error("a start");
    await v.run(10001);
    expect(v.phone.sessionId).not.toBeNull();
    expect(v.phone.begin(b.token, 1760000000005)).toBeNull();
  });
});

describe("session input checks", () => {
  const own = staticFromSecret(key(3));
  const mac = staticFromSecret(key(4));

  it.each([
    ["I_M", () => new PhoneSession(own, new Uint8Array(31), key(2), mac.public)],
    ["I_P", () => new PhoneSession(own, key(1), new Uint8Array(33), mac.public)],
    ["the Mac's static", () => new PhoneSession(own, key(1), key(2), new Uint8Array(0))],
    ["a Mac id for the allocator", () => new CounterAllocator(memoryLastSentStore()).next(new Uint8Array(8), 0)],
  ])("a RangeError for a wrong-length %s", (_what, f) => {
    expect(f).toThrow(RangeError);
  });

  it("a low-order Mac static is refused", () => {
    expect(() => new PhoneSession(own, key(1), key(2), new Uint8Array(32))).toThrow(/low-order/);
  });

  it.each([-1, 0.5, 2 ** 53, Number.NaN])("a RangeError for a time of %s", (t) => {
    const p = new PhoneSession(own, key(1), key(2), mac.public);
    expect(() => p.trigger("mac_online", t)).toThrow(RangeError);
    expect(() => p.poll(t)).toThrow(RangeError);
    expect(() => nextCounterValue(null, t)).toThrow(RangeError);
    expect(() => nextCounterValue(t, 0)).toThrow(RangeError);
  });

  it("the counter stops at 2^53 - 1", () => {
    expect(nextCounterValue(MAX_COUNTER - 1, 0)).toBe(MAX_COUNTER);
    expect(() => nextCounterValue(MAX_COUNTER, 0)).toThrow(/exhausted/);
  });
});
