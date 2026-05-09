export interface ParsedPointCloud {
  points: Float32Array; // xyz xyz xyz … (count × 3 floats)
  colors: Float32Array; // rgb rgb rgb … (count × 3 floats, 0-1 range)
  count: number;
}

interface PCDHeader {
  fields: string[];
  sizes: number[];
  types: string[];   // 'F' | 'I' | 'U'
  counts: number[];
  numPoints: number;
  data: 'ascii' | 'binary' | 'binary_compressed';
  headerByteLength: number;
}

const MAX_POINTS = 1_000_000;

// ─── LZF block decompression ──────────────────────────────────────────────────
// PCL's binary_compressed PCD uses liblzf (Marc A. Lehmann's LZF algorithm).
// Reference: https://github.com/nemequ/liblzf/blob/master/lzf_d.c
function lzfDecompress(src: Buffer, uncompressedSize: number): Buffer {
  const dst = Buffer.allocUnsafe(uncompressedSize);
  let si = 0; // read cursor in src
  let di = 0; // write cursor in dst

  while (di < uncompressedSize && si < src.length) {
    const ctrl = src[si++];

    if (ctrl < 32) {
      // Literal run: copy ctrl+1 bytes directly
      const count = ctrl + 1;
      src.copy(dst, di, si, si + count);
      si += count;
      di += count;
    } else {
      // Back-reference
      let len = ctrl >> 5;                  // upper 3 bits
      const refHigh = (ctrl & 0x1f) << 8;  // lower 5 bits shifted up

      if (len === 7) len += src[si++];      // extended length
      const refLow = src[si++];
      const offset = refHigh + refLow + 1;
      let ref = di - offset;
      len += 2; // minimum match length is 3

      // Byte-by-byte to handle overlapping back-references
      for (let i = 0; i < len; i++) dst[di++] = dst[ref++];
    }
  }

  return dst.slice(0, di);
}

// ─── PCD header parser ────────────────────────────────────────────────────────
function parseHeader(buffer: Buffer): PCDHeader {
  const h: PCDHeader = {
    fields: [], sizes: [], types: [], counts: [],
    numPoints: 0, data: 'ascii', headerByteLength: 0,
  };

  let pos = 0;
  while (pos < buffer.length) {
    const eol = buffer.indexOf(0x0a, pos);
    if (eol === -1) break;
    const line = buffer.slice(pos, eol).toString('utf8').replace(/\r$/, '').trim();
    pos = eol + 1;

    if (!line || line.startsWith('#')) continue;

    const [key, ...rest] = line.split(/\s+/);
    switch (key.toUpperCase()) {
      case 'FIELDS': h.fields = rest; break;
      case 'SIZE':   h.sizes  = rest.map(Number); break;
      case 'TYPE':   h.types  = rest; break;
      case 'COUNT':  h.counts = rest.map(Number); break;
      case 'POINTS': h.numPoints = parseInt(rest[0], 10); break;
      case 'DATA':
        h.data = rest[0].toLowerCase() as PCDHeader['data'];
        h.headerByteLength = pos;
        return h;
    }
  }
  return h;
}

