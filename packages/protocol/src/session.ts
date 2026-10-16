// The phone's session machine, sans-IO, the twin of relay-core's PhoneSession. Time
// is passed in (`now`, a monotonic millisecond clock; `wallMs` only for the counter).
//
// Restart rules (owner decisions, 2026-10-16): one 10 s restart window per (Mac,
// relay), shared by every trigger. A trigger inside it is coalesced into one deferred
// start at the window's end, dropped if a session completes first. A handshake with
// no hs2 gets one retry 10 s later. Pinned by vectors/schedule.json, which the Rust
// scheduler runs too.
import { expectLength, toHex } from "./bytes";
import { NONCE_CEILING, MAX_PLAINTEXT, type Routed, type Session } from "./frame";
import { MAX_COUNTER, startHandshake, type Initiator, type StaticKeypair } from "./noise";

/** The restart window: at most one start per 10 s per (Mac, relay). */
export const RESTART_WINDOW_MS = 10000;
/** A handshake with no hs2 is retried once, this long after it started. */
export const RETRY_MS = 10000;
/** An armed newer handshake with no hs2 this long after its start raises a trigger. */
export const HANGING_MS = 10000;
/** The phone handshakes again this long after a session completed. */
export const MAX_SESSION_AGE_MS = 86400000;
/** An outstanding handshake expires this long after it started. */
export const OUTSTANDING_TTL_MS = 86400000;
/** At most this many outstanding handshakes, the oldest dropped. */
export const MAX_OUTSTANDING = 4;

function checkTime(ms: number, what: string): void {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError(`${what} is an integer from 0 to 2^53 - 1, not ${ms}`);
}

// --- The counter store ---------------------------------------------------------------

/** The phone's last_sent per Mac identity key, whatever the relay. Async, as
 *  expo-secure-store is. */
export interface LastSentStore {
  get(macId: Uint8Array): Promise<number | null>;
  set(macId: Uint8Array, value: number): Promise<void>;
}

/** A LastSentStore in memory. */
export function memoryLastSentStore(): LastSentStore {
  const map = new Map<string, number>();
  return {
    get: async (macId) => map.get(toHex(macId)) ?? null,
    set: async (macId, value) => {
      map.set(toHex(macId), value);
    },
  };
}

/** The counter rule both languages share: max(wallMs, last + 1), or wallMs if nothing
 *  was sent. Throws a RangeError for a bad input, and an Error past 2^53 - 1. */
export function nextCounterValue(last: number | null, wallMs: number): number {
  checkTime(wallMs, "wall_ms");
  if (last !== null) checkTime(last, "last_sent");
  const v = last === null ? wallMs : Math.max(wallMs, last + 1);
  if (v > MAX_COUNTER) throw new Error("hs1 counter exhausted");
  return v;
}

/** One per app: hands out rising counters per Mac key, each recorded before it is
 *  returned, with a promise chain per Mac key so every PhoneSession for that Mac (one
 *  per relay) gets a distinct one. A rejected store call rejects only its own caller;
 *  the chain goes on. */
export class CounterAllocator {
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(private readonly store: LastSentStore) {}

  next(macId: Uint8Array, wallMs: number): Promise<number> {
    expectLength(macId, 32, "Mac identity key");
    checkTime(wallMs, "wall_ms");
    const key = toHex(macId);
    const id = macId.slice();
    const prev = this.chains.get(key) ?? Promise.resolve();
    const result = prev.then(async () => {
      const v = nextCounterValue(await this.store.get(id), wallMs);
      await this.store.set(id, v);
      return v;
    });
    this.chains.set(
      key,
      result.catch(() => undefined),
    );
    return result;
  }
}

// --- The scheduler ---------------------------------------------------------------------

/** The time limits and the frame ceiling. Only the test hook lowers them. */
export interface Limits {
  windowMs: number;
  retryMs: number;
  hangingMs: number;
  maxAgeMs: number;
  ttlMs: number;
  /** The send nonce the phone stops at, and one past the received nonce that makes it
   *  handshake. */
  frameCeiling: number;
}

const DEFAULT_LIMITS: Limits = {
  windowMs: RESTART_WINDOW_MS,
  retryMs: RETRY_MS,
  hangingMs: HANGING_MS,
  maxAgeMs: MAX_SESSION_AGE_MS,
  ttlMs: OUTSTANDING_TTL_MS,
  frameCeiling: NONCE_CEILING,
};

