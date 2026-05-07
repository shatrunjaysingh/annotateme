/**
 * KITTI Sample Dataset Seed
 * Creates a complete KITTI project with tasks, sample PNG images, jobs and pre-seeded annotations.
 * Usage: node seed-kitti.js
 */

const { Client } = require("pg");
const bcrypt     = require("bcryptjs");
const zlib       = require("zlib");
const fs         = require("fs");
const path       = require("path");
const crypto     = require("crypto");
require("dotenv").config();

// ─── KITTI labels ────────────────────────────────────────────────────────────
const KITTI_LABELS = [
  { name: "Car",            color: "#FF6B6B", category: "vehicle" },
  { name: "Van",            color: "#FF9F43", category: "vehicle" },
  { name: "Truck",          color: "#FECA57", category: "vehicle" },
  { name: "Pedestrian",     color: "#48DBFB", category: "human"   },
  { name: "Person_sitting", color: "#1DD1A1", category: "human"   },
  { name: "Cyclist",        color: "#FF6348", category: "human"   },
  { name: "Tram",           color: "#A29BFE", category: "vehicle" },
  { name: "Misc",           color: "#636E72", category: "other"   },
];

const TASKS = [
  { name: "Training Set — Urban Driving",  subset: "Train",      frameCount: 8, status: "annotation"  },
  { name: "Validation Set — Highway",      subset: "Validation", frameCount: 4, status: "annotation"  },
  { name: "Test Set — Intersection",       subset: "Test",       frameCount: 3, status: "annotation"  },
];

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// ─── Minimal valid PNG generator ─────────────────────────────────────────────
// Uses Node's built-in zlib; no external deps.

