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

const MAX_POINTS = 1_000_000; // cap to prevent OOM on huge scans

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
        h.headerByteLength = pos; // everything after this line is point data
        return h;
    }
  }
  return h;
}

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
  } catch { /* out of bounds — return 0 */ }
  return 0;
}

function heightColor(y: number, out: Float32Array, base: number) {
  // Map height roughly -2 m to +4 m → cool-to-warm gradient
  const t = Math.max(0, Math.min(1, (y + 2) / 6));
  out[base]   = t;                        // red increases with height
  out[base+1] = 0.6 * (1 - Math.abs(t - 0.5) * 2); // green peaks mid-range
  out[base+2] = 1 - t;                    // blue decreases with height
}

function unpackRGB(packed: number, out: Float32Array, base: number) {
  // packed float whose bits encode 0x00RRGGBB
  const u = new Uint8Array(new Float32Array([packed]).buffer);
  // little-endian: bytes are [B, G, R, 0]
  out[base]   = u[2] / 255;
  out[base+1] = u[1] / 255;
  out[base+2] = u[0] / 255;
}

export function parsePCD(buffer: Buffer): ParsedPointCloud {
  const h = parseHeader(buffer);

  if (h.data === 'binary_compressed') {
    throw new Error(
      'binary_compressed PCD is not supported. ' +
      'Convert with: pcl_convert_pcd_ascii_binary input.pcd output.pcd 1'
    );
  }

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

  if (h.data === 'ascii') {
    const text  = buffer.slice(h.headerByteLength).toString('utf8');
    const lines = text.split('\n');

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
        const n = Math.min(1, (v[ii] ?? 0) / 255);
        col[i*3] = col[i*3+1] = col[i*3+2] = n;
      } else {
        heightColor(pts[i*3+1], col, i*3);
      }
    }

  } else {
    // binary
    let stride = 0;
    const fieldOffset: number[] = [];
    for (let f = 0; f < h.fields.length; f++) {
      fieldOffset.push(stride);
      stride += (h.sizes[f] ?? 4) * (h.counts[f] ?? 1);
    }

    const data = buffer.slice(h.headerByteLength);

    for (let i = 0; i < count; i++) {
      const base = i * stride;

      pts[i*3]   = readScalar(data, base + fieldOffset[xi],   h.types[xi],   h.sizes[xi]);
      pts[i*3+1] = readScalar(data, base + fieldOffset[yi],   h.types[yi],   h.sizes[yi]);
      pts[i*3+2] = readScalar(data, base + fieldOffset[zi],   h.types[zi],   h.sizes[zi]);

      if (rgbi !== -1 || rgbai !== -1) {
        const fi = rgbi !== -1 ? rgbi : rgbai;
        unpackRGB(
          readScalar(data, base + fieldOffset[fi], h.types[fi], h.sizes[fi]),
          col, i*3
        );
      } else if (ii !== -1) {
        const raw = readScalar(data, base + fieldOffset[ii], h.types[ii], h.sizes[ii]);
        const n   = Math.min(1, raw / 255);
        col[i*3] = col[i*3+1] = col[i*3+2] = n;
      } else {
        heightColor(pts[i*3+1], col, i*3);
      }
    }
  }

  return { points: pts, colors: col, count };
}