/** What the phone's driver raises. */
export type Trigger = "mac_online" | "foreground" | "rehandshake" | "pull_to_refresh";
/** Every cause of a start, the driver's triggers included. */
export type Cause = Trigger | "bad_frame" | "no_session" | "ceiling";

interface Pending {
  token: number;
  startedAt: number;
  counter: number | null;
  hangingDue: number | null;
  hangingDone: boolean;
}

/** The phone's handshake scheduler, pure: the window and coalescing, the retry, the
 *  hanging-handshake trigger, 24 h, the frame ceilings and the adoption rule. A start
 *  is a token; it counts when emitted, whether or not `begin` follows. Not exported
 *  from the package. */
export class Scheduler {
  private lastStart: number | null = null;
  private deferred: number | null = null;
  /** Oldest first. */
  private outstanding: Pending[] = [];
  private retry: { token: number; due: number } | null = null;
  private session: { counter: number; completedAt: number; aged: boolean } | null = null;
  private nextToken = 1;

  constructor(private readonly limits: Limits = DEFAULT_LIMITS) {}

  private open(now: number): boolean {
    return this.lastStart === null || now >= this.lastStart + this.limits.windowMs;
  }

  /** A trigger, of any cause, through the window. Pull to refresh starts one with or
   *  without a session (owner decision, 2026-10-16). */
  trigger(_cause: Cause, now: number): number | null {
    if (this.open(now)) return this.start(now, true);
    this.deferred = now;
    return null;
  }

  private start(now: number, fresh: boolean): number {
    const token = this.nextToken++;
    this.lastStart = now;
    this.deferred = null;
    this.outstanding.push({ token, startedAt: now, counter: null, hangingDue: null, hangingDone: false });
    if (this.outstanding.length > MAX_OUTSTANDING) this.outstanding.shift();
    this.retry = fresh ? { token, due: now + this.limits.retryMs } : null;
    return token;
  }

  isOutstanding(token: number): boolean {
    return this.outstanding.some((p) => p.token === token);
  }

  /** Gives a start its counter. False if the token is stale (or already begun). */
  begin(token: number, counter: number): boolean {
    const p = this.outstanding.find((x) => x.token === token);
    if (!p || p.counter !== null) return false;
    p.counter = counter;
    return true;
  }

  /** Begun handshakes with a counter above the session's, newest first. */
  candidates(): { token: number; counter: number }[] {
    const floor = this.session?.counter ?? null;
    const out: { token: number; counter: number }[] = [];
    for (let i = this.outstanding.length - 1; i >= 0; i--) {
      const p = this.outstanding[i];
      if (p.counter !== null && (floor === null || p.counter > floor)) out.push({ token: p.token, counter: p.counter });
    }
    return out;
  }

  /** An hs2 completed the handshake with `counter`: adopted only if that counter is
   *  above the session's. Adoption drops the deferred trigger, every outstanding
   *  handshake not above it (and any not yet begun), and arms the hanging trigger of
   *  each newer one still outstanding, due at max(its start + 10 s, now + the adopted
   *  handshake's round trip) (owner decision, 2026-10-16), so a round trip over 10 s
   *  cannot loop. */
  adopt(counter: number, now: number): boolean {
    this.expire(now);
    const adopted = this.outstanding.find((p) => p.counter === counter);
    if (!adopted) return false;
    if (this.session && counter <= this.session.counter) return false;
    this.session = { counter, completedAt: now, aged: false };
    this.deferred = null;
    this.outstanding = this.outstanding.filter((p) => p.counter !== null && p.counter > counter);
    const roundTripEnd = now + (now - adopted.startedAt);
    for (const p of this.outstanding) {
      if (p.hangingDue === null && !p.hangingDone) p.hangingDue = Math.max(p.startedAt + this.limits.hangingMs, roundTripEnd);
    }
    this.dropStaleRetry();
    return true;
  }

  /** This side sent a frame with `nonce`: the send nonce reaching the ceiling is a
   *  trigger. */
  onSent(nonce: number, now: number): number | null {
    return this.session && nonce + 1 >= this.limits.frameCeiling ? this.trigger("ceiling", now) : null;
  }

  /** This side accepted a frame with `nonce`: ceiling - 1 is a trigger. */
  onReceived(nonce: number, now: number): number | null {
    return this.session && nonce + 1 >= this.limits.frameCeiling ? this.trigger("ceiling", now) : null;
  }

  /** Drops the session and every outstanding handshake. The window stays. */
  end(): void {
    this.outstanding = [];
    this.retry = null;
    this.session = null;
    this.deferred = null;
  }

  private dropStaleRetry(): void {
    if (this.retry && !this.isOutstanding(this.retry.token)) this.retry = null;
  }

