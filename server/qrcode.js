// qrcode.js — Sinh ma QR (che do Byte, muc sua loi M) ra SVG.
// 0 dependency, chay hoan toan offline. Thuat toan dua theo thiet ke
// tham chieu cong khai (phong cach Nayuki qrcodegen, CC0): bang
// GF(256) 0x11D, Reed-Solomon, cham diem phat chon mat na 0-7.
// Chi ho tro version 1-10 (du cho URL tai app dang
// "http://192.168.0.18:8088/a" ~ version 3).
'use strict';

// ---------- GF(256) ----------
const EXP = new Array(512);
const LOG = new Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function gfMul(a, b) {
  return (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
}

// ---------- Reed-Solomon ----------
// Da thuc chia (divisor) bac degree, he so sap giam dan theo bac
// (bo qua he so x^degree = 1), goc tai alpha^0..alpha^(degree-1).
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] ^= gfMul(divisor[i], factor);
    }
  }
  return result;
}

// ---------- Bang khoi EC muc M (version 1-10) ----------
// [so codeword EC moi khoi, [[so khoi nhom 1, data/khoi], [nhom 2...]]]
const ECC_TABLE = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]]
};
const REMAINDER_BITS = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

function dataCapacityBytes(version) {
  const groups = ECC_TABLE[version][1];
  let total = 0;
  for (const [num, per] of groups) total += num * per;
  return total;
}

// ---------- Lap codeword du lieu (byte mode) ----------
function buildDataCodewords(bytes, version) {
  const capBits = dataCapacityBytes(version) * 8;
  const bits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  }
  pushBits(0x4, 4); // mode: byte
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  // Terminator + can byte + byte dem 0xEC/0x11
  const term = Math.min(4, capBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) {
    pushBits(pad, 8);
  }
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return out;
}

function interleaveWithEc(dataCodewords, version) {
  const [ecLen, groups] = ECC_TABLE[version];
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  const ecs = [];
  let k = 0;
  for (const [num, per] of groups) {
    for (let i = 0; i < num; i++) {
      const block = dataCodewords.slice(k, k + per);
      k += per;
      blocks.push(block);
      ecs.push(rsRemainder(block, divisor));
    }
  }
  const result = [];
  const maxData = Math.max.apply(null, blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) result.push(b[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const e of ecs) result.push(e[i]);
  }
  return result;
}

// ---------- Ma tran QR ----------
function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

class QrMatrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = [];
    this.isFunction = [];
    for (let y = 0; y < this.size; y++) {
      this.modules.push(new Array(this.size).fill(false));
      this.isFunction.push(new Array(this.size).fill(false));
    }
    this.drawFunctionPatterns();
  }

  setFunctionModule(x, y, isDark) {
    if (0 <= x && x < this.size && 0 <= y && y < this.size) {
      this.modules[y][x] = isDark;
      this.isFunction[y][x] = true;
    }
  }

  drawFunctionPatterns() {
    // Duong thoi gian (timing)
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    // 3 mau dinh vi (finder)
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    // Mau can chinh (alignment)
    const alignPos = this.getAlignmentPatternPositions();
    const num = alignPos.length;
    for (let i = 0; i < num; i++) {
      for (let j = 0; j < num; j++) {
        const skip = (i === 0 && j === 0) || (i === 0 && j === num - 1) || (i === num - 1 && j === 0);
        if (!skip) this.drawAlignmentPattern(alignPos[j], alignPos[i]);
      }
    }
    // Dat cho format bits (ban 0 tam) + module toi bat buoc
    this.drawFormatBits(0);
    // Thong tin version (version >= 7)
    if (this.version >= 7) {
      let rem = this.version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 12) * 0x1f25);
      const bits = (this.version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const mod = getBit(bits, i);
        this.setFunctionModule(this.size - 11 + (i % 3), Math.floor(i / 3), mod);
        this.setFunctionModule(Math.floor(i / 3), this.size - 11 + (i % 3), mod);
      }
    }
  }

  drawFinderPattern(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunctionModule(x + dx, y + dy, dist !== 2 && dist !== 4);
      }
    }
  }

  drawAlignmentPattern(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  getAlignmentPatternPositions() {
    if (this.version === 1) return [];
    const num = Math.floor(this.version / 7) + 2;
    const step = (this.version === 32) ? 26
      : Math.round((this.version * 4 + num * 2 + 1) / (num * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < num; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  // formatBits cua muc M = 0
  drawFormatBits(mask) {
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true); // module toi
  }

  drawCodewords(data) {
    let i = 0; // chi so bit
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: throw new Error('mask sai');
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  // ---- Diem phat chon mat na (4 quy tac chuan) ----
  getPenaltyScore() {
    let result = 0;
    let runHistory = new Array(7).fill(0);
    // Hang ngang
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runX = 0;
      runHistory = new Array(7).fill(0);
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result += 1;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * 40;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * 40;
    }
    // Cot doc
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runY = 0;
      runHistory = new Array(7).fill(0);
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result += 1;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * 40;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * 40;
    }
    // Khoi 2x2 cung mau
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) {
          result += 3;
        }
      }
    }
    // Ty le module toi
    let dark = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (this.modules[y][x]) dark++;
    }
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }

  finderPenaltyCountPatterns(runHistory) {
    const n = runHistory[1];
    const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 &&
      runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }

  finderPenaltyTerminateAndCount(color, run, runHistory) {
    if (color) {
      this.finderPenaltyAddHistory(run, runHistory);
      run = 0;
    }
    run += this.size; // cong vien trang ao
    this.finderPenaltyAddHistory(run, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  finderPenaltyAddHistory(currentRunLength, runHistory) {
    if (runHistory[0] === 0) currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }
}

// ---------- API chinh ----------
/** Ma hoa chuoi text thanh ma tran QR { version, size, modules }. */
function encode(text) {
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  for (let version = 1; version <= 10; version++) {
    const capBits = dataCapacityBytes(version) * 8;
    const usedBits = 4 + (version <= 9 ? 8 : 16) + bytes.length * 8;
    if (usedBits > capBits) continue;
    const dataCw = buildDataCodewords(bytes, version);
    const allCw = interleaveWithEc(dataCw, version);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const qr = new QrMatrix(version);
      qr.drawCodewords(allCw);
      qr.applyMask(mask);
      qr.drawFormatBits(mask);
      const score = qr.getPenaltyScore();
      if (best === null || score < best.score) best = { score: score, qr: qr };
    }
    return { version: version, size: best.qr.size, modules: best.qr.modules, isFunction: best.qr.isFunction };
  }
  throw new Error('noi dung qua dai cho QR version 10-M');
}

/** Sinh the SVG cua ma QR cho text (mac dinh: o 5px, vien trang 4 o). */
function svg(text, opts) {
  const o = opts || {};
  const scale = o.scale || 5;
  const border = (o.border === undefined ? 4 : o.border);
  const enc = encode(text);
  const size = enc.size;
  const dim = (size + border * 2) * scale;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (enc.modules[y][x]) {
        d += 'M' + ((x + border) * scale) + ' ' + ((y + border) * scale) +
          'h' + scale + 'v' + scale + 'h-' + scale + 'z';
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim +
    '" viewBox="0 0 ' + dim + ' ' + dim + '" role="img" aria-label="Mã QR tải app Farm Agent">' +
    '<rect width="100%" height="100%" fill="#ffffff"/>' +
    '<path d="' + d + '" fill="#000000"/></svg>';
}

module.exports = {
  encode: encode,
  svg: svg,
  // Chi de kiem chung (verify): khong dung luc chay that.
  _internals: {
    ECC_TABLE: ECC_TABLE,
    REMAINDER_BITS: REMAINDER_BITS,
    rsDivisor: rsDivisor,
    rsRemainder: rsRemainder,
    dataCapacityBytes: dataCapacityBytes
  }
};