// ─── Scalar reader ────────────────────────────────────────────────────────────
function readScalar(buf: Buffer, offset: number, type: string, size: number): number {
  try {
    if (type === 'F') {
      if (size === 4) return buf.readFloatLE(offset);
      if (size === 8) return buf.readDoubleLE(offset);
    } else if (type === 'U') {
      if (size === 1) return buf.readUInt8(offset);
      if (size === 2) return buf.readUInt16LE(offset);
      if (size === 4) return buf.readUInt32LE(offset);
    } else if (type === 'I') {
      if (size === 1) return buf.readInt8(offset);
      if (size === 2) return buf.readInt16LE(offset);
      if (size === 4) return buf.readInt32LE(offset);
    }
  } catch { /* out of bounds */ }
  return 0;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function heightColor(y: number, out: Float32Array, base: number) {
  const t = Math.max(0, Math.min(1, (y + 2) / 6));
  out[base]   = t;
  out[base+1] = 0.6 * (1 - Math.abs(t - 0.5) * 2);
  out[base+2] = 1 - t;
}

function unpackRGB(packed: number, out: Float32Array, base: number) {
  const u = new Uint8Array(new Float32Array([packed]).buffer);
  // little-endian bytes: [B, G, R, 0]
  out[base]   = u[2] / 255;
  out[base+1] = u[1] / 255;
  out[base+2] = u[0] / 255;
}

// Normalize intensity: float fields are already 0-1; uint fields are divided by their type max.
function normalizeIntensity(raw: number, type: string, size: number): number {
  if (type === 'F') return Math.max(0, Math.min(1, raw));
  const maxVal = size === 1 ? 255 : size === 2 ? 65535 : 4294967295;
  return raw / maxVal;
}

function applyColor(
  data: Buffer, base: number,
  h: PCDHeader, ii: number, rgbi: number, rgbai: number, fieldOffset: number[],
  pts: Float32Array, col: Float32Array, i: number, colMajor = false
) {
  if (rgbi !== -1 || rgbai !== -1) {
    const fi = rgbi !== -1 ? rgbi : rgbai;
    const off = colMajor
      ? fieldOffset[fi] + i * (h.sizes[fi] ?? 4)
      : base + fieldOffset[fi];
    unpackRGB(readScalar(data, off, h.types[fi], h.sizes[fi]), col, i*3);
  } else if (ii !== -1) {
    const off = colMajor
      ? fieldOffset[ii] + i * (h.sizes[ii] ?? 4)
      : base + fieldOffset[ii];
    const raw = readScalar(data, off, h.types[ii], h.sizes[ii]);
    const n   = normalizeIntensity(raw, h.types[ii], h.sizes[ii]);
    col[i*3] = col[i*3+1] = col[i*3+2] = n;
  } else {
    heightColor(pts[i*3+2], col, i*3); // PCD z is actual height
  }
}

// ─── Strip NaN / Infinity points (common in ROS LiDAR data for invalid returns) ─
function compactNaN(pts: Float32Array, col: Float32Array, count: number): ParsedPointCloud {
  let valid = 0;
  for (let i = 0; i < count; i++) {
    if (isFinite(pts[i*3]) && isFinite(pts[i*3+1]) && isFinite(pts[i*3+2])) valid++;
  }
  if (valid === count) return { points: pts, colors: col, count };

  const outPts = new Float32Array(valid * 3);
  const outCol = new Float32Array(valid * 3);
  let k = 0;
  for (let i = 0; i < count; i++) {
    if (!isFinite(pts[i*3]) || !isFinite(pts[i*3+1]) || !isFinite(pts[i*3+2])) continue;
    outPts[k*3]   = pts[i*3];   outPts[k*3+1] = pts[i*3+1]; outPts[k*3+2] = pts[i*3+2];
    outCol[k*3]   = col[i*3];   outCol[k*3+1] = col[i*3+1]; outCol[k*3+2] = col[i*3+2];
    k++;
  }
  return { points: outPts, colors: outCol, count: valid };
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function parsePCD(buffer: Buffer): ParsedPointCloud {
  const h = parseHeader(buffer);

  const xi    = h.fields.indexOf('x');
  const yi    = h.fields.indexOf('y');
  const zi    = h.fields.indexOf('z');
  const ii    = h.fields.indexOf('intensity');
  const rgbi  = h.fields.indexOf('rgb');
  const rgbai = h.fields.indexOf('rgba');

  if (xi === -1 || yi === -1 || zi === -1) {
    throw new Error('PCD file is missing required x, y, or z fields');
  }

  const count = Math.min(h.numPoints, MAX_POINTS);
  const pts = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  // ── ASCII ──────────────────────────────────────────────────────────────────
  if (h.data === 'ascii') {
    const lines = buffer.slice(h.headerByteLength).toString('utf8').split('\n');
    for (let i = 0; i < count; i++) {
      const row = lines[i];
      if (!row) break;
      const v = row.trim().split(/\s+/).map(Number);
      pts[i*3]   = v[xi] ?? 0;
      pts[i*3+1] = v[yi] ?? 0;
      pts[i*3+2] = v[zi] ?? 0;
      if (rgbi !== -1 || rgbai !== -1) {
        unpackRGB(v[rgbi !== -1 ? rgbi : rgbai] ?? 0, col, i*3);
      } else if (ii !== -1) {
        const n = normalizeIntensity(v[ii] ?? 0, h.types[ii], h.sizes[ii]);
        col[i*3] = col[i*3+1] = col[i*3+2] = n;
      } else {
        heightColor(pts[i*3+2], col, i*3);
      }
    }
    return compactNaN(pts, col, count);
  }

  // ── Binary (row-major) ────────────────────────────────────────────────────
  if (h.data === 'binary') {
    let stride = 0;
    const fieldOffset: number[] = [];
    for (let f = 0; f < h.fields.length; f++) {
      fieldOffset.push(stride);
      stride += (h.sizes[f] ?? 4) * (h.counts[f] ?? 1);
    }
    const data = buffer.slice(h.headerByteLength);
    for (let i = 0; i < count; i++) {
      const base = i * stride;
      pts[i*3]   = readScalar(data, base + fieldOffset[xi], h.types[xi], h.sizes[xi]);
      pts[i*3+1] = readScalar(data, base + fieldOffset[yi], h.types[yi], h.sizes[yi]);
      pts[i*3+2] = readScalar(data, base + fieldOffset[zi], h.types[zi], h.sizes[zi]);
      applyColor(data, base, h, ii, rgbi, rgbai, fieldOffset, pts, col, i);
    }
    return compactNaN(pts, col, count);
  }

  // ── Binary compressed (column-major LZF layout) ───────────────────────────
  const raw = buffer.slice(h.headerByteLength);
  const compressedSize   = raw.readUInt32LE(0);
  const uncompressedSize = raw.readUInt32LE(4);
  const compressed       = raw.slice(8, 8 + compressedSize);

  const decompressed = lzfDecompress(compressed, uncompressedSize);

  const colFieldOffset: number[] = [];
  let colOff = 0;
  for (let f = 0; f < h.fields.length; f++) {
    colFieldOffset.push(colOff);
    colOff += (h.sizes[f] ?? 4) * (h.counts[f] ?? 1) * h.numPoints;
  }

  for (let i = 0; i < count; i++) {
    pts[i*3]   = readScalar(decompressed, colFieldOffset[xi] + i * (h.sizes[xi] ?? 4), h.types[xi], h.sizes[xi]);
    pts[i*3+1] = readScalar(decompressed, colFieldOffset[yi] + i * (h.sizes[yi] ?? 4), h.types[yi], h.sizes[yi]);
    pts[i*3+2] = readScalar(decompressed, colFieldOffset[zi] + i * (h.sizes[zi] ?? 4), h.types[zi], h.sizes[zi]);
    applyColor(decompressed, 0, h, ii, rgbi, rgbai, colFieldOffset, pts, col, i, true);
  }

  return compactNaN(pts, col, count);
}