  expire(now: number): void {
    this.outstanding = this.outstanding.filter((p) => now < p.startedAt + this.limits.ttlMs);
    this.dropStaleRetry();
  }

  /** Runs whatever is due at `now`. Several causes due together give one start: fresh
   *  (with its own retry) unless the retry alone was due. */
  poll(now: number): { start: number | null; hanging: number[] } {
    this.expire(now);
    let raised = false;
    if (this.session && !this.session.aged && now >= this.session.completedAt + this.limits.maxAgeMs) {
      this.session.aged = true;
      raised = true;
    }
    const hanging: number[] = [];
    for (const p of this.outstanding) {
      if (p.hangingDue !== null && now >= p.hangingDue) {
        p.hangingDue = null;
        p.hangingDone = true;
        raised = true;
        if (p.counter !== null) hanging.push(p.counter);
      }
    }
    const retryDue = this.retry !== null && now >= this.retry.due;
    let start: number | null = null;
    if (this.open(now)) {
      const fresh = raised || this.deferred !== null;
      if (fresh || retryDue) start = this.start(now, fresh);
    } else if (raised) {
      // A retry is due only at its start's window end, so it is never here.
      this.deferred = now;
    }
    return { start, hanging };
  }

  /** The earliest time `poll` has work, or null. */
  nextDeadline(): number | null {
    const times: number[] = [];
    if (this.deferred !== null && this.lastStart !== null) times.push(this.lastStart + this.limits.windowMs);
    if (this.retry) times.push(this.retry.due);
    for (const p of this.outstanding) if (p.hangingDue !== null) times.push(p.hangingDue);
    if (this.session && !this.session.aged) times.push(this.session.completedAt + this.limits.maxAgeMs);
    return times.length ? Math.min(...times) : null;
  }

  sessionCounter(): number | null {
    return this.session?.counter ?? null;
  }
}

// --- The phone -------------------------------------------------------------------------

/** What the phone's driver must do. */
export type PhoneAction =
  /** Get a counter (CounterAllocator.next) and call begin(token, counter). If the
   *  store fails, skip begin: no hs1 is sent. */
  | { kind: "start_handshake"; token: number }
  /** Send this envelope to the relay. */
  | { kind: "send"; routed: Routed }
  /** A newer session was adopted. */
  | { kind: "started" }
  /** A frame's plaintext. */
  | { kind: "deliver"; plaintext: Uint8Array };

let pendingLimits: Limits | null = null;

/** The phone's session with one Mac over one relay. */
export class PhoneSession {
  private readonly limits: Limits;
  private readonly sched: Scheduler;
  private initiators: { token: number; init: Initiator }[] = [];
  private session: Session | null = null;
  private outbox: PhoneAction[] = [];
  private outboxAt: number | null = null;
  private readonly own: StaticKeypair;
  private readonly iM: Uint8Array;
  private readonly iP: Uint8Array;
  private readonly macStatic: Uint8Array;

  /** The phone (`own`, identity `iP`) and its Mac (`iM`, static `macStatic`). Throws a
   *  RangeError for a wrong-length key and an Error for a low-order Mac static. */
  constructor(own: StaticKeypair, iM: Uint8Array, iP: Uint8Array, macStatic: Uint8Array) {
    startHandshake(own, iM, iP, macStatic, 0);
    this.own = { secret: own.secret.slice(), public: own.public.slice() };
    this.iM = iM.slice();
    this.iP = iP.slice();
    this.macStatic = macStatic.slice();
    this.limits = pendingLimits ?? DEFAULT_LIMITS;
    pendingLimits = null;
    this.sched = new Scheduler(this.limits);
  }

  private sync(): void {
    this.initiators = this.initiators.filter((x) => this.sched.isOutstanding(x.token));
  }

  private static starts(token: number | null): PhoneAction[] {
    return token === null ? [] : [{ kind: "start_handshake", token }];
  }

  private queue(token: number | null, now: number): void {
    if (token === null) return;
    this.outbox.push({ kind: "start_handshake", token });
    if (this.outboxAt === null) this.outboxAt = now;
  }

  trigger(kind: Trigger, now: number): PhoneAction[] {
    checkTime(now, "now");
    if (kind !== "mac_online" && kind !== "foreground" && kind !== "rehandshake" && kind !== "pull_to_refresh") {
      throw new RangeError(`unknown trigger ${String(kind)}`);
    }
    const token = this.sched.trigger(kind, now);
    this.sync();
    return PhoneSession.starts(token);
  }

