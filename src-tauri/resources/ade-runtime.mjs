import { execFile, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, mkdtemp, cp, rm, symlink, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r?\n/);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r?\n/);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
class TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
  /** @internal */
  static x(message, ctx, ptr) {
    throw new TomlError(message, { toml: ctx.s, ptr: ptr ?? ctx.p });
  }
}
function parseString(ctx) {
  let startPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (; ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in strings", ctx);
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state) {
        let s = ctx.s.slice(sliceStart, ctx.p);
        parsed = parsed ? parsed + s : s;
      }
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let errPtr = ctx.p++ - 1;
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0; j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            TomlError.x("invalid non-hex character in unicode escape", ctx);
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          TomlError.x("invalid unicode escape", ctx, errPtr);
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p--;
        state = 0;
      } else if (isMultiline && (c === 32 || c === 9)) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "	";
        else if (c === 110)
          parsed += "\n";
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          TomlError.x("unrecognised escape sequence", ctx);
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2)
        TomlError.x("invalid escape: only line-ending whitespace may be escaped", ctx, sliceStart);
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  TomlError.x("unfinished string", ctx, startPtr);
}
let DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[Tt ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|z|[-+]\d{2}:\d{2})?$/i;
class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date, fasttype, unsafeDelim) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    let c;
    if (typeof date === "string") {
      if (fasttype)
        prep: {
          if (fasttype < 3) {
            if (+date.slice(11, 13) > 23) {
              date = "";
              break prep;
            }
            if (fasttype === 2) {
              offset = null;
              date += "Z";
            } else if ((c = date.charCodeAt(date.length - 1)) !== 90 && c !== 122) {
              offset = date.slice(date.length - 6);
            }
            if (unsafeDelim)
              date = date.slice(0, 10) + "T" + date.slice(11);
          } else if (fasttype === 4) {
            date = +date.slice(0, 2) > 23 ? "" : `0000-01-01T${date}Z`;
          }
          hasDate = fasttype !== 4;
          hasTime = fasttype !== 3;
        }
      else {
        let match = date.match(DATE_TIME_RE);
        if (match) {
          if (!match[1]) {
            hasDate = false;
            date = `0000-01-01T${date}`;
          }
          hasTime = !!match[2];
          hasTime && date[10] === " " && (date = date.replace(" ", "T"));
          if (match[2] && +match[2] > 23) {
            date = "";
          } else {
            offset = match[3] || null;
            if (!offset && hasTime)
              date += "Z";
          }
        } else {
          date = "";
        }
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z" || this.#offset === "z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
}
function isDigit(char, base = 10) {
  return base === 16 ? char > 47 && char < 58 || char > 64 && char < 71 || char > 96 && char < 103 : char > 47 && char < 48 + base;
}
function isEndOfValue(char, delim) {
  return char === 32 || char === 9 || char === 10 || char === 13 || // Structure end or next value delimiter
  delim && (char === delim || char === 44) || // Comment
  char === 35;
}
function extractValue(ctx, end) {
  let errPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p);
  if (c === 91 || c === 123) {
    ctx.d-- || TomlError.x("document contains excessively nested structures. aborting.", ctx);
    let value = c === 91 ? parseArray(ctx) : parseInlineTable(ctx);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, false;
  }
  if (c === 43 || c === 45) {
    return parseNumber(ctx, ctx.p, ctx.s.charCodeAt(++ctx.p), 44 - c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 4) === 45 && ctx.s.charCodeAt(ctx.p + 7) === 45) {
    return parseDate$1(ctx, c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 2) === 58) {
    return parseTime(ctx, c, end);
  }
  return parseNumber(ctx, ctx.p, c, 0, end);
}
function parseNumber(ctx, startPtr, startChr, sign, endChr) {
  let c = startChr;
  let state = 0;
  let hasUnderscores = false;
  if (c === 105) {
    if (ctx.s.charCodeAt(++ctx.p) !== 110 || ctx.s.charCodeAt(++ctx.p) !== 102)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, (sign || 1) / 0;
  }
  if (c === 110) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 110)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, NaN;
  }
  if (c === 48) {
    if (++ctx.p >= ctx.s.length || isEndOfValue(c = ctx.s.charCodeAt(ctx.p), endChr))
      return ctx.bi === true ? 0n : 0;
    if (!sign) {
      if (c === 120)
        return parseIntegerBaseN(ctx, startPtr, 16, endChr);
      else if (c === 98)
        return parseIntegerBaseN(ctx, startPtr, 2, endChr);
      else if (c === 111)
        return parseIntegerBaseN(ctx, startPtr, 8, endChr);
    }
    if (c === 46)
      state = 2;
    else if (c === 101 || c === 69)
      state = 4;
    else
      TomlError.x("illegal leading zero", ctx, startPtr);
  } else if (!isDigit(c))
    TomlError.x("invalid value", ctx, startPtr);
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (!state)
      state = 1;
    if (c === 95) {
      if (!(state & 1))
        TomlError.x("illegal underscore", ctx);
      state += 11;
      hasUnderscores = true;
    } else if (state === 1 && c === 46)
      state = 2;
    else if ((state === 1 || state === 3) && (c === 101 || c === 69))
      state = 4;
    else if (state === 4 && (c === 43 || c === 45)) {
      state = 6;
    } else if (!isDigit(c))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (state > 9)
      state -= 11;
    else if (!(state & 1))
      state++;
  }
  if (!state) {
    let val = (startChr - 48) * (sign || 1);
    return ctx.bi === true ? BigInt(val) : val;
  }
  if (!(state & 1))
    TomlError.x("unfinished numeric value", ctx, startPtr);
  let str = ctx.s.slice(startPtr, ctx.p);
  if (hasUnderscores)
    str = str.replaceAll("_", "");
  return state > 1 ? parseFloat(str) : parseInteger(ctx, str, 10, startPtr);
}
function parseIntegerBaseN(ctx, startPtr, base, endChr) {
  let c, underscore = 1;
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (c === 95) {
      if (underscore & 1)
        TomlError.x("illegal underscore", ctx);
      underscore = 3;
    } else if (!isDigit(c, base))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (underscore & 1)
      underscore--;
  }
  if (underscore & 1)
    TomlError.x("unfinished numeric value", ctx);
  let str = ctx.s.slice(startPtr + 2, ctx.p);
  if (underscore)
    str = str.replaceAll("_", "");
  return parseInteger(ctx, str, base, startPtr);
}
function parseInteger(ctx, str, base, startPtr) {
  if (ctx.bi !== true)
    int: {
      let val = parseInt(str, base);
      if (!Number.isSafeInteger(val)) {
        if (ctx.bi)
          break int;
        TomlError.x("integer value cannot be represented losslessly", ctx, startPtr);
      }
      return val;
    }
  return base === 10 ? BigInt(str) : BigInt((base === 2 ? "0b" : base === 8 ? "0o" : "0x") + str);
}
function parseDate$1(ctx, c, endChr) {
  let startPtr = ctx.p++, unsafeSeparator;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++))) {
    return parseNumber(ctx, ctx.p = startPtr, c, 0, endChr);
  }
  ctx.p += 5;
  if (!isDigit(ctx.s.charCodeAt(ctx.p++)))
    TomlError.x("invalid date-time: date part is malformed", ctx, startPtr);
  if (ctx.p >= ctx.s.length || ((c = ctx.s.charCodeAt(ctx.p)) !== 32 || (unsafeSeparator = true, !isDigit(ctx.s.charCodeAt(ctx.p + 1)))) && c !== 84 && c !== 116) {
    let t2 = ctx.s.slice(startPtr, ctx.p);
    return readDate(ctx, t2, 3, false, startPtr);
  }
  if (ctx.s.charCodeAt(ctx.p += 3) !== 58)
    TomlError.x("invalid date-time: time part is malformed", ctx, startPtr);
  if (ctx.s.charCodeAt(ctx.p += 3) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  if (c = ctx.s.charCodeAt(ctx.p)) {
    if (c === 90 || c === 122) {
      let t2 = ctx.s.slice(startPtr, ++ctx.p);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, "[+00:00]");
    }
    if (c === 43 || c === 45) {
      let t2 = ctx.s.slice(startPtr, ctx.p += 6);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, !ctx.ld && "[" + ctx.s.slice(ctx.p - 6, ctx.p) + "]");
    }
  }
  let t = ctx.s.slice(startPtr, ctx.p);
  return readDate(ctx, t, 2, unsafeSeparator, startPtr);
}
function parseTime(ctx, c, endChr) {
  let start = ctx.p;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(++ctx.p))) {
    return parseNumber(ctx, --ctx.p, c, 0, endChr);
  }
  if (ctx.s.charCodeAt(ctx.p += 4) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  let t = ctx.s.slice(start, ctx.p);
  return readDate(ctx, t, 4, false, start);
}
function readDate(ctx, str, type, unsafeDelim, errPtr, temporalSuffix) {
  if (ctx.ld) {
    let date = new TomlDate(str, type, unsafeDelim);
    if (!date.isValid())
      TomlError.x("invalid date", ctx, errPtr);
    return date;
  }
  try {
    if (temporalSuffix)
      str += temporalSuffix;
    switch (type) {
      case 1:
        return Temporal.ZonedDateTime.from(str);
      case 2:
        return Temporal.PlainDateTime.from(str);
      case 3:
        return Temporal.PlainDate.from(str);
      case 4:
        return Temporal.PlainTime.from(str);
    }
  } catch (e) {
    TomlError.x(e instanceof Error ? e.message : "" + e, ctx, errPtr);
  }
}
function skipComment(ctx) {
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in comments", ctx);
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (ctx.p < ctx.s.length) {
    while (ctx.p < ctx.s.length && ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}
function parseKey(ctx, end = 61) {
  let startPtr;
  let state = 0;
  let parsed = [];
  let sliceStart;
  let c = ctx.s.charCodeAt(startPtr = ctx.p);
  do {
    if (c === end) {
      if (!state)
        TomlError.x("unexpected end of key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      return ctx.p++, parsed;
    } else if (c === 46) {
      if (!state)
        TomlError.x("illegal empty bare key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      state = 0;
    } else if (!state && (c === 34 || c === 39)) {
      if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2))
        TomlError.x("illegal quoted key: multiline strings are not allowed", ctx);
      parsed.push(parseString(ctx));
      state = 2;
      ctx.p--;
    } else if (c === 32 || c === 9) {
      if (state === 1) {
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
        state = 2;
      }
    } else if (state === 2 || c < 48 && c !== 45 || c > 57 && c < 65 || c > 90 && c < 97 && c !== 95 || c > 122) {
      TomlError.x("illegal character in key", ctx);
    } else if (!state) {
      state = 1;
      sliceStart = ctx.p;
    }
  } while (c = ctx.s.charCodeAt(++ctx.p));
  TomlError.x("incomplete key-value: cannot find end of key", ctx, startPtr);
}
function parseInlineTable(ctx) {
  let startPtr = ctx.p++;
  let res = /* @__PURE__ */ Object.create(null);
  let seen = /* @__PURE__ */ new Set();
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let errPtr = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0; i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        TomlError.x("trying to redefine an already defined value", ctx, errPtr);
      }
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor")) {
        t = ctx.uk !== 1 && TomlError.x("document contains an unsafe property", ctx, errPtr);
        break;
      }
      if (!hasOwn && unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      TomlError.x("trying to redefine an already defined value", ctx, errPtr);
    }
    skipVoid(ctx, true, true);
    let value = extractValue(
      ctx,
      125
      /* } */
    );
    if (t && typeof (t[k] = value) === "object")
      seen.add(value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished table", ctx, startPtr);
}
function parseArray(ctx) {
  let startPtr = ctx.p++;
  let res = [];
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(
      ctx,
      93
      /* ] */
    ));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished array", ctx, startPtr);
}
function peekTable(ctx, key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor"))
        return false;
      if (unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: /* @__PURE__ */ Object.create(null)
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = /* @__PURE__ */ Object.create(null));
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: /* @__PURE__ */ Object.create(null) };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function validateTablePeek(ctx, peek, ptr) {
  if (peek === null || ctx.uk === 2)
    TomlError.x(peek === null ? "trying to redefine an already defined table or value" : "document contains an unsafe property", ctx, ptr);
}
function parse(toml, options = {}) {
  let ctx = {
    s: toml,
    p: 0,
    d: options.maxDepth ?? 1e3,
    bi: options.integersAsBigInt ?? false,
    ld: options.useLegacyDate ?? true,
    uk: options.unsafeKeyBehaviour === "throw" ? 2 : options.unsafeKeyBehaviour === "drop" ? 1 : 0
  };
  let res = /* @__PURE__ */ Object.create(null);
  let meta = /* @__PURE__ */ Object.create(null);
  let tmp;
  let skipping = false;
  let tbl = res;
  let m = meta;
  if (toml.charCodeAt(0) === 65279)
    ctx.p++;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      skipping = false;
      let k = parseKey(
        ctx,
        93
        /* ] */
      );
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p) !== 93) {
          TomlError.x("expected end of table array declaration", ctx);
        }
        ctx.p++;
      }
      let p = peekTable(
        ctx,
        k,
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        validateTablePeek(ctx, p, tmp);
        skipping = true;
      } else {
        m = p[2];
        tbl = p[1];
      }
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(
        ctx,
        k,
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p && !skipping)
        validateTablePeek(ctx, p, tmp);
      skipVoid(ctx, true, true);
      let v = extractValue(ctx, void 0);
      if (p && !skipping)
        p[1][p[0]] = v;
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && (tmp !== 13 || toml.charCodeAt(ctx.p + 1) !== 10)) {
      TomlError.x("each key-value declaration must be followed by an end-of-line", ctx);
    }
    skipVoid(ctx);
  }
  return res;
}
const KEYED_MERGE_FIELDS = ["code", "id"];
function keyedMergeField(items) {
  if (items.length === 0 || !items.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    return null;
  }
  const records = items;
  for (const field of KEYED_MERGE_FIELDS) {
    if (!records.every((item) => field in item)) continue;
    for (const item of records) {
      const value = item[field];
      if (typeof value !== "string") {
        throw new Error(`keyed array identifier \`${field}\` must be a string, got ${typeof value}`);
      }
      if (!value) throw new Error(`keyed array identifier \`${field}\` must not be empty`);
    }
    return field;
  }
  return null;
}
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const field = keyedMergeField([...a, ...b]);
    if (field === null) return [...a, ...b];
    const merged = a.map((item) => ({ ...item }));
    const indexByKey = /* @__PURE__ */ new Map();
    a.forEach((item, index) => indexByKey.set(item[field], index));
    for (const item of b) {
      const copy = { ...item };
      const key = copy[field];
      const at = indexByKey.get(key);
      if (at === void 0) {
        indexByKey.set(key, merged.length);
        merged.push(copy);
      } else {
        merged[at] = copy;
      }
    }
    return merged;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out2 = { ...a };
    for (const [k, v] of Object.entries(b)) out2[k] = deepMerge(out2[k], v);
    return out2;
  }
  return b;
}
async function readLayer(fs2, p) {
  if (!await fs2.exists(p)) return null;
  return parse(await fs2.readText(p));
}
async function loadCentralConfig(projectRoot, fs2) {
  const base = await readLayer(fs2, `${projectRoot}/_bmad/config.toml`);
  if (!base) throw new Error(`no _bmad/config.toml under ${projectRoot}`);
  let out2 = deepMerge({}, base);
  const team = await readLayer(fs2, `${projectRoot}/_bmad/custom/config.toml`);
  if (team) out2 = deepMerge(out2, team);
  const user = await readLayer(fs2, `${projectRoot}/_bmad/custom/config.user.toml`);
  if (user) out2 = deepMerge(out2, user);
  return out2;
}
async function resolveCustomization(projectRoot, skillRoot, skill, fs2) {
  const base = await readLayer(fs2, `${skillRoot}/customize.toml`);
  if (!base) throw new Error(`no customize.toml at the root of skill ${skill} (${skillRoot})`);
  let out2 = deepMerge({}, base);
  const skillLayer = await readLayer(fs2, `${projectRoot}/_bmad/custom/${skill}.toml`);
  if (skillLayer) out2 = deepMerge(out2, skillLayer);
  const userLayer = await readLayer(fs2, `${projectRoot}/_bmad/custom/${skill}.user.toml`);
  if (userLayer) out2 = deepMerge(out2, userLayer);
  return out2;
}
const STATUSES = ["draft", "ready-for-dev", "in-progress", "in-review", "built", "done", "blocked", "dropped"];
const STATES = ["backlog", "in-progress", "review", "done", "dropped"];
const CONTAINER_STATUSES = ["in-progress", "done", "dropped"];
const STATE_OF = {
  "": "backlog",
  draft: "backlog",
  "ready-for-dev": "backlog",
  "in-progress": "in-progress",
  blocked: "in-progress",
  "in-review": "review",
  built: "review",
  done: "done",
  dropped: "dropped"
};
const LEAF_TYPES = ["story", "spike", "bug"];
const CONTAINER_TYPES = ["initiative", "epic"];
const NAME_RE = /^(story|spike|bug)-(.+)\.md$/;
const ID_RE = /^[0-9A-Za-z]+$/;
const CROSS_RE = /^([0-9A-Za-z]+)\.([0-9A-Za-z]+)$/;
const EPIC_RE = /^epic-[^/]+$/;
const BREAKDOWN = "tickets.toml";
const QUOTED_COMMENT_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s+#.*$/;
const FRONTMATTER_RE$1 = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const PLAN_FIELDS = ["status", "assignee", "blocked_at", "blocked_reason"];
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const UNKNOWN_RE = /^[ \t]*(?:[-*][ \t]+)?Unknown:[ \t]*(\S.*)$/gm;
const MIRROR_KEYS = ["ref", "tracker_id", "remote", "tracker_status", "assignee", "after"];
class TicketError extends Error {
  /** Extra keys the Python adds to the error object it prints. */
  data = {};
}
class NoMatch extends TicketError {
}
class StoreRefusal extends Error {
}
function pyStr(value) {
  if (value === void 0 || value === null) return "None";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  return pyRepr$4(value);
}
function pyOr(value, fallback) {
  return pyTruthy$1(value) ? value : fallback;
}
function pyTruthy$1(value) {
  if (value === void 0 || value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
function pyRepr$4(value) {
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    let out2 = quote;
    for (const ch of value) {
      if (ch === "\\") out2 += "\\\\";
      else if (ch === quote) out2 += "\\" + quote;
      else if (ch === "\n") out2 += "\\n";
      else if (ch === "\r") out2 += "\\r";
      else if (ch === "	") out2 += "\\t";
      else out2 += ch;
    }
    return out2 + quote;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === void 0 || value === null) return "None";
  if (Array.isArray(value)) return "[" + value.map(pyRepr$4).join(", ") + "]";
  return String(value);
}
function pyJsonString$1(value, ensureAscii) {
  let out2 = '"';
  const escape = (code) => "\\u" + code.toString(16).padStart(4, "0");
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (ch === '"') out2 += '\\"';
    else if (ch === "\\") out2 += "\\\\";
    else if (ch === "\n") out2 += "\\n";
    else if (ch === "\r") out2 += "\\r";
    else if (ch === "	") out2 += "\\t";
    else if (ch === "\b") out2 += "\\b";
    else if (ch === "\f") out2 += "\\f";
    else if (code < 32) out2 += escape(code);
    else if (ensureAscii && code > 126) {
      if (code > 65535) {
        const pair = code - 65536;
        out2 += escape(55296 + (pair >> 10)) + escape(56320 + (pair & 1023));
      } else out2 += escape(code);
    } else out2 += ch;
  }
  return out2 + '"';
}
function pyJson$2(value, opts = {}) {
  const ensureAscii = opts.ensureAscii ?? false;
  const indent = opts.indent;
  const write = (value2, depth) => {
    if (value2 === null || value2 === void 0) return "null";
    if (typeof value2 === "boolean") return value2 ? "true" : "false";
    if (typeof value2 === "number") return Number.isFinite(value2) ? String(value2) : "null";
    if (typeof value2 === "string") return pyJsonString$1(value2, ensureAscii);
    const open = indent === void 0 ? "" : "\n";
    const close = indent === void 0 ? "" : "\n" + " ".repeat(indent * depth);
    const inner = indent === void 0 ? "" : " ".repeat(indent * (depth + 1));
    const separator = indent === void 0 ? ", " : ",\n";
    if (Array.isArray(value2)) {
      if (!value2.length) return "[]";
      return "[" + open + value2.map((v) => inner + write(v, depth + 1)).join(separator) + close + "]";
    }
    const entries = Object.entries(value2).map(
      ([k, v]) => inner + pyJsonString$1(k, ensureAscii) + ": " + write(v, depth + 1)
    );
    if (!entries.length) return "{}";
    return "{" + open + entries.join(separator) + close + "}";
  };
  return write(value, 0);
}
const isAbsolutePath = (p) => p.startsWith("/");
function normalizePath$1(p) {
  const absolute = p.startsWith("/");
  const parts = [];
  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  if (absolute) return "/" + joined;
  return joined === "" ? "." : joined;
}
function joinPath(base, child) {
  if (child === "") return normalizePath$1(base);
  if (isAbsolutePath(child)) return normalizePath$1(child);
  const trimmed = base.replace(/\/+$/, "");
  return normalizePath$1(trimmed === "" ? child : `${trimmed}/${child}`);
}
function baseName(p) {
  const trimmed = p.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}
function parentOf(p) {
  const trimmed = p.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut <= 0 ? "/" : trimmed.slice(0, cut);
}
function relativePath(target, root) {
  const t = normalizePath$1(target);
  const r = normalizePath$1(root);
  if (isAbsolutePath(t) !== isAbsolutePath(r)) throw new Error("no relative path between the two");
  const ts = t.split("/").filter(Boolean);
  const rs = r.split("/").filter(Boolean);
  let shared = 0;
  while (shared < ts.length && shared < rs.length && ts[shared] === rs[shared]) shared += 1;
  const parts = [...rs.slice(shared).map(() => ".."), ...ts.slice(shared)];
  return parts.length ? parts.join("/") : ".";
}
function cwd() {
  return typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : "/";
}
function todayIso() {
  const now2 = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now2.getFullYear()}-${pad(now2.getMonth() + 1)}-${pad(now2.getDate())}`;
}
async function isDir(path, fs2) {
  try {
    await fs2.list(path);
    return true;
  } catch {
    return false;
  }
}
async function isFile$1(path, fs2) {
  return await fs2.exists(path) && !await isDir(path, fs2);
}
async function readText$1(path, fs2) {
  const raw = await fs2.readText(path);
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  return text.replace(/\r\n/g, "\n");
}
function parseFrontmatter(text, lenient = false) {
  const m = FRONTMATTER_RE$1.exec(text);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split("\n")) {
    if (lenient && (/\s/.test(line[0] ?? "") || line.startsWith("- "))) continue;
    if (line.replace(/^\s+/, "").startsWith("- ")) throw new TicketError("frontmatter lists must be inline: `key: [a, b]`");
    if (!line.trim() || line.replace(/^\s+/, "").startsWith("#") || !line.includes(":")) continue;
    const at = line.indexOf(":");
    const key = line.slice(0, at);
    const value = line.slice(at + 1).split("   #")[0].trim();
    const quotedValue = QUOTED_COMMENT_RE.exec(value);
    data[key.trim()] = scalar$1(quotedValue ? quotedValue[1] : value);
  }
  return data;
}
function scalar$1(value) {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((v) => scalar$1(v.trim()));
  }
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    if (value[0] === '"') {
      try {
        return String(JSON.parse(value));
      } catch {
        return value.slice(1, -1);
      }
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  return value;
}
function setFrontmatterValue(text, key, value) {
  const m = FRONTMATTER_RE$1.exec(text);
  if (!m) throw new TicketError("ticket has no frontmatter");
  const start = "---\n".length;
  const end = start + m[1].length;
  let block = m[1];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const everyLine = new RegExp(`^${escaped}:.*$\\n?`, "gm");
  const firstLine = new RegExp(`^${escaped}:.*$\\n?`, "m");
  if (value === "") {
    block = block.replace(everyLine, "").replace(/\n+$/, "");
  } else if (firstLine.test(block)) {
    block = block.replace(firstLine, () => `${key}: ${value}
`).replace(/\n+$/, "");
  } else {
    block = `${block}
${key}: ${value}`;
  }
  return text.slice(0, start) + block + text.slice(end);
}
function listValue(value, where) {
  if (value === void 0 || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new TicketError(`${where}: after must be a list`);
  return value;
}
function asFlag(value) {
  return pyStr(value).toLowerCase() === "true";
}
function oneOf(value, allowed, where, field) {
  if (value !== "" && !allowed.includes(value)) {
    throw new TicketError(`${where}: ${field} ${pyRepr$4(value)} is not one of ${allowed.join(", ")}`);
  }
  return value;
}
function asId(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && ID_RE.test(value) && value !== "true" && value !== "false") {
    return /^\d+$/.test(value) ? parseInt(value, 10) : value;
  }
  return null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function loadBreakdown(folder, fs2) {
  const path = joinPath(folder, BREAKDOWN);
  if (!await isFile$1(path, fs2)) return {};
  const where = `${baseName(folder)}/${BREAKDOWN}`;
  let data;
  try {
    data = parse(await readText$1(path, fs2));
  } catch (e) {
    throw new TicketError(`${where}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const floor = data["next_id"] === void 0 ? 0 : data["next_id"];
  if (typeof floor === "boolean" || typeof floor !== "number" || !Number.isInteger(floor)) {
    throw new TicketError(`${where}: \`next_id\` must be a whole number`);
  }
  for (const table of ["entry", "epic"]) {
    const rows = data[table] === void 0 ? [] : data[table];
    if (!Array.isArray(rows) || !rows.every(isRecord)) {
      throw new TicketError(`${where}: write \`[[${table}]]\` tables, one per ${table}`);
    }
    for (const row of rows) {
      for (const key of ["covers", "after", "references", "notes"]) {
        const value = row[key] === void 0 ? [] : row[key];
        if (!Array.isArray(value)) throw new TicketError(`${where}: \`${key}\` must be a list`);
      }
      const id = asId(row["id"]);
      row["id"] = id;
      if (id === null) {
        throw new TicketError(`${where}: every ${table} needs an \`id\`: a number, or letters and digits`);
      }
      if (table === "epic") {
        if (typeof row["slug"] !== "string" || !row["slug"]) {
          throw new TicketError(`${where}: epic ${row["id"]} needs a \`slug\``);
        }
        for (const a of row["after"] ?? []) {
          if (!isRecord(a) || asId(a["epic"]) === null && typeof a["epic"] !== "string") {
            throw new TicketError(
              `${where}: an epic's \`after\` takes tables: [{ epic = <id or slug>, needs = "..." }]`
            );
          }
        }
      }
    }
  }
  return data;
}
async function loadContainer(folder, fs2) {
  const name = baseName(folder);
  const path = joinPath(folder, `${name}.md`);
  if (!await isFile$1(path, fs2)) throw new TicketError(`${name}: no ${name}.md`);
  const fm = parseFrontmatter(await readText$1(path, fs2));
  if (!CONTAINER_TYPES.includes(fm["type"])) {
    throw new TicketError(
      `${name}/${name}.md: type ${pyRepr$4(fm["type"] ?? null)} is not one of ${CONTAINER_TYPES.join(", ")}`
    );
  }
  const status = oneOf(fm["status"] ?? "", CONTAINER_STATUSES, `${name}/${name}.md`, "status");
  return {
    slug: name,
    tracker_id: pyStr(pyOr(fm["tracker_id"] ?? "", "")),
    status,
    raw_after: listValue(fm["after"], `${name}.md`)
  };
}
function fileUnknown(text) {
  const body = text.replace(FRONTMATTER_RE$1, "").replace(COMMENT_RE, "");
  const found = [];
  for (const m of body.matchAll(UNKNOWN_RE)) found.push(m[1].trim());
  return found.join("; ");
}
async function loadFolder(folder, problems, fs2) {
  const where = baseName(folder);
  const rows = /* @__PURE__ */ new Map();
  for (const e of (await loadBreakdown(folder, fs2))["entry"] ?? []) {
    const n = e["id"];
    const kind = e["type"];
    if (!LEAF_TYPES.includes(kind)) {
      throw new TicketError(`${where}/${BREAKDOWN}: entry ${n} type ${pyRepr$4(kind ?? null)} is not one of ${LEAF_TYPES.join(", ")}`);
    }
    if (rows.has(n)) throw new TicketError(`${where}/${BREAKDOWN}: two entries with id ${n}`);
    rows.set(n, {
      epic: where,
      id: n,
      file: null,
      type: kind,
      tracker_id: "",
      title: pyStr(e["title"] ?? ""),
      status: "",
      tracker_status: "",
      state: "planned",
      assignee: "",
      refined: false,
      refine: kind === "bug" || asFlag(e["refine"] ?? false),
      description: pyStr(e["description"] ?? ""),
      verify: pyStr(e["verify"] ?? ""),
      unknown: pyStr(e["unknown"] ?? ""),
      references: (e["references"] ?? []).map(pyStr),
      notes: (e["notes"] ?? []).map(pyStr),
      risk: pyStr(e["risk"] ?? ""),
      hitl: asFlag(e["hitl"] ?? false),
      plan_checkpoint: asFlag(e["plan_checkpoint"] ?? false),
      done_checkpoint: asFlag(e["done_checkpoint"] ?? false),
      covers: (e["covers"] ?? []).map(pyStr),
      estimate: e["estimate"] ?? "",
      blocked_at: "",
      blocked_reason: "",
      raw_after: listValue(e["after"], `${where}/${BREAKDOWN} entry ${n}`),
      entry_after: null
    });
  }
  const unlisted = /* @__PURE__ */ new Map();
  const stray = [];
  const plans = [];
  const seen = /* @__PURE__ */ new Map();
  const names = (await fs2.list(folder)).filter((n) => n.endsWith(".md")).sort();
  for (const name of names) {
    const text = await readText$1(joinPath(folder, name), fs2);
    let fm = parseFrontmatter(text, true);
    if (Object.keys(fm).length === 0 && text.startsWith("---") && NAME_RE.test(name)) {
      throw new TicketError(`${where}/${name}: frontmatter does not close`);
    }
    if (!LEAF_TYPES.includes(fm["type"])) {
      if ("ticket" in fm) plans.push([name, fm]);
      continue;
    }
    try {
      fm = parseFrontmatter(text);
    } catch (e) {
      if (e instanceof TicketError) throw new TicketError(`${where}/${name}: ${e.message}`);
      throw e;
    }
    const status = oneOf(fm["status"] ?? "", STATUSES, `${where}/${name}`, "status");
    const trackerStatus = oneOf(fm["tracker_status"] ?? "", STATES, `${where}/${name}`, "tracker_status");
    const n = asId(fm["id"]);
    if (n !== null) {
      if (seen.has(n)) throw new TicketError(`${seen.get(n)} and ${name} share the id ${n}`);
      seen.set(n, name);
    }
    let row = n !== null ? rows.get(n) : void 0;
    if (row === void 0) {
      row = { epic: where, id: n, raw_after: [], entry_after: null, covers: [], title: "" };
      row["refine"] = true;
      if (n === null) stray.push(row);
      else unlisted.set(n, row);
    } else {
      row["entry_after"] = row["raw_after"];
      row["entry_hitl"] = row["hitl"];
    }
    Object.assign(row, {
      file: name,
      type: fm["type"],
      tracker_id: pyStr(pyOr(fm["tracker_id"] ?? "", "")),
      title: pyStr(pyOr(fm["title"] ?? "", row["title"])),
      status,
      tracker_status: trackerStatus,
      state: trackerStatus || STATE_OF[status],
      assignee: pyStr(pyOr(fm["assignee"] ?? "", "")),
      refined: asFlag(fm["refined"] ?? false),
      refine: row["refine"] || fm["type"] === "bug",
      hitl: asFlag(fm["hitl"] ?? false),
      covers: Array.isArray(fm["covers"]) ? fm["covers"].map(pyStr) : row["covers"],
      estimate: fm["estimate"] !== void 0 ? fm["estimate"] : pyOr(row["estimate"] ?? "", ""),
      risk: typeof fm["risk"] === "string" ? fm["risk"] : pyOr(row["risk"] ?? "", ""),
      blocked_at: fm["blocked_at"] !== void 0 ? fm["blocked_at"] : "",
      blocked_reason: pyStr(pyOr(fm["blocked_reason"] ?? "", "")),
      unknown: fileUnknown(text)
    });
    row["raw_after"] = listValue(fm["after"], `${where}/${name}`);
  }
  const order = [...unlisted.keys()].sort(idSort);
  const out2 = [...rows.values(), ...order.map((n) => unlisted.get(n)), ...stray];
  joinPlans(out2, plans, where, problems);
  return out2;
}
function idSort(a, b) {
  const ka = typeof a === "string" ? 1 : 0;
  const kb = typeof b === "string" ? 1 : 0;
  if (ka !== kb) return ka - kb;
  return a < b ? -1 : a > b ? 1 : 0;
}
function joinPlans(rows, plans, where, problems) {
  for (const [name, fm] of plans) {
    let ticket = fm["ticket"];
    let row;
    if (asId(ticket) !== null) {
      ticket = asId(ticket);
      row = rows.find((r) => r["id"] === ticket);
    }
    if (row === void 0 && typeof ticket === "string" && ticket) {
      row = rows.find((r) => r["file"] === `${ticket}.md`);
    }
    if (row === void 0) {
      problems.push(`${where}/${name}: ticket ${pyRepr$4(ticket)} names no entry or leaf file in ${where}; skipped`);
      continue;
    }
    if ("plan" in row) {
      throw new TicketError(`${where}/${row["plan"]} and ${name} are both plans for ticket ${pyRepr$4(ticket)}`);
    }
    const fields = {};
    for (const key of PLAN_FIELDS) fields[key] = pyStr(pyOr(fm[key] ?? "", ""));
    if (!("assignee" in fm)) {
      fields["assignee"] = row["assignee"] ?? "";
    }
    try {
      oneOf(fields["status"], STATUSES, `${where}/${name}`, "status");
    } catch (e) {
      if (!(e instanceof TicketError)) throw e;
      problems.push(`${e.message}; the ticket reads as blocked until the plan is fixed`);
      fields["blocked_reason"] = `${name} has an unknown status ${pyRepr$4(fields["status"])}`;
      fields["status"] = "blocked";
    }
    row["plan"] = name;
    row["state"] = row["tracker_status"] || STATE_OF[fields["status"]];
    Object.assign(row, fields);
  }
}
async function epicFolders(initiative, fs2) {
  let names;
  try {
    names = await fs2.list(initiative);
  } catch {
    return [];
  }
  const out2 = [];
  for (const name of names.filter((n) => n.startsWith("epic-")).sort()) {
    const dir = joinPath(initiative, name);
    if (await isFile$1(joinPath(dir, `${name}.md`), fs2) || await isFile$1(joinPath(dir, BREAKDOWN), fs2)) out2.push(dir);
  }
  return out2;
}
async function loadTree(folder, fs2) {
  let epics = await epicFolders(folder, fs2);
  let scope;
  let initiative;
  let folders;
  if (epics.length > 0 || "epic" in await loadBreakdown(folder, fs2)) {
    scope = null;
    initiative = folder;
    folders = null;
  } else if ((await epicFolders(parentOf(folder), fs2)).includes(folder)) {
    scope = baseName(folder);
    initiative = parentOf(folder);
    folders = await epicFolders(initiative, fs2);
    epics = folders;
  } else {
    scope = baseName(folder);
    initiative = null;
    folders = [folder];
  }
  const listed2 = initiative ? (await loadBreakdown(initiative, fs2))["epic"] ?? [] : [];
  const order = listed2.map((e) => e["slug"]);
  epics.sort((a, b) => {
    const ia = order.indexOf(baseName(a));
    const ib = order.indexOf(baseName(b));
    const ka = ia === -1 ? order.length : ia;
    const kb = ib === -1 ? order.length : ib;
    if (ka !== kb) return ka - kb;
    return baseName(a) < baseName(b) ? -1 : baseName(a) > baseName(b) ? 1 : 0;
  });
  if (folders === null) folders = [...epics, folder];
  const epicIds = {};
  for (const e of listed2) {
    if (Object.values(epicIds).includes(e["id"])) {
      throw new TicketError(`${baseName(initiative)}/${BREAKDOWN}: two epics with id ${e["id"]}`);
    }
    if (e["slug"] in epicIds) {
      throw new TicketError(`${baseName(initiative)}/${BREAKDOWN}: two epics with slug ${e["slug"]}`);
    }
    epicIds[e["slug"]] = e["id"];
  }
  const problems = [];
  const tickets2 = [];
  for (const f of folders) tickets2.push(...await loadFolder(f, problems, fs2));
  for (const t of tickets2) t["key"] = t["id"] !== null ? `${t["epic"]}/${t["id"]}` : `${t["epic"]}/${t["file"]}`;
  const tree = {
    scope,
    initiative,
    folders: Object.fromEntries(folders.map((f) => [baseName(f), f])),
    epicIds,
    containers: {},
    tickets: tickets2,
    problems
  };
  for (const f of epics) tree.containers[baseName(f)] = await loadContainer(f, fs2);
  resolveRefs(tree);
  checkCycles(tickets2, tree.containers);
  return tree;
}
function resolveRefs(tree) {
  const tickets2 = tree.tickets;
  const containers = tree.containers;
  const byKey = new Map(tickets2.map((t) => [t["key"], t]));
  const slugs = new Map(Object.entries(tree.epicIds).map(([slug, id]) => [id, slug]));
  const ids = /* @__PURE__ */ new Map();
  for (const [slug, c] of Object.entries(containers)) if (c["tracker_id"]) ids.set(c["tracker_id"], slug);
  for (const t of tickets2) if (t["tracker_id"]) ids.set(t["tracker_id"], t["key"]);
  const owners = /* @__PURE__ */ new Map();
  const carriers = [
    ...Object.entries(containers).map(([slug, c]) => [slug, c["tracker_id"]]),
    ...tickets2.map((t) => [t["key"], t["tracker_id"]])
  ];
  for (const [key, tid] of carriers) {
    if (!tid) continue;
    owners.set(tid.toLowerCase(), [...owners.get(tid.toLowerCase()) ?? [], key]);
  }
  for (const [tid, keys] of owners) {
    if (keys.length > 1) throw new TicketError(`tracker_id ${pyRepr$4(tid)} is on more than one ticket: ${keys.join(", ")}`);
  }
  const sibling = (t, ref2, where) => {
    const mates = tickets2.filter((o) => o["epic"] === t["epic"]);
    if (typeof ref2 === "number") {
      const hit = mates.find((o) => o["id"] === ref2);
      if (hit === void 0) throw new TicketError(`${where}: after ${pyRepr$4(ref2)} names no entry in ${t["epic"]}`);
      return hit["key"];
    }
    for (const o of mates) if (typeof o["id"] === "string" && o["id"] === ref2) return o["key"];
    for (const o of mates) {
      if (o["file"] && (ref2 === o["file"] || ref2 === o["file"].slice(0, -3))) return o["key"];
    }
    return null;
  };
  const resolve2 = (t, refs, where) => {
    const keys = [];
    for (const ref2 of refs) {
      const text = pyStr(ref2);
      let key = "id" in t ? sibling(t, ref2, where) : null;
      const m = CROSS_RE.exec(text);
      const slug = m ? slugs.get(asId(m[1])) ?? null : null;
      if (key === null && slug) {
        key = `${slug}/${asId(m[2])}`;
        if (!byKey.has(key)) throw new TicketError(`${where}: after ${pyRepr$4(ref2)} names no entry in ${slug}`);
      }
      if (key === null && EPIC_RE.test(text)) {
        if (!(text in containers)) throw new TicketError(`${where}: after ${pyRepr$4(ref2)} names no epic in this initiative`);
        key = text;
      }
      if (key === null) key = ids.get(text) ?? null;
      if (key === null && m) {
        throw new TicketError(`${where}: after ${pyRepr$4(ref2)} names no epic id in this initiative's ${BREAKDOWN}`);
      }
      if (key === null && NAME_RE.test(text.endsWith(".md") ? text : `${text}.md`)) {
        throw new TicketError(
          `${where}: after ${pyRepr$4(ref2)} matches no ticket in ${t["epic"]}; a file name names a pulled ticket in the same folder only: use the entry's id, or move a backlog ticket into the epic as an entry`
        );
      }
      if (key === null) throw new TicketError(`${where}: after ${pyRepr$4(ref2)} matches no ticket`);
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  };
  for (const t of tickets2) {
    const where = t["file"] ? `${t["epic"]}/${t["file"]}` : `${t["epic"]}/${BREAKDOWN} entry ${t["id"]}`;
    t["after"] = resolve2(t, t["raw_after"], where);
    delete t["raw_after"];
    const planned = t["entry_after"];
    delete t["entry_after"];
    t["gated_by"] = [];
    const entryHitl = t["entry_hitl"];
    delete t["entry_hitl"];
    t["drift"] = {};
    if (planned !== null && planned !== void 0) {
      const entryAfter = resolve2(t, planned, where);
      if (sortedKeys$1(entryAfter) !== sortedKeys$1(t["after"])) {
        t["drift"]["after"] = { file: t["after"], entry: entryAfter };
      }
      if (entryHitl !== t["hitl"]) t["drift"]["hitl"] = { file: t["hitl"], entry: entryHitl };
    }
  }
  for (const [slug, c] of Object.entries(containers)) {
    const gates = resolve2({ epic: slug }, c["raw_after"], `${slug}.md`);
    delete c["raw_after"];
    c["after"] = gates;
    for (const t of tickets2) if (t["epic"] === slug) t["gated_by"] = gates;
  }
}
function sortedKeys$1(keys) {
  return [...keys].sort().join("\0");
}
function checkCycles(tickets2, containers) {
  const graph = /* @__PURE__ */ new Map();
  for (const t of tickets2) graph.set(t["key"], [...t["after"], ...t["gated_by"]]);
  const members = /* @__PURE__ */ new Map();
  for (const t of tickets2) members.set(t["epic"], [...members.get(t["epic"]) ?? [], t["key"]]);
  for (const [slug, c] of Object.entries(containers)) {
    members.set(slug, [...members.get(slug) ?? [], ...c["after"]]);
  }
  const state = /* @__PURE__ */ new Map();
  const visit = (node, path) => {
    if (state.get(node) === "done") return;
    if (state.get(node) === "active") throw new TicketError("cycle through " + [...path, node].join(" -> "));
    state.set(node, "active");
    for (const b of graph.get(node) ?? members.get(node) ?? []) visit(b, [...path, node]);
    state.set(node, "done");
  };
  for (const node of graph.keys()) visit(node, []);
}
function doneKeys(tree) {
  const done = new Set(tree.tickets.filter((t) => t["state"] === "done").map((t) => t["key"]));
  for (const [slug, c] of Object.entries(tree.containers)) if (c["status"] === "done") done.add(slug);
  return done;
}
function inScope(tree) {
  return tree.tickets.filter((t) => tree.scope === null || t["epic"] === tree.scope);
}
function classify(tree) {
  const done = doneKeys(tree);
  const met = /* @__PURE__ */ new Set([...done, ...tree.tickets.filter((t) => t["state"] === "review").map((t) => t["key"])]);
  const groups = { ready_to_refine: [], ready_to_start: [], in_progress: [], blocked: [] };
  for (const t of inScope(tree)) {
    const state = t["state"];
    if (state === "done" || state === "dropped") continue;
    const unmet = [
      ...t["after"].filter((b) => !met.has(b)),
      ...t["gated_by"].filter((b) => !done.has(b))
    ];
    if (t["status"] === "blocked" || pyTruthy$1(t["blocked_at"])) {
      t["waiting_on"] = unmet;
      groups.blocked.push(t);
    } else if (state === "in-progress" || state === "review") {
      groups.in_progress.push(t);
    } else if (unmet.length) {
      t["waiting_on"] = unmet;
      groups.blocked.push(t);
    } else if (t["refine"] && !t["refined"]) {
      groups.ready_to_refine.push(t);
    } else if (pyTruthy$1(t["unknown"])) {
      groups.blocked.push(t);
    } else {
      groups.ready_to_start.push(t);
    }
  }
  return groups;
}
function longestRemainingChain(tree) {
  const remaining = new Map(
    tree.tickets.filter((t) => t["state"] !== "done" && t["state"] !== "dropped").map((t) => [t["key"], t])
  );
  const memo = /* @__PURE__ */ new Map();
  const chain = (k) => {
    const hit = memo.get(k);
    if (hit) return hit;
    let best = [];
    for (const b of [...remaining.get(k)["after"], ...remaining.get(k)["gated_by"]]) {
      if (!remaining.has(b)) continue;
      const c = chain(b);
      if (c.length > best.length) best = c;
    }
    const out2 = [...best, k];
    memo.set(k, out2);
    return out2;
  };
  let longest = [];
  for (const t of inScope(tree)) {
    if (!remaining.has(t["key"])) continue;
    const c = chain(t["key"]);
    if (c.length > longest.length) longest = c;
  }
  return longest.map((k) => ref(k, null, tree));
}
function ref(key, epic, tree) {
  const cut = key.indexOf("/");
  const slug = cut === -1 ? key : key.slice(0, cut);
  const n = cut === -1 ? "" : key.slice(cut + 1);
  if (!n) return slug;
  if (asId(n) === null) return key;
  if (slug === epic) return asId(n);
  if (slug in tree.epicIds) return `${tree.epicIds[slug]}.${n}`;
  return key;
}
async function declaredAfter(tree, fs2) {
  if (!tree.initiative) return {};
  const listed2 = (await loadBreakdown(tree.initiative, fs2))["epic"] ?? [];
  const slugs = listed2.map((e) => e["slug"]);
  const byId = new Map(Object.entries(tree.epicIds).map(([slug, i]) => [i, slug]));
  const out2 = {};
  for (const e of listed2) {
    out2[e["slug"]] = [];
    for (const a of e["after"] ?? []) {
      const needed = byId.get(asId(a["epic"])) ?? a["epic"];
      if (!slugs.includes(needed)) {
        throw new TicketError(
          `${baseName(tree.initiative)}/${BREAKDOWN}: ${e["slug"]} is after ${pyRepr$4(a["epic"] ?? null)}, which is no epic listed`
        );
      }
      out2[e["slug"]].push({ epic: needed, needs: a["needs"] ?? "" });
    }
  }
  return out2;
}
function unpinnedAfter(tree, declared) {
  const out2 = [];
  for (const [slug, edges] of Object.entries(declared)) {
    const mine = tree.tickets.filter((t) => t["epic"] === slug);
    for (const a of edges) {
      const needed = a["epic"];
      const pinned = mine.some(
        (t) => [...t["after"], ...t["gated_by"]].some((b) => b === needed || String(b).startsWith(`${needed}/`))
      );
      if (mine.length && !pinned && (tree.scope === null || tree.scope === slug)) {
        out2.push({ epic: slug, after: needed, needs: a["needs"] });
      }
    }
  }
  return out2;
}
function crossEpicAfter(tree, declared) {
  const order = Object.keys(declared);
  const undeclared = [];
  const conflicts = [];
  const conflict = (epic, needed) => {
    const pair = { epic, after: needed };
    if (order.indexOf(needed) > order.indexOf(epic) && !conflicts.some((c) => JSON.stringify(c) === JSON.stringify(pair)) && (tree.scope === null || tree.scope === epic)) {
      conflicts.push(pair);
    }
  };
  for (const [slug, edges] of Object.entries(declared)) for (const a of edges) conflict(slug, a["epic"]);
  for (const [slug, c] of Object.entries(tree.containers)) {
    for (const b of c["after"]) {
      const needed = String(b).split("/")[0];
      if (slug in declared && needed in declared) conflict(slug, needed);
    }
  }
  for (const t of tree.tickets) {
    if (!(t["epic"] in declared)) continue;
    const allowed = new Set(declared[t["epic"]].map((a) => a["epic"]));
    for (const b of t["after"]) {
      const needed = String(b).split("/")[0];
      if (needed === t["epic"] || !(needed in declared)) continue;
      conflict(t["epic"], needed);
      if (!allowed.has(needed) && (tree.scope === null || tree.scope === t["epic"])) {
        undeclared.push({
          epic: t["epic"],
          after: needed,
          ref: rowRef(t, tree),
          names: ref(b, t["epic"], tree)
        });
      }
    }
  }
  return { undeclared_after: undeclared, order_conflict: conflicts };
}
function rowRef(t, tree) {
  if (t["id"] !== null && t["epic"] in tree.epicIds) return `${tree.epicIds[t["epic"]]}.${t["id"]}`;
  if (t["id"] !== null && t["epic"] === tree.scope) return pyStr(t["id"]);
  return t["file"];
}
const PUBLIC_KEYS = [
  "epic",
  "id",
  "file",
  "type",
  "tracker_id",
  "title",
  "status",
  "tracker_status",
  "state",
  "assignee",
  "hitl",
  "risk",
  "covers",
  "estimate",
  "refine",
  "refined",
  "blocked_at",
  "blocked_reason"
];
function publicRow(t, tree, blocks) {
  const row = {};
  for (const key of PUBLIC_KEYS) row[key] = t[key];
  row["ref"] = rowRef(t, tree);
  row["after"] = t["after"].map((b) => ref(b, t["epic"], tree));
  if (t["gated_by"].length) row["gated_by"] = t["gated_by"];
  if (blocks !== void 0) row["blocks"] = (blocks[t["key"]] ?? []).map((b) => ref(b, t["epic"], tree));
  if (Object.keys(t["drift"]).length) {
    row["drift"] = { ...t["drift"] };
    if ("after" in row["drift"]) {
      row["drift"]["after"] = Object.fromEntries(
        Object.entries(t["drift"]["after"]).map(([k, v]) => [
          k,
          v.map((b) => ref(b, t["epic"], tree))
        ])
      );
    }
  }
  if (pyTruthy$1(t["waiting_on"])) row["waiting_on"] = t["waiting_on"].map((b) => ref(b, t["epic"], tree));
  for (const key of ["unknown", "plan_checkpoint", "done_checkpoint"]) {
    if (pyTruthy$1(t[key])) row[key] = t[key];
  }
  return row;
}
async function findProjectRoot$1(start, fs2) {
  let p = normalizePath$1(start);
  for (; ; ) {
    if (await isDir(joinPath(p, "_bmad"), fs2)) return p;
    if (p === "/") return null;
    p = parentOf(p);
  }
}
async function projectRootFor(args, start, fs2) {
  return args.projectRoot !== void 0 ? normalizePath$1(args.projectRoot) : findProjectRoot$1(start, fs2);
}
async function storeConfig(projectRoot, fs2) {
  if (projectRoot === null) return {};
  const path = joinPath(projectRoot, "_bmad/custom/ticketing-store-config.toml");
  if (!await isFile$1(path, fs2)) return {};
  const parsed = parse(await readText$1(path, fs2));
  const tickets2 = parsed["tickets"] ?? {};
  return isRecord(tickets2) ? tickets2 : {};
}
async function storeName(projectRoot, fs2) {
  const store = (await storeConfig(projectRoot, fs2))["store"] ?? "repo";
  return typeof store === "string" && store ? store : "repo";
}
async function centralConfig(projectRoot, fs2) {
  try {
    return await loadCentralConfig(projectRoot, fs2);
  } catch (e) {
    throw new TicketError(e instanceof Error ? e.message : String(e));
  }
}
async function ticketsRoot(projectRoot, config) {
  const core = config["core"];
  const output = pyStr(isRecord(core) ? core["output_folder"] ?? "" : "");
  return joinPath(projectRoot, output.replaceAll("{project-root}", projectRoot));
}
async function activeInitiative(projectRoot, fs2) {
  const config = await centralConfig(projectRoot, fs2);
  const core = config["core"];
  const name = isRecord(core) ? core["active_initiative"] : null;
  if (typeof name !== "string" || !name.trim()) {
    throw new TicketError(
      "no active initiative: set core.active_initiative in _bmad/custom/config.user.toml, or pass a folder"
    );
  }
  const folder = normalizePath$1(joinPath(await ticketsRoot(projectRoot, config), name.trim()));
  if (!await isDir(folder, fs2)) throw new TicketError(`active initiative folder not found: ${folder}`);
  return folder;
}
async function commandFolder(args, fs2) {
  if (args.dir === void 0) {
    const root2 = await projectRootFor(args, cwd(), fs2);
    if (root2 === null) {
      throw new TicketError("no project root found: no _bmad/ at or above the working directory; pass --project-root");
    }
    args.projectRoot = root2;
    const folder = await activeInitiative(root2, fs2);
    const backlog = normalizePath$1(joinPath(await ticketsRoot(root2, await centralConfig(root2, fs2)), "backlog"));
    args.backlog = await isDir(backlog, fs2) && backlog !== folder ? backlog : null;
    return folder;
  }
  const given = args.dir;
  const candidate = normalizePath$1(isAbsolutePath(given) ? given : joinPath(cwd(), given));
  let root = null;
  if (!await isDir(candidate, fs2) && !isAbsolutePath(given)) root = await projectRootFor(args, cwd(), fs2);
  if (root !== null) {
    let config = null;
    let bases;
    try {
      config = await centralConfig(root, fs2);
      bases = [await ticketsRoot(root, config), root];
    } catch {
      bases = [root];
    }
    if (config !== null) {
      try {
        bases.splice(1, 0, await activeInitiative(root, fs2));
      } catch {
      }
    }
    for (const base of bases) {
      const joined = normalizePath$1(joinPath(base, given));
      if (await isDir(joined, fs2)) return joined;
    }
  }
  if (!await isDir(candidate, fs2)) throw new TicketError(`not a folder: ${candidate}`);
  return candidate;
}
async function withBacklog(args, out2, view) {
  const backlog = args.backlog ?? null;
  if (backlog !== null) {
    try {
      out2["backlog"] = await view(backlog);
    } catch (e) {
      out2["backlog"] = { folder: baseName(backlog), error: pyStr(e instanceof Error ? e.message : e) };
    }
    for (const group of ["ready_to_refine", "ready_to_start", "in_progress", "blocked", "tickets"]) {
      for (const row of out2["backlog"][group] ?? []) {
        row["ref"] = row["file"] || row["ref"];
      }
    }
  }
  return out2;
}
async function locate(args, folder, text, fs2) {
  const tree = await loadTree(folder, fs2);
  try {
    return [resolveTicket(tree, text), tree];
  } catch (miss) {
    if (!(miss instanceof NoMatch)) throw miss;
    const backlog = args.backlog ?? null;
    if (backlog === null) throw miss;
    try {
      const other = await loadTree(backlog, fs2);
      other["fallback"] = true;
      return [resolveTicket(other, text), other];
    } catch {
      throw miss;
    }
  }
}
async function nextView(folder, fs2) {
  const tree = await loadTree(folder, fs2);
  const declared = await declaredAfter(tree, fs2);
  const out2 = { folder: baseName(folder) };
  for (const [group, rows] of Object.entries(classify(tree))) {
    out2[group] = rows.map((t) => publicRow(t, tree));
  }
  out2["unpinned_after"] = unpinnedAfter(tree, declared);
  Object.assign(out2, crossEpicAfter(tree, declared));
  if (tree.problems.length) out2["problems"] = tree.problems;
  return out2;
}
async function cmdNext(args, fs2) {
  const folder = await commandFolder(args, fs2);
  const store = await storeName(await projectRootFor(args, folder, fs2), fs2);
  if (store !== "repo" && !args.synced) {
    throw new StoreRefusal(`store is ${store}: sync ticket status from the tracker first, then rerun with --synced`);
  }
  const out2 = { store, ...await nextView(folder, fs2) };
  return withBacklog(args, out2, (f) => nextView(f, fs2));
}
async function nextId(tree, folder, fs2) {
  const used = tree.tickets.filter((t) => t["epic"] === folder).map((t) => /^\d+/.exec(pyStr(t["id"])));
  const floor = (await loadBreakdown(tree.folders[folder], fs2))["next_id"] ?? 0;
  const highest = used.reduce((acc, m) => m ? Math.max(acc, parseInt(m[0], 10)) : acc, 0);
  return Math.max(highest + 1, floor);
}
async function statusView(folder, fs2) {
  const tree = await loadTree(folder, fs2);
  const declared = await declaredAfter(tree, fs2);
  const tickets2 = inScope(tree);
  const counts = {};
  for (const t of tickets2) counts[t["state"]] = (counts[t["state"]] ?? 0) + 1;
  const blocks = {};
  for (const t of tree.tickets) {
    for (const b of t["after"]) (blocks[b] ??= []).push(t["key"]);
  }
  const out2 = {
    folder: baseName(folder),
    tickets: tickets2.map((t) => publicRow(t, tree, blocks)),
    counts: { total: tickets2.length, ...counts },
    longest_remaining_chain: longestRemainingChain(tree),
    unpinned_after: unpinnedAfter(tree, declared),
    ...crossEpicAfter(tree, declared)
  };
  if (tree.problems.length) out2["problems"] = tree.problems;
  if (tree.scope === null) {
    const epics = [];
    for (const [slug, c] of Object.entries(tree.containers)) {
      epics.push({
        slug,
        id: tree.epicIds[slug] ?? null,
        status: c["status"],
        after: declared[slug] ?? [],
        gated_by: c["after"],
        blocks: (blocks[slug] ?? []).map((b) => ref(b, null, tree)),
        next_id: await nextId(tree, slug, fs2)
      });
    }
    out2["epics"] = epics;
  } else {
    out2["next_id"] = await nextId(tree, tree.scope, fs2);
  }
  return out2;
}
async function cmdStatus(args, fs2) {
  const folder = await commandFolder(args, fs2);
  const store = await storeName(await projectRootFor(args, folder, fs2), fs2);
  const out2 = { store, ...await statusView(folder, fs2) };
  return withBacklog(args, out2, (f) => statusView(f, fs2));
}
const PULLED = `---
{frontmatter}
---

# {heading}

## Description

{description}

## Acceptance Criteria

Verify: {verify}

## References

- parent — {parent}
{references}{notes}`;
function titleSlug(title) {
  const ascii = title.normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return slug || "untitled";
}
function resolveTicket(tree, text) {
  const tickets2 = tree.tickets;
  const needle = text.trim();
  if (!needle) throw new TicketError("the ticket reference is empty");
  const low = needle.toLowerCase();
  let hits = [];
  const m = CROSS_RE.exec(needle);
  if (m) {
    const slug = new Map(Object.entries(tree.epicIds).map(([s, i]) => [i, s])).get(asId(m[1])) ?? null;
    hits = tickets2.filter((t) => slug && t["epic"] === slug && t["id"] === asId(m[2]));
  } else if (asId(needle) !== null && tree.scope) {
    hits = tickets2.filter((t) => t["epic"] === tree.scope && t["id"] === asId(needle));
  }
  if (!hits.length && typeof asId(needle) === "string") {
    hits = tickets2.filter((t) => t["id"] === asId(needle));
  }
  for (const pool of [inScope(tree), tickets2]) {
    if (!hits.length) {
      hits = pool.filter(
        (t) => t["file"] && (low === t["file"].toLowerCase() || low === t["file"].slice(0, -3).toLowerCase())
      );
    }
  }
  if (!hits.length) hits = tickets2.filter((t) => t["tracker_id"] && low === t["tracker_id"].toLowerCase());
  if (!hits.length && !/^\d+$/.test(needle)) {
    hits = inScope(tree).filter((t) => t["title"].toLowerCase().includes(low));
  }
  if (!hits.length) throw new NoMatch(`no ticket matches ${pyRepr$4(needle)}`);
  if (hits.length > 1) {
    throw new TicketError(`${pyRepr$4(needle)} matches more than one ticket: ${hits.map((t) => refName(t)).join(", ")}`);
  }
  return hits[0];
}
function leafStem(t, tree) {
  if (t["file"]) return t["file"].slice(0, -3);
  const stem = `${t["type"]}-${titleSlug(pyStr(t["title"]))}`;
  const taken = /* @__PURE__ */ new Set();
  for (const o of tree.tickets) {
    if (o === t) break;
    if (o["epic"] === t["epic"] && !o["file"]) taken.add(`${o["type"]}-${titleSlug(pyStr(o["title"]))}`);
  }
  for (const o of tree.tickets) if (o["epic"] === t["epic"] && o["file"]) taken.add(o["file"].slice(0, -3));
  return taken.has(stem) ? `${stem}-${t["id"]}` : stem;
}
function planPath(t, tree) {
  const folder = tree.folders[t["epic"]];
  if (t["plan"]) return joinPath(folder, t["plan"]);
  return joinPath(folder, `${leafStem(t, tree)}-plan.md`);
}
async function cmdFind(args, fs2) {
  const folder = await commandFolder(args, fs2);
  const [t, tree] = await locate(args, folder, args.ref, fs2);
  const home = tree.folders[t["epic"]];
  const row = publicRow(t, tree);
  if (tree.fallback && t["file"]) row["ref"] = t["file"];
  const entry = t["file"] ? {} : t;
  const container = joinPath(home, `${baseName(home)}.md`);
  return {
    ...row,
    folder: baseName(home),
    description: entry["description"] ?? "",
    verify: entry["verify"] ?? "",
    references: entry["references"] ?? [],
    notes: entry["notes"] ?? [],
    unknown: t["unknown"] ?? "",
    epic_file: await isFile$1(container, fs2) ? container : null,
    story_file: t["file"] ? joinPath(home, t["file"]) : null,
    plan: planPath(t, tree)
  };
}
function refName(t) {
  return `${t["file"] || t["id"]} in ${t["epic"]}`;
}
async function cmdPull(args, fs2) {
  const folder = await commandFolder(args, fs2);
  const tree = await loadTree(folder, fs2);
  const n = asId(args.id);
  const t = inScope(tree).find((c) => c["epic"] === baseName(folder) && c["id"] === n);
  if (n === null || t === void 0) throw new TicketError(`${baseName(folder)}/${BREAKDOWN} has no entry ${args.id}`);
  if (t["file"]) throw new TicketError(`entry ${args.id} is already pulled: ${t["file"]}`);
  const path = await writeLeaf(t, tree, await projectRootFor(args, folder, fs2), fs2);
  return { file: baseName(path), refine: t["refine"] };
}
async function writeLeaf(t, tree, root, fs2) {
  const folder = tree.folders[t["epic"]];
  const path = joinPath(folder, `${leafStem(t, tree)}.md`);
  if (await fs2.exists(path)) throw new TicketError(`${baseName(path)} exists already; change entry ${t["id"]}'s title`);
  const after = t["after"].map((b) => pyStr(ref(b, t["epic"], tree)));
  const epicFile = joinPath(folder, `${baseName(folder)}.md`);
  let parent;
  if (root !== null) {
    try {
      parent = relativePath(epicFile, root);
    } catch {
      parent = epicFile;
    }
  } else {
    parent = epicFile;
  }
  const notes = [...pyTruthy$1(t["unknown"]) ? [`Unknown: ${t["unknown"]}`] : [], ...t["notes"]];
  const fields = [
    ["id", pyStr(t["id"])],
    ["type", t["type"]],
    ["title", pyJsonString$1(pyStr(t["title"]), false)],
    ["parent", t["epic"]],
    ["covers", t["covers"].length ? `[${t["covers"].join(", ")}]` : ""],
    ["after", `[${after.join(", ")}]`],
    ["refined", t["refine"] ? "false" : ""],
    ["hitl", t["hitl"] ? "true" : "false"],
    ["risk", t["risk"]],
    ["estimate", t["estimate"] !== "" ? pyJsonString$1(pyStr(t["estimate"]), false) : ""]
  ];
  const values = {
    frontmatter: fields.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`).join("\n"),
    heading: pyStr(t["title"]),
    parent,
    description: pyStr(t["description"]),
    verify: pyStr(t["verify"]),
    references: t["references"].map((r) => `- ${r}
`).join(""),
    notes: notes.length ? "\n## Notes\n\n" + notes.map((n) => `- ${n}
`).join("") : ""
  };
  const body = PULLED.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  await fs2.writeText(path, body);
  t["file"] = baseName(path);
  return path;
}
function quoted(value) {
  const text = pyJsonString$1(value, false).replaceAll("   #", "   \\u0023");
  const separators = new RegExp(
    `[${String.fromCharCode(133, 8232, 8233)}]`,
    "g"
  );
  return text.replace(separators, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
async function editFrontmatter(path, values, fs2) {
  const raw = await fs2.readText(path);
  const bom = raw.startsWith("\uFEFF");
  let text = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
  for (const [key, value] of Object.entries(values)) text = setFrontmatterValue(text, key, value);
  let data = text;
  if (raw.includes("\r\n")) data = data.replace(/\n/g, "\r\n");
  if (bom) data = "\uFEFF" + data;
  await fs2.writeText(path, data);
  return text;
}
async function cmdMark(args, fs2) {
  const folder = await commandFolder(args, fs2);
  const store = await storeName(await projectRootFor(args, folder, fs2), fs2);
  if (store !== "repo") {
    throw new StoreRefusal(`store is ${store}: change status through the store's write verb, not this script`);
  }
  const [t, tree] = await locate(args, folder, args.ref, fs2);
  const path = planPath(t, tree);
  let blocked = { blocked_at: "", blocked_reason: "" };
  if (args.blocked !== void 0) {
    blocked = { blocked_at: quoted(todayIso()), blocked_reason: quoted(args.blocked) };
  }
  const created = !t["plan"];
  let text;
  if (created) {
    const assignee = args.assignee !== void 0 ? args.assignee : t["assignee"];
    const fields = [
      ["title", quoted(pyStr(t["title"]))],
      ["ticket", t["id"] !== null ? pyStr(t["id"]) : quoted(t["file"].slice(0, -3))],
      ["status", args.status],
      ["assignee", pyTruthy$1(assignee) ? quoted(pyStr(assignee)) : ""],
      ...Object.entries(blocked)
    ];
    text = "---\n" + fields.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}
`).join("") + "---\n";
    if (await fs2.exists(path)) {
      throw new TicketError(`${baseName(path)} exists already and is not the plan for ${refName(t)}`);
    }
    await fs2.writeText(path, text);
  } else {
    const values = { status: args.status, ...blocked };
    if (args.assignee !== void 0) values["assignee"] = quoted(args.assignee);
    text = await editFrontmatter(path, values, fs2);
  }
  const fm = parseFrontmatter(text, true);
  const out2 = { plan: path, created };
  for (const key of PLAN_FIELDS) out2[key] = fm[key] ?? "";
  return out2;
}
function mirrorValues(item, where) {
  const values = {};
  for (const key of ["tracker_id", "remote", "assignee"]) {
    if (!(key in item)) continue;
    let value = item[key];
    if (key === "tracker_id" && typeof value === "number" && Number.isInteger(value)) value = pyStr(value);
    if (typeof value !== "string") throw new TicketError(`${where}: ${key} must be a string`);
    values[key] = pyTruthy$1(value) ? quoted(value) : "";
  }
  if ("tracker_status" in item) {
    values["tracker_status"] = oneOf(item["tracker_status"], STATES, where, "tracker_status");
  }
  if ("after" in item) {
    if (!Array.isArray(item["after"])) throw new TicketError(`${where}: after must be a list`);
    const parts = [];
    for (const b of item["after"]) {
      const ok = typeof b === "number" && Number.isInteger(b) || typeof b === "string";
      if (!ok || typeof b === "string" && (b.includes(",") || !b)) {
        throw new TicketError(`${where}: after takes ids and names without commas, not ${pyRepr$4(b)}`);
      }
      parts.push(typeof b === "number" ? pyStr(b) : quoted(b));
    }
    values["after"] = `[${parts.join(", ")}]`;
  }
  return values;
}
function byTrackerId(tree, trackerId) {
  const hits = tree.tickets.filter((t) => t["tracker_id"] && t["tracker_id"].toLowerCase() === trackerId.toLowerCase());
  if (!hits.length) throw new NoMatch(`no ticket carries tracker_id ${pyRepr$4(trackerId)}`);
  if (hits.length > 1) throw new TicketError(`tracker_id ${pyRepr$4(trackerId)} is on more than one ticket`);
  return hits[0];
}
async function cmdMirror(args, stdin, fs2) {
  const folder = await commandFolder(args, fs2);
  const root = await projectRootFor(args, folder, fs2);
  const store = await storeName(root, fs2);
  if (store === "repo") throw new StoreRefusal("store is repo: there is no tracker to mirror");
  let items;
  try {
    items = JSON.parse(stdin);
  } catch (e) {
    throw new TicketError(`mirror reads a JSON array of objects on stdin: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new TicketError("mirror reads a JSON array of objects on stdin");
  }
  const folders = [folder];
  const trees = [await loadTree(folder, fs2)];
  if (args.backlog) {
    try {
      trees.push(await loadTree(args.backlog, fs2));
      folders.push(args.backlog);
    } catch {
    }
  }
  const work = [];
  const unmatched = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [index, item] of items.entries()) {
    const n = index + 1;
    const name = "ref" in item ? item["ref"] : item["tracker_id"];
    const where = `item ${n} (${pyRepr$4(name)})`;
    const unknown = Object.keys(item).filter((k) => !MIRROR_KEYS.includes(k));
    if (unknown.length) {
      const hint = unknown.includes("status") ? "; status is the build's and is never mirrored" : "";
      throw new TicketError(`${where}: unknown key ${pyRepr$4(unknown[0])}${hint}`);
    }
    if (typeof name === "boolean" || !(typeof name === "number" || typeof name === "string") || name === "") {
      throw new TicketError(`item ${n}: give a ref, or the tracker_id of a ticket that already carries it`);
    }
    const values = mirrorValues(item, where);
    let hit = null;
    let miss = null;
    for (const tree of trees) {
      try {
        const t = "ref" in item ? resolveTicket(tree, pyStr(name)) : byTrackerId(tree, pyStr(name));
        hit = [t, tree];
        break;
      } catch (e) {
        if (!(e instanceof NoMatch)) throw e;
        miss = miss ?? e;
      }
    }
    if (hit === null) {
      unmatched.push({ ref: name, error: miss ? miss.message : "None" });
      continue;
    }
    if (seen.has(hit[0])) throw new TicketError(`${where}: ${refName(hit[0])} is named twice`);
    seen.add(hit[0]);
    work.push([hit[0], hit[1], values]);
  }
  const undo = [];
  const mirrored = [];
  try {
    for (const [t, tree, values] of work) {
      const pulled = !t["file"];
      let path;
      if (pulled) {
        path = await writeLeaf(t, tree, root, fs2);
        undo.push([path, null]);
      } else {
        path = joinPath(tree.folders[t["epic"]], t["file"]);
        undo.push([path, await fs2.readText(path)]);
      }
      await editFrontmatter(path, values, fs2);
      const refOut = tree === trees[0] ? rowRef(t, tree) : baseName(path);
      mirrored.push({ ref: refOut, file: baseName(path), pulled, set: Object.keys(values).sort() });
    }
    for (const f of folders) await loadTree(f, fs2);
  } catch (e) {
    for (const [path, raw] of undo) {
      try {
        if (raw === null) await fs2.delete(path);
        else await fs2.writeText(path, raw);
      } catch {
      }
    }
    const error = new TicketError(`nothing was mirrored: ${e instanceof Error ? e.message : e}`);
    if (unmatched.length) error.data["unmatched"] = unmatched;
    throw error;
  }
  return { folder: baseName(folder), store, mirrored, unmatched };
}
const COMMANDS$1 = ["next", "status", "find", "pull", "mark", "mirror"];
const HELP = {
  next: `Tickets grouped by what can happen next, in build order.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, \`backlog\` holds the same view of the backlog folder, each row's \`ref\`
its file name.

Output: \`ready_to_refine\` (needs full criteria first), \`ready_to_start\`, \`in_progress\`, and \`blocked\`; a
\`blocked\` row has \`waiting_on\`, its unmet prerequisites, \`blocked_reason\`, or \`unknown\`, a question to
settle before it starts. A prerequisite is met when it is done or in review; an epic's own gate
(\`gated_by\`) waits for that epic to be done. \`unpinned_after\`, \`undeclared_after\`, \`order_conflict\`, and
\`problems\` report a tree that needs fixing. Every row carries \`ref\`, which find resolves, \`state\`, and
\`risk\`; a row has \`drift\` when the leaf file's \`after\` or \`hitl\` differs from the entry's, and \`plan_checkpoint\` or
\`done_checkpoint\` when the entry sets it.`,
  status: `Every ticket in build order.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, \`backlog\` holds the same view of the backlog folder, each row's \`ref\`
its file name.

Output: \`tickets\` (each with \`status\`, \`tracker_status\`, \`state\`, \`blocks\`, and \`drift\` when the leaf file's
\`after\` or \`hitl\` differs from the entry's, with both values), \`counts\` by state, \`next_id\` (the id a new
ticket in the folder takes: one past the highest number used, or \`next_id\` at the top of the folder's
\`tickets.toml\` when that is higher; on an initiative, in each \`epics\` row), \`longest_remaining_chain\`, and
on an initiative \`epics\` with each epic's declared \`after\`.`,
  find: `The one ticket a reference names.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.
<ref> is \`<epic id>.<entry id>\`, an entry id inside an epic folder (one with a letter, from any
folder), a tracker id, a file name, or an unbroken phrase from the title that matches one ticket.

Output: the ticket's row; its entry's \`description\`, \`verify\`, \`references\`, and \`notes\`, all empty once
the entry is pulled, when \`story_file\` holds them; \`unknown\`; its \`folder\`; and the absolute paths
\`epic_file\` (the file of the container it is under, null in a backlog folder), \`story_file\` (null until
the entry is pulled), and \`plan\` (where its plan is or goes; it may not exist yet).`,
  pull: `Write an entry's leaf file from its entry.

<dir> is the epic folder and <id> the entry's id. The file is \`<type>-<slug of the title>.md\`: \`after\` and
\`hitl\` always, other fields only when the entry sets them, no status.`,
  mark: `Set a ticket's status in its plan; never in its leaf file. Repo store only.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.
<ref> is \`<epic id>.<entry id>\`, an entry id inside an epic folder (one with a letter, from any
folder), a tracker id, a file name, or an unbroken phrase from the title that matches one ticket.

A ticket with no plan gets one holding only frontmatter. \`--blocked\` sets \`blocked_at\` (today) and
\`blocked_reason\`; without it both are cleared.`,
  mirror: `Write what a tracker returned into leaf files. Tracker stores only.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.

Stdin is a JSON array, one object per ticket: \`ref\` (or \`tracker_id\` alone, which matches only a ticket
that already carries that id) and any of \`tracker_id\`, \`remote\`, \`tracker_status\` (${STATES.join(", ")}),
\`assignee\`, and \`after\` (a list: a number is a sibling's id, a string any other prerequisite form, a
tracker id included). Only the keys given are written, an empty string removes the line, and \`status\` is
never written. An entry with no leaf file is pulled first. A ticket the tree does not hold is listed under
\`unmatched\` and the rest are written; values that would leave the tree unreadable write nothing, and the
error then still lists \`unmatched\`.`
};
const USAGE = "usage: tickets.py {next|status|find|pull|mark|mirror} [--project-root <root>] [<args>]";
let UsageError$1 = class UsageError extends Error {
  prog = "tickets.py";
};
function takeGlobal(argv) {
  const rest = [];
  const args = {};
  const values = { "--project-root": "projectRoot", "--skill-root": "skillRoot" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    if (values[flag]) {
      const value = eq === -1 ? argv[++i] : token.slice(eq + 1);
      if (value === void 0) throw new UsageError$1(`argument ${flag}: expected one argument`);
      args[values[flag]] = value;
      continue;
    }
    rest.push(token);
  }
  return { rest, args };
}
function takeOptions(rest, spec) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const kind = spec[flag];
    if (kind === void 0) throw new UsageError$1(`unrecognized arguments: ${token}`);
    if (kind === "flag") {
      flags[flag] = true;
      continue;
    }
    const value = eq === -1 ? rest[++i] : token.slice(eq + 1);
    if (value === void 0) throw new UsageError$1(`argument ${flag}: expected one argument`);
    flags[flag] = value;
  }
  return { positional, flags };
}
function required(positional, count, names) {
  if (positional.length < count) {
    throw new UsageError$1(`the following arguments are required: ${names.slice(positional.length).join(", ")}`);
  }
}
function parseTicketArgs(command, rest, args) {
  switch (command) {
    case "next": {
      const { positional, flags } = takeOptions(rest, { "--synced": "flag" });
      if (positional.length > 1) throw new UsageError$1(`unrecognized arguments: ${positional.slice(1).join(" ")}`);
      args.dir = positional[0];
      args.synced = flags["--synced"] === true;
      return args;
    }
    case "status":
    case "mirror": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 1) throw new UsageError$1(`unrecognized arguments: ${positional.slice(1).join(" ")}`);
      args.dir = positional[0];
      return args;
    }
    case "find": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 2) throw new UsageError$1(`unrecognized arguments: ${positional.slice(2).join(" ")}`);
      required(positional, 1, ["ref"]);
      [args.dir, args.ref] = positional.length === 2 ? positional : [void 0, positional[0]];
      return args;
    }
    case "pull": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 2) throw new UsageError$1(`unrecognized arguments: ${positional.slice(2).join(" ")}`);
      required(positional, 2, ["dir", "id"]);
      [args.dir, args.id] = positional;
      return args;
    }
    case "mark": {
      const { positional, flags } = takeOptions(rest, { "--assignee": "value", "--blocked": "value" });
      if (positional.length > 3) throw new UsageError$1(`unrecognized arguments: ${positional.slice(3).join(" ")}`);
      required(positional, 2, ["ref", "status"]);
      [args.dir, args.ref, args.status] = positional.length === 3 ? positional : [void 0, ...positional];
      if (!STATUSES.includes(args.status)) {
        throw new UsageError$1(
          `argument status: invalid choice: ${pyRepr$4(args.status)} (choose from ${STATUSES.join(", ")})`
        );
      }
      if (flags["--assignee"] !== void 0) args.assignee = flags["--assignee"];
      if (flags["--blocked"] !== void 0) args.blocked = flags["--blocked"];
      return args;
    }
    default:
      throw new UsageError$1(`argument command: invalid choice: ${pyRepr$4(command)}`);
  }
}
const STORE_RE = /^[a-z0-9][a-z0-9-]*$/;
const PROJECT_FILE = "_bmad/custom/ticketing-store-config.toml";
function mergeShallow(base, over) {
  const out2 = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out2[key] = isRecord(value) && isRecord(out2[key]) ? mergeShallow(out2[key], value) : value;
  }
  return out2;
}
async function storeConfigMerged(projectRoot, starters, fs2) {
  const path = joinPath(projectRoot, PROJECT_FILE);
  let project = {};
  if (await isFile$1(path, fs2)) project = parse(await readText$1(path, fs2));
  const tickets2 = project["tickets"];
  const raw = isRecord(tickets2) ? tickets2["store"] : null;
  const store = typeof raw === "string" && raw ? raw : "repo";
  const starter = joinPath(starters, `${store}-ticketing.toml`);
  let config = project;
  if (STORE_RE.test(store) && await isFile$1(starter, fs2)) {
    config = mergeShallow(parse(await readText$1(starter, fs2)), project);
  }
  if (isRecord(config["tickets"])) config["tickets"]["store"] = store;
  return config;
}
function extractKey$1(data, dotted) {
  let current = data;
  for (const part of dotted.split(".")) {
    if (isRecord(current) && part in current) current = current[part];
    else return void 0;
  }
  return current;
}
function expandHome$1(p) {
  if (p !== "~" && !p.startsWith("~/")) return p;
  const env = typeof process !== "undefined" ? process.env : void 0;
  const home = env?.HOME || env?.USERPROFILE || "";
  if (!home) return p;
  return p === "~" ? home : joinPath(home, p.slice(2));
}
async function readStore(argv, fs2, globals) {
  const keys = [];
  const flags = {};
  const positional = [];
  const valued = {
    "--project-root": "root",
    "--starters-dir": "startersDir",
    "--skill-root": "skill",
    "-k": "key",
    "--key": "key"
  };
  const tokens = argv[0] === "read_store" ? argv.slice(1) : argv;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    if (flag === "--starters") {
      flags["starters"] = true;
      continue;
    }
    if (valued[flag]) {
      const value = eq === -1 ? tokens[++i] : token.slice(eq + 1);
      if (value === void 0) throw new UsageError$1(`argument ${flag}: expected one argument`);
      if (valued[flag] === "key") keys.push(value);
      else flags[valued[flag]] = value;
      continue;
    }
    positional.push(token);
  }
  if (positional.length) throw new UsageError$1(`unrecognized arguments: ${positional.join(" ")}`);
  if (globals.projectRoot !== void 0 && flags["root"] === void 0) flags["root"] = globals.projectRoot;
  if (globals.skillRoot !== void 0 && flags["skill"] === void 0) flags["skill"] = globals.skillRoot;
  const startersDir = flags["startersDir"];
  const skillRoot = flags["skill"];
  if (startersDir === void 0 && skillRoot === void 0) {
    throw new UsageError$1(
      "one of --skill-root or --starters-dir is required: the store's starters are the skill's config/ folder"
    );
  }
  const starters = expandHome$1(startersDir ?? `${skillRoot}/config`);
  try {
    if (flags["starters"]) {
      const found2 = {};
      const names = (await fs2.list(starters)).filter((n) => n.endsWith("-ticketing.toml")).sort();
      for (const name of names) {
        const data2 = parse(await readText$1(joinPath(starters, name), fs2));
        const store = isRecord(data2["tickets"]) ? data2["tickets"]["store"] : null;
        found2[store ?? name] = data2["description"] ?? "";
      }
      return { stdout: pyJson$2(found2, { indent: 2 }) + "\n", exitCode: 0 };
    }
    if (!flags["root"]) throw new UsageError$1("--project-root is required");
    const data = await storeConfigMerged(flags["root"], starters, fs2);
    if (!keys.length) return { stdout: pyJson$2(data, { indent: 2 }) + "\n", exitCode: 0 };
    const found = {};
    const missing = [];
    for (const key of keys) {
      const value = extractKey$1(data, key);
      if (value === void 0) missing.push(key);
      else found[key] = value;
    }
    let out2 = missing.map((key) => `missing: ${key}
`).join("");
    if (keys.length === 1) {
      if (missing.length) return { stdout: out2, exitCode: 2 };
      const value = found[keys[0]];
      out2 += typeof value === "string" ? value.replace(/\n+$/, "") + "\n" : pyJson$2(value, { indent: 2 }) + "\n";
      return { stdout: out2, exitCode: 0 };
    }
    out2 += pyJson$2(found, { indent: 2 }) + "\n";
    return { stdout: out2, exitCode: missing.length ? 2 : 0 };
  } catch (e) {
    if (e instanceof UsageError$1) throw e;
    return { stdout: `error: cannot read the store config: ${e instanceof Error ? e.message : String(e)}
`, exitCode: 1 };
  }
}
function errorJson(e) {
  const body = { error: e.message };
  if (e instanceof TicketError) Object.assign(body, e.data);
  return pyJson$2(body, { ensureAscii: false }) + "\n";
}
async function readStdin() {
  if (typeof process === "undefined" || !process.stdin) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function tickets(argv, fs2, stdin) {
  const { rest, args } = takeGlobal(argv);
  const command = rest[0];
  if (command === void 0) return { stdout: "usage: tickets.py {next|status|find|pull|mark|mirror}\n", exitCode: 2 };
  if (!COMMANDS$1.includes(command)) {
    if (command === "-h" || command === "--help") {
      return { stdout: `${USAGE}

${HELP["next"]}
`, exitCode: 0 };
    }
    try {
      return await readStore(rest, fs2, args);
    } catch (e) {
      if (e instanceof UsageError$1) return { stdout: `${USAGE}
read_store.py: error: ${e.message}
`, exitCode: 2 };
      return { stdout: errorJson(e), exitCode: 1 };
    }
  }
  if (rest.slice(1).includes("-h") || rest.slice(1).includes("--help")) {
    return { stdout: `${USAGE}

${HELP[command]}
`, exitCode: 0 };
  }
  try {
    const parsed = parseTicketArgs(command, rest.slice(1), args);
    let out2;
    if (command === "next") out2 = await cmdNext(parsed, fs2);
    else if (command === "status") out2 = await cmdStatus(parsed, fs2);
    else if (command === "find") out2 = await cmdFind(parsed, fs2);
    else if (command === "pull") out2 = await cmdPull(parsed, fs2);
    else if (command === "mark") out2 = await cmdMark(parsed, fs2);
    else out2 = await cmdMirror(parsed, stdin ?? await readStdin(), fs2);
    return { stdout: pyJson$2(out2, { ensureAscii: false }) + "\n", exitCode: 0 };
  } catch (e) {
    if (e instanceof UsageError$1) {
      return { stdout: `${USAGE}
tickets.py ${command}: error: ${e.message}
`, exitCode: 2 };
    }
    if (e instanceof StoreRefusal) return { stdout: pyJson$2({ error: e.message }, { ensureAscii: true }) + "\n", exitCode: 2 };
    return { stdout: errorJson(e), exitCode: 1 };
  }
}
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out2, instance) {
  abytes(out2);
  const min = instance.outputLen;
  if (out2.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function rotl(word, shift) {
  return word << shift | word >>> 32 - shift >>> 0;
}
const hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
class Hash {
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
class HashMD extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out2) {
    aexists(this);
    aoutput(out2, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out2);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
}
const sha256$1 = /* @__PURE__ */ createHasher(() => new SHA256());
const sha256 = sha256$1;
class RenderError extends Error {
}
class UndefinedError extends RenderError {
}
const pyTypeName = (value) => {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  if (value === null || value === void 0) return "NoneType";
  return "dict";
};
const sha256Hex = (text) => bytesToHex(sha256(utf8ToBytes(text)));
function canonicalJson(value) {
  const write = (value2) => {
    if (value2 === null || value2 === void 0) return "null";
    if (typeof value2 === "boolean") return value2 ? "true" : "false";
    if (typeof value2 === "number") return String(value2);
    if (typeof value2 === "string") return JSON.stringify(value2);
    if (Array.isArray(value2)) return `[${value2.map(write).join(",")}]`;
    const entries = Object.entries(value2).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${write(v)}`).join(",")}}`;
  };
  return write(value);
}
function tomlLiteral(text, label) {
  let parsed;
  try {
    parsed = parse(`value = ${text}`);
  } catch (error) {
    throw new RenderError(`invalid TOML value for ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Object.keys(parsed).length !== 1 || !("value" in parsed)) {
    throw new RenderError(`${label} must contain a single TOML value`);
  }
  return parsed.value;
}
const PARAMETER_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
function leafPaths(table, prefix = "") {
  const leaves = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(table)) {
    const path = `${prefix}${key}`;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const leaf of leafPaths(value, `${path}.`)) leaves.add(leaf);
    } else leaves.add(path);
  }
  return leaves;
}
function declares(defaults, path) {
  let node = defaults;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node) || !(part in node)) return false;
    node = node[part];
  }
  return true;
}
function lookup(data, path, label) {
  let current = data;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(part in current)) {
      throw new RenderError(`missing ${label} \`${path}\``);
    }
    current = current[part];
  }
  return current;
}
async function checkPersistentLayers(projectRoot, skillName, defaults, fs2) {
  for (const layer of [`${projectRoot}/_bmad/custom/${skillName}.toml`, `${projectRoot}/_bmad/custom/${skillName}.user.toml`]) {
    const table = await readTomlLayer(layer, fs2);
    const undeclared = [...leafPaths(table)].filter((path) => !declares(defaults, path)).sort();
    if (undeclared.length) {
      throw new RenderError(`${layer} sets keys ${skillName} does not declare: ${undeclared.join(", ")}`);
    }
  }
}
async function readTomlLayer(path, fs2) {
  if (!await fs2.exists(path)) return {};
  try {
    return parse(await fs2.readText(path));
  } catch (error) {
    throw new RenderError(`failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function invocationCustomization(defaults, assignments) {
  const commandLayer = {};
  const assigned = [];
  for (const [path, raw] of Object.entries(assignments)) {
    if (!PARAMETER_RE.test(path)) {
      throw new RenderError(`invalid --set assignment \`${path}=${raw}\`; expected bare dotted key=value`);
    }
    for (const earlier of assigned) {
      if (path === earlier || path.startsWith(`${earlier}.`) || earlier.startsWith(`${path}.`)) {
        throw new RenderError(`--set \`${path}\` conflicts with earlier --set \`${earlier}\``);
      }
    }
    assigned.push(path);
    const fallback = lookup(defaults ?? {}, path, "customization parameter");
    const value = typeof fallback === "string" && !/^\s*["']/.test(raw) ? raw : tomlLiteral(raw, path);
    let target = commandLayer;
    const parts = path.split(".");
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object") target[part] = {};
      target = target[part];
    }
    target[parts[parts.length - 1]] = value;
  }
  return commandLayer;
}
class Text {
  constructor(value, label) {
    this.value = value;
    this.label = label;
  }
}
class MarkdownList extends Array {
}
class LayerList extends Array {
}
const markdownList = (items) => {
  const list = new MarkdownList();
  list.push(...items);
  return list;
};
const layerList = (layers) => {
  const list = new LayerList();
  list.push(...layers);
  return list;
};
function formatMarkdownList(items) {
  if (!items.length) return "_None._";
  const rendered = [];
  for (const item of items) {
    const lines = item.split("\n");
    rendered.push(`- ${lines[0]}`);
    for (const line of lines.slice(1)) rendered.push(`  ${line}`);
  }
  return rendered.join("\n");
}
function formatReviewLayers(layers) {
  const active = layers.filter((layer) => layer.instruction.trim());
  if (!active.length) return "No active review layers. HALT with blocking condition `no active review layers`.";
  const sections = [];
  for (const layer of active) {
    const section = [`#### ${layer.name} (\`${layer.id}\`)`];
    if (layer.when) section.push("", `Run only when: ${layer.when}`);
    section.push("", layer.instruction.trim());
    sections.push(section.join("\n"));
  }
  return sections.join("\n\n");
}
function requireString(value, label, allowEmpty = false) {
  if (typeof value !== "string") throw new RenderError(`${label} must be a string, got ${pyTypeName(value)}`);
  if (!allowEmpty && !value.trim()) throw new RenderError(`${label} must not be empty`);
  return value;
}
function requireStringList(value, label) {
  if (!Array.isArray(value)) throw new RenderError(`${label} must be a list, got ${pyTypeName(value)}`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}
function requireReviewLayers(value, label) {
  if (!Array.isArray(value)) throw new RenderError(`${label} must be a list of tables`);
  const seen = /* @__PURE__ */ new Set();
  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new RenderError(`${itemLabel} must be a table`);
    const source = item;
    const id = requireString(source.id, `${itemLabel}.id`);
    if (seen.has(id)) throw new RenderError(`duplicate review layer id \`${id}\``);
    seen.add(id);
    const layer = {
      id,
      name: requireString(source.name ?? id, `${itemLabel}.name`),
      instruction: requireString(source.instruction, `${itemLabel}.instruction`, true)
    };
    if ("when" in source) layer.when = requireString(source.when, `${itemLabel}.when`);
    return layer;
  });
}
function resolveCustomizationValue(value, fallback, label) {
  if (typeof fallback === "string") return requireString(value, label, !fallback.trim());
  if (Array.isArray(fallback)) {
    if (fallback.length && fallback.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return requireReviewLayers(value, label);
    }
    return requireStringList(value, label);
  }
  if (typeof fallback === "boolean" || typeof fallback === "number") {
    if (pyTypeName(value) !== pyTypeName(fallback)) {
      throw new RenderError(`${label} must be ${pyTypeName(fallback)}, got ${pyTypeName(value)}`);
    }
    return value;
  }
  throw new RenderError(`${label} has unsupported default type ${pyTypeName(fallback)}`);
}
function bindCustomization(value, label, destination) {
  const bind = (text) => text.replaceAll("{skill-root}", destination);
  if (typeof value === "string") return new Text(bind(value), label);
  if (Array.isArray(value)) {
    const items = value;
    if (items.length && items.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return layerList(
        items.map((layer) => {
          const bound = Object.fromEntries(Object.entries(layer).map(([key, text]) => [key, bind(text)]));
          return bound;
        })
      );
    }
    return markdownList(items.map(bind));
  }
  return value;
}
class Table {
  constructor(path) {
    this.path = path;
  }
}
class ConfigTable extends Table {
  constructor(central, table, path, ctx) {
    super(path);
    this.central = central;
    this.table = table;
    this.ctx = ctx;
  }
  resolve(name) {
    if (this.path === "config" && !(name in this.table)) {
      const [path, resolved2] = resolveShortConfig(this.central, name, this.ctx.projectRoot);
      this.ctx.inputs[`config.${path}`] = resolved2;
      return new Text(resolved2, `config.${path}`);
    }
    const label = `${this.path}.${name}`;
    if (!(name in this.table)) throw new RenderError(`missing config value \`${label.replace(/^config\./, "")}\``);
    const value = this.table[name];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return new ConfigTable(this.central, value, label, this.ctx);
    }
    const resolved = resolveConfigValue(value, label, this.ctx.projectRoot);
    this.ctx.inputs[label] = resolved;
    return new Text(resolved, label);
  }
}
class CustomizationTable extends Table {
  constructor(defaults, values, path, ctx) {
    super(path);
    this.defaults = defaults;
    this.values = values;
    this.ctx = ctx;
  }
  resolve(name) {
    const path = `${this.path}.${name}`;
    if (this.defaults === null) throw new RenderError(`\`${path}\` requires customize.toml`);
    if (!(name in this.defaults)) throw new RenderError(`missing customization parameter \`${path}\``);
    if (!(name in this.values)) throw new RenderError(`missing customization value \`${path}\``);
    const fallback = this.defaults[name];
    const value = this.values[name];
    const label = `customization.${path}`;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RenderError(`${label} must be a table, got ${pyTypeName(value)}`);
      }
      return new CustomizationTable(fallback, value, path, this.ctx);
    }
    const resolved = resolveCustomizationValue(value, fallback, label);
    this.ctx.inputs[label] = resolved;
    return bindCustomization(resolved, label, this.ctx.destination);
  }
}
function resolveConfigValue(value, label, projectRoot) {
  const text = requireString(value, label);
  if (!text.includes("{project-root}")) return text;
  const resolved = text.replaceAll("{project-root}", projectRoot);
  if (!resolved.startsWith("/")) throw new RenderError(`${label} must resolve to an absolute path: ${resolved}`);
  return resolved;
}
function findConfigValues(data, key, prefix = "") {
  const matches = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return matches;
  for (const [name, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (name === key && !(value && typeof value === "object")) matches.push([path, value]);
    matches.push(...findConfigValues(value, key, path));
  }
  return matches;
}
function resolveShortConfig(central, key, projectRoot) {
  const matches = findConfigValues(central, key);
  if (!matches.length) throw new RenderError(`missing config value \`${key}\``);
  if (matches.length > 1) {
    throw new RenderError(`ambiguous config value \`${key}\` found at: ${matches.map(([path2]) => path2).join(", ")}`);
  }
  const [path, value] = matches[0];
  return [path, resolveConfigValue(value, `config.${path}`, projectRoot)];
}
const isUndefined = (value) => typeof value === "object" && value !== null && "__undefined" in value;
const undefinedValue = (name) => ({ __undefined: name });
const usedUndefined = (value) => {
  throw new UndefinedError(`'${value.__undefined}' is undefined`);
};
function pyTruthy(value) {
  if (isUndefined(value)) usedUndefined(value);
  if (value === null || value === void 0) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (value instanceof Text) return value.value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Table) return true;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
function pyRepr$3(value) {
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === void 0) return "None";
  if (Array.isArray(value)) return `[${value.map(pyRepr$3).join(", ")}]`;
  if (value && typeof value === "object" && !(value instanceof Text)) {
    const entries = Object.entries(value).map(([k, v]) => `${pyRepr$3(k)}: ${pyRepr$3(v)}`);
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}
function toDisplay(value) {
  if (isUndefined(value)) usedUndefined(value);
  if (value instanceof Table) throw new RenderError(`\`${value.path}\` is a table, not a value`);
  if (value instanceof Text) return value.value;
  if (value instanceof MarkdownList) return formatMarkdownList([...value]);
  if (value instanceof LayerList) return formatReviewLayers([...value]);
  if (value === null || value === void 0) return "";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return pyRepr$3(value);
  if (typeof value === "object") return pyRepr$3(value);
  return String(value);
}
function pyEqual(a, b) {
  if (isUndefined(a)) usedUndefined(a);
  if (isUndefined(b)) usedUndefined(b);
  if (a instanceof Text) a = a.value;
  if (b instanceof Text) b = b.value;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => pyEqual(item, b[index]));
  return a === b;
}
const FILTERS = {
  /** jinja's `default(value, default_value="", boolean=false)`. */
  default: (value, args) => isUndefined(value) || pyTruthy(args[1]) && !pyTruthy(value) ? args.length ? args[0] : "" : value
};
const isSpace = (ch) => ch === " " || ch === "	";
function tokenize(source) {
  const chunks = [];
  let text = "";
  let line = 1;
  let i = 0;
  const flush = () => {
    if (text) chunks.push({ kind: "text", text });
    text = "";
  };
  const lstrip = () => {
    const cut = text.lastIndexOf("\n") + 1;
    if ([...text.slice(cut)].every(isSpace)) text = text.slice(0, cut);
  };
  while (i < source.length) {
    const at = (() => {
      for (let j = i; j < source.length - 1; j++) {
        if (source[j] === "{" && (source[j + 1] === "{" || source[j + 1] === "%" || source[j + 1] === "#")) return j;
      }
      return -1;
    })();
    if (at === -1) {
      text += source.slice(i);
      break;
    }
    text += source.slice(i, at);
    line += (source.slice(i, at).match(/\n/g) ?? []).length;
    const opener = source[at + 1];
    const close = `${opener === "{" ? "}" : opener}}`;
    const end = findClose(source, close, at + 2);
    if (end === -1) throw new RenderError(`unclosed ${opener} at line ${line}`);
    const inner = source.slice(at + 2, end);
    const leftSign = inner.startsWith("-") ? "-" : inner.startsWith("+") ? "+" : "";
    const rightSign = inner.endsWith("-") ? "-" : inner.endsWith("+") ? "+" : "";
    const body = inner.slice(leftSign ? 1 : 0, rightSign ? -1 : void 0).trim();
    if (leftSign === "-") text = text.replace(/\s+$/, "");
    else if (opener !== "{" && leftSign !== "+") lstrip();
    const after = end + 2;
    if (body === "raw" && opener === "%") {
      const rawEnd = findRawEnd(source, after);
      if (rawEnd === -1) throw new RenderError(`unclosed raw block at line ${line}`);
      let raw = source.slice(after, rawEnd.start);
      if (rightSign === "-") raw = raw.replace(/^\s+/, "");
      if (rawEnd.leftSign === "-") raw = raw.replace(/\s+$/, "");
      flush();
      if (raw) chunks.push({ kind: "text", text: raw });
      line += (source.slice(after, rawEnd.after).match(/\n/g) ?? []).length;
      i = rawEnd.after;
      continue;
    }
    let next = after;
    if (rightSign === "-") next += /^\s+/.exec(source.slice(after))?.[0].length ?? 0;
    else if (opener !== "{" && rightSign !== "+" && source.startsWith("\n", after)) next = after + 1;
    else if (opener !== "{" && rightSign !== "+" && source.startsWith("\r\n", after)) next = after + 2;
    if (opener === "#") {
      i = next;
      continue;
    }
    flush();
    chunks.push(opener === "{" ? { kind: "output", expr: body, line } : { kind: "tag", body, line });
    line += (source.slice(after, next).match(/\n/g) ?? []).length;
    i = next;
  }
  flush();
  return chunks;
}
function findClose(source, close, from) {
  for (let j = from; j < source.length - 1; j++) {
    const ch = source[j];
    if (ch === '"' || ch === "'") {
      for (j++; j < source.length && source[j] !== ch; j++) {
        if (source[j] === "\\") j++;
      }
      continue;
    }
    if (source.startsWith(close, j)) return j;
  }
  return -1;
}
function findRawEnd(source, from) {
  let i = from;
  while (i < source.length) {
    const at = source.indexOf("{%", i);
    if (at === -1) return -1;
    const end = source.indexOf("%}", at + 2);
    if (end === -1) return -1;
    const inner = source.slice(at + 2, end);
    if (inner.trim().replace(/^[-+]|[-+]$/g, "").trim() === "endraw") {
      const leftSign = inner.startsWith("-") ? "-" : "";
      let after = end + 2;
      if (inner.endsWith("-")) {
        after += /^\s+/.exec(source.slice(after))?.[0].length ?? 0;
      } else if (source.startsWith("\r\n", after)) after += 2;
      else if (source.startsWith("\n", after)) after += 1;
      return { start: at, after, leftSign };
    }
    i = end + 2;
  }
  return -1;
}
function parseNodes(chunks, from, stop) {
  const nodes = [];
  let i = from;
  for (; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.kind === "text") {
      nodes.push({ kind: "text", text: chunk.text });
      continue;
    }
    if (chunk.kind === "output") {
      nodes.push({ kind: "output", expr: chunk.expr, line: chunk.line });
      continue;
    }
    const [word] = chunk.body.split(/\s+/, 1);
    if (stop && stop(chunk.body)) return { nodes, index: i, stopTag: word };
    if (word === "if") {
      const branches = [];
      let expr = chunk.body.replace(/^if\s+/, "").trim();
      let cursor = i + 1;
      for (; ; ) {
        const parsed = parseNodes(chunks, cursor, (body) => /^(elif|else|endif)\b/.test(body));
        branches.push({ expr, body: parsed.nodes });
        const tag = chunks[parsed.index];
        if (!tag || tag.kind !== "tag") throw new RenderError("unexpected end of template; missing endif");
        if (parsed.stopTag === "endif") {
          i = parsed.index;
          break;
        }
        if (parsed.stopTag === "else") expr = null;
        else if (parsed.stopTag === "elif") expr = tag.body.replace(/^elif\s+/, "").trim();
        else throw new RenderError("unexpected end of template; missing endif");
        cursor = parsed.index + 1;
      }
      nodes.push({ kind: "if", branches, line: chunk.line });
      continue;
    }
    if (word === "set") {
      const match = /^set\s+([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(chunk.body);
      if (!match) throw new RenderError(`invalid set at line ${chunk.line}`);
      nodes.push({ kind: "set", name: match[1], expr: match[2], line: chunk.line });
      continue;
    }
    if (word === "for") {
      const match = /^for\s+([A-Za-z_]\w*)\s+in\s+([\s\S]+)$/.exec(chunk.body);
      if (!match) throw new RenderError(`invalid for at line ${chunk.line}`);
      const body = parseNodes(chunks, i + 1, (b) => /^endfor\b/.test(b));
      if (body.stopTag !== "endfor") throw new RenderError(`unexpected end of template; missing endfor`);
      nodes.push({ kind: "for", name: match[1], expr: match[2], body: body.nodes, line: chunk.line });
      i = body.index;
      continue;
    }
    throw new RenderError(`unknown tag \`${chunk.body}\` at line ${chunk.line}`);
  }
  return { nodes, index: i };
}
function lexExpression(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      tokens.push({ kind: "name", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9._]/.test(source[j])) j++;
      tokens.push({ kind: "number", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== ch) {
        if (source[j] === "\\" && j + 1 < source.length) {
          const escaped = source[j + 1];
          value += escaped === "n" ? "\n" : escaped === "t" ? "	" : escaped === "r" ? "\r" : escaped;
          j += 2;
          continue;
        }
        value += source[j];
        j++;
      }
      tokens.push({ kind: "string", value });
      i = j + 1;
      continue;
    }
    const op = ["==", "!=", "<=", ">=", "//", "**"].find((candidate) => source.startsWith(candidate, i)) ?? ch;
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}
function parseExpression(source) {
  const tokens = lexExpression(source);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const eat = (value) => peek() && peek().value === value && peek().kind === "op" ? (at++, true) : false;
  const expect = (value) => {
    if (!eat(value)) throw new RenderError(`expected \`${value}\` in \`${source}\``);
  };
  const parsePrimary = () => {
    const token = take();
    if (!token) throw new RenderError(`unexpected end of expression: \`${source}\``);
    if (token.kind === "string") return { kind: "literal", value: token.value };
    if (token.kind === "number") return { kind: "literal", value: Number(token.value) };
    if (token.kind === "name") {
      if (token.value === "true" || token.value === "True") return { kind: "literal", value: true };
      if (token.value === "false" || token.value === "False") return { kind: "literal", value: false };
      if (token.value === "none" || token.value === "None") return { kind: "literal", value: null };
      if (token.value === "not") return { kind: "unary", op: "not", operand: parseUnary() };
      return { kind: "name", name: token.value };
    }
    if (token.value === "(" || token.value === "[") {
      const close = token.value === "(" ? ")" : "]";
      if (eat(close)) return { kind: "tuple", items: [] };
      const first = parseOr();
      if (token.value === "[" || eat(",")) {
        const items = [first];
        while (!eat(close)) {
          items.push(parseOr());
          if (!eat(",")) break;
        }
        expect(close);
        return { kind: "tuple", items };
      }
      expect(close);
      return first;
    }
    throw new RenderError(`unexpected \`${token.value}\` in \`${source}\``);
  };
  const parsePostfix = () => {
    let expr2 = parsePrimary();
    for (; ; ) {
      if (eat(".")) {
        const name = take();
        if (!name || name.kind !== "name") throw new RenderError(`expected a name after \`.\` in \`${source}\``);
        expr2 = { kind: "attr", target: expr2, name: name.value };
        continue;
      }
      if (eat("[")) {
        const index = parseOr();
        expect("]");
        expr2 = { kind: "item", target: expr2, index };
        continue;
      }
      if (eat("(")) {
        const args = [];
        if (!eat(")")) {
          args.push(parseOr());
          while (eat(",")) {
            if (peek() && peek().value === ")") break;
            args.push(parseOr());
          }
          expect(")");
        }
        expr2 = { kind: "call", target: expr2, args };
        continue;
      }
      if (peek() && peek().kind === "op" && peek().value === "|") {
        at++;
        const name = take();
        if (!name || name.kind !== "name") throw new RenderError(`expected a filter name in \`${source}\``);
        const args = [];
        if (eat("(")) {
          if (!eat(")")) {
            args.push(parseOr());
            while (eat(",")) args.push(parseOr());
            expect(")");
          }
        }
        expr2 = { kind: "filter", target: expr2, name: name.value, args };
        continue;
      }
      return expr2;
    }
  };
  const parseUnary = () => {
    if (peek() && peek().kind === "op" && (peek().value === "-" || peek().value === "+")) {
      const op = take().value;
      return { kind: "unary", op, operand: parseUnary() };
    }
    return parsePostfix();
  };
  const parseMultiplicative = () => {
    let left = parseUnary();
    while (peek() && peek().kind === "op" && ["*", "/", "//", "%"].includes(peek().value)) {
      left = { kind: "binary", op: take().value, left, right: parseUnary() };
    }
    return left;
  };
  const parseAdditive = () => {
    let left = parseMultiplicative();
    while (peek() && peek().kind === "op" && (peek().value === "+" || peek().value === "-")) {
      left = { kind: "binary", op: take().value, left, right: parseMultiplicative() };
    }
    return left;
  };
  const parseConcat = () => {
    let left = parseAdditive();
    while (peek() && peek().kind === "op" && peek().value === "~") {
      take();
      left = { kind: "binary", op: "~", left, right: parseAdditive() };
    }
    return left;
  };
  const parseComparison = () => {
    const left = parseConcat();
    const token = peek();
    if (token && (token.kind === "op" || token.kind === "name")) {
      if (["==", "!=", "<", ">", "<=", ">="].includes(token.value)) {
        at++;
        return { kind: "compare", op: token.value, left, right: parseConcat() };
      }
      if (token.value === "in") {
        at++;
        return { kind: "compare", op: "in", left, right: parseConcat() };
      }
      if (token.value === "not" && tokens[at + 1]?.value === "in") {
        at += 2;
        return { kind: "compare", op: "not in", left, right: parseConcat() };
      }
    }
    return left;
  };
  const parseAnd = () => {
    let left = parseComparison();
    while (peek() && peek().value === "and") {
      at++;
      left = { kind: "and", left, right: parseComparison() };
    }
    return left;
  };
  const parseOr = () => {
    let left = parseAnd();
    while (peek() && peek().value === "or") {
      at++;
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };
  const expr = parseOr();
  if (at !== tokens.length) throw new RenderError(`unexpected \`${tokens[at].value}\` in \`${source}\``);
  return expr;
}
function getAttribute(target, name, path, expr) {
  if (isUndefined(target)) {
    path(expr);
    usedUndefined(target);
  }
  if (target instanceof Table) return target.resolve(name);
  if (target instanceof Text) return undefinedValue(`${path(expr)}`);
  if (target && typeof target === "object" && !Array.isArray(target) && name in target) {
    return target[name];
  }
  return undefinedValue(path(expr));
}
function expressionPath(expr) {
  if (expr.kind === "name") return expr.name;
  if (expr.kind === "attr") return `${expressionPath(expr.target)}.${expr.name}`;
  if (expr.kind === "item" && expr.index.kind === "literal") return `${expressionPath(expr.target)}.${String(expr.index.value)}`;
  return "expression";
}
class Scope {
  constructor(parent) {
    this.parent = parent;
  }
  values = /* @__PURE__ */ new Map();
  has(name) {
    return this.values.has(name) || (this.parent?.has(name) ?? false);
  }
  get(name) {
    if (this.values.has(name)) return this.values.get(name);
    return this.parent?.get(name);
  }
  set(name, value) {
    this.values.set(name, value);
  }
}
function evaluate(expr, scope, context) {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "name":
      return scope.has(expr.name) ? scope.get(expr.name) : expr.name in context ? context[expr.name] : undefinedValue(expr.name);
    case "attr":
      return getAttribute(evaluate(expr.target, scope, context), expr.name, expressionPath, expr);
    case "item": {
      const target = evaluate(expr.target, scope, context);
      const index = evaluate(expr.index, scope, context);
      if (isUndefined(target)) usedUndefined(target);
      if (target instanceof Table) return target.resolve(String(index));
      if (Array.isArray(target) && typeof index === "number") return target[index];
      if (target && typeof target === "object" && String(index) in target) {
        return target[String(index)];
      }
      return undefinedValue(`${expressionPath(expr)}`);
    }
    case "call": {
      const target = evaluate(expr.target, scope, context);
      const args = expr.args.map((arg) => evaluate(arg, scope, context));
      if (isUndefined(target)) usedUndefined(target);
      if (typeof target !== "function") throw new RenderError(`\`${expressionPath(expr.target)}\` is not callable`);
      return target(...args);
    }
    case "filter": {
      const filter = FILTERS[expr.name];
      if (!filter) throw new RenderError(`unknown filter \`${expr.name}\``);
      const value = evaluate(expr.target, scope, context);
      return filter(value, expr.args.map((arg) => evaluate(arg, scope, context)));
    }
    case "tuple":
      return expr.items.map((item) => evaluate(item, scope, context));
    case "unary": {
      const operand = evaluate(expr.operand, scope, context);
      if (expr.op === "not") return !pyTruthy(operand);
      if (isUndefined(operand)) usedUndefined(operand);
      return expr.op === "-" ? -Number(operand) : Number(operand);
    }
    case "and": {
      const left = evaluate(expr.left, scope, context);
      return pyTruthy(left) ? evaluate(expr.right, scope, context) : left;
    }
    case "or": {
      const left = evaluate(expr.left, scope, context);
      return pyTruthy(left) ? left : evaluate(expr.right, scope, context);
    }
    case "binary": {
      const left = evaluate(expr.left, scope, context);
      const right = evaluate(expr.right, scope, context);
      if (isUndefined(left)) usedUndefined(left);
      if (isUndefined(right)) usedUndefined(right);
      if (expr.op === "~") return toDisplay(left) + toDisplay(right);
      const a = Number(left);
      const b = Number(right);
      switch (expr.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "//":
          return Math.floor(a / b);
        default:
          return a % b;
      }
    }
    case "compare": {
      const left = evaluate(expr.left, scope, context);
      const right = evaluate(expr.right, scope, context);
      if (isUndefined(left)) usedUndefined(left);
      if (isUndefined(right)) usedUndefined(right);
      switch (expr.op) {
        case "==":
          return pyEqual(left, right);
        case "!=":
          return !pyEqual(left, right);
        case "in":
          return contains(right, left);
        case "not in":
          return !contains(right, left);
        case "<":
          return toDisplay(left) < toDisplay(right);
        case ">":
          return toDisplay(left) > toDisplay(right);
        case "<=":
          return toDisplay(left) <= toDisplay(right);
        default:
          return toDisplay(left) >= toDisplay(right);
      }
    }
  }
}
function contains(haystack, needle) {
  if (isUndefined(haystack)) usedUndefined(haystack);
  if (haystack instanceof Text) return haystack.value.includes(toDisplay(needle));
  if (typeof haystack === "string") return haystack.includes(toDisplay(needle));
  if (Array.isArray(haystack)) return haystack.some((item) => pyEqual(item, needle));
  if (haystack && typeof haystack === "object") return String(toDisplay(needle)) in haystack;
  return false;
}
function renderNodes(nodes, scope, context, state) {
  let out2 = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out2 += node.text;
        break;
      case "output":
        state.line = node.line;
        out2 += toDisplay(evaluate(parseExpression(node.expr), scope, context));
        break;
      case "set":
        state.line = node.line;
        scope.set(node.name, evaluate(parseExpression(node.expr), scope, context));
        break;
      case "if":
        for (const branch of node.branches) {
          if (branch.expr === null) {
            out2 += renderNodes(branch.body, scope, context, state);
            break;
          }
          state.line = node.line;
          if (pyTruthy(evaluate(parseExpression(branch.expr), scope, context))) {
            out2 += renderNodes(branch.body, scope, context, state);
            break;
          }
        }
        break;
      case "for": {
        state.line = node.line;
        const list = evaluate(parseExpression(node.expr), scope, context);
        if (typeof list === "string" || list instanceof Text) {
          throw new RenderError(`\`${node.expr}\` is a string, not a list`);
        }
        if (isUndefined(list)) usedUndefined(list);
        if (!Array.isArray(list)) throw new RenderError(`\`${node.expr}\` is not a list`);
        for (const item of list) {
          const inner = new Scope(scope);
          inner.set(node.name, item);
          out2 += renderNodes(node.body, inner, context, state);
        }
        break;
      }
    }
  }
  return out2;
}
async function isDirectory$1(path, fs2) {
  try {
    await fs2.list(path);
    return true;
  } catch {
    return false;
  }
}
async function loadSources(skillRoot, fs2) {
  const sources = {};
  const walk2 = async (dir, prefix) => {
    for (const name of await fs2.list(dir)) {
      const path = `${dir}/${name}`;
      if (await isDirectory$1(path, fs2)) await walk2(path, `${prefix}${name}/`);
      else if (name.endsWith(".md") && name !== "SKILL.md") sources[`${prefix}${name}`] = await fs2.readText(path);
    }
  };
  await walk2(skillRoot, "");
  const names = Object.keys(sources).sort();
  const sorted = {};
  for (const name of names) sorted[name] = sources[name];
  if (!("workflow.md" in sorted)) throw new RenderError(`render entry is missing: ${skillRoot}/workflow.md`);
  return sorted;
}
class RenderContext {
  constructor(projectRoot, destination, central, defaults, customization, sourceNames) {
    this.projectRoot = projectRoot;
    this.destination = destination;
    this.sourceNames = sourceNames;
    this.variables = {
      config: new ConfigTable(central, central, "config", this),
      workflow: new CustomizationTable(
        defaults === null ? null : defaults.workflow ?? {},
        customization.workflow ?? {},
        "workflow",
        this
      ),
      rendered: (target) => this.rendered(toDisplay(target)),
      halt: (message) => this.halt(toDisplay(message))
    };
  }
  inputs = {};
  links = {};
  variables;
  line = 1;
  /** Let a template reject its inputs; the caller prefixes the source and line. */
  halt(message) {
    throw new RenderError(message);
  }
  rendered(target) {
    if (!this.sourceNames.has(target)) throw new RenderError(`rendered() targets undeclared source: ${target}`);
    const name = this.currentSource ?? "";
    this.links[name] = [...this.links[name] ?? [], target];
    return `${this.destination}/${target}`;
  }
  currentSource = null;
}
function renderSources(sources, skillRoot, ctx) {
  const bound = {};
  for (const [name, content] of Object.entries(sources)) bound[name] = content.replaceAll("{skill-root}", skillRoot);
  const rendered = {};
  for (const name of Object.keys(sources)) {
    ctx.currentSource = name;
    try {
      rendered[name] = renderSource(bound[name], ctx.variables, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const location = error instanceof RenderError || error instanceof UndefinedError ? `${name}:${ctx.line}` : null;
      throw new RenderError(`${location ?? name}: ${message}`);
    }
  }
  const omitted = new Set(Object.keys(rendered).filter((name) => !rendered[name].trim()));
  if (omitted.has("workflow.md")) throw new RenderError("workflow.md: rendered empty");
  for (const name of Object.keys(rendered).filter((n) => !omitted.has(n)).sort()) {
    for (const target of [...ctx.links[name] ?? []].sort()) {
      if (omitted.has(target)) throw new RenderError(`${name}: rendered() targets omitted source: ${target}`);
    }
  }
  const out2 = {};
  for (const [name, text] of Object.entries(rendered)) if (!omitted.has(name)) out2[name] = text;
  return out2;
}
function renderSource(template, variables, ctx) {
  ctx.line = 1;
  return renderNodes(parseNodes(tokenize(template), 0).nodes, new Scope(), variables, ctx);
}
async function verifyExisting(destination, manifest, fs2) {
  const path = `${destination}/manifest.json`;
  let existing;
  try {
    existing = JSON.parse(await fs2.readText(path));
  } catch (error) {
    throw new RenderError(`corrupt existing generation ${destination}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (canonicalJson(existing) !== canonicalJson(manifest)) {
    throw new RenderError(`generation collision or corruption at ${destination}`);
  }
  const outputs = manifest.outputs;
  const missing = [];
  for (const name of Object.keys(outputs).sort()) {
    if (!await fs2.exists(`${destination}/${name}`)) missing.push(name);
  }
  if (missing.length) {
    throw new RenderError(
      `generation is missing rendered files: ${missing.join(", ")} in ${destination}; deleting that folder is safe because the next run renders it again`
    );
  }
  for (const name of Object.keys(outputs)) {
    if (sha256Hex(await fs2.readText(`${destination}/${name}`)) !== outputs[name]) {
      throw new RenderError(`generation output hash mismatch: ${destination}/${name}`);
    }
  }
}
async function publish(destination, outputs, manifest, fs2) {
  if (await fs2.exists(destination)) {
    await verifyExisting(destination, manifest, fs2);
    return;
  }
  await fs2.mkdir(destination);
  for (const [name, content] of Object.entries(outputs)) {
    const path = `${destination}/${name}`;
    const parent = path.slice(0, path.lastIndexOf("/"));
    await fs2.mkdir(parent);
    await fs2.writeText(path, content);
  }
  await fs2.writeText(`${destination}/manifest.json`, `${JSON.stringify(sortedKeys(manifest), null, 2)}
`);
}
function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    const out2 = {};
    for (const key of Object.keys(value).sort()) {
      out2[key] = sortedKeys(value[key]);
    }
    return out2;
  }
  return value;
}
const RENDERER_MARKER = "ade-runtime/bmad-v6 render_skill";
const TEMPLATE_ENGINE = "ade-runtime/bmad-v6 jinja2 subset";
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "project";
async function renderSkill(projectRoot, skillRoot, set, fs2) {
  try {
    return `read and follow ${await render$1(projectRoot, skillRoot, set, fs2)}
`;
  } catch (error) {
    return `HALT: ${(error instanceof Error ? error.message : String(error)).split("\n").join(" ")}
`;
  }
}
async function render$1(projectRoot, skillRoot, set, fs2) {
  const skillName = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
  const sources = await loadSources(skillRoot, fs2);
  const central = await loadCentralConfig(projectRoot, fs2);
  const customizePath = `${skillRoot}/customize.toml`;
  const hasCustomization = Object.keys(set).length > 0 || await fs2.exists(customizePath);
  const defaults = hasCustomization ? await readTomlLayer(customizePath, fs2) : null;
  await checkPersistentLayers(projectRoot, skillName, defaults, fs2);
  let customization = hasCustomization ? await resolveCustomization(projectRoot, skillRoot, skillName, fs2) : {};
  const supplied = /* @__PURE__ */ new Set();
  if (defaults !== null) {
    const commandLayer = invocationCustomization(defaults, set);
    customization = deepMerge(customization, commandLayer);
    for (const leaf of leafPaths(commandLayer)) supplied.add(leaf);
  }
  const sourceHashes = {};
  for (const [name, content] of Object.entries(sources)) sourceHashes[name] = sha256Hex(content);
  const rootHash = sha256Hex(projectRoot).slice(0, 12);
  const slug = slugOf(projectRoot.replace(/\/+$/, "").split("/").pop() ?? projectRoot);
  const namespace = `${projectRoot}/_bmad/render/${skillName}/${slug}-${rootHash}`;
  const buildContext = (destination2) => new RenderContext(projectRoot, destination2, central, defaults, customization, new Set(Object.keys(sources)));
  const probe = buildContext(`${namespace}/pending`);
  renderSources(sources, skillRoot, probe);
  const unused = [...supplied].filter((path) => !(`customization.${path}` in probe.inputs)).sort();
  if (unused.length) throw new RenderError(`invocation override not used by this render: ${unused.join(", ")}`);
  const identity = {
    project_root: projectRoot,
    skill_root: skillRoot,
    renderer_sha256: sha256Hex(RENDERER_MARKER),
    template_engine: TEMPLATE_ENGINE,
    resolved_values: JSON.parse(canonicalJson(probe.inputs)),
    source_sha256: sourceHashes
  };
  const generationHash = sha256Hex(canonicalJson(identity)).slice(0, 20);
  const destination = `${namespace}/${generationHash}`;
  const rendered = renderSources(sources, skillRoot, buildContext(destination));
  const outputs = {};
  const outputHashes = {};
  for (const [name, content] of Object.entries(rendered)) {
    outputs[name] = content;
    outputHashes[name] = sha256Hex(content);
  }
  const manifest = {
    schema_version: 1,
    skill: skillName,
    project_root: projectRoot,
    project_slug: slug,
    root_hash: rootHash,
    generation_hash: generationHash,
    inputs: identity,
    outputs: outputHashes
  };
  await publish(destination, outputs, manifest, fs2);
  return `${destination}/workflow.md`;
}
const MEMLOG = ".memlog.md";
const PROG = "memlog.py";
const COMMANDS = ["init", "append", "set"];
class UsageError2 extends Error {
}
class CommandError extends Error {
}
class CrashError extends Error {
}
function pyJson$1(value) {
  const write = (value2) => {
    if (value2 === null || value2 === void 0) return "null";
    if (typeof value2 === "boolean") return value2 ? "true" : "false";
    if (typeof value2 === "number") return String(value2);
    if (typeof value2 === "string") return JSON.stringify(value2);
    if (Array.isArray(value2)) return `[${value2.map(write).join(", ")}]`;
    const entries = Object.entries(value2).map(([k, v]) => `${JSON.stringify(k)}: ${write(v)}`);
    return `{${entries.join(", ")}}`;
  };
  return write(value);
}
const splitlines = (text) => text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
const pyRepr$2 = (text) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
function now() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function split(text) {
  const lines = splitlines(text);
  if (!lines.length || lines[0] !== "---") throw new CrashError("ValueError: .memlog.md has no frontmatter");
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) throw new CrashError("ValueError: .memlog.md frontmatter is not terminated");
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const cut = line.indexOf(":");
    if (cut !== -1) meta[line.slice(0, cut).trim()] = line.slice(cut + 1).trim();
  }
  return [meta, lines.slice(end + 1).join("\n").replace(/^\n+/, "")];
}
function render(meta, body) {
  const fields = Object.entries(meta).map(([key, value]) => `${key}: ${value.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).join(" ")}`).join("\n");
  return `---
${fields}
---

${body.replace(/\n+$/, "")}
`;
}
function touch(meta) {
  delete meta.updated;
  meta.updated = now();
}
const entryCount = (body) => splitlines(body).filter((line) => line.startsWith("- ")).length;
const ack = (path, body) => pyJson$1({ ok: true, memlog: path, entries: entryCount(body) }) + "\n";
async function cmdInit(path, fields, fs2) {
  if (await fs2.exists(path)) throw new CommandError(`${path} already exists; use append/set to update it`);
  const parent = path.slice(0, path.lastIndexOf("/"));
  if (parent) await fs2.mkdir(parent);
  const meta = {};
  for (const pair of fields) {
    const cut = pair.indexOf("=");
    if (cut === -1) throw new CommandError(`--field expects key=value, got ${pyRepr$2(pair)}`);
    meta[pair.slice(0, cut).trim()] = pair.slice(cut + 1).trim();
  }
  touch(meta);
  await fs2.writeText(path, render(meta, ""));
  return ack(path, "");
}
async function cmdAppend(path, text, type, by, fs2) {
  const raw = await readLog(path, fs2);
  split(raw);
  const entryText = text.split(/\s+/).filter(Boolean).join(" ");
  let label = type ?? "";
  if (by) label = `${label} by ${by}`.trim();
  const tag = label ? `(${label}) ` : "";
  const entry = `- ${tag}${entryText}`;
  await fs2.writeText(path, raw + (raw.endsWith("\n") ? "" : "\n") + entry + "\n");
  return ack(path, split(await fs2.readText(path))[1]);
}
async function cmdSet(path, key, value, fs2) {
  const [meta, body] = split(await readLog(path, fs2));
  meta[key] = value;
  touch(meta);
  await fs2.writeText(path, render(meta, body));
  return ack(path, body);
}
async function readLog(path, fs2) {
  if (!await fs2.exists(path)) {
    throw new CrashError(`FileNotFoundError: [Errno 2] No such file or directory: ${pyRepr$2(path)}`);
  }
  return fs2.readText(path);
}
const splitFlag$1 = (token) => {
  const cut = token.indexOf("=");
  return cut === -1 || !token.startsWith("--") ? [token, void 0] : [token.slice(0, cut), token.slice(cut + 1)];
};
function requireTarget(workspace, path) {
  if (workspace === void 0 && path === void 0) throw new UsageError2("one of the arguments --workspace --path is required");
  return path ?? `${workspace.replace(/\/+$/, "")}/${MEMLOG}`;
}
function flagsOf(argv) {
  const options = {};
  const takesValue = /* @__PURE__ */ new Set(["--workspace", "--path", "--text", "--type", "--by", "--field", "--key", "--value"]);
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag$1(argv[i]);
    if (!takesValue.has(flag)) throw new UsageError2(`unrecognized arguments: ${argv[i]}`);
    const value = inline ?? argv[++i];
    if (value === void 0) throw new UsageError2(`argument ${flag}: expected one argument`);
    if (flag === "--field") options[flag] = [...options[flag] ?? [], value];
    else {
      if (options[flag] !== void 0) throw new UsageError2(`argument ${flag}: expected one argument`);
      options[flag] = value;
    }
  }
  if (options["--workspace"] !== void 0 && options["--path"] !== void 0) {
    throw new UsageError2("argument --path: not allowed with argument --workspace");
  }
  return options;
}
async function memlog(argv, fs2) {
  const [command, ...rest] = argv;
  if (command === void 0) {
    return { stdout: `${PROG}: error: the following arguments are required: cmd
`, exitCode: 2 };
  }
  if (!COMMANDS.includes(command)) {
    return {
      stdout: `${PROG}: error: argument cmd: invalid choice: ${pyRepr$2(command)} (choose from init, append, set)
`,
      exitCode: 2
    };
  }
  const name = command;
  const prog = `${PROG} ${name}`;
  try {
    const options = flagsOf(rest);
    const required2 = name === "append" ? ["--text"] : name === "set" ? ["--key", "--value"] : [];
    const missing = required2.filter((flag) => !(flag in options));
    if (missing.length) throw new UsageError2(`the following arguments are required: ${missing.join(", ")}`);
    const path = requireTarget(options["--workspace"], options["--path"]);
    if (name === "init") return { stdout: await cmdInit(path, options["--field"] ?? [], fs2), exitCode: 0 };
    if (name === "append") {
      const stdout = await cmdAppend(path, options["--text"], options["--type"], options["--by"], fs2);
      return { stdout, exitCode: 0 };
    }
    return { stdout: await cmdSet(path, options["--key"], options["--value"], fs2), exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError2) return { stdout: `${prog}: error: ${message}
`, exitCode: 2 };
    if (error instanceof CommandError) return { stdout: `error: ${message}
`, exitCode: 2 };
    if (error instanceof CrashError) return { stdout: `${message}
`, exitCode: 1 };
    throw error;
  }
}
function isTable$3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function pyRepr$1(value) {
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    let out2 = quote;
    for (const ch of value) {
      if (ch === "\\") out2 += "\\\\";
      else if (ch === quote) out2 += "\\" + quote;
      else if (ch === "\n") out2 += "\\n";
      else if (ch === "\r") out2 += "\\r";
      else if (ch === "	") out2 += "\\t";
      else out2 += ch;
    }
    return out2 + quote;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === void 0 || value === null) return "None";
  if (Array.isArray(value)) return "[" + value.map(pyRepr$1).join(", ") + "]";
  const entries = Object.entries(value);
  return "{" + entries.map(([k, v]) => `${pyRepr$1(k)}: ${pyRepr$1(v)}`).join(", ") + "}";
}
function pyJsonString(value, ensureAscii) {
  let out2 = '"';
  const escape = (code) => "\\u" + code.toString(16).padStart(4, "0");
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (ch === '"') out2 += '\\"';
    else if (ch === "\\") out2 += "\\\\";
    else if (ch === "\n") out2 += "\\n";
    else if (ch === "\r") out2 += "\\r";
    else if (ch === "	") out2 += "\\t";
    else if (ch === "\b") out2 += "\\b";
    else if (ch === "\f") out2 += "\\f";
    else if (code < 32) out2 += escape(code);
    else if (ensureAscii && code > 126) {
      if (code > 65535) {
        const pair = code - 65536;
        out2 += escape(55296 + (pair >> 10)) + escape(56320 + (pair & 1023));
      } else out2 += escape(code);
    } else out2 += ch;
  }
  return out2 + '"';
}
function pyJson(value, opts = {}) {
  const ensureAscii = opts.ensureAscii ?? false;
  const indent = opts.indent;
  const write = (value2, depth) => {
    if (value2 === null || value2 === void 0) return "null";
    if (typeof value2 === "boolean") return value2 ? "true" : "false";
    if (typeof value2 === "number") return Number.isFinite(value2) ? String(value2) : "null";
    if (typeof value2 === "string") return pyJsonString(value2, ensureAscii);
    const open = indent === void 0 ? "" : "\n";
    const close = indent === void 0 ? "" : "\n" + " ".repeat(indent * depth);
    const inner = indent === void 0 ? "" : " ".repeat(indent * (depth + 1));
    const separator = indent === void 0 ? ", " : ",\n";
    if (Array.isArray(value2)) {
      if (!value2.length) return "[]";
      return "[" + open + value2.map((v) => inner + write(v, depth + 1)).join(separator) + close + "]";
    }
    const entries = Object.entries(value2).map(
      ([k, v]) => inner + pyJsonString(k, ensureAscii) + ": " + write(v, depth + 1)
    );
    if (!entries.length) return "{}";
    return "{" + open + entries.join(separator) + close + "}";
  };
  return write(value, 0);
}
function resolvePath(text) {
  const absolute = text.startsWith("/");
  const parts = [];
  for (const segment of text.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  return absolute ? "/" + joined : joined;
}
function dirname(p) {
  const cut = p.replace(/\/+$/, "").lastIndexOf("/");
  return cut <= 0 ? "/" : p.replace(/\/+$/, "").slice(0, cut);
}
function purePosixParts(entry) {
  return entry.split("/").filter((part) => part !== "" && part !== ".");
}
function posixName(parts) {
  return parts.length ? parts[parts.length - 1] : "";
}
function folderName(path) {
  return posixName(purePosixParts(path));
}
function posixStem(name) {
  const cut = name.lastIndexOf(".");
  return cut <= 0 ? name : name.slice(0, cut);
}
async function isDirectory(fs2, path) {
  try {
    await fs2.list(path);
    return true;
  } catch {
    return false;
  }
}
async function isFile(fs2, path) {
  if (!await fs2.exists(path)) return false;
  return !await isDirectory(fs2, path);
}
function missingPathError(path) {
  return `[Errno 2] No such file or directory: '${path}'`;
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function byteLength(text) {
  if (!/[^\x00-\x7f]/.test(text)) return text.length;
  return new TextEncoder().encode(text).length;
}
const MANIFEST_NAME$1 = "bmod.toml";
const TOPICS_DIR = "help";
const HELP_NAME = `${TOPICS_DIR}/help.md`;
const ROSTER_NAME$1 = "roster.toml";
const RETIRED_NAME$1 = "retired.toml";
const MIGRATION_TABLE = "migration";
const MIGRATION_FIELDS = ["module", "from", "to", "title", "summary", "detect", "guide"];
const MIGRATION_NAME = /^migration-([0-9]+)\.toml$/;
const READ_LIMIT = 1024 * 1024;
async function readDocument(fs2, path, folder) {
  const resolved = resolvePath(path);
  const base = resolvePath(folder);
  if (!(resolved === base || resolved.startsWith(base.endsWith("/") ? base : base + "/"))) {
    throw new Error("resolves outside the skill folder");
  }
  if (!await fs2.exists(path)) throw new Error(missingPathError(path));
  if (await isDirectory(fs2, path)) throw new Error("is not a regular file");
  const text = await fs2.readText(path);
  if (byteLength(text) > READ_LIMIT) throw new Error(`is larger than ${READ_LIMIT} bytes`);
  return text;
}
function safeSkillRelative(entry) {
  if (!entry || entry.includes("://") || entry.includes("\\") || entry.includes(":")) return null;
  if (entry.startsWith("/")) return null;
  const parts = purePosixParts(entry);
  if (parts.includes("..") || posixName(parts) === "") return null;
  return parts;
}
function installCommand(source, skill) {
  if (typeof source !== "string" || !source.startsWith("github:")) return null;
  const parts = source.slice("github:".length).split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return `npx skills add ${parts[0]}/${parts[1]} --skill ${skill}`;
}
function manifestProblem(folder, problem) {
  return {
    kind: "manifest",
    skill: folder.slice(folder.lastIndexOf("/") + 1),
    manifest: `${folder}/${MANIFEST_NAME$1}`,
    problem
  };
}
async function scan(fs2, roots) {
  const folders = /* @__PURE__ */ new Map();
  const modules = [];
  const problems = [];
  const recordCodes = /* @__PURE__ */ new Map();
  const pending = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await fs2.list(root);
    } catch (error) {
      const text = await fs2.exists(root) ? errorText(error) : missingPathError(root);
      problems.push({ kind: "root", root, problem: `cannot read root ${root}: ${text}` });
      continue;
    }
    entries.sort(compareStrings);
    for (const name of entries) {
      const folder = `${root}/${name}`;
      if (!await isDirectory(fs2, folder)) continue;
      if (folders.has(name)) continue;
      folders.set(name, folder);
      const manifest = `${folder}/${MANIFEST_NAME$1}`;
      if (!await isFile(fs2, manifest)) continue;
      let data;
      try {
        data = parse(await fs2.readText(manifest));
      } catch (error) {
        problems.push(manifestProblem(folder, `cannot use ${manifest}: ${errorText(error)}`));
        continue;
      }
      if (!("bmod" in data) && !("skill" in data)) {
        problems.push(manifestProblem(folder, `${manifest} has neither a [bmod] nor a [skill] table`));
        continue;
      }
      let skill = isTable$3(data.skill) ? data.skill : null;
      if ("skill" in data && !isTable$3(data.skill)) {
        problems.push(manifestProblem(folder, `${manifest}: 'skill' is not a table`));
        skill = null;
      }
      if ("bmod" in data) {
        const module = readRecord(folder, data.bmod, skill !== null, problems);
        if (module !== null) {
          recordCodes.set(name, module.code);
          const first = modules.find((other) => other.code.toLowerCase() === module.code.toLowerCase());
          if (first === void 0) modules.push(module);
          else {
            problems.push({
              kind: "module",
              skill: name,
              problem: `${name}: module ${pyRepr$1(module.code)} is already recorded by ${first.folder.slice(first.folder.lastIndexOf("/") + 1)}; ${first.folder.slice(first.folder.lastIndexOf("/") + 1)} is used`
            });
          }
        }
      }
      if (skill !== null) pending.push({ root, folder, table: skill, ownRecord: "bmod" in data });
    }
  }
  const skills = pending.map(
    ({ root, folder, table, ownRecord }) => resolveSkill(root, folder, table, ownRecord, recordCodes)
  );
  problems.push(...absentRecords(skills, folders));
  for (const entry of skills) delete entry.source;
  return { folders, modules, skills, problems };
}
function readRecord(folder, table, hasSkill, problems) {
  const manifest = `${folder}/${MANIFEST_NAME$1}`;
  if (!isTable$3(table)) {
    problems.push(manifestProblem(folder, `${manifest}: 'bmod' is not a table`));
    return null;
  }
  const code = table.code;
  if (typeof code !== "string" || !code) {
    problems.push(manifestProblem(folder, `${manifest}: [bmod] has no usable 'code'`));
    return null;
  }
  const listed2 = table.skills;
  let members;
  if (listed2 === void 0) {
    members = hasSkill ? [folderName(folder)] : [];
  } else if (Array.isArray(listed2) && listed2.every((name) => typeof name === "string" && name)) {
    members = [...new Set(listed2)];
  } else {
    problems.push(manifestProblem(folder, `${manifest}: [bmod] 'skills' is not a list of skill names`));
    members = [];
  }
  return { code, folder, table, skills: members };
}
function resolveSkill(root, folder, table, ownRecord, recordCodes) {
  const name = folderName(folder);
  let bmod = ownRecord ? name : table.bmod ?? null;
  if (typeof bmod !== "string" || !bmod) bmod = null;
  return {
    skill: name,
    module: bmod !== null && recordCodes.has(bmod) ? recordCodes.get(bmod) : null,
    bmod,
    root,
    source: table.source
  };
}
function absentRecords(skills, folders) {
  const problems = [];
  const byBmod = /* @__PURE__ */ new Map();
  for (const entry of skills) {
    if (entry.module !== null) continue;
    if (entry.bmod === null) {
      problems.push({
        kind: "manifest",
        skill: entry.skill,
        problem: `${entry.skill}: [skill] does not name its module record under 'bmod'`
      });
      continue;
    }
    const group = byBmod.get(entry.bmod);
    if (group) group.push(entry);
    else byBmod.set(entry.bmod, [entry]);
  }
  for (const bmod of [...byBmod.keys()].sort(compareStrings)) {
    const entries = byBmod.get(bmod);
    const names = entries.map((entry) => entry.skill).sort(compareStrings);
    const state = folders.has(bmod) ? "has no usable module record" : "is not installed";
    const problem = {
      kind: "module",
      bmod,
      skills: names,
      problem: `module record ${bmod} ${state}; it is named by ${names.join(", ")}`
    };
    const command = folders.has(bmod) ? null : installCommand(entries[0].source, bmod);
    if (command) {
      problem.install = command;
      problem.problem = `${problem.problem}; install it with \`${command}\``;
    }
    problems.push(problem);
  }
  return problems;
}
async function collect$1(fs2, roots, includeContent = false) {
  const found = await scan(fs2, roots);
  const problems = found.problems;
  const documents = /* @__PURE__ */ new Map();
  for (const module of found.modules) {
    const declared = module.table.knowledge ?? [];
    if (!Array.isArray(declared)) {
      problems.push({
        kind: "knowledge",
        skill: folderName(module.folder),
        problem: "[bmod] 'knowledge' is not a list"
      });
      continue;
    }
    let entries = declared;
    if (await isFile(fs2, `${module.folder}/${HELP_NAME}`)) entries = [{ path: HELP_NAME }, ...entries];
    for (const entry of entries) {
      await recordDocument(fs2, documents, problems, found.folders, module, entry, includeContent);
    }
  }
  const topics = [];
  for (const module of found.modules) {
    for (const topic of await moduleTopics(fs2, module, problems)) {
      if (!documents.has(`${module.code}\0${topic.path}`)) topics.push(topic);
    }
  }
  const migrations = [];
  for (const module of found.modules) migrations.push(...await moduleMigrations(fs2, module, problems));
  return {
    roots: roots.map((root) => root),
    skills: [...found.skills].sort((a, b) => compareStrings(String(a.skill), String(b.skill))),
    documents: [...documents.values()].sort(
      (a, b) => compareStrings(a.module, b.module) || compareStrings(a.path, b.path)
    ),
    topics: [...topics].sort((a, b) => compareStrings(a.module, b.module) || compareStrings(a.path, b.path)),
    migrations: [...migrations].sort(
      (a, b) => compareStrings(a.module, b.module) || migrationNumber(a.path) - migrationNumber(b.path)
    ),
    problems
  };
}
async function recordDocument(fs2, documents, problems, folders, module, entry, includeContent) {
  const own = folderName(module.folder);
  const name = isTable$3(entry) ? entry.path : void 0;
  if (typeof name !== "string") {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge entry ${pyRepr$1(entry)} has no path`
    });
    return;
  }
  const relative = safeSkillRelative(name);
  if (relative === null) {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge names unsafe path ${pyRepr$1(name)}`
    });
    return;
  }
  const covered = isTable$3(entry) ? entry.skills ?? "*" : "*";
  let skills;
  if (covered === "*") {
    skills = [...module.skills];
  } else if (Array.isArray(covered) && covered.every((skill) => typeof skill === "string" && skill)) {
    skills = [...new Set(covered)];
  } else {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge entry ${pyRepr$1(name)}: 'skills' is neither "*" nor a list of skill names`
    });
    return;
  }
  const key = `${module.code}\0${relative.join("/")}`;
  if (documents.has(key)) {
    problems.push({ kind: "knowledge", skill: own, problem: `knowledge names ${pyRepr$1(name)} twice` });
    return;
  }
  const path = `${module.folder}/${relative.join("/")}`;
  let text;
  try {
    text = await readDocument(fs2, path, module.folder);
  } catch (error) {
    problems.push({
      kind: "document",
      skill: own,
      document: path,
      problem: `${path}: ${errorText(error)}`
    });
    return;
  }
  const document = {
    module: module.code,
    path: relative.join("/"),
    skills,
    installed_skills: skills.filter((skill) => folders.has(skill)),
    reported_from: own
  };
  if (includeContent) document.content = text;
  documents.set(key, document);
}
async function moduleTopics(fs2, module, problems) {
  const own = folderName(module.folder);
  let names;
  try {
    names = await fs2.list(`${module.folder}/${TOPICS_DIR}`);
  } catch {
    return [];
  }
  names.sort(compareStrings);
  const topics = [];
  for (const name of names) {
    if (!name.endsWith(".md") || name === "help.md") continue;
    const path = `${module.folder}/${TOPICS_DIR}/${name}`;
    try {
      await readDocument(fs2, path, module.folder);
    } catch (error) {
      problems.push({
        kind: "document",
        skill: own,
        document: path,
        problem: `${path}: ${errorText(error)}`
      });
      continue;
    }
    topics.push({
      module: module.code,
      topic: posixStem(name),
      path: `${TOPICS_DIR}/${name}`,
      file: path
    });
  }
  return topics;
}
async function moduleMigrations(fs2, module, problems) {
  let names;
  try {
    names = await fs2.list(module.folder);
  } catch {
    return [];
  }
  names = names.filter((name) => name.endsWith(".toml") && ![MANIFEST_NAME$1, ROSTER_NAME$1, RETIRED_NAME$1].includes(name)).sort(compareStrings);
  const migrations = [];
  for (const name of names) {
    const path = `${module.folder}/${name}`;
    let data;
    try {
      data = parse(await readDocument(fs2, path, module.folder));
    } catch (error) {
      problems.push(migrationProblem(module.folder, path, errorText(error)));
      continue;
    }
    if (!(MIGRATION_TABLE in data)) continue;
    const table = data[MIGRATION_TABLE];
    if (!isTable$3(table)) {
      problems.push(migrationProblem(module.folder, path, "'migration' is not a table"));
      continue;
    }
    const fields = {};
    for (const field of MIGRATION_FIELDS) fields[field] = table[field];
    const missing = MIGRATION_FIELDS.filter(
      (field) => typeof fields[field] !== "string" || !fields[field].trim()
    );
    const checklist = table.checklist;
    if (!Array.isArray(checklist) || !checklist.length || !checklist.every((item) => typeof item === "string" && item.trim())) {
      missing.push("checklist");
    }
    if (missing.length) {
      problems.push(migrationProblem(module.folder, path, `[migration] needs non-empty ${missing.join(", ")}`));
      continue;
    }
    if (fields.module !== module.code) {
      problems.push(
        migrationProblem(
          module.folder,
          path,
          `[migration] module ${pyRepr$1(fields.module)} is not this record's ${pyRepr$1(module.code)}`
        )
      );
      continue;
    }
    if (migrationNumber(name) === null) {
      problems.push(migrationProblem(module.folder, path, "a migration file must be named migration-<n>.toml"));
      continue;
    }
    migrations.push({
      module: module.code,
      path: name,
      file: path,
      from: fields.from,
      to: fields.to,
      title: fields.title
    });
  }
  const numbers = migrations.map((migration) => migrationNumber(migration.path));
  const duplicated = new Set(numbers.filter((number) => numbers.filter((n) => n === number).length > 1));
  for (const item of migrations) {
    if (duplicated.has(migrationNumber(item.path))) {
      problems.push(migrationProblem(module.folder, item.file, "another migration of this module has the same number"));
    }
  }
  return migrations.filter((item) => !duplicated.has(migrationNumber(item.path))).sort((a, b) => migrationNumber(a.path) - migrationNumber(b.path));
}
function migrationNumber(name) {
  const match = MIGRATION_NAME.exec(name);
  return match ? Number(match[1]) : null;
}
function migrationProblem(folder, path, problem) {
  return {
    kind: "migration",
    skill: folderName(folder),
    document: path,
    problem: `${path}: ${problem}`
  };
}
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
async function knowledge(argv, fs2) {
  const roots = [];
  let content = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--root") {
      const value = argv[++i];
      if (value === void 0) return usageError$4("argument --root: expected one argument");
      roots.push(value);
    } else if (token.startsWith("--root=")) {
      roots.push(token.slice("--root=".length));
    } else if (token === "--content") {
      content = true;
    } else if (token === "--skill-root") {
      const value = argv[++i];
      if (value === void 0) return usageError$4("argument --skill-root: expected one argument");
    } else if (!token.startsWith("--skill-root=")) {
      return usageError$4(`unrecognized arguments: ${token}`);
    }
  }
  if (!roots.length) return usageError$4("the following arguments are required: --root");
  const report = await collect$1(fs2, roots, content);
  return { stdout: `${pyJson(report)}
`, exitCode: 0 };
}
function usageError$4(message) {
  return { stdout: `knowledge: error: ${message}`, exitCode: 2 };
}
function csvDictRows(text) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row = {};
    header.forEach((name, i) => {
      row[name] = i < cells.length ? cells[i] : null;
    });
    if (cells.length > header.length) row["null"] = cells[header.length];
    return row;
  });
}
function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted2 = false;
  let fieldSeen = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
    fieldSeen = false;
  };
  const endRow = () => {
    push();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted2) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted2 = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "" && !fieldSeen) {
      quoted2 = true;
      fieldSeen = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      push();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      endRow();
      i += 2;
      continue;
    }
    field += ch;
    fieldSeen = true;
    i += 1;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}
class YamlError extends Error {
}
function scanLines(text) {
  const out2 = [];
  text.split(/\r\n|\n|\r/).forEach((raw, index) => {
    const trimmed = raw.replace(/\s+$/, "");
    const body = trimmed.trimStart();
    if (body === "" || body.startsWith("#") || body === "---") return;
    out2.push({ indent: trimmed.length - body.length, text: body, number: index + 1 });
  });
  return out2;
}
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"') i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).replace(/\s+$/, "");
  }
  return text;
}
function unquote(raw, line) {
  const text = raw.trim();
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) throw new YamlError(`unterminated single-quoted scalar at line ${line}`);
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) throw new YamlError(`unterminated double-quoted scalar at line ${line}`);
    let out2 = "";
    for (let i = 1; i < text.length - 1; i++) {
      const ch = text[i];
      if (ch !== "\\") {
        out2 += ch;
        continue;
      }
      const next = text[++i];
      if (next === "n") out2 += "\n";
      else if (next === "t") out2 += "	";
      else if (next === "r") out2 += "\r";
      else out2 += next;
    }
    return out2;
  }
  return text;
}
function plainScalar(text) {
  if (text === "" || text === "~" || /^null$/i.test(text)) return null;
  if (/^(true|yes|on)$/i.test(text)) return true;
  if (/^(false|no|off)$/i.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  if (/^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)(?:[eE][-+]?[0-9]+)?$/.test(text)) return Number.parseFloat(text);
  return text;
}
function scalar(raw, line) {
  const text = raw.trim();
  if (text.startsWith("[") || text.startsWith("{")) return readFlow(text, line);
  if (text.startsWith("'") || text.startsWith('"')) return unquote(text, line);
  return plainScalar(text);
}
function readFlow(text, line) {
  let i = 0;
  const skip = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };
  const readPlain = (stops) => {
    const start = i;
    while (i < text.length && !stops.includes(text[i])) i += 1;
    return text.slice(start, i).trim();
  };
  const readValue = () => {
    skip();
    const ch = text[i];
    if (ch === "[" || ch === "{") {
      const mapping = ch === "{";
      const close = mapping ? "}" : "]";
      i += 1;
      const items = [];
      const entries = {};
      for (; ; ) {
        skip();
        if (i >= text.length) throw new YamlError(`unterminated flow collection at line ${line}`);
        if (text[i] === close) {
          i += 1;
          return mapping ? entries : items;
        }
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (mapping) {
          skip();
          const key = text[i] === "'" || text[i] === '"' ? String(readValue()) : readPlain(":," + close);
          skip();
          if (text[i] !== ":") throw new YamlError(`flow mapping entry without a value at line ${line}`);
          i += 1;
          entries[key] = readValue();
        } else {
          items.push(readValue());
        }
      }
    }
    if (ch === "'" || ch === '"') {
      let out2 = "";
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === quote) {
          if (quote === "'" && text[i + 1] === "'") {
            out2 += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        if (text[i] === "\\" && quote === '"') {
          const next = text[++i];
          out2 += next === "n" ? "\n" : next === "t" ? "	" : next;
          i += 1;
          continue;
        }
        out2 += text[i++];
      }
      return out2;
    }
    return plainScalar(readPlain(",]}"));
  };
  const value = readValue();
  skip();
  if (i !== text.length) throw new YamlError(`trailing text after a flow collection at line ${line}`);
  return value;
}
function loadYaml(text, file = "module.yaml") {
  const lines = scanLines(text);
  let at = 0;
  const fail = (number, detail) => {
    throw new YamlError(`${file}: ${detail} at line ${number}`);
  };
  const blockScalar = (header, indent) => {
    const keep = header.endsWith("+");
    const chomp = header.endsWith("-");
    const folded = header.startsWith(">");
    const parts = [];
    while (at < lines.length && lines[at].indent > indent) {
      parts.push({ indent: lines[at].indent, text: lines[at].text });
      at += 1;
    }
    if (!parts.length) return "";
    const base = parts[0].indent;
    const body = parts.map((part) => " ".repeat(Math.max(0, part.indent - base)) + part.text).join("\n");
    const value2 = folded ? body.replace(/([^\n])\n(?!\n)/g, "$1 ") : body;
    if (chomp) return value2;
    return keep ? value2 + "\n\n" : value2 + "\n";
  };
  const isMappingLine = (line) => {
    if (line.text.startsWith("- ") || line.text === "-") return false;
    const text2 = stripComment(line.text);
    return text2.includes(":");
  };
  const parseNode = (indent) => {
    if (at >= lines.length) return null;
    if (lines[at].text.startsWith("- ") || lines[at].text === "-") return parseSequence(indent);
    return parseMapping(indent);
  };
  const parseSequence = (indent) => {
    const items = [];
    while (at < lines.length && lines[at].indent === indent && (lines[at].text.startsWith("- ") || lines[at].text === "-")) {
      const line = lines[at];
      const rest = line.text === "-" ? "" : stripComment(line.text.slice(2)).trim();
      at += 1;
      if (rest === "") {
        items.push(at < lines.length && lines[at].indent > indent ? parseNode(lines[at].indent) : null);
        continue;
      }
      if (isMappingLine({ ...line, text: rest })) items.push(parseMapping(indent + 2, [rest]));
      else items.push(scalar(rest, line.number));
    }
    return items;
  };
  const parseMapping = (indent, leading = []) => {
    const map = {};
    let pending = leading;
    for (; ; ) {
      let text2;
      let number;
      if (pending.length) {
        text2 = pending.shift();
        number = lines[Math.max(0, at - 1)]?.number ?? 1;
      } else {
        if (at >= lines.length || lines[at].indent !== indent || !isMappingLine(lines[at])) return map;
        const line = lines[at];
        text2 = stripComment(line.text);
        number = line.number;
        at += 1;
      }
      const cut = text2.indexOf(":");
      const key = unquote(text2.slice(0, cut), number).trim();
      const rest = stripComment(text2.slice(cut + 1)).trim();
      if (rest.startsWith("|") || rest.startsWith(">")) {
        if (!/^[|>][+-]?$/.test(rest)) fail(number, `unsupported block scalar header ${pyRepr$1(rest)}`);
        map[key] = blockScalar(rest, indent);
        continue;
      }
      if (rest === "") {
        if (at < lines.length && lines[at].indent > indent) map[key] = parseNode(lines[at].indent);
        else if (at < lines.length && lines[at].indent === indent && (lines[at].text.startsWith("- ") || lines[at].text === "-"))
          map[key] = parseSequence(indent);
        else map[key] = null;
        continue;
      }
      if (isMappingLine({ text: rest })) {
        fail(number, `a mapping value must start on its own line`);
      }
      map[key] = scalar(rest, number);
    }
  };
  if (!lines.length) return null;
  const value = parseNode(lines[0].indent);
  if (at < lines.length) fail(lines[at].number, "cannot parse");
  return value;
}
function parseDate(raw) {
  const text = raw.trim();
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text);
  if (!match) throw new Error(`unparseable date: ${pyRepr$1(text)} (want YYYY[-MM[-DD]])`);
  const [, year, month, day] = match;
  const date = { year: Number(year), month: Number(month ?? 1), day: Number(day ?? 1) };
  if (!dayOfMonthExists(date)) throw new Error(`day is out of range for month`);
  return date;
}
function dayOfMonthExists({ year, month, day }) {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function addMonths(date, months) {
  const total = date.month - 1 + months;
  const year = date.year + Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}
function formatDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(date.year).padStart(4, "0")}-${pad(date.month)}-${pad(date.day)}`;
}
function compareDates(a, b) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}
function today() {
  const now2 = /* @__PURE__ */ new Date();
  return { year: now2.getFullYear(), month: now2.getMonth() + 1, day: now2.getDate() };
}
function absolutePath(text, cwd2 = process.cwd()) {
  return resolvePath(text.startsWith("/") ? text : `${cwd2}/${text}`);
}
function asciiFold(text) {
  return text.normalize("NFKD").split("").filter((ch) => ch.codePointAt(0) < 128).join("");
}
function htmlEscape(text, quote = true) {
  const out2 = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return quote ? out2.replace(/"/g, "&quot;").replace(/'/g, "&#x27;") : out2;
}
function pySplitLines(text) {
  if (text === "") return [];
  const lines = text.split(new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]"));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function pySplitJoin(text) {
  return text.split(/\s+/).filter(Boolean).join(" ");
}
function pyRound(value, digits = 0) {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}
function usageError$3(script, message) {
  return { stdout: `${script}: error: ${message}`, exitCode: 2 };
}
const BLOCK_RE = /\{if-([a-zA-Z0-9_-]+)\}([\s\S]*?)\{\/if-\1\}/;
function processConditionals(text, truths) {
  const kept = [];
  const removed = [];
  let current = text;
  for (; ; ) {
    const match = BLOCK_RE.exec(current);
    if (match === null) break;
    const condition = match[1];
    const replacement = truths.has(condition) ? match[2] : "";
    if (truths.has(condition)) {
      if (!kept.includes(condition)) kept.push(condition);
    } else if (!removed.includes(condition)) removed.push(condition);
    current = current.slice(0, match.index) + replacement + current.slice(match.index + match[0].length);
  }
  return { text: current.replace(/\n{3,}/g, "\n\n"), kept, removed };
}
function processVariables(text, variables) {
  const substituted = [];
  let current = text;
  for (const [name, value] of variables) {
    const placeholder = `{${name}}`;
    if (current.includes(placeholder)) {
      current = current.split(placeholder).join(value);
      substituted.push(name);
    }
  }
  return { text: current, substituted };
}
function splitFlag(token) {
  if (!token.startsWith("-") || token === "-" || token === "--") return [token, null];
  const cut = token.indexOf("=");
  if (cut < 0) return [token, null];
  return [token.slice(0, cut), token.slice(cut + 1)];
}
const SHA1_IV = /* @__PURE__ */ Uint32Array.from([
  1732584193,
  4023233417,
  2562383102,
  271733878,
  3285377520
]);
const p32 = /* @__PURE__ */ Math.pow(2, 32);
const K = /* @__PURE__ */ Array.from({ length: 64 }, (_, i) => Math.floor(p32 * Math.abs(Math.sin(i + 1))));
const MD5_IV = /* @__PURE__ */ SHA1_IV.slice(0, 4);
const MD5_W = /* @__PURE__ */ new Uint32Array(16);
class MD5 extends HashMD {
  constructor() {
    super(64, 16, 8, true);
    this.A = MD5_IV[0] | 0;
    this.B = MD5_IV[1] | 0;
    this.C = MD5_IV[2] | 0;
    this.D = MD5_IV[3] | 0;
  }
  get() {
    const { A, B, C, D } = this;
    return [A, B, C, D];
  }
  set(A, B, C, D) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      MD5_W[i] = view.getUint32(offset, true);
    let { A, B, C, D } = this;
    for (let i = 0; i < 64; i++) {
      let F, g, s;
      if (i < 16) {
        F = Chi(B, C, D);
        g = i;
        s = [7, 12, 17, 22];
      } else if (i < 32) {
        F = Chi(D, B, C);
        g = (5 * i + 1) % 16;
        s = [5, 9, 14, 20];
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
        s = [4, 11, 16, 23];
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
        s = [6, 10, 15, 21];
      }
      F = F + A + K[i] + MD5_W[g];
      A = D;
      D = C;
      C = B;
      B = B + rotl(F, s[i % 4]);
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    this.set(A, B, C, D);
  }
  roundClean() {
    clean(MD5_W);
  }
  destroy() {
    this.set(0, 0, 0, 0);
    clean(this.buffer);
  }
}
const md5 = /* @__PURE__ */ createHasher(() => new MD5());
const SELECTOR_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BMad Method Brainstorming Selection</title>
<script>
/* set the theme before first paint so there's no light-mode flash */
(function(){ try {
  var t = localStorage.getItem('bmad-theme');
  if (!t) { t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
  document.documentElement.setAttribute('data-theme', t);
} catch(e){} })();
<\/script>
<style>
  :root {
    --bg:#f6f7fb; --surface:#fff; --ink:#1c1e2b; --muted:#6b7080;
    --accent:#5b4bdc; --accent-ink:#5b4bdc; --warn:#c0561f;
    --line:#e6e8f0; --control:#eef0f7; --control2:#f1f2f8; --raised:#fff;
    --cnt:#b9bdce; --foot:#aeb2c4; --shadow:rgba(20,20,50,.06);
  }
  :root[data-theme="dark"] {
    --bg:#0f1117; --surface:#171a23; --ink:#e7e9f2; --muted:#9aa0b4;
    --accent:#6d5cf0; --accent-ink:#a99bff; --warn:#e08a4a;
    --line:#2a2f3e; --control:#222634; --control2:#1d212d; --raised:#2c3242;
    --cnt:#5a6076; --foot:#5a6076; --shadow:rgba(0,0,0,.45);
  }
  /* lift the category hue toward white on dark surfaces so deep hues stay legible */
  :root[data-theme="dark"] section > h2 { color:color-mix(in srgb, var(--c) 62%, #fff); }
  :root[data-theme="dark"] .tech .ico { color:color-mix(in srgb, var(--c) 68%, #fff); }
  :root[data-theme="dark"] label.tech:has(input:checked) { border-color:color-mix(in srgb, var(--c) 60%, #fff); }
  .titlerow { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .themebtn { flex:none; width:36px; height:36px; border-radius:9px; background:var(--control); color:var(--ink); font-size:17px; line-height:1; display:inline-flex; align-items:center; justify-content:center; }
  .themebtn:hover { background:var(--raised); }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink); }
  header { position:sticky; top:0; z-index:5; background:var(--surface); padding:20px 0 12px; border-bottom:1px solid var(--line); box-shadow:0 2px 12px var(--shadow); }
  .hwrap { max-width:1120px; margin:0 auto; padding:0 24px; }  /* align header content with the card column on wide screens */
  h1 { margin:0 0 4px; font-size:24px; letter-spacing:-.02em; }
  .sub { margin:0 0 12px; color:var(--muted); font-size:14px; max-width:74ch; }
  button { font:inherit; border:0; border-radius:8px; cursor:pointer; }
  .composer { display:flex; flex-direction:column; gap:9px; margin:6px 0 12px; }
  .grp { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .glabel { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); min-width:74px; }
  .modes { display:inline-flex; background:var(--control); border-radius:9px; padding:3px; gap:2px; }
  .mode { padding:7px 13px; font-size:14px; font-weight:600; color:var(--muted); background:transparent; }
  .mode.on { background:var(--raised); color:var(--accent-ink); box-shadow:0 1px 3px var(--shadow); }
  .modehint { flex:1 1 240px; min-width:0; font-size:13px; color:var(--muted); font-style:italic; }
  .pill { font-size:13px; color:var(--muted); background:var(--control); padding:6px 12px; border-radius:20px; }
  .pill b { color:var(--accent-ink); }
  .step { display:inline-flex; align-items:center; gap:7px; font-size:13px; color:var(--ink); background:var(--control2); padding:4px 6px 4px 12px; border-radius:20px; }
  .step b { min-width:12px; text-align:center; font-size:14px; color:var(--ink); }
  .step button { width:24px; height:24px; border-radius:50%; background:var(--raised); color:var(--muted); font-size:17px; line-height:22px; text-align:center; box-shadow:0 1px 2px var(--shadow); }
  .step button:hover { color:var(--accent-ink); }
  .total { font-size:12px; color:var(--muted); }
  .total.warn { color:var(--warn); font-weight:600; }
  .bar { display:flex; gap:10px 14px; align-items:center; flex-wrap:wrap; }
  #copy { margin-left:auto; padding:9px 22px; background:var(--accent); color:#fff; font-size:14px; font-weight:700; }
  #copy:hover { filter:brightness(1.07); }
  .chips { flex:1 1 320px; min-width:0; display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
  .chip { font-size:12px; padding:4px 11px; border-radius:16px; border:0; color:#fff; background:var(--cc); font-weight:600; cursor:pointer; }
  .chip:hover { filter:brightness(1.08); }
  .banner { max-height:0; overflow:hidden; transition:max-height .25s ease, padding .22s ease, margin .22s ease; background:linear-gradient(90deg,var(--accent),#8275f2); color:#fff; border-radius:10px; font-weight:700; text-align:center; padding:0 14px; }
  .banner.show { max-height:64px; padding:13px 14px; margin-top:10px; }
  .banner.fail { background:linear-gradient(90deg,var(--warn),#e0894a); }
  main { padding:18px 24px 60px; max-width:1120px; margin:0 auto; }
  section { margin:0 0 26px; }
  section > h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--c); margin:0 0 10px; border-bottom:1px solid color-mix(in srgb, var(--c) 24%, var(--line)); padding-bottom:6px; }
  section > h2 .cnt { color:color-mix(in srgb, var(--c) 45%, var(--cnt)); margin-left:6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:10px; }
  label.tech { display:flex; gap:12px; align-items:flex-start; background:color-mix(in srgb, var(--c) 5%, var(--surface)); border:1px solid color-mix(in srgb, var(--c) 18%, var(--line)); border-radius:10px; padding:11px 13px; cursor:pointer; transition:border-color .12s, box-shadow .12s, background .12s; }
  label.tech:hover { border-color:color-mix(in srgb, var(--c) 45%, var(--surface)); }
  label.tech input { margin-top:2px; width:17px; height:17px; accent-color:var(--c); flex:none; }
  label.tech:has(input:checked) { border-color:var(--c); background:color-mix(in srgb, var(--c) 12%, var(--surface)); box-shadow:0 0 0 2px color-mix(in srgb, var(--c) 30%, transparent); }
  .tech .ic2 { display:flex; gap:5px; flex:none; }
  .tech .ico { width:40px; height:40px; flex:none; color:var(--c); }
  .tech .n { font-weight:600; display:block; }
  .tech .d { color:var(--muted); font-size:13.5px; display:block; margin-top:2px; }
  .tech .gf { color:var(--accent-ink); font-size:11px; display:block; margin-top:5px; opacity:.85; }
  .grouphdr { margin:30px 0 12px; font-size:12px; text-transform:uppercase; letter-spacing:.14em; font-weight:700; color:var(--c); opacity:.92; border-bottom:1px solid color-mix(in srgb, var(--c) 22%, var(--line)); padding-bottom:7px; }
  main > .grouphdr:first-child { margin-top:2px; }
  :root[data-theme="dark"] .grouphdr { color:color-mix(in srgb, var(--c) 62%, #fff); }
  .goals { display:flex; gap:7px; flex-wrap:wrap; }
  .goal { font-size:12px; padding:5px 12px; border-radius:16px; background:var(--control); color:var(--muted); font-weight:600; }
  .goal:hover { color:var(--ink); }
  .goal.on { background:var(--accent); color:#fff; }
  label.tech.invent { border-style:dashed; background:transparent; }
  label.tech.invent:hover { border-color:var(--c); }
  label.tech.invent .n { color:var(--c); }
  label.tech.hidden { display:none; }
  footer { text-align:center; color:var(--foot); font-size:12px; padding:24px; }
</style>
</head>
<body>
<header>
  <div class="hwrap">
  <div class="titlerow">
    <h1>BMad Method Brainstorming Selection</h1>
    <button id="theme" class="themebtn" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"></button>
  </div>
  <p class="sub">Compose your session, hit <strong>Copy prompt</strong>, and paste it back into the chat to begin. {{TOTAL}}</p>

  <div class="composer">
    <div class="grp">
      <span class="glabel">Facilitation</span>
      <div class="modes" id="modes">
        <button type="button" class="mode on" data-mode="Facilitator">Facilitator</button>
        <button type="button" class="mode" data-mode="Creative Partner">Creative Partner</button>
        <button type="button" class="mode" data-mode="Ideate for me">Ideate for me</button>
      </div>
      <span class="modehint" id="modehint"></span>
    </div>
    <div class="grp">
      <span class="glabel">Techniques</span>
      <span class="pill">Picked <b id="pickN">0</b></span>
      <span class="step">Random <button type="button" data-step="rand" data-d="-1">&minus;</button><b id="randN">0</b><button type="button" data-step="rand" data-d="1">+</button></span>
      <span class="step">Invent <button type="button" data-step="inv" data-d="-1">&minus;</button><b id="invN">0</b><button type="button" data-step="inv" data-d="1">+</button></span>
      <span class="step">AI picks <button type="button" data-step="ai" data-d="-1">&minus;</button><b id="aiN">0</b><button type="button" data-step="ai" data-d="1">+</button></span>
      <span class="total" id="total">Total 0 &middot; 3&ndash;4 is the sweet spot</span>
      <button id="copy" type="button">Copy prompt</button>
    </div>
  </div>

  {{GOALBAR}}
  <div class="bar">
    <span class="glabel">Jump to</span>
    <div class="chips" id="chips">{{CHIPS}}</div>
  </div>

  <div class="banner" id="banner">&#10003; Copied! Now paste it into the chat to start your session.</div>
  </div>
</header>
<main>
{{BODY}}
</main>
<footer>BMad Method &middot; Brainstorming</footer>
<script>
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var all = Array.prototype.slice;
  var boxes = all.call(document.querySelectorAll('input[type=checkbox]'));
  var techBoxes = boxes.filter(function(b){ return b.dataset.name; });      // real technique cards
  var inventBoxes = boxes.filter(function(b){ return b.dataset.invent; });  // per-category "invent in the spirit of" cards
  var header = document.querySelector('header');
  var sections = all.call(document.querySelectorAll('section'));
  var state = { mode: 'Facilitator', rand: 0, inv: 0, ai: 0 };
  var MODE_HINTS = {
    'Facilitator': 'A forcing function for your ideas — I prompt and push, but never supply them.',
    'Creative Partner': 'We riff together — I facilitate and add ideas too, each logged as yours or mine.',
    'Ideate for me': 'I run the whole session myself, then show you the result and offer to keep going.'
  };
  function setHint(){ $('modehint').textContent = MODE_HINTS[state.mode] || ''; }

  var themeBtn = $('theme');
  function setThemeIcon(){ themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾'; }
  themeBtn.addEventListener('click', function(){
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bmad-theme', next); } catch(e){}
    setThemeIcon();
  });

  all.call(document.querySelectorAll('.mode')).forEach(function(b){
    b.addEventListener('click', function(){
      all.call(document.querySelectorAll('.mode')).forEach(function(m){ m.classList.remove('on'); });
      b.classList.add('on');
      state.mode = b.dataset.mode;
      setHint();
    });
  });

  all.call(document.querySelectorAll('[data-step]')).forEach(function(btn){
    btn.addEventListener('click', function(){
      var k = btn.dataset.step, d = parseInt(btn.dataset.d, 10);
      state[k] = Math.max(0, state[k] + d);
      update();
    });
  });

  // Category chips are jump-nav: click one to smooth-scroll its section into view,
  // offsetting by the sticky header's height so the heading isn't hidden beneath it.
  all.call(document.querySelectorAll('.chip')).forEach(function(chip){
    chip.addEventListener('click', function(){
      var sec = null;
      for (var i = 0; i < sections.length; i++){ if (sections[i].dataset.cat === chip.dataset.cat){ sec = sections[i]; break; } }
      if (!sec){ return; }
      var top = sec.getBoundingClientRect().top + window.pageYOffset - header.offsetHeight - 8;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  boxes.forEach(function(b){ b.addEventListener('change', update); });

  // A \`classic\` technique appears twice (lead "Proven & Professional" group + its home
  // category), so de-dupe checked picks by name; the lead copy carries data-lead.
  function checkedTech(){
    var seen = {}, out = [];
    techBoxes.forEach(function(b){
      if (!b.checked || seen[b.dataset.name]) { return; }
      seen[b.dataset.name] = 1;
      out.push(b);
    });
    return out;
  }
  function checkedInvent(){ return inventBoxes.filter(function(b){ return b.checked; }); }

  function update(){
    // rand can't exceed what the pool can supply — keep the counter honest with the draw
    if (state.rand > randomPool().length){ state.rand = randomPool().length; }
    $('pickN').textContent = checkedTech().length;
    $('randN').textContent = state.rand;
    $('invN').textContent = state.inv;
    $('aiN').textContent = state.ai;
    var total = checkedTech().length + state.rand + state.inv + checkedInvent().length + state.ai;
    var t = $('total');
    t.textContent = 'Total ' + total + ' · 3–4 is the sweet spot';
    t.classList.toggle('warn', total > 5);
  }

  // "Great for" goal filter: clicking a goal narrows visible cards to those tagged with it.
  var goalBtns = all.call(document.querySelectorAll('.goal'));
  function activeGoals(){ return goalBtns.filter(function(b){ return b.classList.contains('on'); }).map(function(b){ return b.dataset.goal; }); }
  function applyFilter(){
    var act = activeGoals();
    all.call(document.querySelectorAll('label.tech')).forEach(function(lab){
      var inp = lab.querySelector('input');
      if (inp.dataset.invent){ return; }  // invent cards aren't goal-tagged — always visible
      var good = (inp.dataset.good || '').split('|');
      var show = !act.length || act.some(function(g){ return good.indexOf(g) >= 0; });
      lab.classList.toggle('hidden', !show);
    });
  }
  goalBtns.forEach(function(b){ b.addEventListener('click', function(){ b.classList.toggle('on'); applyFilter(); }); });

  function randomPool(){
    var picked = {};
    checkedTech().forEach(function(b){ picked[b.dataset.name] = 1; });
    // draw from unchecked, non-lead copies, skipping anything already picked
    return techBoxes.filter(function(b){ return !b.checked && !b.dataset.lead && !picked[b.dataset.name]; });
  }

  function sample(arr, n){
    var a = arr.slice(), out = [];
    while (out.length < n && a.length){ out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); }
    return out;
  }

  function compose(){
    var picks = checkedTech().map(function(b){ return { n: b.dataset.name, c: b.dataset.cat, d: b.dataset.desc, r: false }; });
    var rnd = sample(randomPool(), state.rand).map(function(b){ return { n: b.dataset.name, c: b.dataset.cat, d: b.dataset.desc, r: true }; });
    var techs = picks.concat(rnd);
    var L = ["Let's run my brainstorming session.", "", 'Facilitation mode: ' + state.mode + '.'];
    if (techs.length){
      L.push("", 'Techniques to use:');
      techs.forEach(function(t, i){
        L.push((i + 1) + '.' + (t.r ? ' (random pick)' : '') + ' ' + t.n + '  ·  ' + t.c);
        L.push('   ' + t.d);
      });
    }
    var extra = [];
    if (state.inv > 0){ extra.push('invent ' + state.inv + ' brand-new technique' + (state.inv > 1 ? 's' : '') + ' on the fly'); }
    checkedInvent().forEach(function(b){ extra.push('invent 1 new technique in the spirit of ' + b.dataset.invent); });
    if (state.ai > 0){ extra.push('you choose ' + state.ai + ' more technique' + (state.ai > 1 ? 's' : '') + ' that fit my goal'); }
    if (extra.length){ L.push("", 'Then: ' + extra.join('; and ') + '.'); }
    if (!techs.length && !extra.length){
      L.push("", state.mode === 'Ideate for me'
        ? 'Run the whole session yourself — pick the techniques, generate the ideas, then show me the result.'
        : 'Help me choose 3–4 techniques to start.');
    }
    return L.join('\\n');
  }

  function fallbackCopy(t){
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch(e){ ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function flash(ok, text){
    var b = $('banner');
    b.classList.toggle('fail', !ok);
    b.innerHTML = ok
      ? '✓ Copied! Now paste it into the chat to start your session.'
      : '⚠ Couldn’t reach the clipboard — copy the text in the box, then paste it into the chat.';
    b.classList.add('show');
    setTimeout(function(){ b.classList.remove('show'); }, 4500);
    // Last resort on a hard failure: a prefilled, selectable prompt so the text is never lost.
    if (!ok){ window.prompt('Copy this, then paste it into the chat:', text); }
  }

  $('copy').addEventListener('click', function(){
    var text = compose();
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(
        function(){ flash(true, text); },
        function(){ flash(fallbackCopy(text), text); }
      );
    } else { flash(fallbackCopy(text), text); }
  });

  setHint();
  setThemeIcon();
  update();
})();
<\/script>
</body>
</html>
`;
const FIELDS$1 = ["category", "technique_name", "description", "detail", "provenance", "good_for", "audience"];
const REQUIRED_FIELDS$1 = ["category", "technique_name", "description"];
function loadCatalog$1(text) {
  const body = text.replace(/^﻿/, "");
  return csvDictRows(body).map((row) => {
    const out2 = {};
    for (const field of FIELDS$1) out2[field] = (row[field] ?? "").trim();
    return out2;
  });
}
function loadExtra$1(text) {
  const data = JSON.parse(text.replace(/^﻿/, ""));
  if (!Array.isArray(data)) throw new Error("--extra must be a JSON array of objects");
  const rows = [];
  data.forEach((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`each --extra entry must be a JSON object, got: ${pyRepr$1(item)}`);
    }
    const entry = item;
    const row = {};
    for (const field of FIELDS$1) row[field] = String(entry[field] ?? "").trim();
    for (const field of REQUIRED_FIELDS$1) {
      if (!row[field]) throw new Error(`--extra entry ${index + 1} (${row.technique_name || "unnamed"}) is missing ${field}`);
    }
    rows.push(row);
  });
  return rows;
}
function mergeTechniques(rows, extras) {
  const merged = rows.map((row) => ({ ...row }));
  const index = /* @__PURE__ */ new Map();
  merged.forEach((row, i) => index.set(row.technique_name.toLowerCase(), i));
  for (const extra of extras) {
    const key = extra.technique_name.toLowerCase();
    const at = index.get(key);
    if (at !== void 0) merged[at] = extra;
    else {
      index.set(key, merged.length);
      merged.push(extra);
    }
  }
  return merged;
}
function categories$1(rows) {
  const counts = /* @__PURE__ */ new Map();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}
function filterCats$1(rows, cats) {
  if (!cats?.length) return rows;
  const wanted = new Set(cats.map((cat) => cat.toLowerCase()));
  return rows.filter((row) => wanted.has(row.category.toLowerCase()));
}
function find$1(rows, names) {
  const byName = /* @__PURE__ */ new Map();
  for (const row of rows) byName.set(row.technique_name.toLowerCase(), row);
  const found = [];
  const missing = [];
  for (const name of names) {
    const row = byName.get(name.trim().toLowerCase());
    if (row) found.push(row);
    else missing.push(name);
  }
  return { found, missing };
}
async function resolveDetail(fs2, row, csvDir) {
  if (!row.detail) return null;
  const base = csvDir.replace(/\/+$/, "");
  const path = normalizePath(`${base}/${row.detail}`);
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  if (!await isFile(fs2, path)) return null;
  return (await fs2.readText(path)).trim();
}
function normalizePath(path) {
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return "/" + parts.join("/");
}
function fmtCategories$1(cats, asJson) {
  if (asJson) return pyJson(cats.map(([category, count]) => ({ category, count })), { ensureAscii: true });
  return cats.map(([category, count]) => `${category}	${count}`).join("\n");
}
function fmtList(rows, asJson) {
  if (asJson) {
    return pyJson(
      rows.map((row) => ({ category: row.category, technique_name: row.technique_name, description: row.description })),
      { ensureAscii: true }
    );
  }
  return rows.map((row) => `${row.category}	${row.technique_name}	${row.description}`).join("\n");
}
async function fmtShow(fs2, rows, csvDir, asJson) {
  if (asJson) {
    const out2 = [];
    for (const row of rows) {
      const detail = await resolveDetail(fs2, row, csvDir);
      const entry = {
        category: row.category,
        technique_name: row.technique_name,
        description: row.description
      };
      if (detail) entry.detail = detail;
      out2.push(entry);
    }
    return pyJson(out2, { ensureAscii: true });
  }
  const blocks = [];
  for (const row of rows) {
    let block = `## ${row.technique_name}  [${row.category}]
${row.description}`;
    const detail = await resolveDetail(fs2, row, csvDir);
    if (detail) block += `

${detail}`;
    blocks.push(block);
  }
  return blocks.join("\n\n");
}
function pretty(cat) {
  let out2 = "";
  let previousWasLetter = false;
  for (const ch of cat.replace(/_/g, " ").replace(/-/g, " ").toLowerCase()) {
    const isLetter = /[a-z]/.test(ch);
    out2 += isLetter && !previousWasLetter ? ch.toUpperCase() : ch;
    previousWasLetter = isLetter;
  }
  return out2;
}
const CHIP = '<rect x="1.5" y="1.5" width="41" height="41" rx="12" fill="currentColor" fill-opacity="0.12"/>';
const FALLBACK_GLYPH = '<circle cx="22" cy="22" r="11" fill="currentColor" fill-opacity="0.16"/><circle cx="22" cy="22" r="11" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="22" cy="22" r="3.4" fill="currentColor"/>';
const FALLBACK_TECH = '<rect x="15" y="15" width="14" height="14" rx="2.5" transform="rotate(45 22 22)" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="22" r="2.4" fill="currentColor"/>';
async function loadIcons(fs2, csvDir) {
  try {
    const data = JSON.parse(await fs2.readText(`${csvDir}/brain-icons.json`));
    return {
      categories: data.categories ?? {},
      techniques: data.techniques ?? {}
    };
  } catch {
    return { categories: {}, techniques: {} };
  }
}
function hlsToRgb(hue, lightness, saturation) {
  const m2 = lightness + saturation - lightness * saturation;
  const m1 = 2 * lightness - m2;
  const channel = (h) => {
    const value = (h % 1 + 1) % 1;
    if (value < 1 / 6) return m1 + (m2 - m1) * value * 6;
    if (value < 0.5) return m2;
    if (value < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - value) * 6;
    return m1;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
}
function hslHex(deg, saturation, lightness) {
  const [r, g, b] = hlsToRgb((deg % 360 + 360) % 360 / 360, lightness, saturation);
  const hex = (value) => Math.max(0, pyRound(value * 255)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
function categoryStyle(icons, cat) {
  const style = icons.categories[cat];
  if (style?.hue) return { hue: style.hue, glyph: style.glyph || FALLBACK_GLYPH };
  const digest = bytesToHex(md5(utf8ToBytes(cat)));
  let deg = 0;
  for (const digit of digest) deg = (deg * 16 + Number.parseInt(digit, 16)) % 360;
  return { hue: hslHex(deg, 0.58, 0.52), glyph: FALLBACK_GLYPH };
}
function techIcon(icons, name) {
  return icons.techniques[name] ?? FALLBACK_TECH;
}
const CLASSIC_GROUP = "Proven & Professional";
const LEAD_HUE = "#3d4f73";
const CATEGORY_GROUPS = [
  ["Structured & Analytical", ["structured", "deep"]],
  ["Creative & Generative", ["creative", "biomimetic", "cultural", "speculative_future", "quantum"]],
  ["Wild & Playful", ["wild", "absurdist", "theatrical", "constraint"]],
  ["Introspective & Personal", ["introspective_delight", "collaborative"]]
];
const GOAL_LABELS = [
  ["feature", "Build a feature"],
  ["novel", "Novel concept"],
  ["strategy", "Strategy"],
  ["planning", "Planning"],
  ["diagnosis", "Diagnose"],
  ["personal", "Personal / life"],
  ["unstuck", "Get unstuck"]
];
function goodForLabel(good) {
  const parts = good.split("|").filter(Boolean).map((tag) => GOAL_LABELS.find(([key]) => key === tag)?.[1] ?? tag);
  return parts.length ? "Great for: " + parts.join(" · ") : "";
}
function svg(inner) {
  return `<svg class="ico" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">${CHIP}${inner}</svg>`;
}
function card(icons, row, lead = false) {
  const name = htmlEscape(row.technique_name);
  const desc = htmlEscape(row.description);
  const { hue, glyph } = categoryStyle(icons, row.category);
  const display = htmlEscape(pretty(row.category));
  const good = htmlEscape(row.good_for ?? "");
  const provenance = htmlEscape(row.provenance ?? "");
  const style = lead ? ` style="--c:${hue}"` : "";
  const leadAttr = lead ? ' data-lead="1"' : "";
  const label = goodForLabel(row.good_for ?? "");
  const labelHtml = label ? `<span class="gf">${htmlEscape(label)}</span>` : "";
  return `<label class="tech"${style}><input type="checkbox" data-name="${name}" data-cat="${display}" data-desc="${desc}" data-good="${good}" data-prov="${provenance}"${leadAttr}><span class="ic2">${svg(glyph)}${svg(techIcon(icons, row.technique_name))}</span><span><span class="n">${name}</span><span class="d">${desc}</span>${labelHtml}</span></label>`;
}
function inventCard(display, glyph) {
  return `<label class="tech invent"><input type="checkbox" data-invent="${display}"><span class="ic2">${svg(glyph)}</span><span><span class="n">✨ Invent a ${display} technique</span><span class="d">Make up a brand-new technique on the fly, in the spirit of ${display}</span></span></label>`;
}
function htmlDoc(icons, rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) groups.set(row.category, [...groups.get(row.category) ?? [], row]);
  const body = [];
  const chips = [];
  const addSection = (cat) => {
    const { hue, glyph } = categoryStyle(icons, cat);
    const display = htmlEscape(pretty(cat));
    const cards = (groups.get(cat) ?? []).map((row) => card(icons, row));
    cards.push(inventCard(display, glyph));
    chips.push(`<button type="button" class="chip" data-cat="${display}" style="--cc:${hue}">${display}</button>`);
    body.push(
      `<section data-cat="${display}" style="--c:${hue}"><h2>${display}<span class="cnt">${(groups.get(cat) ?? []).length}</span></h2><div class="grid">${cards.join("")}</div></section>`
    );
  };
  const classics = rows.filter((row) => (row.provenance ?? "").toLowerCase() === "classic");
  if (classics.length) {
    const display = htmlEscape(CLASSIC_GROUP);
    const leadCards = classics.map((row) => card(icons, row, true)).join("");
    chips.push(`<button type="button" class="chip" data-cat="${display}" style="--cc:${LEAD_HUE}">${display}</button>`);
    body.push(
      `<section data-cat="${display}" style="--c:${LEAD_HUE}"><h2>${display}<span class="cnt">${classics.length}</span></h2><div class="grid">${leadCards}</div></section>`
    );
  }
  const placed = /* @__PURE__ */ new Set();
  for (const [title, cats] of CATEGORY_GROUPS) {
    const present = cats.filter((cat) => groups.has(cat));
    if (!present.length) continue;
    const { hue } = categoryStyle(icons, present[0]);
    body.push(`<h2 class="grouphdr" style="--c:${hue}">${htmlEscape(title)}</h2>`);
    for (const cat of present) {
      addSection(cat);
      placed.add(cat);
    }
  }
  const leftover = [...groups.keys()].filter((cat) => !placed.has(cat)).sort();
  if (leftover.length) {
    body.push('<h2 class="grouphdr" style="--c:#8a8f9e">More</h2>');
    for (const cat of leftover) addSection(cat);
  }
  const presentGoals = /* @__PURE__ */ new Set();
  for (const row of rows) for (const tag of (row.good_for ?? "").split("|")) if (tag) presentGoals.add(tag);
  let goalbar = "";
  if (presentGoals.size) {
    const ordered = [
      ...GOAL_LABELS.filter(([key]) => presentGoals.has(key)).map(([key]) => key),
      ...[...presentGoals].filter((tag) => !GOAL_LABELS.some(([key]) => key === tag)).sort()
    ];
    const goalChips = ordered.map((tag) => {
      const label = GOAL_LABELS.find(([key]) => key === tag)?.[1] ?? tag;
      return `<button type="button" class="goal" data-goal="${htmlEscape(tag)}">${htmlEscape(label)}</button>`;
    }).join("");
    goalbar = `<div class="bar"><span class="glabel">Great for</span><div class="goals" id="goals">${goalChips}</div></div>`;
  }
  const total = htmlEscape(`${rows.length} techniques across ${groups.size} categories.`);
  return SELECTOR_TEMPLATE.split("{{BODY}}").join(body.join("\n")).split("{{CHIPS}}").join(chips.join("")).split("{{GOALBAR}}").join(goalbar).split("{{TOTAL}}").join(total);
}
async function brain(argv, fs2) {
  const script = "brain";
  let file = null;
  let extra = null;
  let skillRoot = null;
  let asJson = false;
  let command = null;
  let categoriesArg = [];
  let all = false;
  let names = [];
  let outPath = null;
  let drawCount = 1;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--file") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --file: expected one argument");
      file = taken;
    } else if (flag === "--extra") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --extra: expected one argument");
      extra = taken;
    } else if (flag === "--json" && inline === null) asJson = true;
    else if (flag === "--skill-root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
      skillRoot = taken;
    } else if (command === null && ["categories", "list", "show", "random", "html"].includes(argv[i])) {
      command = argv[i];
    } else if (command === "list" && flag === "--category") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "list" && flag === "--all" && inline === null) all = true;
    else if (command === "show") names.push(argv[i]);
    else if (command === "random" && flag === "-n") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument -n: expected one argument");
      const parsed = Number.parseInt(taken, 10);
      if (Number.isNaN(parsed)) return usageError$3(script, `argument -n: invalid int value: '${taken}'`);
      drawCount = parsed;
    } else if (command === "random" && flag === "--category") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "html" && flag === "--out") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --out: expected one argument");
      outPath = taken;
    } else {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    }
  }
  if (file === null) {
    return usageError$3(script, "--file is required (the pin defaulted to the catalog beside the script)");
  }
  if (!await isFile(fs2, file)) {
    return { stdout: `error: technique file not found: ${file}
`, exitCode: 2 };
  }
  let rows = loadCatalog$1(await fs2.readText(file));
  if (extra !== null) {
    if (!await isFile(fs2, extra)) {
      return { stdout: `error: --extra file not found: ${extra}
`, exitCode: 2 };
    }
    try {
      rows = mergeTechniques(rows, loadExtra$1(await fs2.readText(extra)));
    } catch (error) {
      const text = errorText(error);
      return { stdout: `error: could not read --extra: ${text}
`, exitCode: 2 };
    }
  }
  const csvDir = absolutePath(file).slice(0, absolutePath(file).lastIndexOf("/")) || "/";
  const iconDir = skillRoot !== null ? `${absolutePath(skillRoot)}/assets` : csvDir;
  if (command === null) return usageError$3(script, "the following arguments are required: cmd");
  if (command === "categories") return { stdout: fmtCategories$1(categories$1(rows), asJson) + "\n", exitCode: 0 };
  if (command === "list") {
    if (!categoriesArg.length && !all) {
      return {
        stdout: "error: `list` needs --category (one or more) — or --all to dump the whole catalog on purpose. Use `categories` for the cheap map, or `random` to draw blind.\n",
        exitCode: 2
      };
    }
    return { stdout: fmtList(filterCats$1(rows, categoriesArg), asJson) + "\n", exitCode: 0 };
  }
  if (command === "show") {
    const { found, missing } = find$1(rows, names);
    if (!found.length) return { stdout: missing.map((name) => `# not found: ${name}`).join("\n") + "\n", exitCode: 1 };
    return { stdout: await fmtShow(fs2, found, csvDir, asJson) + "\n", exitCode: 0 };
  }
  if (command === "random") {
    const pool = filterCats$1(rows, categoriesArg);
    if (!pool.length) return { stdout: "# no techniques match\n", exitCode: 1 };
    const n = Math.max(0, Math.min(drawCount, pool.length));
    const picks = [];
    const remaining = [...pool];
    for (let i = 0; i < n && remaining.length; i++) {
      picks.push(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
    }
    return { stdout: fmtList(picks, asJson) + "\n", exitCode: 0 };
  }
  if (outPath === null) {
    return {
      stdout: "error: `html` needs --out PATH — it writes the selection page to a file and never prints the catalog to stdout (which would defeat the point).\n",
      exitCode: 2
    };
  }
  const parent = outPath.slice(0, outPath.lastIndexOf("/"));
  if (parent && !await fs2.exists(parent)) await fs2.mkdir(parent);
  await fs2.writeText(outPath, htmlDoc(await loadIcons(fs2, iconDir), rows));
  return { stdout: `wrote ${outPath} (${rows.length} techniques, ${categories$1(rows).length} categories)
`, exitCode: 0 };
}
const UNIT_SEP = "";
const LOG_FORMAT = `--format=%H${UNIT_SEP}%P${UNIT_SEP}%s`;
function emit$1(payload, code = 0) {
  return { stdout: pyJson(payload, { ensureAscii: true }), exitCode: code };
}
function argumentError(message) {
  return emit$1({ ok: false, error: `argument error: ${message}` }, 2);
}
function runGit(cmd) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("GIT_") && value !== void 0) env[key] = value;
  return new Promise((resolve2, reject) => {
    execFile(
      cmd[0],
      cmd.slice(1),
      { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "string") return reject(error);
        const code = error && typeof error.code === "number" ? error.code : 0;
        resolve2({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    );
  });
}
function gitLog(repo, extraArgs, range) {
  return runGit([
    "git",
    "-c",
    "core.quotePath=false",
    "-c",
    "log.diffMerges=separate",
    "-C",
    repo,
    "log",
    "--numstat",
    "--no-renames",
    ...extraArgs,
    LOG_FORMAT,
    range,
    "--"
    // terminate rev parsing so the range can never match a pathspec
  ]).then((proc) => {
    if (proc.code !== 0) {
      throw new GitFailure(proc.stderr.trim() || `git exited ${proc.code}`);
    }
    return proc.stdout;
  });
}
class GitFailure extends Error {
}
function parseNumstatLine(line) {
  const parts = line.split("	");
  if (parts.length < 3) return null;
  const [addedRaw, deletedRaw, ...rest] = parts;
  return {
    added: addedRaw === "-" ? null : Number.parseInt(addedRaw, 10),
    deleted: deletedRaw === "-" ? null : Number.parseInt(deletedRaw, 10),
    path: rest.join("	")
  };
}
function parseLog(output, stories) {
  const commits = [];
  const files = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  let counting = true;
  for (const raw of output.split("\n")) {
    if (raw.includes(UNIT_SEP)) {
      const [sha, parents, ...subjectParts] = raw.split(UNIT_SEP);
      const subject = subjectParts.join(UNIT_SEP);
      counting = !seen.has(sha);
      if (!counting) continue;
      seen.add(sha);
      commits.push({
        sha,
        subject,
        // Every id the subject names, in --stories order, word-boundary
        // matched so "1-2" does not also match "11-2".
        stories: stories.filter((id) => new RegExp(`\\b${escapeRegExp(id)}\\b`).test(subject)),
        is_merge: parents.split(/\s+/).filter(Boolean).length > 1
      });
      continue;
    }
    if (!counting || !raw.trim()) continue;
    const parsed = parseNumstatLine(raw);
    if (parsed === null) continue;
    let entry = files.get(parsed.path);
    if (entry === void 0) {
      entry = { path: parsed.path, added: 0, deleted: 0, binary_revisions: 0, commit_count: 0 };
      files.set(parsed.path, entry);
    }
    entry.commit_count += 1;
    if (parsed.added === null || parsed.deleted === null) {
      entry.binary_revisions += 1;
    } else {
      entry.added += parsed.added;
      entry.deleted += parsed.deleted;
    }
  }
  return { commits, files };
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function fileList(files) {
  return [...files.values()].map((entry) => ({
    path: entry.path,
    added: entry.added,
    deleted: entry.deleted,
    net: entry.added - entry.deleted,
    commit_count: entry.commit_count,
    binary_revisions: entry.binary_revisions
  }));
}
async function gitEvidence(argv, _fs) {
  let repo = ".";
  let range = null;
  let storiesArg = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--repo") {
      const taken = value();
      if (taken === void 0) return argumentError("argument --repo: expected one argument");
      repo = taken;
    } else if (flag === "--range") {
      const taken = value();
      if (taken === void 0) return argumentError("argument --range: expected one argument");
      range = taken;
    } else if (flag === "--stories") {
      const taken = value();
      if (taken === void 0) return argumentError("argument --stories: expected one argument");
      storiesArg = taken;
    } else return argumentError(`unrecognized arguments: ${argv[i]}`);
  }
  const stories = storiesArg ? [...new Set(storiesArg.split(",").map((id) => id.trim()).filter(Boolean))] : [];
  if (range === null) {
    return emit$1({ range: null, note: "no range supplied", commits: [], files: [] });
  }
  const cut = range.indexOf("..");
  const left = cut < 0 ? range : range.slice(0, cut);
  const right = cut < 0 ? "" : range.slice(cut + 2);
  if (range !== range.trim() || range.startsWith("-") || !left || !right || right.startsWith(".")) {
    return emit$1({ ok: false, error: `invalid --range ${pyRepr$1(range)}: expected a revision range like REV..REV` }, 2);
  }
  try {
    const first = parseLog(await gitLog(repo, [], range), stories);
    const mergeCount = first.commits.filter((commit) => commit.is_merge).length;
    let mergeCommits = [];
    let mergeFiles = /* @__PURE__ */ new Map();
    if (mergeCount) {
      const second = parseLog(await gitLog(repo, ["-m", "--first-parent", "--min-parents=2"], range), stories);
      mergeCommits = second.commits;
      mergeFiles = second.files;
    }
    return emit$1({
      range,
      commit_count: first.commits.length,
      merge_count: mergeCount,
      merges_measured: mergeCommits.length,
      commits: first.commits,
      files: fileList(first.files),
      merge_files: fileList(mergeFiles),
      stories_supplied: stories
    });
  } catch (error) {
    const message = error instanceof GitFailure ? error.message : error.message;
    return emit$1({ ok: false, error: message }, 1);
  }
}
const SHAPES = [
  "plain-skill",
  "script-utility",
  "rendered-skill",
  "agent",
  "memory-agent",
  "single-skill-module",
  "multi-skill-module"
];
const KNOWN_DIRS = ["references", "scripts", "assets", "help", "evals"];
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BMAD_NAME_RE = /^(?:bmad|bmad-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RECORD_NAME_RE = /^bmod-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_DESCRIPTION = "Required bmod metadata. Never invoke this skill.";
const USE_WHEN_RE = /\buse\s+(?:when|if)\b/i;
const TODO_RE = /\[TODO:/;
const TEXT_SUFFIXES = [".md", ".toml", ".py", ".json", ".yaml", ".yml", ".txt", ".html", ".csv"];
const DESCRIPTION_PLACEHOLDER = "[TODO: what the skill does, one sentence. Use when <the situation that should trigger it>.]";
function yamlSingleQuoted(value) {
  return "'" + value.replace(/'/g, "''") + "'";
}
function tomlString(value) {
  return pyJsonString(value, true);
}
function frontmatterBlock(content) {
  const text = content.replace(/^\s+/, "");
  if (!text.startsWith("---")) return { block: null, body: content };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { block: null, body: content };
  const after = text.slice(end + 4);
  if (after && !after.startsWith("\n") && !after.startsWith("\r")) return { block: null, body: content };
  return { block: text.slice(3, end).replace(/^[\r\n]+|[\r\n]+$/g, ""), body: after };
}
function stripQuotes(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "'" || value[0] === '"')) {
    const inner = value.slice(1, -1);
    return value[0] === "'" ? inner.replace(/''/g, "'") : inner;
  }
  return value;
}
function parseSkillFrontmatter(content) {
  const { block, body } = frontmatterBlock(content);
  if (block === null) return { meta: null, body };
  const result = {};
  let key = null;
  let value = "";
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0 && line[0] !== " " && line[0] !== "	") {
      if (key !== null) result[key] = stripQuotes(value.trim());
      key = line.slice(0, colon).trim();
      value = line.slice(colon + 1);
    } else if (key !== null && !line.replace(/^\s+/, "").startsWith("#")) {
      value += "\n" + line;
    }
  }
  if (key !== null) result[key] = stripQuotes(value.trim());
  return { meta: result, body };
}
function skillMd(name, description) {
  return `---
name: ${name}
description: ${yamlSingleQuoted(description)}
---

# ${name}
`;
}
function bmodToml(shape, name, bmod, source) {
  const sourceValue = source ? tomlString(source) : tomlString("[TODO: update_source, e.g. github:org/repo/skills]");
  if (shape === "multi-skill-module") {
    const code = name.startsWith("bmod-") ? name.slice("bmod-".length) : name;
    return `[bmod]
code = ${tomlString(code)}
version = "0.1.0"
update_source = ${sourceValue}
skills = []
`;
  }
  if (shape === "single-skill-module") {
    const code = name.startsWith("bmad-") ? name.slice("bmad-".length) : name;
    return `[bmod]
code = ${tomlString(code)}
version = "0.1.0"
update_source = ${sourceValue}

# The record is in this same file, so the skill table needs no bmod or source.
[skill]
`;
  }
  const lines = ["[skill]"];
  if (bmod) lines.push(`bmod = ${tomlString(bmod)}`);
  if (source) lines.push(`source = ${tomlString(source)}`);
  return lines.join("\n") + "\n";
}
async function create(fs2, args) {
  const name = args.name;
  if (!KEBAB_RE.test(name) || name.length > 64) {
    return {
      stdout: `${pyJson(
        {
          ok: false,
          error: `name ${pyRepr$1(name)} must be kebab-case (lowercase, digits, single hyphens), at most 64 characters`
        },
        { ensureAscii: true }
      )}
`,
      exitCode: 1
    };
  }
  if (args.shape === "multi-skill-module" && !RECORD_NAME_RE.test(name)) {
    return { stdout: `${pyJson({ ok: false, error: "a multi-skill-module record is named bmod-<code>" }, { ensureAscii: true })}
`, exitCode: 1 };
  }
  const dirs = args.dirs.split(",").map((entry) => entry.trim()).filter(Boolean);
  const unknown = dirs.filter((dir) => !KNOWN_DIRS.includes(dir));
  if (unknown.length) {
    return {
      stdout: `${pyJson(
        { ok: false, error: `unknown dirs ${unknown.join(", ")}; known: ${KNOWN_DIRS.join(", ")}` },
        { ensureAscii: true }
      )}
`,
      exitCode: 1
    };
  }
  const skillDir = `${args.dest}/${name}`;
  if (await fs2.exists(skillDir)) {
    return { stdout: `${pyJson({ ok: false, error: `${skillDir} already exists` }, { ensureAscii: true })}
`, exitCode: 1 };
  }
  let description = args.description ?? DESCRIPTION_PLACEHOLDER;
  if (args.shape === "multi-skill-module") description = RECORD_DESCRIPTION;
  const created = [];
  const emitted = [["SKILL.md", skillMd(name, description)]];
  if (args.bmod || args.shape === "single-skill-module" || args.shape === "multi-skill-module") {
    emitted.push(["bmod.toml", bmodToml(args.shape, name, args.bmod, args.source)]);
  }
  await fs2.mkdir(skillDir);
  for (const [rel2, text] of emitted) {
    await fs2.writeText(`${skillDir}/${rel2}`, text);
    created.push(rel2);
  }
  for (const dir of dirs) {
    await fs2.mkdir(`${skillDir}/${dir}`);
    created.push(dir + "/");
  }
  const result = { ok: true, skill: name, dir: skillDir, shape: args.shape, created };
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`, exitCode: 0 };
}
function finding$2(path, line, rule, text, fix) {
  return { path, line, rule, text: text.slice(0, 200), fix };
}
async function readBmod(fs2, skillDir, findings) {
  const path = `${skillDir}/bmod.toml`;
  if (!await isFile(fs2, path)) return { data: null, status: "absent" };
  let data;
  try {
    data = parse(await fs2.readText(path));
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    findings.push(finding$2("bmod.toml", 1, "bmod-invalid", text, "fix the TOML"));
    return { data: null, status: "invalid" };
  }
  if (!("skill" in data) && !("bmod" in data)) {
    findings.push(finding$2("bmod.toml", 1, "bmod-tables", "neither [skill] nor [bmod]", "add a [skill] table"));
    return { data, status: "invalid" };
  }
  return { data, status: "ok" };
}
async function walkFiles(fs2, root, skip = () => false) {
  const out2 = [];
  const walk2 = async (dir, rel2) => {
    for (const name of await fs2.list(dir)) {
      const path = `${dir}/${name}`;
      const parts = [...rel2, name];
      if (skip(parts)) continue;
      if (await isDirectory(fs2, path)) await walk2(path, parts);
      else out2.push(path);
    }
  };
  await walk2(root, []);
  return out2.sort(compareStrings);
}
async function check(fs2, skillDir, anyName) {
  const findings = [];
  const bmod = await readBmod(fs2, skillDir, findings);
  const isRecord2 = bmod.data !== null && "bmod" in bmod.data && !("skill" in bmod.data);
  const skillPath = `${skillDir}/SKILL.md`;
  if (!await isFile(fs2, skillPath)) {
    findings.push(finding$2("SKILL.md", 1, "skill-md-missing", "no SKILL.md", "create SKILL.md"));
  } else {
    const content = await fs2.readText(skillPath);
    const { meta, body } = parseSkillFrontmatter(content);
    if (meta === null) {
      findings.push(finding$2("SKILL.md", 1, "frontmatter-missing", content.slice(0, 80), "open with --- name/description ---"));
    } else {
      const extra = Object.keys(meta).filter((key) => key !== "name" && key !== "description").sort(compareStrings);
      if (extra.length) {
        findings.push(finding$2("SKILL.md", 1, "frontmatter-keys", extra.join(", "), "keep only name and description"));
      }
      const name = meta.name ?? "";
      if (!name) {
        findings.push(finding$2("SKILL.md", 1, "name-missing", "", "add name: <folder name>"));
      } else {
        if (name !== skillDir.slice(skillDir.lastIndexOf("/") + 1)) {
          findings.push(
            finding$2("SKILL.md", 2, "name-folder-mismatch", name, `name must equal ${skillDir.slice(skillDir.lastIndexOf("/") + 1)}`)
          );
        }
        const regex = anyName ? KEBAB_RE : isRecord2 ? RECORD_NAME_RE : BMAD_NAME_RE;
        if (!regex.test(name)) {
          findings.push(finding$2("SKILL.md", 2, "name-format", name, `name must match ${regex.source}`));
        }
      }
      const desc = meta.description ?? "";
      if (!desc) {
        findings.push(finding$2("SKILL.md", 1, "description-missing", "", "add a description with a Use when clause"));
      } else {
        if (desc.length > 1024) {
          findings.push(finding$2("SKILL.md", 3, "description-length", `${desc.length} chars`, "cut to 1024 or fewer"));
        }
        if (isRecord2) {
          if (desc !== RECORD_DESCRIPTION) {
            findings.push(
              finding$2("SKILL.md", 3, "description-trigger", desc, `a record's description is '${RECORD_DESCRIPTION}'`)
            );
          }
        } else if (!USE_WHEN_RE.test(desc)) {
          findings.push(finding$2("SKILL.md", 3, "description-trigger", desc, 'add a "Use when ..." clause'));
        }
      }
      if (!body.trim()) {
        findings.push(finding$2("SKILL.md", 1, "body-empty", "", "write the skill body after the frontmatter"));
      }
    }
  }
  for (const path of await walkFiles(fs2, skillDir)) {
    const rel2 = path.slice(skillDir.length + 1);
    const parts = rel2.split("/");
    const name = parts[parts.length - 1];
    const dot = name.lastIndexOf(".");
    const suffix = dot > 0 ? name.slice(dot) : "";
    if (!TEXT_SUFFIXES.includes(suffix) || parts.some((part) => part.startsWith("."))) continue;
    const lines = (await fs2.readText(path)).split("\n");
    lines.forEach((line, index) => {
      if (TODO_RE.test(line)) {
        findings.push(finding$2(rel2, index + 1, "todo-left", line.trim(), "fill in or remove the placeholder"));
      }
    });
  }
  return { ok: findings.length === 0, skill: skillDir.slice(skillDir.lastIndexOf("/") + 1), bmod: bmod.status, findings };
}
async function initSkill(argv, fs2) {
  const script = "init_skill";
  const args = { name: null, dest: null, shape: null, dirs: "", bmod: null, source: null, description: null };
  let checkPath = null;
  let anyName = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const take = () => value();
    if (flag === "--check") {
      const taken = take();
      if (taken === void 0) return usageError$3(script, "argument --check: expected one argument");
      checkPath = taken;
    } else if (flag === "--any-name" && inline === null) anyName = true;
    else if (flag === "--name") args.name = take() ?? null;
    else if (flag === "--dest") args.dest = take() ?? null;
    else if (flag === "--shape") {
      const taken = take();
      if (taken === void 0) return usageError$3(script, "argument --shape: expected one argument");
      if (!SHAPES.includes(taken)) return usageError$3(script, `argument --shape: invalid choice: '${taken}'`);
      args.shape = taken;
    } else if (flag === "--dirs") args.dirs = take() ?? "";
    else if (flag === "--bmod") args.bmod = take() ?? null;
    else if (flag === "--source") args.source = take() ?? null;
    else if (flag === "--description") args.description = take() ?? null;
    else if (flag === "--skill-root") {
      if (take() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (checkPath !== null) {
    if (!await isDirectory(fs2, checkPath)) return usageError$3(script, `not a directory: ${checkPath}`);
    const result = await check(fs2, checkPath, anyName);
    return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`, exitCode: result.ok ? 0 : 1 };
  }
  if (!(args.name && args.dest && args.shape)) {
    return usageError$3(script, "--name, --dest and --shape are required to create a skill (or use --check)");
  }
  return create(fs2, args);
}
const AD_HEADING = /^#{2,4}\s*AD-(\d+)\b(.*)$/gm;
const HEADING = /^#{1,6}\s/m;
const FENCE = /```[\s\S]*?```/g;
const PLACEHOLDER_WORD = /\b(TBD|TODO|FIXME|XXX)\b/g;
const SIMILAR_TO = /similar to AD-\d+/gi;
const TEMPLATE_TOKEN = /\{[a-z_][a-z0-9_ /.-]*\}/g;
const TEMPLATE_TOKEN_ONE = /\{[a-z_][a-z0-9_ /.-]*\}/;
function splitFrontmatter(text) {
  const lines = text.split("\n");
  if (lines.length && lines[0] === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        return { frontmatter: lines.slice(1, i).join("\n"), body: lines.slice(i + 1).join("\n"), offset: i + 1 };
      }
    }
  }
  return { frontmatter: "", body: text, offset: 0 };
}
function blankFences$1(text) {
  return text.replace(FENCE, (block) => "\n".repeat((block.match(/\n/g) ?? []).length));
}
function lineOf$1(text, index) {
  let count = 0;
  for (let i = 0; i < index; i++) if (text[i] === "\n") count += 1;
  return count + 1;
}
const PLACEHOLDER_RULES = [
  [PLACEHOLDER_WORD, "placeholder marker", "high"],
  [SIMILAR_TO, "unresolved cross-reference", "high"],
  [TEMPLATE_TOKEN, "possible unfilled template token (verify)", "low"]
];
function findPlaceholders(body, offset, name) {
  const findings = [];
  const scan2 = blankFences$1(body);
  for (const [regex, label, severity] of PLACEHOLDER_RULES) {
    for (const match of scan2.matchAll(regex)) {
      findings.push({
        category: "placeholder",
        severity,
        detail: `${label}: ${pyRepr$1(match[0])}`,
        location: `${name} (line ${offset + lineOf$1(scan2, match.index)})`
      });
    }
  }
  return findings;
}
function findFrontmatterPlaceholders(frontmatter, name) {
  const findings = [];
  for (const [regex, label, severity] of [PLACEHOLDER_RULES[0], PLACEHOLDER_RULES[2]]) {
    for (const match of frontmatter.matchAll(regex)) {
      findings.push({
        category: "placeholder",
        severity,
        detail: `frontmatter ${label}: ${pyRepr$1(match[0])}`,
        location: `${name} frontmatter (line ${1 + lineOf$1(frontmatter, match.index)})`
      });
    }
  }
  return findings;
}
function tableCells$1(row) {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}
function findAdIssues(body, offset, name) {
  const findings = [];
  const scan2 = blankFences$1(body);
  const seen = /* @__PURE__ */ new Map();
  let previous = null;
  for (const match of scan2.matchAll(AD_HEADING)) {
    const num = Number(match[1]);
    const fileLine = offset + lineOf$1(scan2, match.index);
    const location = `${name} AD-${num} (line ${fileLine})`;
    if (seen.has(num)) {
      findings.push({
        category: "ad_id",
        severity: "high",
        detail: `AD-${num} id reused (also at line ${seen.get(num)})`,
        location
      });
    } else seen.set(num, fileLine);
    if (previous !== null && num <= previous) {
      findings.push({
        category: "ad_id",
        severity: "high",
        detail: `AD-${num} is non-monotonic (follows AD-${previous}); ids must ascend and never renumber`,
        location
      });
    }
    previous = previous === null ? num : Math.max(previous, num);
    const start = match.index + match[0].length;
    const next = HEADING.exec(scan2.slice(start));
    const block = next ? scan2.slice(start, start + next.index) : scan2.slice(start);
    const low = block.toLowerCase();
    const missing = ["binds", "prevents", "rule"].filter((field) => !low.includes(field));
    if (missing.length) {
      findings.push({
        category: "ad_fields",
        severity: "high",
        detail: `AD-${num} missing required field(s): ${missing.join(", ")}`,
        location
      });
    }
  }
  return findings;
}
function findUnpinnedStack(body, offset, name) {
  const findings = [];
  let inStack = false;
  let headerSeen = false;
  let nameIdx = 0;
  let versionIdx = 1;
  const scan2 = blankFences$1(body);
  scan2.split("\n").forEach((raw, i) => {
    if (HEADING.test(raw)) {
      inStack = /^##\s+Stack\b/.test(raw);
      headerSeen = false;
      nameIdx = 0;
      versionIdx = 1;
      return;
    }
    if (!inStack || !raw.trimStart().startsWith("|")) return;
    if ([...raw.trim()].every((ch) => "|-: ".includes(ch))) return;
    const cells = tableCells$1(raw);
    if (!headerSeen) {
      headerSeen = true;
      cells.forEach((cell, j) => {
        if (cell.toLowerCase() === "name") nameIdx = j;
        else if (cell.toLowerCase() === "version") versionIdx = j;
      });
      return;
    }
    const dep = nameIdx < cells.length ? cells[nameIdx] : "";
    const version = versionIdx < cells.length ? cells[versionIdx] : "";
    if (!dep || TEMPLATE_TOKEN_ONE.test(dep)) return;
    if (!version || TEMPLATE_TOKEN_ONE.test(version)) {
      findings.push({
        category: "version_pin",
        severity: "medium",
        detail: `Stack entry ${pyRepr$1(dep)} has no version`,
        location: `${name} (line ${offset + i + 1})`
      });
    }
  });
  return findings;
}
function lintSpineText(text, name = "spine") {
  const { frontmatter, body, offset } = splitFrontmatter(text);
  const findings = [];
  findings.push(...findFrontmatterPlaceholders(frontmatter, name));
  findings.push(...findPlaceholders(body, offset, name));
  findings.push(...findAdIssues(body, offset, name));
  findings.push(...findUnpinnedStack(body, offset, name));
  const bySeverity = {};
  for (const finding2 of findings) bySeverity[finding2.severity] = (bySeverity[finding2.severity] ?? 0) + 1;
  return {
    ok: findings.length === 0,
    spine: name,
    total_findings: findings.length,
    by_severity: bySeverity,
    findings
  };
}
async function lintSpine(argv, fs2) {
  const script = "lint_spine";
  const positionals = [];
  const ignored = "--skill-root";
  let workspace = null;
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--workspace") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --workspace: expected one argument");
      workspace = taken;
    } else if (flag === "-o" || flag === "--output") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, `argument ${flag}: expected one argument`);
      output = taken;
    } else if (flag === ignored) {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  if (workspace === null) return usageError$3(script, "the following arguments are required: --workspace");
  if (positionals.length) return usageError$3(script, `unrecognized arguments: ${positionals[0]}`);
  const folder = absolutePath(workspace);
  const spinePath = `${folder}/${folder.slice(folder.lastIndexOf("/") + 1)}.md`;
  let result;
  if (!await fs2.exists(spinePath)) {
    result = { ok: false, error: `${spinePath} not found`, findings: [], total_findings: 0 };
  } else if (await isDirectory(fs2, spinePath)) {
    result = { ok: false, error: `could not read ${spinePath}: [Errno 21] Is a directory: '${spinePath}'`, findings: [], total_findings: 0 };
  } else {
    try {
      result = lintSpineText(await fs2.readText(spinePath), spinePath.slice(spinePath.lastIndexOf("/") + 1));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      result = { ok: false, error: `could not read ${spinePath}: ${text}`, findings: [], total_findings: 0 };
    }
  }
  const out2 = pyJson(result, { indent: 2, ensureAscii: true });
  if (output !== null) {
    const parent = output.slice(0, output.lastIndexOf("/"));
    if (parent && parent !== "/" && !await fs2.exists(parent)) await fs2.mkdir(parent);
    await fs2.writeText(output, out2 + "\n");
    return { stdout: "", exitCode: 0 };
  }
  return { stdout: out2 + "\n", exitCode: 0 };
}
const SURFACE_KEYS = ["agent", "workflow"];
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
function frontmatterDescription(text) {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return "";
  for (const line of match[1].split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("description:")) continue;
    let value = stripped.slice("description:".length).trim();
    if (value.length >= 2 && (value.startsWith("'") && value.endsWith("'") || value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}
function expandUser(path, home) {
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolvePath(`${home}/${path.slice(2)}`);
  return resolvePath(path);
}
async function scanCustomizableSkills(fs2, roots, projectRoot) {
  const agents = [];
  const workflows = [];
  const errors = [];
  const scannedRoots = [];
  const seen = /* @__PURE__ */ new Set();
  const customDir = `${projectRoot}/_bmad/custom`;
  for (const root of roots) {
    if (!await isDirectory(fs2, root)) {
      errors.push(`skills root does not exist: ${root}`);
      continue;
    }
    scannedRoots.push(root);
    for (const name of (await fs2.list(root)).sort(compareStrings)) {
      const skillDir = `${root}/${name}`;
      if (!await isDirectory(fs2, skillDir)) continue;
      const customizeToml = `${skillDir}/customize.toml`;
      if (!await isFile(fs2, customizeToml)) continue;
      let data;
      try {
        data = parse(await fs2.readText(customizeToml));
      } catch {
        data = null;
      }
      if (data === null) {
        errors.push(`failed to parse ${customizeToml}`);
        continue;
      }
      if (seen.has(name)) continue;
      seen.add(name);
      const skillMd2 = `${skillDir}/SKILL.md`;
      const description = await isFile(fs2, skillMd2) ? frontmatterDescription(await fs2.readText(skillMd2)) : "";
      const teamOverride = `${customDir}/${name}.toml`;
      const userOverride = `${customDir}/${name}.user.toml`;
      const surfaces = SURFACE_KEYS.filter((key) => key in data);
      if (!surfaces.length) {
        errors.push(`no [agent] or [workflow] block in ${customizeToml}`);
        continue;
      }
      for (const surface of surfaces) {
        const entry = {
          description,
          has_team_override: await isFile(fs2, teamOverride),
          has_user_override: await isFile(fs2, userOverride),
          install_path: skillDir,
          name,
          skills_root: root,
          surface,
          team_override_path: teamOverride,
          user_override_path: userOverride
        };
        if (surface === "agent") agents.push(entry);
        else workflows.push(entry);
      }
    }
  }
  return {
    agents,
    custom_dir: customDir,
    errors,
    project_root: projectRoot,
    scanned_roots: scannedRoots,
    workflows
  };
}
async function listCustomizableSkills(argv, fs2) {
  const script = "list_customizable_skills";
  let projectRoot = null;
  let skillsRoot = null;
  let skillRoot = null;
  const extraRoots = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const taken = () => value();
    if (flag === "--project-root") {
      projectRoot = taken() ?? null;
      if (projectRoot === null) return usageError$3(script, "argument --project-root: expected one argument");
    } else if (flag === "--skills-root") {
      skillsRoot = taken() ?? null;
      if (skillsRoot === null) return usageError$3(script, "argument --skills-root: expected one argument");
    } else if (flag === "--extra-root") {
      const extra = taken();
      if (extra === void 0) return usageError$3(script, "argument --extra-root: expected one argument");
      extraRoots.push(extra);
    } else if (flag === "--skill-root") {
      const taken2 = taken();
      if (taken2 === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
      skillRoot = taken2;
    } else {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    }
  }
  if (projectRoot === null) return usageError$3(script, "the following arguments are required: --project-root");
  const home = homedir();
  const resolvedProject = absolutePath(expandUser(projectRoot, home));
  if (!await isDirectory(fs2, resolvedProject)) {
    return {
      stdout: `error: project-root does not exist or is not a directory: ${resolvedProject}
`,
      exitCode: 2
    };
  }
  if (skillsRoot === null && skillRoot === null) {
    return usageError$3(script, "give --skills-root (or the patched --skill-root) to name the skills folder to scan");
  }
  const primary = skillsRoot !== null ? absolutePath(expandUser(skillsRoot, home)) : resolvePath(`${absolutePath(expandUser(skillRoot, home))}/..`);
  const roots = [];
  for (const root of [primary, ...extraRoots.map((extra) => absolutePath(expandUser(extra, home)))]) {
    if (!roots.includes(root)) roots.push(root);
  }
  try {
    const result = await scanCustomizableSkills(fs2, roots, resolvedProject);
    return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`, exitCode: 0 };
  } catch (error) {
    return { stdout: `${errorText(error)}
`, exitCode: 1 };
  }
}
const FIELDS = ["num", "category", "method_name", "description", "output_pattern"];
const REQUIRED_FIELDS = ["category", "method_name", "description", "output_pattern"];
function loadCatalog(text) {
  const body = text.replace(/^﻿/, "");
  return csvDictRows(body).map((row) => {
    const out2 = {};
    for (const field of FIELDS) out2[field] = (row[field] ?? "").trim();
    return out2;
  });
}
function loadExtra(text) {
  const data = JSON.parse(text.replace(/^﻿/, ""));
  if (!Array.isArray(data)) throw new Error("--extra must be a JSON array of objects");
  const rows = [];
  data.forEach((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`each --extra entry must be a JSON object, got: ${pyRepr$1(item)}`);
    }
    const entry = item;
    const row = {};
    for (const field of FIELDS) row[field] = String(entry[field] ?? "").trim();
    row.code = String(entry.code ?? "").trim();
    for (const field of REQUIRED_FIELDS) {
      if (!row[field]) {
        const name = row.method_name || row.code || "unnamed";
        throw new Error(`--extra entry ${index + 1} (${name}) is missing ${field}`);
      }
    }
    rows.push(row);
  });
  return rows;
}
function mergeExtra(rows, extras) {
  const merged = rows.map((row) => ({ ...row }));
  const index = /* @__PURE__ */ new Map();
  merged.forEach((row, i) => index.set(row.method_name.toLowerCase(), i));
  for (const extra of extras) {
    const key = extra.method_name.toLowerCase();
    const at = index.get(key);
    if (at !== void 0) {
      const replaced = { ...extra };
      replaced.num = replaced.num || merged[at].num;
      merged[at] = replaced;
    } else {
      index.set(key, merged.length);
      merged.push({ ...extra });
    }
  }
  let nextNum = Math.max(0, ...merged.filter((row) => /^\d+$/.test(row.num)).map((row) => Number(row.num))) + 1;
  const seen = /* @__PURE__ */ new Map();
  for (const row of merged) {
    if (!row.num) {
      row.num = String(nextNum);
      nextNum += 1;
    }
    const owner = seen.get(row.num);
    if (owner !== void 0) throw new Error(`num ${row.num} is used by both ${owner} and ${row.method_name}`);
    seen.set(row.num, row.method_name);
  }
  return merged;
}
function categories(rows) {
  const counts = /* @__PURE__ */ new Map();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
}
function filterCats(rows, cats) {
  if (!cats?.length) return rows;
  const wanted = new Set(cats.map((cat) => cat.toLowerCase()));
  return rows.filter((row) => wanted.has(row.category.toLowerCase()));
}
function find(rows, names) {
  const byKey = /* @__PURE__ */ new Map();
  for (const row of rows) {
    byKey.set(row.method_name.toLowerCase(), row);
    if (row.num && !byKey.has(row.num)) byKey.set(row.num, row);
  }
  const found = [];
  const missing = [];
  for (const name of names) {
    const row = byKey.get(name.trim().toLowerCase());
    if (row) found.push(row);
    else missing.push(name);
  }
  return { found, missing };
}
function exclude(rows, names) {
  if (!names?.length) return rows;
  const skip = new Set(names.map((name) => name.trim().toLowerCase()));
  return rows.filter((row) => !skip.has(row.method_name.toLowerCase()));
}
function spreadSample(rows, n, random) {
  const byCat = /* @__PURE__ */ new Map();
  for (const row of rows) byCat.set(row.category, [...byCat.get(row.category) ?? [], row]);
  const shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  };
  let buckets = [...byCat.values()];
  shuffle(buckets);
  for (const bucket of buckets) shuffle(bucket);
  const out2 = [];
  while (buckets.length && out2.length < n) {
    const exhausted = [];
    for (const bucket of buckets) {
      if (out2.length >= n) break;
      out2.push(bucket.pop());
      if (!bucket.length) exhausted.push(bucket);
    }
    buckets = buckets.filter((bucket) => !exhausted.includes(bucket));
  }
  return out2;
}
function sample(rows, n, random) {
  const pool = [...rows];
  const out2 = [];
  for (let i = 0; i < n && pool.length; i++) {
    const at = Math.floor(random() * pool.length);
    out2.push(pool.splice(at, 1)[0]);
  }
  return out2;
}
function fmtCategories(cats, asJson) {
  if (asJson) return pyJson(cats.map(([category, count]) => ({ category, count })), { ensureAscii: true });
  return cats.map(([category, count]) => `${category}	${count}`).join("\n");
}
function fmtRows(rows, asJson) {
  if (asJson) {
    return pyJson(
      rows.map((row) => Object.fromEntries(FIELDS.map((field) => [field, row[field]]))),
      { ensureAscii: true }
    );
  }
  return rows.map((row) => FIELDS.map((field) => row[field]).join("	")).join("\n");
}
async function pickMethods(argv, fs2) {
  const script = "pick_methods";
  let file = null;
  let extra = null;
  let asJson = false;
  let command = null;
  let categoriesArg = [];
  let all = false;
  let names = [];
  let drawCount = 1;
  let excludeArgs = [];
  let spread = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--file") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --file: expected one argument");
      file = taken;
    } else if (flag === "--extra") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --extra: expected one argument");
      extra = taken;
    } else if (flag === "--json" && inline === null) asJson = true;
    else if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (command === null && ["categories", "list", "show", "random"].includes(argv[i])) {
      command = argv[i];
    } else if (command === "list" && flag === "--category") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "list" && flag === "--all" && inline === null) all = true;
    else if (command === "random" && flag === "-n") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument -n: expected one argument");
      const parsed = Number.parseInt(taken, 10);
      if (Number.isNaN(parsed)) return usageError$3(script, `argument -n: invalid int value: '${taken}'`);
      drawCount = parsed;
    } else if (command === "random" && flag === "--category") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "random" && flag === "--exclude") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --exclude: expected one argument");
      excludeArgs.push(taken);
    } else if (command === "random" && flag === "--spread" && inline === null) spread = true;
    else if (command === "show") names.push(argv[i]);
    else return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (file === null) {
    return usageError$3(script, "--file is required (the pin defaulted to the catalog beside the script)");
  }
  if (!await isFile(fs2, file)) {
    return { stdout: `error: method file not found: ${file}
`, exitCode: 2 };
  }
  let rows = loadCatalog(await fs2.readText(file));
  if (extra !== null) {
    try {
      rows = mergeExtra(rows, loadExtra(await fs2.readText(extra)));
    } catch (error) {
      const text = errorText(error);
      const message = text.startsWith("--extra ") ? text : await fs2.exists(extra) ? text : missingPathError(extra);
      return { stdout: `error: could not read --extra: ${message}
`, exitCode: 2 };
    }
  }
  if (command === null) return usageError$3(script, "the following arguments are required: cmd");
  if (command === "categories") return { stdout: fmtCategories(categories(rows), asJson) + "\n", exitCode: 0 };
  if (command === "list") {
    if (!categoriesArg.length && !all) {
      return {
        stdout: "error: `list` needs --category (one or more) — or --all to dump the whole catalog on purpose. Use `categories` for the cheap map, or `random` to draw blind.\n",
        exitCode: 2
      };
    }
    return { stdout: fmtRows(filterCats(rows, categoriesArg), asJson) + "\n", exitCode: 0 };
  }
  if (command === "show") {
    const { found, missing } = find(rows, names);
    if (!found.length) return { stdout: missing.map((name) => `# not found: ${name}`).join("\n") + "\n", exitCode: 1 };
    return { stdout: fmtRows(found, asJson) + "\n", exitCode: 0 };
  }
  const pool = exclude(filterCats(rows, categoriesArg), excludeArgs);
  if (!pool.length) return { stdout: "# no methods match\n", exitCode: 1 };
  const n = Math.max(0, Math.min(drawCount, pool.length));
  const picks = spread ? spreadSample(pool, n, Math.random) : sample(pool, n, Math.random);
  return { stdout: fmtRows(picks, asJson) + "\n", exitCode: 0 };
}
const TEXT_LIMIT = 300;
const CORRECTION_RE = /^(?:no|nope|not|don'?t|do not|stop|wrong|wait|actually|instead|undo|revert|never|hold on|that'?s (?:not|wrong)|that is (?:not|wrong)|why did you|i said|i asked|not what)\b/i;
const INTERRUPTED_RE = /^\[Request interrupted by user/;
const COMMAND_RE = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/g;
const MEMLOG_ENTRY_RE = /^- (?:\(([^)]*)\) )?(.*)$/;
const FILE_INPUT_KEYS = ["file_path", "notebook_path", "path"];
function truncate(text) {
  const collapsed = pySplitJoin(text);
  return collapsed.length <= TEXT_LIMIT ? collapsed : collapsed.slice(0, TEXT_LIMIT - 3) + "...";
}
function encodeCwd(cwd2) {
  return cwd2.replace(/[/.]/g, "-");
}
function projectsDir(home, configDir) {
  const base = configDir ? configDir : `${home}/.claude`;
  return `${base}/projects`;
}
class Counter {
  counts = /* @__PURE__ */ new Map();
  bump(key) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  mostCommon(limit) {
    const entries = [...this.counts.entries()].map((entry, index) => ({ entry, index }));
    entries.sort((a, b) => b.entry[1] - a.entry[1] || a.index - b.index);
    return entries.slice(0, limit).map((item) => item.entry);
  }
  values() {
    return [...this.counts.values()];
  }
}
class Digest {
  sources = [];
  requests = new Counter();
  requestText = /* @__PURE__ */ new Map();
  sequences = new Counter();
  corrections = [];
  files = /* @__PURE__ */ new Set();
  skills = new Counter();
  addRequest(text) {
    const key = pySplitJoin(text.toLowerCase());
    if (!key) return;
    this.requests.bump(key);
    if (!this.requestText.has(key)) this.requestText.set(key, truncate(text));
    const stripped = text.trim();
    if (CORRECTION_RE.test(stripped) || INTERRUPTED_RE.test(stripped)) this.addCorrection(text);
  }
  addCorrection(text) {
    const short = truncate(text);
    if (!this.corrections.includes(short)) this.corrections.push(short);
  }
  addSequence(tools) {
    const collapsed = [];
    for (const tool of tools) if (collapsed[collapsed.length - 1] !== tool) collapsed.push(tool);
    if (collapsed.length) this.sequences.bump(collapsed.join("\0"));
  }
  addFile(path) {
    this.files.add(path);
  }
  addSkill(name) {
    this.skills.bump(name);
  }
  render(maxItems) {
    return {
      sources: this.sources,
      user_requests: this.requests.mostCommon(maxItems).map(([key, count]) => ({ text: this.requestText.get(key) ?? key, count })),
      tool_sequences: this.sequences.mostCommon(maxItems).map(([sequence, count]) => ({ tools: sequence.split("\0"), count })),
      corrections: this.corrections.slice(0, maxItems),
      files_touched: [...this.files].sort(compareStrings).slice(0, maxItems),
      skills_invoked: this.skills.mostCommon(maxItems).map(([name, count]) => ({ name, count }))
    };
  }
}
function userText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content.filter((block) => block !== null && typeof block === "object").filter((block) => block.type === "text").map((block) => typeof block.text === "string" ? block.text : "");
    if (!texts.length) return null;
    const joined = texts.filter(Boolean);
    return joined.length ? joined.join("\n") : null;
  }
  return null;
}
function readClaudeCode(text, digest) {
  let entries = 0;
  let turnTools = [];
  for (const line of pySplitLines(text)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record === null || typeof record !== "object" || Array.isArray(record)) continue;
    const row = record;
    if (row.isMeta || row.isSidechain) continue;
    const message = row.message !== null && typeof row.message === "object" && !Array.isArray(row.message) ? row.message : null;
    if (message === null) continue;
    const content = message.content;
    if (row.type === "user") {
      const prompt = userText(content);
      if (prompt === null) continue;
      entries += 1;
      digest.addSequence(turnTools);
      turnTools = [];
      for (const match of prompt.matchAll(COMMAND_RE)) digest.addSkill(match[1]);
      const stripped = prompt.trim();
      if (INTERRUPTED_RE.test(stripped)) digest.addCorrection(stripped);
      else if (stripped && !stripped.startsWith("<")) digest.addRequest(stripped);
    } else if (row.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block === null || typeof block !== "object") continue;
        const item = block;
        if (item.type !== "tool_use") continue;
        entries += 1;
        const name = String(item.name ?? "");
        turnTools.push(name);
        const input = item.input !== null && typeof item.input === "object" && !Array.isArray(item.input) ? item.input : {};
        if (name === "Skill" && input.skill) digest.addSkill(String(input.skill));
        for (const key of FILE_INPUT_KEYS) {
          if (typeof input[key] === "string" && input[key]) digest.addFile(input[key]);
        }
      }
    }
  }
  digest.addSequence(turnTools);
  return entries;
}
function readMemlog(text, digest) {
  let entries = 0;
  for (const line of pySplitLines(text)) {
    const match = MEMLOG_ENTRY_RE.exec(line);
    if (!match) continue;
    entries += 1;
    const tag = (match[1] ?? "").trim().toLowerCase();
    const kind = tag.split(" by ")[0].trim();
    const byUser = ` ${tag}`.includes(" by user") || tag.startsWith("by user");
    const body = match[2].trim();
    if (kind === "gap" || kind === "correction") digest.addCorrection(body);
    else if (kind === "direction" || kind === "decision" || byUser) digest.addRequest(body);
    else if (CORRECTION_RE.test(body)) digest.addCorrection(body);
  }
  return entries;
}
function detectFormat(path, requested) {
  if (requested !== "auto") return requested;
  if (path.endsWith(".jsonl")) return "claude-code";
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name.endsWith(".memlog.md") || name === ".memlog.md") return "memlog";
  return null;
}
async function expand(fs2, paths) {
  const files = [];
  for (const path of paths) {
    if (await isDirectory(fs2, path)) {
      const names = (await fs2.list(path)).sort(compareStrings);
      for (const name of names) if (name.endsWith(".jsonl")) files.push(`${path}/${name}`);
      for (const name of names) if (name.endsWith(".memlog.md")) files.push(`${path}/${name}`);
    } else files.push(path);
  }
  return files;
}
async function readSessionLog(argv, fs2) {
  const script = "read_session_log";
  const paths = [];
  let project = null;
  let format = "auto";
  let maxItems = 20;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --project: expected one argument");
      project = taken;
    } else if (flag === "--format") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --format: expected one argument");
      if (!["auto", "claude-code", "memlog"].includes(taken)) {
        return usageError$3(script, `argument --format: invalid choice: '${taken}'`);
      }
      format = taken;
    } else if (flag === "--max-items") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --max-items: expected one argument");
      const parsed = Number.parseInt(taken, 10);
      if (Number.isNaN(parsed)) return usageError$3(script, `argument --max-items: invalid int value: '${taken}'`);
      maxItems = parsed;
    } else if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    } else paths.push(argv[i]);
  }
  if (project !== null) {
    const { homedir: homedir2 } = await import("node:os");
    const { resolve: resolvePath2 } = await import("node:path");
    const expanded = project.startsWith("~") ? `${homedir2()}${project.slice(1)}` : project;
    const folder = `${projectsDir(homedir2(), process.env.CLAUDE_CONFIG_DIR)}/${encodeCwd(resolvePath2(expanded))}`;
    if (!await isDirectory(fs2, folder)) {
      return usageError$3(script, `no transcripts for ${project} at ${folder}`);
    }
    paths.push(folder);
  }
  if (!paths.length) return usageError$3(script, "give at least one path or --project");
  const missing = [];
  for (const path of paths) if (!await fs2.exists(path)) missing.push(path);
  if (missing.length) return usageError$3(script, `not found: ${missing.join(", ")}`);
  const digest = new Digest();
  for (const path of await expand(fs2, paths)) {
    const detected = detectFormat(path, format);
    if (detected === null) continue;
    const text = await fs2.readText(path);
    const entries = detected === "claude-code" ? readClaudeCode(text, digest) : readMemlog(text, digest);
    digest.sources.push({ path, format: detected, entries });
  }
  return { stdout: `${pyJson(digest.render(maxItems), { indent: 2, ensureAscii: true })}
`, exitCode: 0 };
}
const MARKER_RE$1 = /\[(\d+)\](?!\()/g;
const MD_LINK_RE = /\[([^\]]*)\]\(((?:[^\s()]|\([^\s()]*\))+)\)/;
const BARE_URL_RE = /https?:\/\/(?:\([^\s()]*\)|[^\s()|\]])+/;
const ROW_ID_RE = /^\[(\d+)\]$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const ENTRY_RE = /^- (?:\(([\p{L}\p{N}_-]+)(?: by [^)]*)?\)\s*)?(.*)$/u;
function out(payload, exitCode) {
  return { stdout: `${pyJson(payload, { indent: 2 })}
`, exitCode };
}
function refusal(message) {
  return { stdout: `error: ${message}
`, exitCode: 2 };
}
async function readText(fs2, pathArg) {
  if (pathArg === "-") return { ok: false, message: "stdin is not available to the bundled runtime; pass a path" };
  try {
    return { ok: true, text: await fs2.readText(pathArg) };
  } catch (error) {
    return { ok: false, message: await fs2.exists(pathArg) ? errorText(error) : missingPathError(pathArg) };
  }
}
function stripFences(text) {
  const lines = [];
  let openFence = null;
  for (const line of text.split("\n")) {
    const fence = FENCE_RE.exec(line);
    if (openFence === null) {
      if (fence) openFence = [fence[1][0], fence[1].length];
      lines.push(fence ? "" : line);
      continue;
    }
    const marker = fence ? fence[1] : "";
    if (marker.slice(0, 1) === openFence[0] && marker.length >= openFence[1] && line.trim() === marker) openFence = null;
    lines.push("");
  }
  return lines.join("\n");
}
function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
function appendixRows(text) {
  const rows = /* @__PURE__ */ new Map();
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("|")) continue;
    const cells = tableCells(stripped);
    if (cells.length < 2) continue;
    const match = ROW_ID_RE.exec(cells[0]);
    if (match) rows.set(Number(match[1]), cells);
  }
  return rows;
}
function cmdCitations(text) {
  const scannable = stripFences(text);
  const rows = appendixRows(scannable);
  const markers = /* @__PURE__ */ new Set();
  for (const line of scannable.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("|")) {
      const cells = tableCells(stripped);
      if (cells.length && ROW_ID_RE.test(cells[0])) continue;
    }
    for (const match of line.matchAll(MARKER_RE$1)) markers.add(Number(match[1]));
  }
  const dangling = [...markers].filter((n) => !rows.has(n)).sort((a, b) => a - b);
  const orphaned = [...rows.keys()].filter((n) => !markers.has(n)).sort((a, b) => a - b);
  const ok = !dangling.length && !orphaned.length;
  return out(
    {
      markers: [...markers].sort((a, b) => a - b),
      appendix_rows: [...rows.keys()].sort((a, b) => a - b),
      dangling_markers: dangling,
      orphaned_rows: orphaned,
      ok
    },
    ok ? 0 : 1
  );
}
function cmdTally(text) {
  const body = text.startsWith("---") ? text.split("---").slice(0, 3).slice(-1)[0] : text;
  const byType = /* @__PURE__ */ new Map();
  const byRef = /* @__PURE__ */ new Map();
  const unrefStatus = /* @__PURE__ */ new Map();
  let entries = 0;
  for (const line of body.split("\n")) {
    if (!line.startsWith("- ")) continue;
    const match = ENTRY_RE.exec(line);
    if (!match) continue;
    entries += 1;
    const entryType = match[1] ?? "note";
    byType.set(entryType, (byType.get(entryType) ?? 0) + 1);
    if (entryType !== "claim") continue;
    const status = /status=([\w-]+)/.exec(match[2]);
    const ref2 = /ref=\[?(\d+)\]?/.exec(match[2]);
    if (ref2) byRef.set(Number(ref2[1]), status ? status[1] : "unknown");
    else {
      const key = status ? status[1] : "unknown";
      unrefStatus.set(key, (unrefStatus.get(key) ?? 0) + 1);
    }
  }
  const claims = new Map(unrefStatus);
  for (const status of byRef.values()) claims.set(status, (claims.get(status) ?? 0) + 1);
  const sorted = (map) => Object.fromEntries([...map.entries()].sort((a, b) => compareStrings(a[0], b[0])));
  return out(
    {
      entries,
      by_type: sorted(byType),
      claims: sorted(claims),
      claims_total: [...claims.values()].reduce((sum, n) => sum + n, 0)
    },
    0
  );
}
function cmdStaleness(text, windowsArg, todayArg) {
  let windows;
  let reference;
  try {
    const rawWindows = JSON.parse(windowsArg);
    if (rawWindows === null || typeof rawWindows !== "object" || Array.isArray(rawWindows)) {
      throw new Error("--windows must be a JSON object of class -> months");
    }
    windows = new Map(
      Object.entries(rawWindows).map(([key, value]) => {
        const months = Number(value);
        if (!Number.isInteger(months)) throw new Error(`--windows values must be whole months, got ${pyRepr$1(value)}`);
        return [key.toLowerCase(), months];
      })
    );
    reference = todayArg ? parseDate(todayArg) : today();
  } catch (error) {
    return refusal(errorText(error));
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return refusal(errorText(error));
  }
  const claims = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload.claims : payload;
  if (!Array.isArray(claims) || !claims.every((claim) => claim !== null && typeof claim === "object" && !Array.isArray(claim))) {
    return refusal('claims must be a JSON array of objects, or {"claims": [...]}');
  }
  const results = [];
  const noWindow = /* @__PURE__ */ new Set();
  let staleCount = 0;
  let earliest = null;
  for (const claim of claims) {
    const claimClass = String(claim.class ?? "").toLowerCase();
    let published;
    try {
      published = parseDate(String(claim.pub_date));
    } catch (error) {
      return { stdout: `error in claim ${pyRepr$1(claim)}: ${errorText(error)}
`, exitCode: 2 };
    }
    const months = windows.get(claimClass);
    if (months === void 0) {
      noWindow.add(claimClass);
      results.push({ ...claim, recheck: null, stale: null });
      continue;
    }
    const recheck = addMonths(published, months);
    const stale = compareDates(recheck, reference) <= 0;
    if (stale) staleCount += 1;
    if (earliest === null || compareDates(recheck, earliest) < 0) earliest = recheck;
    results.push({ ...claim, recheck: formatDate(recheck), stale });
  }
  return out(
    {
      today: formatDate(reference),
      claims: results,
      stale_count: staleCount,
      earliest_recheck: earliest === null ? null : formatDate(earliest),
      no_window_classes: [...noWindow].sort(compareStrings)
    },
    staleCount ? 1 : 0
  );
}
function slugify(text, maxLen = 40) {
  const folded = asciiFold(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return folded.replace(/-{2,}/g, "-").slice(0, maxLen).replace(/-+$/, "");
}
function cmdSlug(topic, type, pattern, dateArg) {
  const slug = slugify(topic);
  if (!slug) return refusal("topic slugified to an empty string");
  const folder = pattern.split("{research_type}").join(type).split("{topic_slug}").join(slug).split("{date}").join(dateArg ?? formatDate(today()));
  return out({ topic_slug: slug, folder }, 0);
}
function safeUrl(raw) {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(raw);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  return (scheme === "http" || scheme === "https") && match[2] ? raw : null;
}
function cellHtml(cell, invalid) {
  const link = MD_LINK_RE.exec(cell);
  if (link) {
    const url = safeUrl(link[2]);
    const label = htmlEscape(link[1] || link[2]);
    if (url) {
      return htmlEscape(cell.slice(0, link.index)) + `<a href="${htmlEscape(url)}" target="_blank" rel="noopener">${label}</a>` + htmlEscape(cell.slice(link.index + link[0].length));
    }
    invalid.push(link[2]);
    return htmlEscape(cell.split(link[0]).join(link[1] || link[2]));
  }
  const bare = BARE_URL_RE.exec(cell);
  if (bare) {
    const url = safeUrl(bare[0]);
    if (url) {
      const escaped = htmlEscape(url);
      return htmlEscape(cell.slice(0, bare.index)) + `<a href="${escaped}" target="_blank" rel="noopener">${escaped}</a>` + htmlEscape(cell.slice(bare.index + bare[0].length));
    }
    invalid.push(bare[0]);
  }
  return htmlEscape(cell);
}
function cmdEscapeSources(text) {
  const rows = appendixRows(stripFences(text));
  if (!rows.size) return refusal("no source-appendix table rows found");
  const invalid = [];
  const bodyRows = [];
  for (const n of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(n);
    const tds = cells.slice(1).map((cell) => `<td>${cellHtml(cell, invalid)}</td>`).join("");
    bodyRows.push(`<tr id="src-${n}"><td>[${n}]</td>${tds}</tr>`);
  }
  const table = '<table class="sources"><tbody>' + bodyRows.join("") + "</tbody></table>";
  return out({ rows: rows.size, invalid_urls: invalid, html: table }, invalid.length ? 1 : 0);
}
async function reconKit(argv, fs2) {
  const rest = [];
  let command = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      if ((inline ?? argv[++i]) === void 0) {
        return usageError$3("recon_kit", "argument --skill-root: expected one argument");
      }
      continue;
    }
    if (command === null) command = argv[i];
    else rest.push(argv[i]);
  }
  if (command === null) return usageError$3("recon_kit", "the following arguments are required: cmd");
  const positionals = [];
  let windows = null;
  let todayArg = null;
  let type = null;
  let pattern = "research-{topic_slug}";
  let dateArg = null;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = splitFlag(rest[i]);
    const value = () => inline ?? rest[++i];
    if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3("recon_kit", "argument --skill-root: expected one argument");
    } else if (flag === "--windows") {
      windows = value() ?? null;
      if (windows === null) return usageError$3("recon_kit", "argument --windows: expected one argument");
    } else if (flag === "--today") {
      todayArg = value() ?? null;
    } else if (flag === "--type") {
      type = value() ?? null;
    } else if (flag === "--pattern") {
      pattern = value() ?? pattern;
    } else if (flag === "--date") {
      dateArg = value() ?? null;
    } else if (rest[i].startsWith("-") && rest[i] !== "-") {
      return usageError$3("recon_kit", `unrecognized arguments: ${rest[i]}`);
    } else positionals.push(rest[i]);
  }
  const read = async () => {
    const path = positionals[0];
    if (path === void 0) return { ok: false, message: "the following arguments are required: file" };
    return readText(fs2, path);
  };
  switch (command) {
    case "citations":
    case "tally":
    case "escape-sources":
    case "staleness": {
      if (positionals[0] === void 0) return usageError$3("recon_kit", "the following arguments are required: file");
      const file = await read();
      if (!file.ok) return refusal(file.message);
      if (command === "staleness" && windows === null) {
        return usageError$3("recon_kit", "the following arguments are required: --windows");
      }
      if (command === "citations") return cmdCitations(file.text);
      if (command === "tally") return cmdTally(file.text);
      if (command === "escape-sources") return cmdEscapeSources(file.text);
      return cmdStaleness(file.text, windows, todayArg);
    }
    case "slug": {
      const topic = positionals[0];
      if (topic === void 0) return usageError$3("recon_kit", "the following arguments are required: topic");
      if (type === null) return usageError$3("recon_kit", "the following arguments are required: --type");
      return cmdSlug(topic, type, pattern, dateArg);
    }
    default:
      return usageError$3("recon_kit", `invalid choice: ${pyRepr$1(command)}`);
  }
}
const RUNTIME_RE = /_bmad\/scripts\//;
function commonPrefix(names) {
  if (!names.length) return "";
  const parts = names.map((name) => name.split("-"));
  let shared = [];
  const width = Math.min(...parts.map((p) => p.length));
  for (let i = 0; i < width; i++) {
    if (new Set(parts.map((part) => part[i])).size !== 1) break;
    shared.push(parts[0][i]);
  }
  if (parts.length === 1) {
    shared = parts[0].slice(0, -1);
    if (!shared.length) shared = parts[0];
  }
  return shared.length ? shared.join("-") + "-" : "";
}
function isRelativeTo(path, parent) {
  return path === parent || path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}
async function scanRegistry(fs2, projectRoot, roots) {
  const seen = /* @__PURE__ */ new Set();
  const records = /* @__PURE__ */ new Map();
  const members = /* @__PURE__ */ new Map();
  const unregistered = [];
  const home = resolvePath(homedir());
  for (const root of roots) {
    if (!await isDirectory(fs2, root)) continue;
    const entries = (await fs2.list(root)).sort(compareStrings);
    for (const name of entries) {
      const folder = `${root}/${name}`;
      if (!await isDirectory(fs2, folder)) continue;
      if (!await isFile(fs2, `${folder}/SKILL.md`)) continue;
      const real = resolvePath(folder);
      if (seen.has(real)) continue;
      seen.add(real);
      const scope = isRelativeTo(real, home) && !isRelativeTo(real, resolvePath(projectRoot)) ? "user" : "project";
      const manifest = `${folder}/bmod.toml`;
      if (!await isFile(fs2, manifest)) {
        const skillText = await fs2.readText(`${folder}/SKILL.md`);
        if (await isFile(fs2, `${folder}/customize.toml`) || RUNTIME_RE.test(skillText)) {
          unregistered.push({ skill: name, path: folder });
        }
        continue;
      }
      let data = {};
      try {
        data = parse(await fs2.readText(manifest));
      } catch {
        data = {};
      }
      const bmod = data.bmod;
      if (bmod !== null && typeof bmod === "object" && !Array.isArray(bmod) && bmod.code) {
        const table = bmod;
        const skills = Array.isArray(table.skills) ? table.skills : [];
        records.set(name, {
          code: String(table.code),
          folder: name,
          path: folder,
          scope,
          version: table.version ?? null,
          update_source: table.update_source ?? null,
          skills: skills.map(String),
          has_help: await isFile(fs2, `${folder}/help/help.md`),
          has_roster: await isFile(fs2, `${folder}/roster.toml`),
          single_skill: "skill" in data
        });
      }
      const skill = data.skill;
      if (skill !== null && typeof skill === "object" && !Array.isArray(skill) && skill.bmod) {
        const owner = String(skill.bmod);
        members.set(owner, [...members.get(owner) ?? [], name]);
      }
    }
  }
  const out2 = [];
  for (const folder of [...records.keys()].sort(compareStrings)) {
    const rec = records.get(folder);
    const names = [.../* @__PURE__ */ new Set([...rec.skills, ...members.get(folder) ?? []])].sort(compareStrings);
    rec.skills = names;
    rec.prefix = names.length ? commonPrefix(names) : `${rec.code}-`;
    out2.push(rec);
  }
  const bmadDir = `${projectRoot}/_bmad`;
  const core = out2.find((rec) => rec.code === "core-tools") ?? null;
  const skillsDir = `${projectRoot}/skills`;
  let skillsRepo = false;
  if (await isDirectory(fs2, skillsDir)) {
    for (const name of await fs2.list(skillsDir)) {
      const folder = `${skillsDir}/${name}`;
      if (!await isDirectory(fs2, folder)) continue;
      if (await isFile(fs2, `${folder}/SKILL.md`) && await isFile(fs2, `${folder}/bmod.toml`)) {
        skillsRepo = true;
        break;
      }
    }
  }
  return {
    project_root: projectRoot,
    bmad: { present: await isDirectory(fs2, bmadDir), version: core === null ? null : core.version },
    skills_repo: skillsRepo,
    records: out2,
    unregistered
  };
}
function defaultRegistryRoots(projectRoot) {
  const home = homedir();
  return [
    `${projectRoot}/.agents/skills`,
    `${projectRoot}/.claude/skills`,
    `${projectRoot}/skills`,
    `${home}/.agents/skills`,
    `${home}/.claude/skills`
  ];
}
async function registry(argv, fs2) {
  const script = "registry";
  let projectRoot = null;
  let skillRoot = null;
  const roots = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project-root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --project-root: expected one argument");
      projectRoot = taken;
    } else if (flag === "--root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --root: expected one argument");
      roots.push(taken);
    } else if (flag === "--skill-root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
      skillRoot = taken;
    } else {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    }
  }
  if (projectRoot === null) return usageError$3(script, "the following arguments are required: --project-root");
  const resolved = absolutePath(projectRoot);
  if (!await isDirectory(fs2, resolved)) return usageError$3(script, `not a directory: ${resolved}`);
  const fallback = skillRoot === null ? [] : [resolvePath(`${skillRoot}/..`)];
  const allRoots = roots.length ? roots.map((root) => absolutePath(root)) : [...fallback, ...defaultRegistryRoots(resolved)];
  const report = await scanRegistry(fs2, resolved, allRoots);
  return { stdout: `${pyJson(report, { indent: 2, ensureAscii: true })}
`, exitCode: 0 };
}
const MEMBER_FIELDS = ["name", "icon", "title", "persona", "capabilities", "model"];
const AGENT_FIELDS = ["name", "icon", "title"];
async function collect(fs2, roots, projectRoot = null) {
  const found = await scan(fs2, roots);
  const problems = found.problems;
  const skills = found.folders;
  const files = /* @__PURE__ */ new Map();
  for (const module of found.modules) {
    if (await fs2.exists(`${module.folder}/${ROSTER_NAME$1}`)) {
      await recordFile(fs2, files, problems, module);
    }
  }
  const members = {};
  const groups = {};
  const ordered = [...files.values()].sort(
    (a, b) => compareStrings(a.module.code, b.module.code) || compareStrings(a.path, b.path)
  );
  for (const file of ordered) {
    const source = file.module.table.update_source;
    for (const member of listed(file.data, "members", problems, file.module.code, file.path)) {
      await addMember(fs2, members, problems, member, file.module.code, file.path, source, skills, projectRoot);
    }
    for (const group of listed(file.data, "groups", problems, file.module.code, file.path)) {
      addGroup(groups, problems, group, file.module.code, file.path);
    }
  }
  const agents = {};
  for (const [code, member] of Object.entries(members)) if (member.installed) agents[code] = member;
  await applyCentralAgents(fs2, agents, members, problems, projectRoot);
  return {
    agents,
    members,
    groups: [...Object.values(groups)],
    rosters: ordered.map((file) => ({
      module: file.module.code,
      path: file.path,
      skills: file.module.skills.filter((name) => skills.has(name))
    })),
    problems
  };
}
function listed(data, key, problems, module, path) {
  const found = data[key] ?? [];
  if (Array.isArray(found)) return found;
  problems.push({ kind: "roster", problem: `${module} ${path}: '${key}' is not a list` });
  return [];
}
async function recordFile(fs2, files, problems, module) {
  const folder = module.folder;
  const path = `${folder}/${ROSTER_NAME$1}`;
  let data;
  try {
    data = parse(await readDocument(fs2, path, folder));
  } catch (error) {
    problems.push({
      kind: "roster",
      skill: folderName(folder),
      problem: `${path}: ${errorText(error)}`
    });
    return;
  }
  const key = `${module.code}\0${ROSTER_NAME$1}`;
  if (!files.has(key)) files.set(key, { module, path: ROSTER_NAME$1, data });
}
async function addMember(fs2, members, problems, member, module, path, source, skills, projectRoot) {
  const code = isTable$3(member) ? member.code : void 0;
  if (typeof code !== "string" || !code) {
    problems.push({ kind: "member", problem: `${module} ${path}: a member has no code` });
    return;
  }
  if (code in members) {
    problems.push({
      kind: "member",
      problem: `${module} ${path}: member ${pyRepr$1(code)} is already defined by ${members[code].module}`
    });
    return;
  }
  const table = member;
  const entry = { code, module, source: "roster" };
  for (const field of MEMBER_FIELDS) {
    if (typeof table[field] === "string") entry[field] = table[field];
  }
  const skill = table.skill;
  if (typeof skill === "string" && skill) {
    entry.skill = skill;
    entry.installed = skills.has(skill);
    if (entry.installed) {
      Object.assign(entry, await agentIdentity(fs2, skills.get(skill), projectRoot));
    } else {
      const command = installCommand(source, skill);
      if (command) entry.install = command;
    }
  }
  if (!("name" in entry)) entry.name = code;
  members[code] = entry;
}
async function agentIdentity(fs2, skillDir, projectRoot) {
  let agent;
  try {
    const skill = folderName(skillDir);
    const customization = await resolveCustomization(projectRoot ?? "", skillDir, skill, fs2);
    agent = customization.agent ?? {};
  } catch {
    return {};
  }
  if (!isTable$3(agent)) return {};
  const identity = {};
  for (const field of AGENT_FIELDS) {
    if (typeof agent[field] === "string" && agent[field]) identity[field] = agent[field];
  }
  return identity;
}
function addGroup(groups, problems, group, module, path) {
  const id = isTable$3(group) ? group.id : void 0;
  if (typeof id !== "string" || !id) {
    problems.push({ kind: "group", problem: `${module} ${path}: a group has no id` });
    return;
  }
  if (id in groups) {
    problems.push({
      kind: "group",
      problem: `${module} ${path}: group ${pyRepr$1(id)} is already defined by ${groups[id].module}`
    });
    return;
  }
  groups[id] = { ...group, module };
}
async function applyCentralAgents(fs2, agents, members, problems, projectRoot) {
  if (projectRoot === null || !await isDirectory(fs2, `${projectRoot}/_bmad`)) return;
  let configured;
  try {
    configured = (await loadCentralConfig(projectRoot, fs2)).agents ?? {};
  } catch (error) {
    problems.push({ kind: "config", problem: errorText(error) });
    return;
  }
  if (!isTable$3(configured)) return;
  for (const [code, info] of Object.entries(configured)) {
    if (!isTable$3(info) || members[code]?.installed === false) continue;
    if (!(code in agents)) agents[code] = { code, source: "config" };
    const entry = agents[code];
    const settled = /* @__PURE__ */ new Set();
    if (entry.source === "roster") {
      settled.add("module");
      for (const field of AGENT_FIELDS) if (field in entry) settled.add(field);
    }
    const hasPersona = "persona" in info;
    for (const [field, value] of Object.entries(info)) {
      if (settled.has(field)) continue;
      const target = field === "description" && !hasPersona ? "persona" : field;
      entry[target] = value;
    }
    if (!("name" in entry)) entry.name = code;
  }
}
async function roster(argv, fs2) {
  let skill = null;
  let projectRoot = null;
  const roots = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--skill") {
      const value = argv[++i];
      if (value === void 0) return usageError$2("argument --skill: expected one argument");
      skill = value;
    } else if (token.startsWith("--skill=")) {
      skill = token.slice("--skill=".length);
    } else if (token === "--root") {
      const value = argv[++i];
      if (value === void 0) return usageError$2("argument --root: expected one argument");
      roots.push(value);
    } else if (token.startsWith("--root=")) {
      roots.push(token.slice("--root=".length));
    } else if (token === "--project-root") {
      const value = argv[++i];
      if (value === void 0) return usageError$2("argument --project-root: expected one argument");
      projectRoot = value;
    } else if (token.startsWith("--project-root=")) {
      projectRoot = token.slice("--project-root=".length);
    } else {
      return usageError$2(`unrecognized arguments: ${token}`);
    }
  }
  const allRoots = (skill !== null ? [dirname(resolvePath(skill))] : []).concat(roots);
  if (!allRoots.length) return usageError$2("give --skill or --root");
  const report = await collect(fs2, allRoots, projectRoot === null ? null : resolvePath(projectRoot));
  return { stdout: `${pyJson(report, { indent: 2 })}
`, exitCode: 0 };
}
function usageError$2(message) {
  return { stdout: `roster: error: ${message}`, exitCode: 2 };
}
function isTable$2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function loadRoster$1(fs2, projectRoot, skillRoot) {
  const root = resolvePath(`${skillRoot}/..`);
  try {
    const data = await collect(fs2, [root], projectRoot);
    const agents = data.agents ?? {};
    const members = data.members ?? {};
    const guests = {};
    for (const [code, member] of Object.entries(members)) if (!(code in agents)) guests[code] = member;
    const problems = (data.problems ?? []).filter((problem) => isTable$2(problem) && typeof problem.problem === "string").map((problem) => problem.problem).filter(Boolean);
    return { agents, guests, groups: data.groups ?? [], resolved: true, problems };
  } catch {
    try {
      const config = await loadCentralConfig(projectRoot, fs2);
      const agents = isTable$2(config.agents) ? config.agents : {};
      return { agents, guests: {}, groups: [], resolved: true, problems: [] };
    } catch {
      return { agents: {}, guests: {}, groups: [], resolved: false, problems: [] };
    }
  }
}
async function loadWorkflow(fs2, projectRoot, skillRoot) {
  const skill = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
  try {
    const merged = await resolveCustomization(projectRoot, skillRoot, skill, fs2);
    if (isTable$2(merged.workflow)) return merged.workflow;
  } catch {
  }
  try {
    const base = parse(await fs2.readText(`${skillRoot}/customize.toml`));
    return isTable$2(base.workflow) ? base.workflow : {};
  } catch {
    return {};
  }
}
function mergeGroups$1(rosterGroups, customGroups) {
  const merged = /* @__PURE__ */ new Map();
  for (const group of rosterGroups) {
    if (isTable$2(group) && group.id) merged.set(String(group.id), group);
  }
  if (Array.isArray(customGroups)) {
    for (const group of customGroups) if (isTable$2(group) && group.id) merged.set(String(group.id), group);
  }
  return [...merged.values()];
}
function alias(code) {
  if (code.includes("-agent-")) return code.split("-agent-", 2)[1];
  for (const prefix of ["bmad-agent-", "bmad-"]) if (code.startsWith(prefix)) return code.slice(prefix.length);
  return code;
}
function badMember$1(code, name) {
  return !(typeof code === "string" && (name === void 0 || name === null || typeof name === "string"));
}
function buildCollective(agents, partyMembers, guests = null) {
  const collective = {};
  const index = /* @__PURE__ */ new Map();
  const installedCodes = [];
  const aliasOwner = /* @__PURE__ */ new Map();
  const register = (code, entry) => {
    collective[code] = entry;
    index.set(code, code);
    index.set(code.toLowerCase(), code);
    const short = alias(code).toLowerCase();
    const owner = aliasOwner.has(short) ? aliasOwner.get(short) : code;
    if (!aliasOwner.has(short)) aliasOwner.set(short, code);
    if (owner === code) {
      if (!index.has(short)) index.set(short, code);
    } else if (owner !== null) {
      aliasOwner.set(short, null);
      if (index.get(short) === owner && short !== owner.toLowerCase()) index.delete(short);
    }
    const name = entry.name;
    if (name) index.set(name.toLowerCase(), code);
  };
  for (const [code, info] of Object.entries(agents)) {
    if (badMember$1(code, info.name)) continue;
    const entry = {
      code,
      name: info.name ?? code,
      icon: info.icon ?? "",
      title: info.title ?? "",
      module: info.module ?? "",
      source: "installed"
    };
    const persona = info.persona ?? info.description;
    if (persona) entry.persona = persona;
    for (const field of ["capabilities", "model"]) if (info[field]) entry[field] = info[field];
    register(code, entry);
    installedCodes.push(code);
  }
  for (const [code, info] of Object.entries(guests ?? {})) {
    if (badMember$1(code, info.name)) continue;
    const entry = { code, source: "roster" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model", "module", "skill", "install"]) {
      if (info[field]) entry[field] = info[field];
    }
    if (entry.name === void 0) entry.name = code;
    if (info.installed === false) entry.installed = false;
    register(code, entry);
  }
  for (const member of Array.isArray(partyMembers) ? partyMembers : []) {
    if (!isTable$2(member)) continue;
    const code = member.code;
    if (code === null || code === void 0 || code === "" || badMember$1(code, member.name)) continue;
    const text = String(code);
    const canonical = index.get(text) ?? index.get(text.toLowerCase()) ?? text;
    const entry = { ...collective[canonical] ?? {}, code: canonical, source: "custom" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (member[field] !== null && member[field] !== void 0) entry[field] = member[field];
    }
    if (entry.name === void 0) entry.name = canonical;
    register(canonical, entry);
  }
  return { collective, index, installedCodes };
}
function resolveMembers(tokens, collective, index) {
  const resolved = [];
  const unresolved = [];
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (typeof token !== "string") {
      unresolved.push(token);
      continue;
    }
    const code = index.get(token) ?? index.get(token.toLowerCase());
    if (code && code in collective) resolved.push(collective[code]);
    else unresolved.push(token);
  }
  return { resolved, unresolved };
}
function groupMenu(groups) {
  const out2 = [];
  for (const group of groups) {
    if (!isTable$2(group) || !group.id) continue;
    const members = Array.isArray(group.members) ? group.members : [];
    const entry = {
      id: group.id,
      name: group.name ?? group.id,
      member_count: members.length
    };
    if (!members.length) entry.open_cast = true;
    out2.push(entry);
  }
  return out2;
}
function findGroup(groups, groupId) {
  for (const group of groups) if (isTable$2(group) && group.id === groupId) return group;
  return null;
}
function groupDetail(group, collective, index) {
  const rawMembers = Array.isArray(group.members) ? group.members : [];
  const { resolved, unresolved } = resolveMembers(rawMembers, collective, index);
  const detail = {
    active: group.id,
    name: group.name ?? group.id,
    members: resolved,
    unresolved,
    memory_enabled: Boolean(group.memory ?? false)
  };
  if (group.scene) detail.scene = group.scene;
  if (!rawMembers.length) detail.open_cast = true;
  return detail;
}
async function resolveParty(argv, fs2) {
  const script = "resolve_party";
  let projectRoot = null;
  let skill = null;
  let party = null;
  let listGroups = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project-root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --project-root: expected one argument");
      projectRoot = taken;
    } else if (flag === "--skill") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --skill: expected one argument");
      skill = taken;
    } else if (flag === "--party" || flag === "--group") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, `argument ${flag}: expected one argument`);
      party = taken;
    } else if (flag === "--list-groups" && inline === null) listGroups = true;
    else if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (projectRoot === null) return usageError$3(script, "the following arguments are required: --project-root");
  if (skill === null) return usageError$3(script, "the following arguments are required: --skill");
  const root = absolutePath(projectRoot);
  const skillRoot = absolutePath(skill);
  const workflow = await loadWorkflow(fs2, root, skillRoot);
  const roster2 = await loadRoster$1(fs2, root, skillRoot);
  const groups = mergeGroups$1(roster2.groups, workflow.party_groups ?? []);
  const defaultParty = typeof workflow.default_party === "string" ? workflow.default_party : "";
  const partyMode = typeof workflow.party_mode === "string" && workflow.party_mode || "session";
  const partyMemory = Boolean(workflow.party_memory ?? true);
  const emit2 = (payload) => ({ stdout: `${pyJson(payload, { indent: 2 })}
`, exitCode: 0 });
  if (listGroups) {
    return emit2({ party_mode: partyMode, default_party: defaultParty, groups: groupMenu(groups) });
  }
  const { collective, index, installedCodes } = buildCollective(
    roster2.agents,
    workflow.party_members ?? [],
    roster2.guests
  );
  if (party !== null) {
    const group2 = findGroup(groups, party);
    if (group2 === null) {
      return emit2({ error: "unknown_group", requested: party, available: groupMenu(groups) });
    }
    const detail = { ...groupDetail(group2, collective, index), party_mode: partyMode };
    if (roster2.problems.length) detail.roster_problems = roster2.problems;
    return emit2(detail);
  }
  const result = {
    party_mode: partyMode,
    groups: groupMenu(groups),
    installed_agents_resolved: roster2.resolved
  };
  if (roster2.problems.length) result.roster_problems = roster2.problems;
  const group = defaultParty ? findGroup(groups, defaultParty) : null;
  if (group !== null) Object.assign(result, groupDetail(group, collective, index));
  else {
    Object.assign(result, {
      active: "installed",
      members: installedCodes.map((code) => collective[code]),
      memory_enabled: partyMemory
    });
  }
  return emit2(result);
}
const PARTY_SKILL = "bmad-party-mode";
function isTable$1(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function badMember(code, name) {
  return !(typeof code === "string" && (name === void 0 || name === null || typeof name === "string"));
}
async function loadRoster(fs2, projectRoot, skillRoot) {
  try {
    const data = await collect(fs2, [resolvePath(`${skillRoot}/..`)], projectRoot);
    const agents = isTable$1(data.agents) ? data.agents : {};
    const members = isTable$1(data.members) ? data.members : {};
    const guests = {};
    for (const [code, member] of Object.entries(members)) {
      if (!(code in agents) && isTable$1(member)) guests[code] = member;
    }
    return { agents, guests, groups: Array.isArray(data.groups) ? data.groups : [], resolved: true };
  } catch {
    return { agents: await loadConfigAgents(fs2, projectRoot), guests: {}, groups: [], resolved: true };
  }
}
async function loadConfigAgents(fs2, projectRoot) {
  try {
    const config = await loadCentralConfig(projectRoot, fs2);
    const agents = config.agents;
    if (Array.isArray(agents)) {
      const out2 = {};
      for (const item of agents) if (isTable$1(item) && item.code) out2[String(item.code)] = item;
      return out2;
    }
    return isTable$1(agents) ? agents : {};
  } catch {
    return {};
  }
}
function mergeGroups(rosterGroups, customGroups) {
  const merged = /* @__PURE__ */ new Map();
  for (const group of rosterGroups) if (isTable$1(group) && group.id) merged.set(String(group.id), group);
  if (Array.isArray(customGroups)) {
    for (const group of customGroups) if (isTable$1(group) && group.id) merged.set(String(group.id), group);
  }
  return [...merged.values()];
}
async function findPartySkill(fs2, projectRoot, skillRoot) {
  const parent = resolvePath(`${skillRoot}/..`);
  const candidates = [
    `${parent}/${PARTY_SKILL}`,
    `${projectRoot}/.claude/skills/${PARTY_SKILL}`,
    `${projectRoot}/_bmad/skills/${PARTY_SKILL}`
  ];
  for (const candidate of candidates) {
    if (await isFile(fs2, `${candidate}/customize.toml`)) return candidate;
  }
  return null;
}
async function loadPartyWorkflow(fs2, projectRoot, partySkill) {
  try {
    const merged = await resolveCustomization(projectRoot, partySkill, PARTY_SKILL, fs2);
    if (isTable$1(merged.workflow)) return merged.workflow;
  } catch {
  }
  try {
    const base = parse(await fs2.readText(`${partySkill}/customize.toml`));
    return isTable$1(base.workflow) ? base.workflow : {};
  } catch {
    return {};
  }
}
async function loadPartyOverrides(fs2, projectRoot) {
  const custom = `${projectRoot}/_bmad/custom`;
  const read = async (path) => {
    if (!await isFile(fs2, path)) return {};
    try {
      const data = parse(await fs2.readText(path));
      return isTable$1(data.workflow) ? data.workflow : {};
    } catch {
      return {};
    }
  };
  const team = await read(`${custom}/${PARTY_SKILL}.toml`);
  const user = await read(`${custom}/${PARTY_SKILL}.user.toml`);
  const merged = { ...team };
  for (const [key, value] of Object.entries(user)) {
    const current = merged[key];
    if (Array.isArray(value) && Array.isArray(current)) merged[key] = [...current, ...value];
    else merged[key] = value;
  }
  return merged;
}
function buildPool(agents, partyMembers, guests = null) {
  const pool = {};
  const index = /* @__PURE__ */ new Map();
  const installedCodes = [];
  const customCodes = [];
  const register = (code, entry) => {
    pool[code] = entry;
    index.set(code, code);
    index.set(code.toLowerCase(), code);
    index.set(shortAlias(code).toLowerCase(), code);
    const name = entry.name;
    if (name) {
      const key = name.toLowerCase();
      if ((index.get(key) ?? code) === code) index.set(key, code);
    }
  };
  for (const [code, info] of Object.entries(agents ?? {})) {
    if (badMember(code, info.name)) continue;
    register(code, {
      code,
      name: info.name ?? code,
      icon: info.icon ?? "",
      title: info.title ?? "",
      description: info.description ?? "",
      persona: info.persona ?? "",
      source: "installed"
    });
    installedCodes.push(code);
  }
  for (const [code, info] of Object.entries(guests ?? {})) {
    if (badMember(code, info.name)) continue;
    const entry = { code, source: "roster" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (info[field]) entry[field] = info[field];
    }
    if (entry.name === void 0) entry.name = code;
    register(code, entry);
    customCodes.push(code);
  }
  for (const member of Array.isArray(partyMembers) ? partyMembers : []) {
    if (!isTable$1(member)) continue;
    const code = member.code;
    if (code === null || code === void 0 || code === "" || badMember(code, member.name)) continue;
    const text = String(code);
    const canonical = index.get(text) ?? index.get(text.toLowerCase()) ?? text;
    const wasInstalled = canonical in pool;
    const entry = { ...pool[canonical] ?? {}, code: canonical, source: "custom" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (member[field] !== null && member[field] !== void 0) entry[field] = member[field];
    }
    if (entry.name === void 0) entry.name = canonical;
    register(canonical, entry);
    if (!wasInstalled) customCodes.push(canonical);
  }
  return { pool, index, installedCodes, customCodes };
}
function shortAlias(code) {
  for (const prefix of ["bmad-agent-", "bmad-"]) if (code.startsWith(prefix)) return code.slice(prefix.length);
  return code;
}
function brief(entry) {
  const out2 = {};
  for (const key of ["code", "name", "icon", "title", "source"]) {
    const value = entry[key];
    if (value) out2[key] = value;
  }
  for (const key of ["description", "persona", "capabilities", "model"]) {
    const value = entry[key];
    if (value) out2[key] = value;
  }
  return out2;
}
function resolveParties(groups, pool, index) {
  const out2 = [];
  for (const group of groups) {
    if (!isTable$1(group) || !group.id) continue;
    const raw = Array.isArray(group.members) ? group.members : [];
    const members = [];
    for (const token of raw) {
      const key = typeof token === "string" ? token : pyRepr$1(token);
      const code = index.get(key) ?? index.get(key.toLowerCase());
      if (code !== void 0 && code in pool) members.push(brief(pool[code]));
    }
    const party = { id: group.id, name: group.name ?? group.id, members };
    if (group.scene) party.scene = group.scene;
    if (!raw.length) party.open_cast = true;
    out2.push(party);
  }
  return out2;
}
async function resolvePersonas(argv, fs2) {
  const script = "resolve_personas";
  let projectRoot = null;
  let skill = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project-root") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --project-root: expected one argument");
      projectRoot = taken;
    } else if (flag === "--skill") {
      const taken = value();
      if (taken === void 0) return usageError$3(script, "argument --skill: expected one argument");
      skill = taken;
    } else if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (projectRoot === null) return usageError$3(script, "the following arguments are required: --project-root");
  if (skill === null) return usageError$3(script, "the following arguments are required: --skill");
  const root = absolutePath(projectRoot);
  const skillRoot = absolutePath(skill);
  const roster2 = await loadRoster(fs2, root, skillRoot);
  const partySkill = await findPartySkill(fs2, root, skillRoot);
  const workflow = partySkill !== null ? await loadPartyWorkflow(fs2, root, partySkill) : await loadPartyOverrides(fs2, root);
  const { pool, index, installedCodes, customCodes } = buildPool(roster2.agents, workflow.party_members ?? [], roster2.guests);
  const parties = resolveParties(mergeGroups(roster2.groups, workflow.party_groups ?? []), pool, index);
  const payload = {
    agents: installedCodes.map((code) => brief(pool[code])),
    members: customCodes.map((code) => brief(pool[code])),
    parties,
    default_party: typeof workflow.default_party === "string" && workflow.default_party ? workflow.default_party : "",
    party_mode_found: partySkill !== null,
    agents_resolved: roster2.resolved
  };
  return { stdout: `${pyJson(payload, { indent: 2 })}
`, exitCode: 0 };
}
const CANARY_PREFIX = "TRIGGER-LOADED-";
const DEFAULT_SKILL_DIR = ".agents/skills";
function utcNowIso() {
  return `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19)}Z`;
}
function writeJson(path, data) {
  return writeFile(path, `${pyJson(data, { indent: 2, ensureAscii: true })}
`, "utf8");
}
function readJson(text) {
  return JSON.parse(text);
}
async function findProjectRoot(fs2, start) {
  let gitRoot = null;
  let current = resolvePath(start);
  for (; ; ) {
    if (await isDirectory(fs2, `${current}/_bmad`)) return current;
    if (gitRoot === null && await fs2.exists(`${current}/.git`)) gitRoot = current;
    const parent = current.slice(0, current.lastIndexOf("/")) || "/";
    if (parent === current) return gitRoot;
    current = parent;
  }
}
function validateHarness(harness) {
  if (harness === null || typeof harness !== "object" || Array.isArray(harness)) throw new Error("harness must be a table");
  const table = harness;
  const command = table.command;
  if (!Array.isArray(command) || !command.length || !command.every((token) => typeof token === "string")) {
    throw new Error("harness.command must be a non-empty list of strings");
  }
  if (!command.some((token) => token.includes("{prompt}"))) {
    throw new Error("harness.command needs a {prompt} token");
  }
  if (table.skill_dir !== void 0 && typeof table.skill_dir !== "string") {
    throw new Error("harness.skill_dir must be a string");
  }
  const env = table.env ?? {};
  if (env === null || typeof env !== "object" || Array.isArray(env) || !Object.values(env).every((value) => typeof value === "string")) {
    throw new Error('harness.env is a table of var = "value" ("" forwards the host value, "~" is the fresh HOME)');
  }
  if (table.home_files !== void 0 && !Array.isArray(table.home_files)) {
    throw new Error("harness.home_files must be a list");
  }
  return table;
}
async function resolveHarness(fs2, projectRoot, explicit) {
  if (explicit !== null) {
    if (!await isFile(fs2, explicit)) return { harness: null, note: `harness file not found: ${explicit}` };
    return { harness: validateHarness(readJson(await fs2.readText(explicit))), note: explicit };
  }
  if (projectRoot === null) return { harness: null, note: "no project root" };
  if (!await isDirectory(fs2, `${projectRoot}/_bmad`)) {
    return { harness: null, note: "BMad is not set up in this project; pass --harness" };
  }
  let workflow = {};
  for (const name of ["bmad-eval.toml", "bmad-eval.user.toml"]) {
    const path = `${projectRoot}/_bmad/custom/${name}`;
    if (!await isFile(fs2, path)) continue;
    try {
      const data = parse(await fs2.readText(path));
      if (data.workflow !== void 0 && data.workflow !== null && typeof data.workflow === "object") {
        workflow = { ...workflow, ...data.workflow };
      }
    } catch {
      continue;
    }
  }
  const harness = workflow.harness;
  if (harness === null || harness === void 0 || typeof harness !== "object" || !harness.command) {
    return { harness: null, note: "no harness recorded in bmad-eval's customization" };
  }
  return { harness: validateHarness(harness), note: "customization workflow.harness" };
}
function buildArgv(harness, prompt, cwd2) {
  return harness.command.map(
    (token) => token.split("{prompt}").join(prompt).split("{query}").join(prompt).split("{cwd}").join(cwd2)
  );
}
function expandHome(value, homeDir) {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return join(homeDir, value.slice(2));
  return value;
}
function buildCaseEnv(harness, homeDir, hostEnv) {
  const env = { PATH: hostEnv.PATH ?? "", HOME: homeDir };
  if (process.platform === "win32") env.USERPROFILE = homeDir;
  for (const name of process.platform === "win32" ? ["SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP"] : []) {
    if (hostEnv[name]) env[name] = hostEnv[name];
  }
  for (const [name, value] of Object.entries(harness?.env ?? {})) {
    if (value === "") {
      if (hostEnv[name]) env[name] = hostEnv[name];
    } else env[name] = expandHome(value, homeDir);
  }
  return env;
}
function contained(root, rel2) {
  const base = resolve(root);
  const target = resolve(base, rel2);
  if (target !== base && !target.startsWith(base.endsWith("/") ? base : `${base}/`)) {
    throw new Error(`path escapes the workspace: ${rel2}`);
  }
  return target;
}
async function makeHome(harness, room) {
  const home = join(room, ".home");
  await mkdir(home, { recursive: true });
  for (const value of Object.values(harness?.env ?? {})) {
    if (value.startsWith("~/")) await mkdir(contained(home, value.slice(2)), { recursive: true });
  }
  for (const entry of harness?.home_files ?? []) {
    const rel2 = String(entry).replace(/^~\//, "").replace(/^~/, "");
    const source = join(homedir(), rel2);
    const dest = contained(home, rel2);
    const stats = await import("node:fs/promises").then((f) => f.lstat(source).catch(() => null));
    if (!stats) continue;
    await mkdir(join(dest, ".."), { recursive: true });
    if (stats.isDirectory()) await symlink(source, dest, "dir");
    else await copyFile(source, dest);
  }
  return home;
}
async function runInCleanRoom(harness, caseDir, prompt, timeout, stage) {
  await mkdir(caseDir, { recursive: true });
  await writeFile(join(caseDir, "prompt.txt"), prompt, "utf8");
  const room = await mkdtemp(join(tmpdir(), "bmad-eval-"));
  try {
    const cwd2 = join(room, "cwd");
    await mkdir(cwd2);
    await stage(cwd2);
    await new Promise((done) => {
      const git = spawn("git", ["init", "-q", cwd2], { stdio: "ignore" });
      git.on("close", () => done());
      git.on("error", () => done());
    });
    const env = buildCaseEnv(harness, await makeHome(harness, room), process.env);
    const argv = buildArgv(harness, prompt, cwd2);
    const started = Date.now();
    const run = await new Promise((resolve2) => {
      const child = spawn(argv[0], argv.slice(1), { cwd: cwd2, env, stdio: ["ignore", "pipe", "pipe"] });
      const stdout = [];
      const stderr = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve2({
          status: "timeout",
          return_code: -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat([...stderr, Buffer.from(`
TIMEOUT after ${timeout}s`)])
        });
      }, timeout * 1e3);
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve2({
          status: "harness-missing",
          return_code: -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat([...stderr, Buffer.from(`command not found: ${error.message}`)])
        });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve2({
          status: code === 0 ? "ok" : "error",
          return_code: code ?? -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr)
        });
      });
    });
    const elapsed = (Date.now() - started) / 1e3;
    await cp(cwd2, join(caseDir, "cwd"), {
      recursive: true,
      filter: (source) => !source.split("/").includes(".git")
    });
    const stdoutText = run.stdout.toString("utf8");
    const stderrText = run.stderr.toString("utf8");
    await writeFile(join(caseDir, "transcript.jsonl"), stdoutText, "utf8");
    await writeFile(join(caseDir, "stderr.txt"), stderrText, "utf8");
    return {
      status: run.status,
      return_code: run.return_code,
      elapsed_s: Math.round(elapsed * 1e3) / 1e3,
      stdout: stdoutText,
      stderr: stderrText
    };
  } finally {
    await rm(room, { recursive: true, force: true, maxRetries: 3 });
  }
}
function accountTranscript(text) {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalSteps = 0;
  const toolCalls = {};
  let foundUsage = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (evt === null || typeof evt !== "object" || Array.isArray(evt)) continue;
    const event = evt;
    if (event.type === "assistant") {
      totalSteps += 1;
      const message = event.message;
      const usage = message !== null && typeof message === "object" ? message.usage : null;
      if (usage !== null && typeof usage === "object" && !Array.isArray(usage)) {
        foundUsage = true;
        inputTokens += Number(usage.input_tokens ?? 0) || 0;
        outputTokens += Number(usage.output_tokens ?? 0) || 0;
      }
      const content = message !== null && typeof message === "object" ? message.content : null;
      for (const item of Array.isArray(content) ? content : []) {
        if (item !== null && typeof item === "object" && item.type === "tool_use") {
          const name = String(item.name ?? "?");
          toolCalls[name] = (toolCalls[name] ?? 0) + 1;
        }
      }
    } else if (event.usage !== null && typeof event.usage === "object" && !Array.isArray(event.usage)) {
      const usage = event.usage;
      foundUsage = true;
      if (usage.input_tokens !== void 0) inputTokens = Number(usage.input_tokens) || inputTokens;
      if (usage.output_tokens !== void 0) outputTokens = Number(usage.output_tokens) || outputTokens;
    }
  }
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    tokens_reported: foundUsage,
    total_steps: totalSteps,
    tool_calls: toolCalls,
    total_tool_calls: Object.values(toolCalls).reduce((sum, n) => sum + n, 0)
  };
}
function unquoteYaml(value) {
  const text = value.trim();
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") return text.slice(1, -1).replace(/''/g, "'");
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
  return text;
}
function parseSkillMd(text, skillPath) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(text);
  if (!match) throw new Error(`SKILL.md at ${skillPath} is missing frontmatter`);
  const fields = /* @__PURE__ */ new Map();
  let current = null;
  for (const line of match[1].split("\n")) {
    if (line[0] !== " " && line[0] !== "	" && line.includes(":")) {
      const cut = line.indexOf(":");
      current = line.slice(0, cut).trim();
      const value = line.slice(cut + 1).trim();
      fields.set(current, ["|", ">", "|-", ">-"].includes(value) ? [] : [value]);
    } else if (current !== null && line.trim()) {
      fields.set(current, [...fields.get(current) ?? [], line.trim()]);
    }
  }
  const name = unquoteYaml((fields.get("name") ?? []).join(" "));
  if (!name) throw new Error(`SKILL.md at ${skillPath} has no name`);
  return { name, description: unquoteYaml((fields.get("description") ?? []).join(" ")) };
}
async function writeSyntheticSkill(skillsDir, skillName, description, token) {
  const cleanName = `${skillName}-trig-${token.slice(CANARY_PREFIX.length)}`;
  const root = join(skillsDir, cleanName);
  await mkdir(root, { recursive: true });
  const indented = description.split("\n").join("\n  ");
  await writeFile(
    join(root, "SKILL.md"),
    `---
name: ${cleanName}
description: |
  ${indented}
---

# ${skillName}

This skill handles: ${description}

Begin your reply with the exact token \`${token}\`, then continue.
`,
    "utf8"
  );
  return cleanName;
}
async function makeRunDir(outputDir, label) {
  const now2 = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now2.getFullYear()}${pad(now2.getMonth() + 1)}${pad(now2.getDate())}-${pad(now2.getHours())}${pad(
    now2.getMinutes()
  )}${pad(now2.getSeconds())}`;
  for (let n = 1; n < 1e3; n++) {
    const runId = n === 1 ? `${stamp}-${label}` : `${stamp}-${label}-${n}`;
    const runDir = join(outputDir, runId);
    try {
      await mkdir(outputDir, { recursive: true });
      await mkdir(runDir, { recursive: false });
      return { runId, runDir };
    } catch {
      continue;
    }
  }
  throw new Error(`could not create a run folder under ${outputDir}`);
}
function detectLoad(output, token) {
  return output.includes(token);
}
async function runTriggers(argv, fs2) {
  const script = "run_triggers";
  let skillPath = null;
  let queriesFile = null;
  let outputDir = null;
  let projectRoot = null;
  let harnessFile = null;
  let runsPerQuery = 3;
  let threshold = 0.5;
  let timeout = 180;
  let workers = 4;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const number = () => {
      const taken = value();
      if (taken === void 0) return null;
      const parsed = Number(taken);
      return Number.isNaN(parsed) ? null : parsed;
    };
    if (flag === "--skill-path") skillPath = value() ?? null;
    else if (flag === "--queries") queriesFile = value() ?? null;
    else if (flag === "--output-dir") outputDir = value() ?? null;
    else if (flag === "--project-root") projectRoot = value() ?? null;
    else if (flag === "--harness") harnessFile = value() ?? null;
    else if (flag === "--runs-per-query") runsPerQuery = number() ?? runsPerQuery;
    else if (flag === "--threshold") threshold = number() ?? threshold;
    else if (flag === "--timeout") timeout = number() ?? timeout;
    else if (flag === "--workers") workers = number() ?? workers;
    else if (flag === "--quiet" && inline === null) quiet = true;
    else if (flag === "--skill-root") {
      if (value() === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (skillPath === null) return usageError$3(script, "the following arguments are required: --skill-path");
  if (queriesFile === null) return usageError$3(script, "the following arguments are required: --queries");
  if (outputDir === null) return usageError$3(script, "the following arguments are required: --output-dir");
  const resolvedSkill = resolvePath(skillPath);
  const resolvedQueries = resolvePath(queriesFile);
  if (!await isFile(fs2, resolvedQueries)) {
    return { stdout: `queries file not found: ${resolvedQueries}
`, exitCode: 2 };
  }
  let skillMd2;
  try {
    skillMd2 = await fs2.readText(`${resolvedSkill}/SKILL.md`);
  } catch {
    return { stdout: `no SKILL.md at ${resolvedSkill}
`, exitCode: 1 };
  }
  let parsedSkill;
  try {
    parsedSkill = parseSkillMd(skillMd2, resolvedSkill);
  } catch (error) {
    return { stdout: `${error.message}
`, exitCode: 1 };
  }
  let queries;
  try {
    queries = readJson(await fs2.readText(resolvedQueries));
  } catch {
    return { stdout: `queries file is not valid JSON: ${resolvedQueries}
`, exitCode: 2 };
  }
  if (!Array.isArray(queries)) return { stdout: "queries file must be a JSON list\n", exitCode: 2 };
  const root = projectRoot !== null ? resolvePath(projectRoot) : await findProjectRoot(fs2, resolvedSkill);
  let harness;
  let harnessNote;
  try {
    ({ harness, note: harnessNote } = await resolveHarness(fs2, root, harnessFile === null ? null : resolvePath(harnessFile)));
  } catch (error) {
    return { stdout: `harness invalid: ${error.message}
`, exitCode: 2 };
  }
  const { runId, runDir } = await makeRunDir(resolve(outputDir), `${parsedSkill.name}-triggers`);
  await mkdir(join(runDir, "queries"), { recursive: true });
  await writeJson(join(runDir, "run.json"), {
    run_id: runId,
    skill_name: parsedSkill.name,
    description: parsedSkill.description,
    harness: harnessNote,
    command: harness?.command ?? null,
    started_at: utcNowIso(),
    query_count: queries.length,
    runs_per_query: runsPerQuery,
    threshold
  });
  if (harness === null) {
    const output2 = {
      run_id: runId,
      completed_at: utcNowIso(),
      skill_name: parsedSkill.name,
      description: parsedSkill.description,
      status: "skipped",
      reason: "no harness recorded",
      results: [],
      summary: { total: queries.length, passed: 0, failed: 0, unmeasured: queries.length }
    };
    await writeJson(join(runDir, "triggers-result.json"), output2);
    return { stdout: `${pyJson(output2, { indent: 2, ensureAscii: true })}
`, exitCode: 3 };
  }
  const attempts = queries.map(() => []);
  const errors = queries.map(() => []);
  const skillDirName = typeof harness.skill_dir === "string" ? harness.skill_dir : DEFAULT_SKILL_DIR;
  const jobs = [];
  queries.forEach((query, idx) => {
    const row = query !== null && typeof query === "object" ? query : {};
    for (let run = 1; run <= runsPerQuery; run++) jobs.push({ idx, run, q: row });
  });
  const execute = async (job) => {
    const attemptDir = join(runDir, "queries", `q${String(job.idx).padStart(3, "0")}-r${job.run}`);
    const token = CANARY_PREFIX + randomUUID().replace(/-/g, "").slice(0, 8);
    let loaded = null;
    let failure = "";
    let run = null;
    try {
      run = await runInCleanRoom(harness, attemptDir, String(job.q.query ?? ""), timeout, async (cwd2) => {
        await writeSyntheticSkill(join(cwd2, skillDirName), parsedSkill.name, parsedSkill.description, token);
      });
      loaded = run.status === "ok" ? detectLoad(run.stdout, token) : null;
      const accounting = accountTranscript(run.stdout);
      await writeJson(join(attemptDir, "timing.json"), {
        status: run.status,
        elapsed_s: run.elapsed_s,
        return_code: run.return_code,
        loaded,
        total_tokens: accounting.total_tokens,
        tokens_reported: accounting.tokens_reported,
        captured_at: utcNowIso()
      });
      if (run.status !== "ok") failure = `${run.status}: ${run.stderr.slice(-500).trim()}`;
    } catch (error) {
      loaded = null;
      failure = error.message;
    }
    if (loaded === null) {
      errors[job.idx].push(failure);
      if (!quiet) process.stderr.write(`  attempt failed for query ${job.idx}: ${failure}
`);
    } else attempts[job.idx].push(loaded);
  };
  const queue = [...jobs];
  const runners = Array.from({ length: Math.max(1, workers) }, async () => {
    for (; ; ) {
      const job = queue.shift();
      if (job === void 0) return;
      await execute(job);
    }
  });
  await Promise.all(runners);
  const results = queries.map((query, idx) => {
    const row = query !== null && typeof query === "object" ? query : {};
    const runs = attempts[idx];
    const measured = runs.length === runsPerQuery;
    const rate = runs.length ? runs.filter(Boolean).length / runs.length : 0;
    const should = row.should_trigger === void 0 ? true : Boolean(row.should_trigger);
    const passed = measured ? should ? rate >= threshold : rate < threshold : null;
    return {
      query: row.query ?? "",
      should_trigger: should,
      trigger_rate: Math.round(rate * 1e3) / 1e3,
      triggers: runs.filter(Boolean).length,
      runs: runs.length,
      errors: errors[idx],
      pass: passed
    };
  });
  const unmeasured = results.filter((result) => result.pass === null).length;
  const output = {
    run_id: runId,
    completed_at: utcNowIso(),
    skill_name: parsedSkill.name,
    description: parsedSkill.description,
    harness: harnessNote,
    results,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass === true).length,
      failed: results.filter((result) => result.pass === false).length,
      unmeasured
    }
  };
  await writeJson(join(runDir, "triggers-result.json"), output);
  return { stdout: `${pyJson(output, { indent: 2, ensureAscii: true })}
`, exitCode: unmeasured ? 1 : 0 };
}
const SKIP_DIRS$1 = [".git", "__pycache__", "node_modules", ".venv", "venv", ".pytest_cache"];
const MODULE_META_KEYS = [
  "code",
  "name",
  "header",
  "subheader",
  "description",
  "module_version",
  "default_selected",
  "module_greeting",
  "agents",
  "directories",
  "post-install-notes"
];
const LEGACY_FILE_NAMES = ["module.yaml", "module-help.csv", "merge-config.py", "merge-help-csv.py", "cleanup-legacy.py"];
const LEGACY_READ_RE = /_bmad\/config\.yaml|config\.user\.yaml|\bbmad-[a-z0-9-]+-setup\b|module-setup\.md/;
async function walk(fs2, root) {
  const out2 = [];
  const visit = async (dir, parts) => {
    for (const name of await fs2.list(dir)) {
      if (SKIP_DIRS$1.includes(name)) continue;
      const path = `${dir}/${name}`;
      const next = [...parts, name];
      if (await isDirectory(fs2, path)) await visit(path, next);
      else out2.push(path);
    }
  };
  await visit(root, []);
  return out2.sort(compareStrings);
}
async function findOne(fs2, root, name) {
  const matches = (await walk(fs2, root)).filter((path) => folderName(path) === name);
  matches.sort((a, b) => a.split("/").length - b.split("/").length || compareStrings(a, b));
  return matches[0] ?? null;
}
function rel$1(root, path) {
  return path.slice(root.length + 1);
}
function isTable(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function configKey(key, spec) {
  const reasons = [];
  let kind = "text";
  if ("single-select" in spec) {
    kind = "single-select";
    reasons.push("single-select options; ask as free text and name the choices in the prompt");
  } else if ("multi-select" in spec) {
    kind = "multi-select";
    reasons.push("multi-select options; a bmod answer is one scalar");
  } else if (typeof spec.default === "boolean") {
    kind = "confirm";
    reasons.push("boolean default; store the answer as a string or drop the question");
  }
  const result = spec.result;
  if (typeof result === "string" && result !== "{value}" && result !== "") {
    reasons.push(`result template ${pyRepr$1(result)}; fold it into the default and the skill that reads it`);
  }
  for (const extra of ["regex", "required", "example"]) {
    if (extra in spec) reasons.push(`${extra} has no bmod equivalent`);
  }
  return {
    key,
    prompt: spec.prompt ?? "",
    default: spec.default ?? null,
    user_setting: spec.user_setting === true,
    kind,
    unconvertible: reasons
  };
}
async function readHelpRows(fs2, path) {
  if (path === null) return [];
  const rows = csvDictRows(await fs2.readText(path));
  return rows.map((row) => {
    const out2 = { skill: row.skill ?? "" };
    for (const [key, value] of Object.entries(row)) {
      if (key === "skill" || key === "null") continue;
      out2[key] = value;
    }
    return out2;
  });
}
async function skillDirs(fs2, root) {
  const dirs = /* @__PURE__ */ new Set();
  for (const path of await walk(fs2, root)) {
    if (folderName(path) === "SKILL.md") dirs.add(path.slice(0, path.lastIndexOf("/")));
  }
  return [...dirs].sort(compareStrings);
}
function skillOf(root, path, skills) {
  const pathParent = path.slice(0, path.lastIndexOf("/"));
  for (const skill of [...skills].sort((a, b) => b.split("/").length - a.split("/").length)) {
    if (skill === pathParent || pathParent.startsWith(`${skill}/`)) return folderName(skill);
  }
  return folderName(root);
}
async function scanLegacy(fs2, root) {
  const moduleYaml = await findOne(fs2, root, "module.yaml");
  if (moduleYaml === null) return null;
  const parsed = loadYaml(await fs2.readText(moduleYaml), rel$1(root, moduleYaml));
  const meta = isTable(parsed) ? parsed : {};
  const helpCsv = await findOne(fs2, root, "module-help.csv");
  const skills = await skillDirs(fs2, root);
  const setupSkill = skills.find((skill) => folderName(skill).endsWith("-setup")) ?? null;
  const setupName = setupSkill === null ? null : folderName(setupSkill);
  const moduleSetup = await findOne(fs2, root, "module-setup.md");
  let toDelete = /* @__PURE__ */ new Set();
  for (const path of await walk(fs2, root)) {
    if (LEGACY_FILE_NAMES.includes(folderName(path))) toDelete.add(rel$1(root, path));
  }
  if (setupSkill !== null) {
    const prefix = `${rel$1(root, setupSkill)}/`;
    toDelete = new Set([...toDelete].filter((path) => !path.startsWith(prefix)));
    toDelete.add(prefix);
  }
  if (moduleSetup !== null) toDelete.add(rel$1(root, moduleSetup));
  const reads = [];
  for (const path of await walk(fs2, root)) {
    if (!path.endsWith(".md")) continue;
    const relative = rel$1(root, path);
    const dropped = toDelete.has(relative) || [...toDelete].some((entry) => entry.endsWith("/") && relative.startsWith(entry));
    if (dropped) continue;
    const lines = (await fs2.readText(path)).split("\n");
    lines.forEach((line, index) => {
      if (LEGACY_READ_RE.test(line)) {
        reads.push({ skill: skillOf(root, path, skills), path: relative, line: index + 1, text: line.trim().slice(0, 200) });
      }
    });
  }
  const greeting = meta.module_greeting ?? "";
  const configKeys = Object.entries(meta).filter(([key, value]) => !MODULE_META_KEYS.includes(key) && isTable(value) && "prompt" in value).map(([key, value]) => configKey(key, value));
  return {
    module: {
      code: meta.code ?? "",
      name: meta.name ?? "",
      version: String(meta.module_version ?? ""),
      greeting: typeof greeting === "string" ? greeting.trim() : "",
      agents: Array.isArray(meta.agents) ? meta.agents : []
    },
    config_keys: configKeys,
    help_rows: await readHelpRows(fs2, helpCsv),
    skills: skills.filter((skill) => skill !== setupSkill).map((skill) => folderName(skill)),
    legacy_reads: reads,
    setup_skill: setupName,
    files_to_delete: [...toDelete].sort(compareStrings)
  };
}
async function scanLegacyModule(argv, fs2) {
  const script = "scan_legacy_module";
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      if ((inline ?? argv[++i]) === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const module = positionals[0];
  if (module === void 0) return usageError$3(script, "the following arguments are required: module");
  if (!await isDirectory(fs2, module)) return usageError$3(script, `not a directory: ${module}`);
  const result = await scanLegacy(fs2, module);
  if (result === null) {
    return { stdout: `scan_legacy_module: no module.yaml under ${module}
`, exitCode: 1 };
  }
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`, exitCode: 0 };
}
const SKIP_DIRS = [".git", "__pycache__", "node_modules", ".venv", "venv"];
const EXAMPLE_DIR = "assets";
const EXAMPLE_PREFIX = "sample-";
const BARE_SCRIPT_RE = /\buv\s+run\b[^`\n]*?\s(?:\.\/)?scripts\/\S+/g;
const INSTALLED_PATH_RE = /\{installed_path\}|\binstalled_path\s*[:=]/g;
const ABS_PATH_RE = /(?:\/Users\/|\/home\/|\b[A-Za-z]:[\\/]|(?<![\w.])~\/)\S*/g;
const OLD_FORMAT_RE = /\bmodule\.yaml\b|\bmodule-help\.csv\b/g;
const PYTHON_CALL_RE = /(?<![\w/.-])(?:python3?|pip3?)\s+(?:-m\s+\S+|\S+\.py\b|install\b)/g;
const BACKTICK_REF_RE = /`([^`\s]+\/[^`\s]+\.(?:md|yaml|yml|toml|json|csv|txt|xml|py|html))`/g;
const SKILL_DIR_RE = /(?:^|\/)(?:skills|\.claude\/skills|\.agents\/skills|_bmad)\/([a-z0-9][a-z0-9-]*)\//;
const RULES = ["bare-script-call", "installed-path", "absolute-path", "cross-skill-ref", "missing-file", "old-module-format", "python-call"];
const BMAD_RUNTIME_DIRS = ["scripts", "config", "custom", "memory", "render", "_config", "knowledge"];
function finding$1(path, line, rule, text, fix) {
  return { path, line, rule, text: text.trim().slice(0, 200), fix };
}
function blankFences(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ""));
}
function lineOf(content, offset) {
  let count = 0;
  for (let i = 0; i < offset; i++) if (content[i] === "\n") count += 1;
  return count + 1;
}
async function iterMarkdown(fs2, root) {
  const out2 = [];
  const walk2 = async (dir, parts) => {
    for (const name of await fs2.list(dir)) {
      const path = `${dir}/${name}`;
      const next = [...parts, name];
      if (SKIP_DIRS.includes(name) || name.startsWith(".")) continue;
      if (await isDirectory(fs2, path)) await walk2(path, next);
      else if (name.endsWith(".md")) out2.push(path);
    }
  };
  await walk2(root, []);
  return out2.sort(compareStrings);
}
function isExample(parts) {
  const name = parts[parts.length - 1] ?? "";
  return parts.slice(0, -1).includes(EXAMPLE_DIR) || name.startsWith(EXAMPLE_PREFIX);
}
function scanRegexRules(content, rel2) {
  const findings = [];
  const rules = [
    [BARE_SCRIPT_RE, "bare-script-call", "write `uv run {skill-root}/scripts/<name>.py`"],
    [INSTALLED_PATH_RE, "installed-path", "remove installed_path; use a path relative to this file"],
    [ABS_PATH_RE, "absolute-path", "use {project-root}, {skill-root} or a config value"],
    [OLD_FORMAT_RE, "old-module-format", "describe the module in bmod.toml; see the migrate mode"],
    [PYTHON_CALL_RE, "python-call", "run it as `uv run <path>`; dependencies come from the script's PEP 723 header"]
  ];
  for (const [regex, rule, fix] of rules) {
    for (const match of content.matchAll(regex)) {
      findings.push(finding$1(rel2, lineOf(content, match.index), rule, match[0], fix));
    }
  }
  return findings;
}
async function scanReferences(fs2, content, rel2, skillRoot) {
  const findings = [];
  const stripped = blankFences(content);
  const skillName = skillRoot.slice(skillRoot.lastIndexOf("/") + 1);
  const relDir = rel2.includes("/") ? `${skillRoot}/${rel2.slice(0, rel2.lastIndexOf("/"))}` : skillRoot;
  for (const match of stripped.matchAll(BACKTICK_REF_RE)) {
    const raw = match[1];
    const line = lineOf(stripped, match.index);
    const other = SKILL_DIR_RE.exec(raw);
    if (other && other[1] !== skillName && !BMAD_RUNTIME_DIRS.includes(other[1])) {
      findings.push(
        finding$1(
          rel2,
          line,
          "cross-skill-ref",
          raw,
          `do not reach into \`${other[1]}\`; write "invoke the \`${other[1]}\` skill"`
        )
      );
      continue;
    }
    if ([...raw].some((ch) => "*<{".includes(ch))) continue;
    if (raw.startsWith("../")) {
      const target = normalize(`${relDir}/${raw}`);
      if (target !== skillRoot && !target.startsWith(`${skillRoot}/`)) {
        findings.push(finding$1(rel2, line, "cross-skill-ref", raw, "a skill's files stay inside it"));
      }
      continue;
    }
    if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("_bmad/") || raw.startsWith("@")) continue;
    if (isExample(rel2.split("/"))) continue;
    const resolves = async (path) => await fs2.exists(path) && !await isDirectory(fs2, path);
    if (await resolves(`${relDir}/${raw}`) || await resolves(`${skillRoot}/${raw}`)) continue;
    const firstDir = raw.split("/")[0];
    if (await isDirectory(fs2, `${relDir}/${firstDir}`) || await isDirectory(fs2, `${skillRoot}/${firstDir}`)) {
      findings.push(finding$1(rel2, line, "missing-file", raw, "fix the path or remove the dead reference"));
    }
  }
  return findings;
}
function normalize(path) {
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return "/" + parts.join("/");
}
async function scanSkill(fs2, skillRoot, allow = []) {
  let findings = [];
  let count = 0;
  for (const path of await iterMarkdown(fs2, skillRoot)) {
    count += 1;
    const rel2 = path.slice(skillRoot.length + 1);
    const content = await fs2.readText(path);
    findings.push(...scanRegexRules(content, rel2));
    findings.push(...await scanReferences(fs2, content, rel2, skillRoot));
  }
  findings = findings.filter((entry) => !allow.includes(entry.rule));
  findings.sort(
    (a, b) => compareStrings(a.path, b.path) || a.line - b.line || compareStrings(a.rule, b.rule)
  );
  return { skill: skillRoot.slice(skillRoot.lastIndexOf("/") + 1), files_scanned: count, findings };
}
async function scanPaths(argv, fs2) {
  const script = "scan_paths";
  const positionals = [];
  const allow = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--allow") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, "argument --allow: expected one argument");
      allow.push(value);
    } else if (flag === "--skill-root") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const skill = positionals[0];
  if (skill === void 0) return usageError$3(script, "the following arguments are required: skill");
  if (!await isDirectory(fs2, skill)) return usageError$3(script, `not a directory: ${skill}`);
  const unknown = [...new Set(allow)].filter((rule) => !RULES.includes(rule)).sort(compareStrings);
  if (unknown.length) {
    return usageError$3(script, `unknown rule(s): ${unknown.join(", ")}; rules: ${[...RULES].sort(compareStrings).join(", ")}`);
  }
  const result = await scanSkill(fs2, skill, allow);
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`, exitCode: result.findings.length ? 1 : 0 };
}
const FLOOR = [3, 11];
const REQUIRES_RE = /^#\s*requires-python\s*=\s*"([^"]*)"/;
const VERSION_RE = />=\s*(\d+)\.(\d+)/;
const CUSTOM_IO_RE = new RegExp(["_bmad/custom", "\\.user\\.toml"].join("|"));
const NETWORK_MODULES = ["urllib.request", "requests", "httpx", "socket", "http.client", "aiohttp"];
const NETWORK_ROOTS = ["requests", "httpx", "socket", "aiohttp"];
const MODEL_ID_RE = /\b(?:claude|gpt|gemini)-(?:[a-z]+-)*\d[a-z0-9.-]*\b/i;
function finding(path, line, rule, text, fix) {
  return { path, line, rule, text: text.trim().slice(0, 200), fix };
}
function pep723Floor(content) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "# /// script") continue;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === "# ///") {
        for (const line of body) {
          const requires = REQUIRES_RE.exec(line);
          if (requires) return { hasBlock: true, requires: requires[1] };
        }
        return { hasBlock: true, requires: null };
      }
      if (!/^#( .*)?$/.test(lines[j])) break;
      body.push(lines[j]);
    }
    break;
  }
  return { hasBlock: false, requires: null };
}
function floorOk(requires) {
  const match = VERSION_RE.exec(requires);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > FLOOR[0] || major === FLOOR[0] && minor >= FLOOR[1];
}
function tokenizePython(source) {
  const tokens = [];
  const brackets = [];
  let line = 1;
  let i = 0;
  let atLineStart = true;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      atLineStart = true;
      continue;
    }
    if (ch === "\\" && source[i + 1] === "\n") {
      line += 1;
      i += 2;
      atLineStart = false;
      continue;
    }
    if (atLineStart && /[ \t]/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    const prefix = /^[rRbBuUfF]{0,3}/.exec(source.slice(i))[0];
    const quoteAt = i + prefix.length;
    const quoteCh = source[quoteAt];
    if (quoteCh === '"' || quoteCh === "'") {
      const raw = /[rR]/.test(prefix);
      const triple = source.startsWith(quoteCh.repeat(3), quoteAt);
      const start = quoteAt + (triple ? 3 : 1);
      const startLine = line;
      let j = start;
      let value = "";
      let closed = false;
      while (j < source.length) {
        if (!raw && source[j] === "\\") {
          const next = source[j + 1];
          if (next === "\n") line += 1;
          value += next === "n" ? "\n" : next === "t" ? "	" : next === "r" ? "\r" : next ?? "";
          j += 2;
          continue;
        }
        if (source.startsWith(triple ? quoteCh.repeat(3) : quoteCh, j)) {
          closed = true;
          j += triple ? 3 : 1;
          break;
        }
        if (source[j] === "\n") {
          if (!triple) break;
          line += 1;
        }
        value += source[j];
        j += 1;
      }
      if (!closed) {
        return [
          ...tokens,
          { kind: "error", line: startLine, text: "", message: `unterminated string literal (detected at line ${startLine})` }
        ];
      }
      tokens.push({ kind: "string", line: startLine, text: value });
      i = j;
      atLineStart = false;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      brackets.push({ ch, line });
      i += 1;
      atLineStart = false;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const open = brackets.pop();
      if (!open) {
        return [...tokens, { kind: "error", line, text: "", message: "unmatched ')'" }];
      }
      i += 1;
      atLineStart = false;
      continue;
    }
    if (atLineStart && /^(?:import|from)\b/.test(source.slice(i))) {
      const startLine = line;
      let j = i;
      let depth = 0;
      while (j < source.length) {
        const c = source[j];
        if (c === "#" && depth === 0) break;
        if (c === "\n" && depth === 0 && source[j - 1] !== "\\") break;
        if (c === "\n") line += 1;
        if ("([{".includes(c)) depth += 1;
        if (")]}".includes(c)) depth -= 1;
        j += 1;
      }
      const statement = source.slice(i, j).replace(/\\\n/g, " ").replace(/\n/g, " ");
      const names = importNames(statement);
      if (names === null) {
        return [...tokens, { kind: "error", line: startLine, text: "", message: "invalid syntax" }];
      }
      tokens.push({ kind: "import", line: startLine, text: statement, names });
      i = j;
      atLineStart = false;
      continue;
    }
    i += 1;
    if (!/[ \t]/.test(ch)) atLineStart = false;
  }
  if (brackets.length) {
    const open = brackets[brackets.length - 1];
    return [...tokens, { kind: "error", line: open.line, text: "", message: `'${open.ch}' was never closed` }];
  }
  return tokens;
}
function importNames(statement) {
  const text = statement.trim();
  if (text.startsWith("import")) {
    const body2 = text.slice("import".length).trim().replace(/\s+/g, " ");
    if (!body2) return null;
    const parts = body2.split(",").map((part) => part.trim());
    const names2 = [];
    for (const part of parts) {
      const alias2 = part.split(/\s+as\s+/)[0].trim();
      if (!/^[A-Za-z_][\w.]*$/.test(alias2)) return null;
      names2.push(alias2);
    }
    return names2;
  }
  if (!text.startsWith("from")) return null;
  const match = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(text);
  if (!match) return null;
  const module = match[1];
  const body = match[2].replace(/[()]/g, "").trim();
  const names = [module];
  for (const part of body.split(",")) {
    const alias2 = part.split(/\s+as\s+/)[0].trim();
    if (!alias2) continue;
    names.push(`${module}.${alias2}`);
  }
  return names;
}
function scanSource(source, rel2, hasTest) {
  const findings = [];
  const { hasBlock, requires } = pep723Floor(source);
  if (!hasBlock) {
    findings.push(finding(rel2, 1, "pep723-missing", rel2.split("/").pop(), 'add `# /// script` with requires-python = ">=3.11"'));
  } else if (requires === null || !floorOk(requires)) {
    findings.push(finding(rel2, 1, "pep723-floor", requires ?? "(none)", 'set requires-python = ">=3.11"'));
  }
  if (!hasTest) {
    const stem = rel2.split("/").pop().replace(/\.[^.]*$/, "");
    findings.push(finding(rel2, 1, "test-missing", rel2.split("/").pop(), `add scripts/tests/test_${stem}.py (unittest)`));
  }
  const tokens = tokenizePython(source);
  const error = tokens.find((token) => token.kind === "error");
  if (error) {
    findings.push(finding(rel2, error.line, "syntax-error", error.message, "fix the syntax"));
    return findings;
  }
  for (const token of tokens) {
    if (token.kind === "import") {
      for (const name of token.names) {
        if (NETWORK_MODULES.includes(name) || matchesNetworkRoot(name)) {
          findings.push(finding(rel2, token.line, "network-call", name, "work offline, or say in the docstring why not"));
          break;
        }
      }
      continue;
    }
    const value = token.text;
    if (CUSTOM_IO_RE.test(value)) {
      findings.push(
        finding(
          rel2,
          token.line,
          "custom-io",
          value,
          "drop it: resolve_customization.py reads overrides and the bmad-customize skill writes them"
        )
      );
    }
    const match = MODEL_ID_RE.exec(value);
    if (match) {
      findings.push(finding(rel2, token.line, "model-id", match[0], "take the model from the caller, never a list"));
    }
  }
  return findings;
}
function matchesNetworkRoot(name) {
  return NETWORK_ROOTS.includes(name.split(".")[0]);
}
async function scanOneScript(fs2, path, scriptsDir) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const rel2 = `scripts/${name}`;
  const content = await fs2.readText(path);
  const { hasBlock, requires } = pep723Floor(content);
  const stem = name.replace(/\.[^.]*$/, "");
  const hasTest = await isFile(fs2, `${scriptsDir}/tests/test_${stem}.py`);
  const info = { path: rel2, has_pep723: hasBlock, floor: requires, has_test: hasTest };
  return { info, findings: scanSource(content, rel2, hasTest) };
}
async function scanScriptsTree(fs2, skillRoot) {
  const scriptsDir = `${skillRoot}/scripts`;
  const scripts = [];
  const findings = [];
  if (await isDirectory(fs2, scriptsDir)) {
    const names = (await fs2.list(scriptsDir)).filter((name) => name.endsWith(".py")).sort(compareStrings);
    for (const name of names) {
      const result = await scanOneScript(fs2, `${scriptsDir}/${name}`, scriptsDir);
      scripts.push(result.info);
      findings.push(...result.findings);
    }
  }
  findings.sort(
    (a, b) => compareStrings(a.path, b.path) || a.line - b.line || compareStrings(a.rule, b.rule)
  );
  return { skill: skillRoot.slice(skillRoot.lastIndexOf("/") + 1), scripts, findings };
}
async function scanScripts(argv, fs2) {
  const script = "scan_scripts";
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const skill = positionals[0];
  if (skill === void 0) return usageError$3(script, "the following arguments are required: skill");
  if (!await isDirectory(fs2, skill)) return usageError$3(script, `not a directory: ${skill}`);
  const result = await scanScriptsTree(fs2, skill);
  return {
    stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}
`,
    exitCode: result.findings.length ? 1 : 0
  };
}
const MANIFEST_NAME = "bmod.toml";
const RETIRED_NAME = "retired.toml";
const ROSTER_NAME = "roster.toml";
const RECORD_PREFIX = "bmod-";
const STAMP_PROBE = "0.0.0-stamp-check";
const MESSAGE_KEYS = ["pre_install_message", "post_install_message"];
const QUESTION_KEYS = ["key", "prompt", "default"];
const OPTIONAL_QUESTION_KEYS = ["scope"];
const QUESTION_SCOPES = ["team", "user"];
const UPDATE_SOURCE_PREFIXES = ["github:", "https://", "file:", "plugin:"];
const MODULE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_MODULE_DIRS = /* @__PURE__ */ new Set(["_config", "custom", "modules", "scripts"]);
const TABLE_HEADER = /[ \t]*\[\[?[^\[\]\n]+\]\]?[ \t]*(?:#[^\n]*)?\r?\n?/;
const BMOD_HEADER = /[ \t]*\[[ \t]*bmod[ \t]*\][ \t]*(?:#[^\n]*)?\r?\n?/;
const VERSION_LINE = /(?<head>[ \t]*version[ \t]*=[ \t]*)"[^"\n]*"(?<tail>[ \t]*(?:#[^\n]*)?\r?\n?)/;
const SEMVER = /(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?/;
function fullmatch(re, text) {
  return new RegExp(`^(?:${re.source})$`).exec(text);
}
function parseBmodFile(path, text) {
  const data = parseTomlText(text, path);
  const bmodTable = data.bmod;
  const skillTable = data.skill;
  if (bmodTable === void 0 && skillTable === void 0) {
    throw new Error(`bmod file ${path} must hold a [bmod] table, a [skill] table, or both`);
  }
  for (const [name, table] of [
    ["bmod", bmodTable],
    ["skill", skillTable]
  ]) {
    if (table !== void 0 && !isTable$3(table)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(name)} must be a table`);
    }
  }
  const bmod = bmodTable !== void 0 ? parseBmodTable(bmodTable, path) : null;
  const skill = skillTable !== void 0 ? parseSkillTable(skillTable, path, bmod === null) : null;
  return { bmod, skill };
}
function parseBmodTable(table, path) {
  const code = requiredString(table, "bmod", "code", path);
  if (!MODULE_NAME.test(code) || RESERVED_MODULE_DIRS.has(code.toLowerCase())) {
    throw new Error(`bmod file ${path} field 'bmod.code' has unsafe value ${pyRepr$1(code)}`);
  }
  const version = requiredString(table, "bmod", "version", path);
  const updateSource = requiredString(table, "bmod", "update_source", path);
  validateSource(updateSource, "bmod.update_source", path);
  const skills = table.skills;
  return {
    code,
    version,
    update_source: updateSource,
    skills: skills !== void 0 ? parseSkillNames(skills, "bmod.skills", path) : null,
    knowledge: parseKnowledge(table.knowledge, path),
    questions: parseQuestions(table.config_questions, code, path),
    required_skills: parseRequirements(table.required_skills, "bmod.required_skills", path),
    recommended_skills: parseRequirements(table.recommended_skills, "bmod.recommended_skills", path),
    pre_install_message: optionalString(table, "bmod", "pre_install_message", path),
    post_install_message: optionalString(table, "bmod", "post_install_message", path)
  };
}
async function readRetiredFile(fs2, folder) {
  const path = `${folder}/${RETIRED_NAME}`;
  if (!await isFile(fs2, path)) return { renamed: [], removed: [] };
  const data = parseTomlText(await fs2.readText(path), path);
  const renamed = parseRenamed(data.renamed, path);
  const removed = parseSkillNames(data.removed ?? [], "removed", path);
  const retired = [...renamed.map((rename) => rename.old), ...removed];
  const repeated = retired.find((name) => retired.filter((other) => other === name).length > 1);
  if (repeated !== void 0) {
    throw new Error(`bmod file ${path} retires ${pyRepr$1(repeated)} more than once in renamed and removed`);
  }
  return { renamed, removed };
}
function parseRenamed(value, path) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'renamed' must be a list of tables`);
  }
  const renamed = [];
  value.forEach((entry, index) => {
    const field = `renamed[${index}]`;
    if (!isTable$3(entry)) throw new Error(`bmod file ${path} field ${field} must be a table`);
    const names = [];
    for (const key of ["from", "to"]) {
      const name = entry[key];
      if (typeof name !== "string" || !SKILL_NAME.test(name)) {
        throw new Error(`bmod file ${path} field '${field}.${key}' must be a skill name; found ${pyRepr$1(name)}`);
      }
      names.push(name);
    }
    if (names[0] === names[1]) {
      throw new Error(`bmod file ${path} field ${field} renames ${pyRepr$1(names[0])} to itself`);
    }
    renamed.push({ old: names[0], new: names[1] });
  });
  return renamed;
}
function parseSkillTable(table, path, standalone) {
  let bmod = null;
  let source = null;
  if (standalone) {
    bmod = requiredString(table, "skill", "bmod", path);
    if (!SKILL_NAME.test(bmod)) {
      throw new Error(`bmod file ${path} field 'skill.bmod' has unsafe value ${pyRepr$1(bmod)}`);
    }
    source = requiredString(table, "skill", "source", path);
    validateSource(source, "skill.source", path);
  }
  return {
    bmod,
    source,
    scripts: parseScripts(table.scripts, path),
    required_skills: parseRequirements(table.required_skills, "skill.required_skills", path),
    recommended_skills: parseRequirements(table.recommended_skills, "skill.recommended_skills", path)
  };
}
function validateSource(value, field, path) {
  const prefix = UPDATE_SOURCE_PREFIXES.find((candidate) => value.startsWith(candidate));
  if (prefix === void 0 || !value.slice(prefix.length)) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} must name a source`);
  }
  if (prefix === "github:") {
    const parts = value.slice(prefix.length).split("/");
    if (parts.length < 2 || parts.some((part) => !part)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(field)} github source must name owner/repo`);
    }
  }
  if (prefix === "https://" && [...value].some((character) => /\s/.test(character))) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} must be a valid HTTPS URL`);
  }
}
function parseSkillNames(value, field, path) {
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} must be a list of skill names`);
  }
  const names = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !SKILL_NAME.test(entry)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(field)} has unsafe skill name ${pyRepr$1(entry)}`);
    }
    if (names.includes(entry)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(field)} repeats ${pyRepr$1(entry)}`);
    }
    names.push(entry);
  }
  return names;
}
function parsePath(entry, field, path, seen) {
  if (typeof entry !== "string" || !entry) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} has invalid value ${pyRepr$1(entry)}`);
  }
  const relative = safeSkillRelative(entry);
  if (relative === null) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} has unsafe value ${pyRepr$1(entry)}`);
  }
  if (seen.some((other) => other.join("/") === relative.join("/"))) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} repeats ${pyRepr$1(entry)}`);
  }
  return relative;
}
function parseKnowledge(value, path) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'bmod.knowledge' must be a list of tables`);
  }
  const knowledge2 = [];
  value.forEach((entry, index) => {
    const field = `bmod.knowledge[${index}]`;
    if (!isTable$3(entry)) throw new Error(`bmod file ${path} field ${field} must be a table`);
    const relative = parsePath(entry.path, `${field}.path`, path, knowledge2.map((item) => item.path.split("/")));
    const skills = entry.skills ?? "*";
    const asPath = relative.join("/");
    if (skills === "*") {
      knowledge2.push({ path: asPath, skills: null });
      return;
    }
    if (typeof skills === "string") {
      throw new Error(`bmod file ${path} field '${field}.skills' must be "*" or a list of skill names`);
    }
    knowledge2.push({ path: asPath, skills: parseSkillNames(skills, `${field}.skills`, path) });
  });
  return knowledge2;
}
function parseRequirements(value, field, path) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field ${pyRepr$1(field)} must be a list of skills`);
  }
  const requirements = [];
  value.forEach((entry, index) => {
    const item = `${field}[${index}]`;
    let requirement;
    if (typeof entry === "string") {
      requirement = { skill: entry, version: null, source: null };
    } else if (isTable$3(entry)) {
      const skill = entry.skill;
      if (typeof skill !== "string") {
        throw new Error(`bmod file ${path} field '${item}.skill' must be a string and is required`);
      }
      const source = entry.source;
      if (typeof source !== "string") {
        throw new Error(`bmod file ${path} field '${item}.source' must be a string and is required`);
      }
      validateSource(source, `${item}.source`, path);
      const minimum = entry.version;
      if (minimum !== void 0) {
        if (typeof minimum !== "string") {
          throw new Error(`bmod file ${path} field '${item}.version' must be a string`);
        }
        if (parseOrderableSemver(minimum) === null) {
          throw new Error(
            `bmod file ${path} field '${item}.version' must be an orderable version; found ${pyRepr$1(minimum)}`
          );
        }
      }
      requirement = { skill, version: minimum ?? null, source };
    } else {
      throw new Error(`bmod file ${path} field ${pyRepr$1(item)} must be a skill name or a table`);
    }
    if (!SKILL_NAME.test(requirement.skill)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(item)} has unsafe skill name ${pyRepr$1(requirement.skill)}`);
    }
    if (requirements.some((other) => other.skill === requirement.skill)) {
      throw new Error(`bmod file ${path} field ${pyRepr$1(field)} repeats ${pyRepr$1(requirement.skill)}`);
    }
    requirements.push(requirement);
  });
  return requirements;
}
function requiredString(table, name, field, path) {
  const value = table[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`bmod file ${path} field '${name}.${field}' must be a non-empty string`);
  }
  return value;
}
function optionalString(table, name, field, path) {
  const value = table[field] ?? "";
  if (typeof value !== "string") {
    throw new Error(`bmod file ${path} field '${name}.${field}' must be a string`);
  }
  return value;
}
function parseQuestions(value, module, path) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'bmod.config_questions' must be a list`);
  }
  const questions = [];
  const seen = [];
  value.forEach((question, index) => {
    const field = `bmod.config_questions[${index}]`;
    if (!isTable$3(question)) throw new Error(`bmod file ${path} field ${field} must be a mapping`);
    const keys = Object.keys(question);
    const allowed = /* @__PURE__ */ new Set([...QUESTION_KEYS, ...OPTIONAL_QUESTION_KEYS]);
    if (!QUESTION_KEYS.every((key2) => keys.includes(key2)) || keys.some((key2) => !allowed.has(key2))) {
      const missing = QUESTION_KEYS.filter((key2) => !keys.includes(key2)).sort();
      const unknown = keys.filter((key2) => !allowed.has(key2)).sort();
      const detail = missing.length ? `missing key ${pyRepr$1(missing[0])}` : `unknown key ${pyRepr$1(unknown[0])}`;
      throw new Error(`bmod file ${path} field ${field} has ${detail}`);
    }
    for (const key2 of QUESTION_KEYS) {
      if (typeof question[key2] !== "string") {
        throw new Error(`bmod file ${path} field ${field}.${key2} must be a string`);
      }
    }
    const scope = question.scope ?? "team";
    if (!QUESTION_SCOPES.includes(scope)) {
      throw new Error(`bmod file ${path} field ${field}.scope must be "team" or "user"; found ${pyRepr$1(scope)}`);
    }
    const prompt = question.prompt;
    const key = question.key;
    if (!prompt.trim()) {
      throw new Error(`bmod file ${path} field ${field}.prompt must be non-empty`);
    }
    if (!key || key.split(".").some((part) => !part || part !== part.trim())) {
      throw new Error(`bmod file ${path} field ${field}.key must be a non-empty dotted key`);
    }
    if (key === module || key.startsWith(`${module}.`)) {
      throw new Error(`bmod file ${path} field ${field}.key ${pyRepr$1(key)} must not start with module ${pyRepr$1(module)}`);
    }
    const conflict = conflictingQuestionKey(seen, key);
    if (conflict !== null) {
      throw new Error(`bmod file ${path} config question key ${pyRepr$1(key)} conflicts with ${pyRepr$1(conflict)}`);
    }
    seen.push(key);
    questions.push({
      module,
      key,
      prompt,
      default: question.default,
      scope
    });
  });
  return questions;
}
function conflictingQuestionKey(keys, candidate) {
  for (const key of keys) {
    if (key === candidate || key.startsWith(`${candidate}.`) || candidate.startsWith(`${key}.`)) return key;
  }
  return null;
}
function parseScripts(value, path) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'skill.scripts' must be a list`);
  }
  const scripts = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry) {
      throw new Error(`bmod file ${path} field 'skill.scripts' has invalid value ${pyRepr$1(entry)}`);
    }
    const parts = purePosixParts(entry);
    if (entry.startsWith("/") || entry.includes("\\") || parts.length < 2 || parts[0] !== "scripts" || parts.includes("..")) {
      throw new Error(`bmod file ${path} field 'skill.scripts' has unsafe value ${pyRepr$1(entry)}`);
    }
    scripts.push(parts);
  }
  return scripts;
}
function parseTomlText(text, source) {
  try {
    return parse(text);
  } catch (error) {
    throw new Error(`cannot parse TOML ${source}: ${errorText(error)}`);
  }
}
function parseOrderableSemver(value) {
  const match = fullmatch(SEMVER, value);
  if (match === null || value.toLowerCase().includes("-dev")) return null;
  const prerelease = match.groups.prerelease;
  return [
    [Number(match.groups.major), Number(match.groups.minor), Number(match.groups.patch)],
    prerelease !== void 0 ? prerelease.split(".") : null
  ];
}
async function discoverInstallation(fs2, skillRoot, roots = []) {
  const problems = [];
  const allRoots = uniqueFolders([...roots, dirname(skillRoot)]);
  const [folders, duplicates] = await locateSkills(fs2, allRoots, dirname(skillRoot));
  const files = await discoverInstalledFiles(fs2, folders, problems);
  const byFolder = new Map(files.map((installed) => [installed.folder, installed]));
  const winners = selectModuleRecords(files, problems);
  const modules = [];
  for (const code of [...winners.keys()].sort(compareStrings)) {
    const recordFile2 = winners.get(code);
    const record = recordFile2.parsed.bmod;
    const listed2 = memberNames(recordFile2);
    const present = listed2.filter((name) => folders.has(name));
    const members = [];
    for (const name of present) {
      const member = byFolder.get(name);
      if (member === void 0 || member.parsed.skill === null) continue;
      if (member === recordFile2 || member.parsed.bmod === null && member.parsed.skill.bmod === recordFile2.folder) {
        members.push(member);
        continue;
      }
      const detail = member.parsed.bmod === null ? `names ${pyRepr$1(member.parsed.skill.bmod)} as its bmod` : "is a module record of its own";
      problems.push({
        kind: "membership",
        skill: name,
        bmod: recordFile2.folder,
        message: `${recordFile2.file} lists the skill ${pyRepr$1(name)}, but ${member.file} ${detail}`
      });
    }
    let retired = { renamed: [], removed: [] };
    try {
      retired = await readRetiredFile(fs2, recordFile2.source);
    } catch (error) {
      problems.push({ kind: "retired-file", folder: recordFile2.folder, message: errorText(error) });
    }
    modules.push({
      code,
      folder: recordFile2.folder,
      source: recordFile2.source,
      file: recordFile2.file,
      parsed: record,
      skills: present,
      absent_skills: listed2.filter((name) => !present.includes(name)),
      members,
      questions: record.questions,
      retired
    });
  }
  const missingRecords = [];
  for (const installed of files) {
    const skill = installed.parsed.skill;
    if (skill !== null && installed.parsed.bmod !== null && !memberNames(installed).includes(installed.folder)) {
      problems.push({
        kind: "membership",
        skill: installed.folder,
        bmod: installed.folder,
        message: `${installed.file} holds [bmod] and [skill], but its skills list leaves out ${pyRepr$1(installed.folder)}`
      });
    }
    if (skill === null || installed.parsed.bmod !== null || skill.bmod === null) continue;
    const recordFile2 = byFolder.get(skill.bmod);
    if (recordFile2 === void 0 || recordFile2.parsed.bmod === null) {
      const source = skill.source ?? "";
      missingRecords.push({
        skill: installed.folder,
        bmod: skill.bmod,
        source,
        channel: requirementChannel(source),
        install: installCommand(source, skill.bmod)
      });
    } else if (!memberNames(recordFile2).includes(installed.folder)) {
      problems.push({
        kind: "membership",
        skill: installed.folder,
        bmod: skill.bmod,
        message: `${installed.file} names ${pyRepr$1(skill.bmod)} as its bmod, but ${recordFile2.file} does not list the skill ${pyRepr$1(installed.folder)}`
      });
    }
  }
  return {
    files,
    modules,
    missing_records: missingRecords,
    problems,
    roots: allRoots,
    folders,
    duplicates
  };
}
function uniqueFolders(folders) {
  const unique = [];
  const seen = /* @__PURE__ */ new Set();
  for (const folder of folders) {
    const resolved = resolvePath(folder);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      unique.push(folder);
    }
  }
  return unique;
}
async function locateSkills(fs2, roots, ownFolder) {
  const copies = /* @__PURE__ */ new Map();
  for (const root of roots) {
    let entries;
    try {
      entries = await fs2.list(root);
    } catch (error) {
      const text = await fs2.exists(root) ? errorText(error) : missingPathError(root);
      if (resolvePath(root) === resolvePath(ownFolder)) {
        throw new Error(`cannot inspect installed skills ${root}: ${text}`);
      }
      continue;
    }
    entries.sort(compareStrings);
    for (const name of entries) {
      const path = `${root}/${name}`;
      if (await isDirectory(fs2, path)) {
        const group = copies.get(name);
        if (group) group.push(path);
        else copies.set(name, [path]);
      }
    }
  }
  const folders = /* @__PURE__ */ new Map();
  for (const [name, paths] of copies) folders.set(name, paths[0]);
  const duplicates = [];
  for (const name of [...copies.keys()].sort(compareStrings)) {
    const distinct = uniqueFolders(copies.get(name));
    if (distinct.length > 1) {
      let anyManifest = false;
      for (const path of distinct) if (await isFile(fs2, `${path}/${MANIFEST_NAME}`)) anyManifest = true;
      if (anyManifest) duplicates.push({ skill: name, folders: distinct });
    }
  }
  return [folders, duplicates];
}
async function discoverInstalledFiles(fs2, folders, problems) {
  const files = [];
  for (const name of [...folders.keys()].sort(compareStrings)) {
    const sibling = folders.get(name);
    const path = `${sibling}/${MANIFEST_NAME}`;
    let parsed;
    try {
      parsed = await readBmodFile(fs2, path);
    } catch (error) {
      problems.push({ kind: "bmod-file", folder: folderName(sibling), message: errorText(error) });
      continue;
    }
    if (parsed !== null) files.push({ folder: name, source: sibling, file: path, parsed });
  }
  return files;
}
async function readBmodFile(fs2, path) {
  if (!await isFile(fs2, path)) return null;
  let text;
  try {
    text = await fs2.readText(path);
  } catch (error) {
    throw new Error(`cannot read bmod file ${path}: ${errorText(error)}`);
  }
  return parseBmodFile(path, text);
}
function selectModuleRecords(files, problems) {
  const casefolded = /* @__PURE__ */ new Map();
  const winners = /* @__PURE__ */ new Map();
  for (const installed of files) {
    const record = installed.parsed.bmod;
    if (record === null) continue;
    const previous = casefolded.get(record.code.toLowerCase());
    if (previous === void 0) {
      casefolded.set(record.code.toLowerCase(), installed);
      winners.set(record.code, installed);
      continue;
    }
    if (previous.parsed.bmod.code !== record.code) {
      throw new Error(
        `installed module codes differ only by case: ${pyRepr$1(previous.parsed.bmod.code)} from ${previous.file} and ${pyRepr$1(record.code)} from ${installed.file}`
      );
    }
    problems.push({
      kind: "duplicate-module",
      module: record.code,
      folder: installed.folder,
      kept: previous.folder,
      message: `module code ${pyRepr$1(record.code)} is declared by ${previous.file} and by ${installed.file}; the first is used`
    });
  }
  return winners;
}
function memberNames(recordFile2) {
  const record = recordFile2.parsed.bmod;
  if (record.skills !== null) return record.skills;
  return recordFile2.parsed.skill !== null ? [recordFile2.folder] : [];
}
function requirementChannel(source) {
  if (source.startsWith("plugin:")) return "plugin";
  if (source.startsWith("file:")) return "local";
  return "skills-cli";
}
function rel(folder) {
  return `skills/${folder}/${MANIFEST_NAME}`;
}
function retiredRel(folder) {
  return `skills/${folder}/${RETIRED_NAME}`;
}
async function checkRepo(fs2, projectRoot) {
  const skillsDir = `${projectRoot}/skills`;
  let entries;
  try {
    entries = await fs2.list(skillsDir);
  } catch {
    entries = [];
  }
  entries.sort(compareStrings);
  const folders = [];
  for (const name of entries) if (await isDirectory(fs2, `${skillsDir}/${name}`)) folders.push(name);
  if (!folders.length) {
    return {
      records: [],
      skills: 0,
      documents: 0,
      problems: [
        `no skills/*/${MANIFEST_NAME} found under ${projectRoot}: pass the repository root with --project-root`
      ]
    };
  }
  const problems = [];
  const files = /* @__PURE__ */ new Map();
  for (const name of folders) {
    const manifest = `${skillsDir}/${name}/${MANIFEST_NAME}`;
    if (!await isFile(fs2, manifest)) {
      problems.push(`skills/${name}: missing ${MANIFEST_NAME}`);
      continue;
    }
    try {
      files.set(name, parseBmodFile(manifest, await fs2.readText(manifest)));
    } catch (error) {
      problems.push(`${rel(name)}: the runtime parser rejects this file: ${errorText(error)}`);
    }
  }
  const shipped = new Set(folders);
  const records = /* @__PURE__ */ new Map();
  for (const [name, parsed] of files) if (parsed.bmod !== null) records.set(name, parsed.bmod);
  const members = /* @__PURE__ */ new Map();
  for (const name of records.keys()) members.set(name, memberNames({ folder: name, parsed: files.get(name) }));
  problems.push(...await recordProblems(fs2, files, records, skillsDir));
  problems.push(...membershipProblems(files, records, members, shipped));
  const retired = /* @__PURE__ */ new Map();
  for (const name of records.keys()) {
    try {
      retired.set(name, await readRetiredFile(fs2, `${skillsDir}/${name}`));
    } catch (error) {
      problems.push(`skills/${name}/${RETIRED_NAME}: the runtime parser rejects this file: ${errorText(error)}`);
    }
  }
  problems.push(...retiredProblems(retired, shipped));
  for (const [name, parsed] of files) {
    for (const [table, source] of [
      ["bmod", parsed.bmod],
      ["skill", parsed.skill]
    ]) {
      if (source !== null) problems.push(...requirementProblems(name, table, source, shipped));
    }
  }
  let documents = 0;
  for (const [name, record] of records) {
    const folder = `${skillsDir}/${name}`;
    documents += record.knowledge.length + (await isFile(fs2, `${folder}/${HELP_NAME}`) ? 1 : 0);
    problems.push(...await knowledgeProblems(fs2, name, record, folder, members.get(name)));
    problems.push(...await topicProblems(fs2, name, folder));
    problems.push(...await rosterFileProblems(fs2, name, record, folder, skillsDir));
    problems.push(...await stampProblems(fs2, name, `${folder}/${MANIFEST_NAME}`));
    problems.push(...await messageProblems(fs2, name, `${folder}/${MANIFEST_NAME}`));
  }
  if (!problems.length) problems.push(...await runtimeProblems(fs2, skillsDir));
  const recordFiles = [...records.keys()].sort(compareStrings).map((name) => `${skillsDir}/${name}/${MANIFEST_NAME}`);
  const skillCount = [...files.values()].filter((parsed) => parsed.skill !== null).length;
  return { records: recordFiles, skills: skillCount, documents, problems };
}
function versionProblem(version) {
  const match = fullmatch(SEMVER, version);
  if (match === null) {
    return `invalid version ${pyRepr$1(version)}: must be SemVer (MAJOR.MINOR.PATCH, optional prerelease), e.g. 6.12.0`;
  }
  if (version.toLowerCase().includes("-dev")) {
    return `invalid version ${pyRepr$1(version)}: setup.py cannot order "-dev" versions, so an installed module would never compare as current — pick a different prerelease label`;
  }
  if (match.groups.build !== void 0) {
    const base = version.split("+", 1)[0];
    return `invalid version ${pyRepr$1(version)}: setup.py ignores build metadata when ordering, so this compares equal to ${pyRepr$1(base)} and an installed module would never see the release — change the major, minor, patch, or prerelease part`;
  }
  return null;
}
function stampText(original, version) {
  const lines = splitLines(original);
  const headers = lines.map((line, index) => fullmatch(BMOD_HEADER, line) ? index : -1).filter((index) => index >= 0);
  if (headers.length !== 1) {
    throw new Error(`expected exactly one '[bmod]' table header line, found ${headers.length}`);
  }
  const start = headers[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index++) {
    if (fullmatch(TABLE_HEADER, lines[index])) {
      end = index;
      break;
    }
  }
  const matches = [];
  for (let index = start; index < end; index++) if (fullmatch(VERSION_LINE, lines[index])) matches.push(index);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one 'version = "..."' line inside [bmod], found ${matches.length}`);
  }
  const match = fullmatch(VERSION_LINE, lines[matches[0]]);
  lines[matches[0]] = `${match.groups.head}"${version}"${match.groups.tail}`;
  const stamped = lines.join("");
  if (!deepEqual(parse(stamped), withVersion(parse(original), version))) {
    throw new Error("rewriting the version line would change something other than [bmod] version");
  }
  return stamped;
}
function splitLines(text) {
  const lines = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (ch === "\n") {
      lines.push(current);
      current = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") current += text[++i];
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}
function withVersion(data, version) {
  const expected = structuredClone(data);
  expected.bmod.version = version;
  return expected;
}
function deepEqual(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isTable$3(left) && isTable$3(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => deepEqual(left[key], right[key]));
  }
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}
async function messageProblems(fs2, name, manifest) {
  const table = parse(await fs2.readText(manifest)).bmod;
  return MESSAGE_KEYS.filter((key) => !(key in table)).map(
    (key) => `${rel(name)}: [bmod] is missing ${pyRepr$1(key)}; add it, empty if the module has no message`
  );
}
async function stampProblems(fs2, name, manifest) {
  try {
    stampText(await fs2.readText(manifest), STAMP_PROBE);
  } catch (error) {
    return [`${rel(name)}: stamp_release.py cannot stamp this file: ${errorText(error)}`];
  }
  return [];
}
async function recordProblems(fs2, files, records, skillsDir) {
  const problems = [];
  for (const [name, parsed] of files) {
    if (name.startsWith(RECORD_PREFIX) && parsed.bmod === null) {
      problems.push(`${rel(name)}: a ${RECORD_PREFIX}* folder holds a module record, but this file has no [bmod]`);
    }
  }
  const firstByCode = /* @__PURE__ */ new Map();
  for (const [name, record] of records) {
    const problem = versionProblem(record.version);
    if (problem !== null) problems.push(`${rel(name)}: [bmod] ${problem}`);
    const skillMd2 = `${skillsDir}/${name}/SKILL.md`;
    if (!await isFile(fs2, skillMd2)) {
      problems.push(`skills/${name}: a module record folder must ship SKILL.md as a plain file`);
    }
    if (files.get(name).skill === null && name !== RECORD_PREFIX + record.code) {
      problems.push(
        `${rel(name)}: a module record folder is named ${pyRepr$1(RECORD_PREFIX + record.code)} after its code; this one is ${pyRepr$1(name)}`
      );
    }
    const first = firstByCode.get(record.code.toLowerCase()) ?? name;
    if (!firstByCode.has(record.code.toLowerCase())) firstByCode.set(record.code.toLowerCase(), name);
    if (first !== name) {
      problems.push(
        `${rel(name)}: module code ${pyRepr$1(record.code)} is already declared by ${rel(first)}; one record per code`
      );
    }
  }
  const versions = [...records.entries()].map(([name, record]) => `${name}\0${record.version}`);
  const distinct = new Set(versions.map((entry) => entry.split("\0")[1]));
  if (distinct.size > 1) {
    const listed2 = [...records.entries()].map(([name, record]) => `${name} has ${pyRepr$1(record.version)}`).join(", ");
    problems.push(`skills/: every module record carries one version, stamped together; ${listed2}`);
  }
  return problems;
}
function membershipProblems(files, records, members, shipped) {
  const problems = [];
  for (const [name, parsed] of files) {
    if (parsed.skill === null) continue;
    if (parsed.bmod !== null) {
      if (!members.get(name).includes(name)) {
        problems.push(`${rel(name)}: holds [skill], but its own [bmod] skills list leaves ${pyRepr$1(name)} out`);
      }
      continue;
    }
    const bmod = parsed.skill.bmod;
    const record = records.get(bmod);
    if (record !== void 0 && parsed.skill.source !== record.update_source) {
      problems.push(
        `${rel(name)}: [skill] source ${pyRepr$1(parsed.skill.source)} differs from ${rel(bmod)} update_source ${pyRepr$1(record.update_source)}`
      );
    }
    if (record === void 0) {
      problems.push(`${rel(name)}: [skill] bmod names ${pyRepr$1(bmod)}, which is not a module record in this repository`);
    } else if (!members.get(bmod).includes(name)) {
      problems.push(`${rel(name)}: [skill] bmod names ${pyRepr$1(bmod)}, but ${rel(bmod)} does not list ${pyRepr$1(name)}`);
    }
  }
  for (const [name, listed2] of members) {
    for (const member of listed2) {
      const parsed = files.get(member);
      if (!shipped.has(member)) {
        problems.push(`${rel(name)}: lists the skill ${pyRepr$1(member)}, which this repository does not ship`);
      } else if (parsed === void 0) {
        continue;
      } else if (parsed.skill === null || parsed.bmod !== null && member !== name) {
        problems.push(`${rel(name)}: lists ${pyRepr$1(member)}, which is a module record and not a skill of this module`);
      } else if (member !== name && parsed.skill.bmod !== name) {
        problems.push(
          `${rel(name)}: lists the skill ${pyRepr$1(member)}, but ${rel(member)} names ${pyRepr$1(parsed.skill.bmod)} as its bmod`
        );
      }
    }
  }
  return problems;
}
function retiredProblems(records, shipped) {
  const problems = [];
  const retiredBy = /* @__PURE__ */ new Map();
  for (const [name, record] of records) {
    const retired = [...record.renamed.map((rename) => rename.old), ...record.removed];
    for (const old of retired) {
      if (shipped.has(old)) {
        problems.push(
          `${retiredRel(name)}: retires ${pyRepr$1(old)}, but skills/${old} still ships; a retired name is never reused`
        );
      }
      if (!retiredBy.has(old)) retiredBy.set(old, name);
      const first = retiredBy.get(old);
      if (first !== name) {
        problems.push(`${retiredRel(name)}: retires ${pyRepr$1(old)}, which ${retiredRel(first)} already retires`);
      }
    }
    const targets = record.renamed.map((rename) => rename.new);
    for (const target of [...new Set(targets.filter((t) => targets.filter((o) => o === t).length > 1))]) {
      problems.push(
        `${retiredRel(name)}: renames more than one skill to ${pyRepr$1(target)}; their customizations would collide, so list the extras under removed`
      );
    }
    for (const rename of record.renamed) {
      if (!shipped.has(rename.new)) {
        problems.push(
          `${retiredRel(name)}: renames ${pyRepr$1(rename.old)} to ${pyRepr$1(rename.new)}, which this repository does not ship`
        );
      }
    }
  }
  return problems;
}
function requirementProblems(folder, table, source, shipped) {
  const problems = [];
  for (const field of ["required_skills", "recommended_skills"]) {
    for (const requirement of source[field]) {
      const where = `${rel(folder)}: ${table}.${field} entry ${pyRepr$1(requirement.skill)}`;
      if (requirement.version !== null && requirement.version.includes("+")) {
        problems.push(
          `${where} version ${pyRepr$1(requirement.version)} carries build metadata, which setup.py ignores when ordering; it would compare equal to ${pyRepr$1(requirement.version.split("+", 1)[0])}`
        );
      }
      if (requirement.source === null && !shipped.has(requirement.skill)) {
        problems.push(`${where} names no skill in this repository and gives no source to fetch it from`);
      }
    }
  }
  return problems;
}
async function knowledgeProblems(fs2, name, record, folder, members) {
  const problems = [];
  const helpPath = `${folder}/${HELP_NAME}`;
  if (name.startsWith("bmod-") || await fs2.exists(helpPath)) {
    const problem = await plainFileProblem(fs2, folder, HELP_NAME);
    if (problem !== null) {
      problems.push(`skills/${name}/${HELP_NAME}, which every bmod-* folder holds, ${problem}`);
    }
  }
  for (const entry of record.knowledge) {
    if (entry.path === HELP_NAME) {
      problems.push(`${rel(name)}: knowledge names ${pyRepr$1(HELP_NAME)}, which is always read`);
      continue;
    }
    const problem = await plainFileProblem(fs2, folder, entry.path);
    if (problem !== null) {
      problems.push(`${rel(name)}: knowledge names ${pyRepr$1(entry.path)}, which ${problem}`);
    }
    for (const skill of entry.skills ?? []) {
      if (!members.includes(skill)) {
        problems.push(
          `${rel(name)}: knowledge ${pyRepr$1(entry.path)} names ${pyRepr$1(skill)}, which is not a skill of module ${pyRepr$1(record.code)}`
        );
      }
    }
  }
  return problems;
}
const TOPIC_REFERENCE = /`help\/([^`/<>]+\.md)`/g;
async function topicProblems(fs2, name, folder) {
  let text = "";
  try {
    text = await fs2.readText(`${folder}/${HELP_NAME}`);
  } catch {
    text = "";
  }
  const helpFile = "help.md";
  const named = new Set([...text.matchAll(TOPIC_REFERENCE)].map((match) => match[1]));
  named.delete(helpFile);
  let helpEntries;
  try {
    helpEntries = await fs2.list(`${folder}/${TOPICS_DIR}`);
  } catch {
    helpEntries = [];
  }
  const shipped = new Set(helpEntries.filter((entry) => entry.endsWith(".md") && entry !== helpFile));
  const where = `skills/${name}/${TOPICS_DIR}`;
  const problems = [...shipped].filter((topic) => !named.has(topic)).sort(compareStrings).map((topic) => `${where}/${topic} is never named in ${HELP_NAME}`);
  problems.push(
    ...[...named].filter((topic) => !shipped.has(topic)).sort(compareStrings).map((topic) => `skills/${name}/${HELP_NAME} names ${where}/${topic}, which does not exist`)
  );
  for (const topic of [...shipped].sort(compareStrings)) {
    let body;
    try {
      body = await fs2.readText(`${folder}/${TOPICS_DIR}/${topic}`);
    } catch {
      continue;
    }
    const others = new Set([...body.matchAll(TOPIC_REFERENCE)].map((match) => match[1]));
    for (const other of [...others].filter((o) => !shipped.has(o) && o !== helpFile).sort(compareStrings)) {
      problems.push(`${where}/${topic} names ${where}/${other}, which does not exist`);
    }
  }
  for (const topic of [...shipped].filter((t) => named.has(t)).sort(compareStrings)) {
    const problem = await plainFileProblem(fs2, folder, `${TOPICS_DIR}/${topic}`);
    if (problem !== null) problems.push(`${where}/${topic} ${problem}`);
  }
  return problems;
}
async function plainFileProblem(fs2, folder, relative) {
  const path = `${folder}/${relative}`;
  if (!await fs2.exists(path)) return "the module record does not ship";
  try {
    await readDocument(fs2, path, folder);
  } catch (error) {
    return errorText(error);
  }
  return null;
}
async function rosterFileProblems(fs2, name, _record, folder, skillsDir) {
  const path = `${folder}/${ROSTER_NAME}`;
  if (!await fs2.exists(path)) return [];
  const where = `skills/${name}/${ROSTER_NAME}`;
  const problem = await plainFileProblem(fs2, folder, ROSTER_NAME);
  if (problem !== null) return [`${where} ${problem}`];
  let party;
  try {
    party = parse(await fs2.readText(path));
  } catch (error) {
    return [`${where}: cannot read roster: ${errorText(error)}`];
  }
  return (await rosterProblems(fs2, party, skillsDir)).map((entry) => `${where}: ${entry}`);
}
async function rosterProblems(fs2, party, skillsDir) {
  const problems = [];
  const members = asList(party.members).filter(isTable$3);
  const codes = members.map((member) => member.code);
  const strings = codes.filter((code) => typeof code === "string");
  const repeated = [...new Set(strings.filter((code) => strings.filter((other) => other === code).length > 1))].sort(
    compareStrings
  );
  for (const code of repeated) problems.push(`member code ${pyRepr$1(code)} is defined twice`);
  for (const member of members) {
    const skill = member.skill;
    if (skill !== void 0 && !(typeof skill === "string" && await isFile(fs2, `${skillsDir}/${skill}/SKILL.md`))) {
      problems.push(`member ${pyRepr$1(member.code)} names skill ${pyRepr$1(skill)}, which this repository does not ship`);
    }
  }
  for (const group of asList(party.groups)) {
    if (!isTable$3(group)) continue;
    for (const code of asList(group.members)) {
      if (!codes.includes(code)) {
        problems.push(`group ${pyRepr$1(group.id)} lists ${pyRepr$1(code)}, which no member defines`);
      }
    }
  }
  return problems;
}
function asList(value) {
  return Array.isArray(value) ? value : [];
}
async function runtimeProblems(fs2, skillsDir) {
  const problems = [];
  let installation;
  try {
    installation = await discoverInstallation(fs2, `${skillsDir}/bmad`);
  } catch (error) {
    return [`skills/: setup.py cannot discover the modules: ${errorText(error)}`];
  }
  problems.push(...installation.problems.map((problem) => `skills/: setup.py reports: ${problem.message}`));
  problems.push(
    ...installation.missing_records.map(
      (missing) => `skills/: setup.py finds no module record ${pyRepr$1(missing.bmod)} for ${pyRepr$1(missing.skill)}`
    )
  );
  const report = await collect$1(fs2, [skillsDir]);
  problems.push(...report.problems.map((problem) => `skills/: knowledge.py reports: ${problem.problem}`));
  return problems;
}
async function validateManifests(argv, fs2) {
  let projectRoot = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--project-root") {
      const value = argv[++i];
      if (value === void 0) return usageError$1("argument --project-root: expected one argument");
      projectRoot = value;
    } else if (token.startsWith("--project-root=")) {
      projectRoot = token.slice("--project-root=".length);
    } else {
      return usageError$1(`unrecognized arguments: ${token}`);
    }
  }
  const root = resolvePath(projectRoot ?? (typeof process !== "undefined" ? process.cwd() : "."));
  const report = await checkRepo(fs2, root);
  if (report.problems.length) {
    return {
      stdout: `bmod file validation failed (${report.problems.length}):
` + report.problems.map((problem) => `  ${problem}
`).join(""),
      exitCode: 1
    };
  }
  return {
    stdout: `bmod files valid: ${report.skills} skills, ${report.records.length} module records, ${report.documents} knowledge documents.
`,
    exitCode: 0
  };
}
function usageError$1(message) {
  return { stdout: `validate_manifests: error: ${message}`, exitCode: 2 };
}
const MARKER_RE = /\{\/?if-[a-zA-Z0-9_-]+\}/g;
const TOKEN_RE = /\{[a-zA-Z][a-zA-Z0-9_.-]*\}/g;
const sortedUnique = (matches) => [...new Set(matches)].sort();
async function processTemplate(argv, fs2) {
  const script = "process_template";
  const positionals = [];
  const variables = [];
  const truths = [];
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const [flag, inline] = splitFlag(token);
    if (flag === "-o" || flag === "--output") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, `argument ${flag}: expected one argument`);
      output = value;
    } else if (flag === "--var") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, "argument --var: expected one argument");
      const cut = value.indexOf("=");
      if (cut <= 0) return usageError$3(script, `argument --var: expected key=value, got ${pyRepr$1(value)}`);
      variables.push([value.slice(0, cut), value.slice(cut + 1)]);
    } else if (flag === "--true") {
      const value = inline ?? argv[++i];
      if (value === void 0) return usageError$3(script, "argument --true: expected one argument");
      truths.push(value);
    } else if (flag === "--json" && inline === null) ;
    else if (token.startsWith("-") && token !== "-") {
      return usageError$3(script, `unrecognized arguments: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  const template = positionals[0];
  if (template === void 0) return usageError$3(script, "the following arguments are required: template");
  let content;
  try {
    content = await fs2.readText(template);
  } catch (error) {
    const text = await fs2.exists(template) ? errorText(error) : missingPathError(template);
    return { stdout: `process_template: cannot read ${template}: ${text}
`, exitCode: 2 };
  }
  const conditional = processConditionals(content, new Set(truths));
  const variable = processVariables(conditional.text, new Map(variables));
  const leftover = sortedUnique(variable.text.match(MARKER_RE) ?? []);
  if (leftover.length) {
    return { stdout: `process_template: leftover conditional markers: ${leftover.join(", ")}
`, exitCode: 3 };
  }
  const metadata = {
    output_file: output ?? "<stdout>",
    vars_substituted: variable.substituted,
    conditions_true: conditional.kept,
    conditions_false: conditional.removed,
    tokens_remaining: sortedUnique(variable.text.match(TOKEN_RE) ?? [])
  };
  if (output !== null) {
    const parent = dirname(output);
    if (parent !== "/" && !await fs2.exists(parent)) await fs2.mkdir(parent);
    await fs2.writeText(output, variable.text);
    return { stdout: `${pyJson(metadata, { ensureAscii: true })}
`, exitCode: 0 };
  }
  return { stdout: variable.text, exitCode: 0 };
}
const IDENTITY_FILES = ["PERSONA.md", "CREED.md", "BOND.md", "HOW-I-REMEMBER.md", "CAPABILITIES.md"];
const DATED_RE = /^(\d{4}-\d{2}-\d{2})/;
const STATUS_RAW_RE = /^status:\s*raw\s*$/m;
const RECENT_COUNT = 8;
async function directoriesUnder(fs2, root) {
  const out2 = [];
  const walk2 = async (dir) => {
    let entries;
    try {
      entries = await fs2.list(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = `${dir}/${name}`;
      if (!await isDirectory(fs2, path)) continue;
      out2.push(path);
      await walk2(path);
    }
  };
  await walk2(root);
  return out2.sort();
}
async function filesUnder(fs2, root) {
  const out2 = [];
  for (const dir of [root, ...await directoriesUnder(fs2, root)]) {
    for (const path of await listOrEmpty(fs2, dir)) {
      if (await isFile(fs2, path)) out2.push(path);
    }
  }
  return out2;
}
async function listOrEmpty(fs2, dir) {
  try {
    return (await fs2.list(dir)).map((name) => `${dir}/${name}`);
  } catch {
    return [];
  }
}
function relativeTo(path, parent) {
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
async function folderLines(fs2, root, label) {
  if (!await isDirectory(fs2, root)) return [];
  const lines = [];
  const directFiles = [];
  for (const path of await listOrEmpty(fs2, root)) if (await isFile(fs2, path)) directFiles.push(path);
  const named = directFiles.filter((path) => !folderName(path).startsWith("."));
  if (named.length) lines.push(`${label}/ (${named.length} files)`);
  for (const folder of await directoriesUnder(fs2, root)) {
    const files = (await listOrEmpty(fs2, folder)).filter((path) => !folderName(path).startsWith("."));
    const count = (await Promise.all(files.map((path) => isFile(fs2, path)))).filter(Boolean).length;
    lines.push(`${relativeTo(folder, dirname(root))}/ (${count} files)`);
  }
  return lines;
}
async function recentDated(fs2, root) {
  if (!await isDirectory(fs2, root)) return [];
  const dated = (await filesUnder(fs2, root)).filter((path) => DATED_RE.test(folderName(path)));
  dated.sort((a, b) => {
    const nameA = folderName(a);
    const nameB = folderName(b);
    if (nameA !== nameB) return nameA < nameB ? 1 : -1;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  return dated.slice(0, RECENT_COUNT).map((path) => relativeTo(path, dirname(root)));
}
async function undistilled(fs2, raw) {
  if (!await isDirectory(fs2, raw)) return [];
  const out2 = [];
  for (const path of (await listOrEmpty(fs2, raw)).sort()) {
    if (!await isFile(fs2, path)) continue;
    const head = (await fs2.readText(path)).slice(0, 2e3);
    if (STATUS_RAW_RE.test(head)) out2.push(folderName(path));
  }
  return out2;
}
async function tendingLine(fs2, sanctum) {
  const stamp = `${sanctum}/memory/.tended`;
  const tended = await isFile(fs2, stamp) ? (await fs2.readText(stamp)).trim().slice(0, 10) : "";
  const sessions = `${sanctum}/memory/sessions`;
  const notes = await isDirectory(fs2, sessions) ? (await listOrEmpty(fs2, sessions)).filter((path) => DATED_RE.test(folderName(path))) : [];
  const since = tended ? notes.filter((path) => (DATED_RE.exec(folderName(path))?.[1] ?? "") > tended) : notes;
  if (tended) return `Tended: ${tended}; session notes since: ${since.length}`;
  return `Never tended; session notes: ${since.length}`;
}
async function emit(fs2, path) {
  return `
===== ${folderName(path)} =====
${(await fs2.readText(path)).replace(/\s+$/, "")}
`;
}
async function wake(argv, fs2) {
  const script = "wake";
  const positionals = [];
  let skillRoot = null;
  let pulse = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--pulse" && inline === null) pulse = true;
    else if (flag === "--skill-root") {
      skillRoot = inline ?? argv[++i] ?? null;
      if (skillRoot === null) return usageError$3(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("--")) return usageError$3(script, `unrecognized arguments: ${argv[i]}`);
    else positionals.push(argv[i]);
  }
  if (!positionals.length) return { stdout: "Usage: wake.py <project-root> [--pulse]\n", exitCode: 2 };
  if (skillRoot === null) {
    return usageError$3(script, "--skill-root is required (the pin read the skill name from its own folder)");
  }
  const projectRoot = absolutePath(positionals[0]);
  const skillName = folderName(skillRoot);
  const sanctum = `${projectRoot}/_bmad/memory/${skillName}`;
  const missing = [];
  for (const name of IDENTITY_FILES) if (!await isFile(fs2, `${sanctum}/${name}`)) missing.push(name);
  if (missing.length) {
    const lines2 = ["MODE: FIRST_BREATH"];
    if (await isDirectory(fs2, sanctum)) lines2.push(`INCOMPLETE SANCTUM at ${sanctum}: missing ${missing.join(", ")}`);
    else lines2.push(`NO SANCTUM at ${sanctum}`);
    lines2.push("This is your one birth. Load references/first-breath.md and follow it.");
    return { stdout: lines2.join("\n") + "\n", exitCode: 0 };
  }
  let out2 = pulse ? "MODE: PULSE\n" : "MODE: WAKING\n";
  out2 += `Sanctum: ${sanctum}
`;
  for (const name of IDENTITY_FILES) out2 += await emit(fs2, `${sanctum}/${name}`);
  if (pulse && await isFile(fs2, `${sanctum}/PULSE.md`)) out2 += await emit(fs2, `${sanctum}/PULSE.md`);
  out2 += "\n===== memory map =====\n";
  const lines = (await folderLines(fs2, `${sanctum}/memory`, "memory")).concat(
    await folderLines(fs2, `${sanctum}/raw`, "raw")
  );
  out2 += (lines.length ? lines.join("\n") : "(empty: nothing remembered yet)") + "\n";
  const recent = await recentDated(fs2, `${sanctum}/memory`);
  if (recent.length) out2 += "\nNewest:\n" + recent.map((path) => `  ${path}`).join("\n") + "\n";
  out2 += `
${await tendingLine(fs2, sanctum)}
`;
  const raw = await undistilled(fs2, `${sanctum}/raw`);
  if (raw.length) out2 += `
Undistilled raw (${raw.length}):
` + raw.map((name) => `  raw/${name}`).join("\n") + "\n";
  const pending = `${sanctum}/memory/pending.md`;
  if (await isFile(fs2, pending) && (await fs2.readText(pending)).trim()) out2 += await emit(fs2, pending);
  return { stdout: out2, exitCode: 0 };
}
const helpers = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  brain,
  gitEvidence,
  initSkill,
  knowledge,
  lintSpine,
  listCustomizableSkills,
  pickMethods,
  processTemplate,
  readSessionLog,
  reconKit,
  registry,
  resolveParty,
  resolvePersonas,
  roster,
  runTriggers,
  scanLegacyModule,
  scanPaths,
  scanScripts,
  validateManifests,
  wake
}, Symbol.toStringTag, { value: "Module" }));
function realFs() {
  return {
    readText: (p) => import("node:fs/promises").then((f) => f.readFile(p, "utf8")),
    writeText: (p, body) => import("node:fs/promises").then((f) => f.writeFile(p, body)),
    list: (p) => import("node:fs/promises").then((f) => f.readdir(p)),
    exists: (p) => import("node:fs/promises").then((f) => f.access(p).then(() => true, () => false)),
    // `mkdir` with `recursive: true` resolves to the first created path; discard it for Promise<void>.
    mkdir: (p) => import("node:fs/promises").then((f) => f.mkdir(p, { recursive: true }).then(() => void 0)),
    delete: (p) => import("node:fs/promises").then((f) => f.unlink(p))
  };
}
const fs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  realFs
}, Symbol.toStringTag, { value: "Module" }));
const PENDING_PORTS = /* @__PURE__ */ new Set(["roster", "knowledge", "validate_manifests"]);
function flagValue(argv, flag) {
  const at = argv.indexOf(flag);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null;
}
function usageError(script, message) {
  return { stdout: `${script}: error: ${message}`, exitCode: 2 };
}
function absoluteRoot(root) {
  return resolve(root).replace(/\\/g, "/");
}
function pyRepr(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function setOverrides(argv) {
  const set = {};
  const invalid = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    let assignment = null;
    if (token === "--set") assignment = argv[++i] ?? "";
    else if (token.startsWith("--set=")) assignment = token.slice("--set=".length);
    else if (token.startsWith("--set ")) assignment = token.slice("--set ".length);
    if (assignment === null) continue;
    const cut = assignment.indexOf("=");
    if (cut <= 0) invalid.push(assignment);
    else set[assignment.slice(0, cut)] = assignment.slice(cut + 1);
  }
  return { set, invalid };
}
function keyPaths(argv) {
  const keys = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--key" || token === "-k") {
      const value = argv[++i];
      if (value !== void 0) keys.push(value);
    } else if (token.startsWith("--key=")) {
      keys.push(token.slice("--key=".length));
    }
  }
  return keys;
}
const MISSING = /* @__PURE__ */ Symbol("missing");
function extractKey(data, dotted) {
  let current = data;
  for (const part of dotted.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return MISSING;
    current = current[part];
  }
  return current;
}
function resolveOutput(merged, argv) {
  const keys = keyPaths(argv);
  if (keys.length === 0) return merged;
  const out2 = {};
  for (const key of keys) {
    const value = extractKey(merged, key);
    if (value !== MISSING) out2[key] = value;
  }
  return out2;
}
function camel(stem) {
  return stem.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
async function cliMain(argv, fs2) {
  const [script, ...rest] = argv;
  if (script === void 0) {
    return { stdout: "usage: node ade-runtime.mjs <script> <script args…>", exitCode: 2 };
  }
  switch (script) {
    case "tickets":
    case "read_store":
      return tickets(rest, fs2);
    case "resolve_config": {
      const root = flagValue(rest, "--project-root");
      if (root === null) return usageError("resolve_config", "the following arguments are required: --project-root");
      const cfg = await loadCentralConfig(absoluteRoot(root), fs2);
      return { stdout: JSON.stringify(resolveOutput(cfg, rest), null, 2), exitCode: 0 };
    }
    case "resolve_customization": {
      const root = flagValue(rest, "--project-root");
      const skillRoot = flagValue(rest, "--skill");
      if (root === null) return usageError("resolve_customization", "the following arguments are required: --project-root");
      if (skillRoot === null) return usageError("resolve_customization", "the following arguments are required: --skill");
      const skill = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
      const merged = await resolveCustomization(absoluteRoot(root), skillRoot, skill, fs2);
      return { stdout: JSON.stringify(resolveOutput(merged, rest), null, 2), exitCode: 0 };
    }
    case "render_skill": {
      const root = flagValue(rest, "--project-root");
      const skill = flagValue(rest, "--skill");
      if (root === null) return usageError("render_skill", "the following arguments are required: --project-root");
      if (skill === null) return usageError("render_skill", "the following arguments are required: --skill");
      const { set, invalid } = setOverrides(rest);
      if (invalid.length > 0) {
        return {
          stdout: `HALT: invalid --set assignment ${pyRepr(invalid[0])}; expected bare dotted key=value
`,
          exitCode: 1
        };
      }
      const stdout = await renderSkill(absoluteRoot(root), skill, set, fs2);
      return { stdout, exitCode: stdout.startsWith("HALT:") ? 1 : 0 };
    }
    case "memlog":
      return memlog(rest, fs2);
    default: {
      const helpers$1 = await Promise.resolve().then(() => helpers);
      const fn = helpers$1[script] ?? helpers$1[camel(script)];
      if (typeof fn === "function") return fn(rest, fs2);
      if (PENDING_PORTS.has(script)) {
        return { stdout: `${script}: not ported into this runtime build yet`, exitCode: 1 };
      }
      return { stdout: `unknown runtime script: ${script}`, exitCode: 2 };
    }
  }
}
if (typeof process !== "undefined" && process.argv[1]?.endsWith("ade-runtime.mjs")) {
  const { realFs: realFs2 } = await Promise.resolve().then(() => fs);
  try {
    const r = await cliMain(process.argv.slice(2), realFs2());
    if (r.stdout) process.stdout.write(r.stdout.endsWith("\n") ? r.stdout : `${r.stdout}
`);
    process.exitCode = r.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  }
}
export {
  cliMain
};