function crc32(data) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = (table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, dataBuf])), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function makePNG(width, height, drawFn) {
  // Build raw scanlines: filter-byte(0) + RGB per pixel
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = drawFn(x, y);
      const off = y * (width * 3 + 1) + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth 8, color type RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Predefined object boxes: [{x, y, w, h, rgb:[r,g,b]}]
const FRAME_OBJECTS = [
  [{ x:70,  y:100, w:90,  h:55, rgb:[220,60,60]   }, { x:240, y:108, w:65,  h:42, rgb:[60,140,220]  }],
  [{ x:50,  y:105, w:80,  h:50, rgb:[60,180,80]   }, { x:200, y:110, w:50,  h:70, rgb:[240,180,50]  }],
  [{ x:100, y:95,  w:130, h:65, rgb:[170,80,220]  }, { x:310, y:100, w:70,  h:50, rgb:[220,110,60]  }],
  [{ x:60,  y:110, w:100, h:60, rgb:[60,200,200]  }, { x:280, y:115, w:55,  h:45, rgb:[200,50,150]  }],
  [{ x:120, y:100, w:85,  h:55, rgb:[240,200,50]  }, { x:240, y:105, w:65,  h:50, rgb:[80,80,220]   }],
  [{ x:70,  y:112, w:75,  h:50, rgb:[220,80,80]   }, { x:220, y:100, w:90,  h:60, rgb:[50,220,100]  }],
  [{ x:90,  y:98,  w:110, h:60, rgb:[100,150,240] }, { x:260, y:108, w:50,  h:45, rgb:[230,130,50]  }],
  [{ x:55,  y:115, w:80,  h:55, rgb:[180,220,80]  }, { x:230, y:110, w:70,  h:50, rgb:[220,60,180]  }],
  [{ x:85,  y:105, w:95,  h:58, rgb:[60,180,220]  }, { x:270, y:100, w:75,  h:52, rgb:[240,160,50]  }],
  [{ x:75,  y:98,  w:105, h:62, rgb:[220,100,100] }, { x:245, y:105, w:60,  h:48, rgb:[80,220,130]  }],
  [{ x:95,  y:110, w:88,  h:55, rgb:[160,80,240]  }, { x:255, y:115, w:55,  h:44, rgb:[240,200,60]  }],
  [{ x:65,  y:100, w:92,  h:58, rgb:[60,200,180]  }, { x:235, y:105, w:68,  h:50, rgb:[220,80,80]   }],
  [{ x:110, y:95,  w:98,  h:60, rgb:[200,160,50]  }, { x:260, y:108, w:62,  h:47, rgb:[80,100,230]  }],
  [{ x:78,  y:105, w:85,  h:54, rgb:[50,220,80]   }, { x:242, y:112, w:72,  h:52, rgb:[230,80,150]  }],
  [{ x:88,  y:97,  w:102, h:62, rgb:[220,120,60]  }, { x:258, y:102, w:58,  h:46, rgb:[100,200,240] }],
];

function drawScene(frameIndex) {
  const W = 375, H = 200;
  const objects = FRAME_OBJECTS[frameIndex % FRAME_OBJECTS.length];
  // Create pixel buffer
  const pixels = new Uint8Array(W * H * 3);

  return (x, y) => {
    // Sky (top 35%)
    if (y < H * 0.35) {
      const t = y / (H * 0.35);
      return [Math.floor(100 + t * 55), Math.floor(149 + t * 30), 237];
    }
    // Horizon / buildings (35–55%)
    if (y < H * 0.55) {
      const v = 100 + ((x * 7 + y * 13) % 60);
      return [v, v, v];
    }
    // Road (bottom 45%) with center lane markings
    const isLane = x > W * 0.47 && x < W * 0.53 && (Math.floor(y / 18) % 2 === 0);
    if (isLane) return [200, 200, 200];
    const v = 70 + ((x + y) % 25);
    // Check if inside any object
    for (const obj of objects) {
      if (x >= obj.x && x < obj.x + obj.w && y >= obj.y && y < obj.y + obj.h) {
        // Simple shading: slightly lighter on top-left
        const shade = (x - obj.x < 8 || y - obj.y < 8) ? 30 : 0;
        return [
          Math.min(255, obj.rgb[0] + shade),
          Math.min(255, obj.rgb[1] + shade),
          Math.min(255, obj.rgb[2] + shade),
        ];
      }
    }
    return [v, v, v];
  };
}

// Pre-seeded annotation shapes for a frame
function makeShapes(frameIndex) {
  const objects = FRAME_OBJECTS[frameIndex % FRAME_OBJECTS.length];
  return objects.map((obj, i) => ({
    id: crypto.randomUUID(),
    type: "rect",
    label: KITTI_LABELS[(frameIndex + i) % KITTI_LABELS.length].name,
    color: KITTI_LABELS[(frameIndex + i) % KITTI_LABELS.length].color,
    points: [{ x: obj.x, y: obj.y }, { x: obj.x + obj.w, y: obj.y + obj.h }],
    occluded: false,
    attributes: { truncated: 0, alpha: -1.0, occluded: 0 },
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const client = new Client({
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT || "5432"),
    user:     process.env.DB_USER     || "annotateme",
    password: process.env.DB_PASSWORD || "annotateme",
    database: process.env.DB_NAME     || "annotateme",
  });

  await client.connect();
  console.log("✓ Connected to database\n");

  // Get admin user
  const adminRow = await client.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (adminRow.rows.length === 0) { console.error("❌ No admin user found. Run: node create-admin.js"); process.exit(1); }
  const adminId = adminRow.rows[0].id;
  console.log(`✓ Admin user: ${adminId}`);

  // Remove existing KITTI project if any (using DO block to avoid type issues)
  await client.query(`
    DO $$
    DECLARE proj_ids uuid[];
    BEGIN
      SELECT ARRAY_AGG(id) INTO proj_ids FROM projects WHERE name='KITTI Autonomous Driving';
      IF proj_ids IS NOT NULL THEN
        DELETE FROM annotations WHERE "jobId" IN (
          SELECT j.id FROM jobs j JOIN tasks t ON j."taskId"=t.id WHERE t."projectId"=ANY(proj_ids)
        );
        DELETE FROM files  WHERE "taskId"    IN (SELECT id FROM tasks WHERE "projectId"=ANY(proj_ids));
        DELETE FROM jobs   WHERE "taskId"    IN (SELECT id FROM tasks WHERE "projectId"=ANY(proj_ids));
        DELETE FROM tasks  WHERE "projectId"=ANY(proj_ids);
        DELETE FROM projects WHERE id=ANY(proj_ids);
      END IF;
    END $$;
  `);

  // ── Project ─────────────────────────────────────────────────────────────
  const labelSet = KITTI_LABELS.map(l => l.name);
  const projRes = await client.query(
    `INSERT INTO projects (id,name,description,"dataType","labelSet","totalItems","annotatedItems",progress,status,"createdById","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,'image',$3,15,0,0,'active',$4,NOW(),NOW()) RETURNING id`,
    [
      "KITTI Autonomous Driving",
      "KITTI benchmark dataset for autonomous driving. Covers urban driving, highway, and intersection scenarios with 8 object categories.",
      JSON.stringify(labelSet),
      adminId,
    ]
  );
  const projectId = projRes.rows[0].id;
  console.log(`✓ Project created: "KITTI Autonomous Driving" (${projectId})\n`);

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  let globalFrameIdx = 0;
  let totalAnnotated = 0;

  for (let ti = 0; ti < TASKS.length; ti++) {
    const t = TASKS[ti];
    console.log(`  ► Task ${ti + 1}: "${t.name}" [${t.subset}]`);

    const taskRes = await client.query(
      `INSERT INTO tasks (id,name,status,subset,"frameCount","annotatedFrames","projectId","assigneeId","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,0,$5,$6,NOW(),NOW()) RETURNING id`,
      [t.name, t.status, t.subset, t.frameCount, projectId, adminId]
    );
    const taskId = taskRes.rows[0].id;

    let thumbnailUrl = null;

    // Generate images
    for (let fi = 0; fi < t.frameCount; fi++) {
      const drawFn  = drawScene(globalFrameIdx);
      const imgBuf  = makePNG(375, 200, drawFn);
      const fname   = `kitti_${t.subset.toLowerCase()}_${String(fi).padStart(6,"0")}_${Date.now()}.png`;
      const fpath   = path.join(UPLOAD_DIR, fname);
      fs.writeFileSync(fpath, imgBuf);

      await client.query(
        `INSERT INTO files (id,"originalName","fileName","mimeType",size,path,url,"frameNumber",status,"taskId","projectId","uploadedAt")
         VALUES (gen_random_uuid(),$1,$2,'image/png',$3,$4,$5,$6,'completed',$7,$8,NOW())`,
        [`kitti_${String(globalFrameIdx).padStart(6,"0")}.png`, fname, imgBuf.length, fpath, `/uploads/${fname}`, fi, taskId, projectId]
      );

      if (fi === 0) thumbnailUrl = `/uploads/${fname}`;
      globalFrameIdx++;
    }

    await client.query(`UPDATE tasks SET "thumbnailUrl"=$1 WHERE id=$2`, [thumbnailUrl, taskId]);
    console.log(`    ✓ Generated ${t.frameCount} PNG frames`);

    // Create job
    const jobState = ti === 0 ? "in_progress" : "new";
    const jobRes = await client.query(
      `INSERT INTO jobs (id,stage,state,type,"frameStart","frameEnd","taskId","assigneeId","createdAt","updatedAt")
       VALUES (gen_random_uuid(),'annotation',$1,'annotation',0,$2,$3,$4,NOW(),NOW()) RETURNING id`,
      [jobState, t.frameCount - 1, taskId, adminId]
    );
    const jobId = jobRes.rows[0].id;
    console.log(`    ✓ Job #${ti+1} created (frames 0–${t.frameCount - 1}, state: ${jobState})`);

    // Pre-seed annotations: Task1 = all 8 frames, Task2 = first 2, Task3 = 0
    const seedFrames = ti === 0 ? t.frameCount : ti === 1 ? 2 : 0;
    const taskStartFrame = globalFrameIdx - t.frameCount;

    for (let fi = 0; fi < seedFrames; fi++) {
      const shapes = makeShapes(taskStartFrame + fi);
      await client.query(
        `INSERT INTO annotations (id,"jobId","frameNumber",shapes,tags,tracks,status,confidence,"fileId","createdAt","updatedAt")
         VALUES (gen_random_uuid(),$1,$2,$3,'[]','[]','completed',0.94,NULL,NOW(),NOW())`,
        [jobId, fi, JSON.stringify(shapes)]
      );
      totalAnnotated++;
    }

    if (seedFrames > 0) {
      console.log(`    ✓ Pre-seeded ${seedFrames} annotated frames`);
    }

    // Update task annotated count
    await client.query(`UPDATE tasks SET "annotatedFrames"=$1 WHERE id=$2`, [seedFrames, taskId]);
    console.log();
  }

  // Update project stats
  await client.query(
    `UPDATE projects SET "annotatedItems"=$1, "totalItems"=15, progress=$2 WHERE id=$3`,
    [totalAnnotated, Math.round((totalAnnotated / 15) * 100), projectId]
  );

  // Final summary
  const tasks = await client.query(`SELECT name, subset, "frameCount", "annotatedFrames" FROM tasks WHERE "projectId"=$1 ORDER BY "createdAt"`, [projectId]);
  const jobs  = await client.query(`SELECT j.id, j.state, j.stage, j."frameStart", j."frameEnd", t.name as task FROM jobs j JOIN tasks t ON j."taskId"=t.id WHERE t."projectId"=$1`, [projectId]);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅  KITTI Seed Complete");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Project  : KITTI Autonomous Driving`);
  console.log(`  Labels   : ${KITTI_LABELS.map(l=>l.name).join(", ")}`);
  console.log();
  console.log("  Tasks:");
  for (const row of tasks.rows) {
    console.log(`    • [${row.subset.padEnd(10)}] ${row.name}`);
    console.log(`      Frames: ${row.frameCount}  |  Annotated: ${row.annotatedFrames}`);
  }
  console.log();
  console.log("  Jobs:");
  for (const row of jobs.rows) {
    console.log(`    • ${row.task.substring(0,30).padEnd(30)}  stage:${row.stage}  state:${row.state}  frames:${row.frameStart}–${row.frameEnd}`);
  }
  console.log();
  console.log("  Login  :  admin@annotateme.com  /  admin");
  console.log("  Open   :  http://localhost:4200");
  console.log("═══════════════════════════════════════════════════════");

  await client.end();
}

seed().catch(e => { console.error("❌ Seed failed:", e.message, e.stack); process.exit(1); });