  /** The second step of a start: hs1 with `counter`, as an envelope to the Mac. Null if
   *  the token is stale (end() ran, or a newer session was adopted, since the start);
   *  the counter is then simply skipped. */
  begin(token: number, counter: number): Routed | null {
    if (!Number.isSafeInteger(counter) || counter < 0) throw new RangeError(`bad counter ${counter}`);
    if (!this.sched.isOutstanding(token)) return null;
    const init = startHandshake(this.own, this.iM, this.iP, this.macStatic, counter);
    if (!this.sched.begin(token, counter)) return null;
    this.initiators.push({ token, init });
    return { kind: 1, peer: this.iM.slice(), body: init.hs1 };
  }

  /** An hs2 from the Mac: tried against the outstanding handshakes newest first, only
   *  those above the current session's counter, and adopted if one completes. */
  onHs2(hs2: Uint8Array, now: number): PhoneAction[] {
    checkTime(now, "now");
    this.sched.expire(now);
    this.sync();
    for (const { token, counter } of this.sched.candidates()) {
      const entry = this.initiators.find((x) => x.token === token);
      const session = entry?.init.finish(hs2);
      if (session) {
        this.sched.adopt(counter, now);
        this.session = session;
        this.sync();
        return [{ kind: "started" }];
      }
    }
    return [];
  }

  /** A frame body from the Mac. */
  onFrame(body: Uint8Array, now: number): PhoneAction[] {
    checkTime(now, "now");
    if (!this.session) return [];
    const got = this.session.open(body);
    if (got.kind === "drop") return [];
    if (got.kind === "bad") {
      const token = this.sched.trigger("bad_frame", now);
      this.sync();
      return PhoneSession.starts(token);
    }
    const token = this.sched.onReceived(this.session.lastRecv!, now);
    this.sync();
    return [{ kind: "deliver", plaintext: got.plaintext }, ...PhoneSession.starts(token)];
  }

  /** Seals a frame to the Mac. Throws a RangeError over 60,000 bytes. With no session,
   *  or at the ceiling, it refuses and raises the trigger, whose action comes from the
   *  next poll. */
  send(plaintext: Uint8Array, now: number): { ok: true; routed: Routed } | { ok: false; error: "no_session" | "ceiling" } {
    checkTime(now, "now");
    if (plaintext.length > MAX_PLAINTEXT) {
      throw new RangeError(`a plaintext is at most ${MAX_PLAINTEXT} bytes, not ${plaintext.length}`);
    }
    if (!this.session) {
      this.queue(this.sched.trigger("no_session", now), now);
      return { ok: false, error: "no_session" };
    }
    if (this.session.sendNonce >= this.limits.frameCeiling) {
      this.queue(this.sched.trigger("ceiling", now), now);
      return { ok: false, error: "ceiling" };
    }
    const nonce = this.session.sendNonce;
    const sealed = this.session.seal(plaintext);
    if (!sealed.ok) return { ok: false, error: "ceiling" };
    this.queue(this.sched.onSent(nonce, now), now);
    return { ok: true, routed: { kind: 3, peer: this.iM.slice(), body: sealed.body } };
  }

  /** Drops the session and its outstanding handshakes (no pair remains). */
  end(): void {
    this.sched.end();
    this.initiators = [];
    this.session = null;
    this.outbox = [];
    this.outboxAt = null;
  }

  /** Runs whatever is due at `now`. */
  poll(now: number): PhoneAction[] {
    checkTime(now, "now");
    const out = this.outbox;
    this.outbox = [];
    this.outboxAt = null;
    const { start } = this.sched.poll(now);
    this.sync();
    return [...out, ...PhoneSession.starts(start)];
  }

  /** The earliest time poll has work, or null. */
  nextDeadline(): number | null {
    const d = this.sched.nextDeadline();
    if (this.outboxAt === null) return d;
    return d === null ? this.outboxAt : Math.min(d, this.outboxAt);
  }

  /** The adopted session's id, or null. */
  get sessionId(): Uint8Array | null {
    return this.session ? this.session.id : null;
  }
}

/** A PhoneSession with lowered limits. Test hook: not exported from the package. */
export function phoneSessionWithLimits(
  own: StaticKeypair,
  iM: Uint8Array,
  iP: Uint8Array,
  macStatic: Uint8Array,
  limits: Partial<Limits>,
): PhoneSession {
  pendingLimits = { ...DEFAULT_LIMITS, ...limits };
  try {
    return new PhoneSession(own, iM, iP, macStatic);
  } finally {
    pendingLimits = null;
  }
}
