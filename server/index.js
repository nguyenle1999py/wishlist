import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, migrate, UPLOAD_DIR, ensureDirs, DB_PATH } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 8765);
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 2 * 1024 * 1024);

ensureDirs();
const db = openDb();
migrate(db);

const app = new Hono();
app.use("/api/*", cors());

function rowToWish(row) {
  return {
    id: row.id,
    title: row.title,
    link: row.link || "",
    note: row.note || "",
    imageUrl: row.image_path ? `/uploads/${path.basename(row.image_path)}` : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMultipart(contentType, body) {
  const boundaryMatch = /boundary=(.+)$/i.exec(contentType || "");
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1].trim();
  const text = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const parts = [];
  const splitter = Buffer.from(`--${boundary}`);
  let start = text.indexOf(splitter) + splitter.length;
  while (start < text.length) {
    if (text[start] === 45 && text[start + 1] === 45) break;
    if (text[start] === 13 && text[start + 1] === 10) start += 2;
    const next = text.indexOf(splitter, start);
    const chunk = text.subarray(start, next === -1 ? text.length : next - 2);
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = chunk.subarray(0, headerEnd).toString("utf8");
    const data = chunk.subarray(headerEnd + 4);
    const nameMatch = /name="([^"]+)"/i.exec(header);
    const fileMatch = /filename="([^"]*)"/i.exec(header);
    const typeMatch = /Content-Type:\s*(.+)/i.exec(header);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: fileMatch ? fileMatch[1] : null,
        contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
        data,
      });
    }
    if (next === -1) break;
    start = next + splitter.length;
  }
  return parts;
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function allWishes() {
  return db
    .prepare("SELECT * FROM wishes ORDER BY sort_order ASC, created_at ASC")
    .all()
    .map(rowToWish);
}

app.get("/api/health", (c) =>
  c.json({ ok: true, stack: "vite+hono+sqlite", maxImageBytes: MAX_IMAGE_BYTES })
);

app.get("/api/wishes", (c) => c.json({ wishes: allWishes() }));

app.post("/api/wishes", async (c) => {
  const contentType = c.req.header("content-type") || "";
  let title = "";
  let link = "";
  let note = "";
  let imagePath = null;

  if (contentType.includes("multipart/form-data")) {
    const buf = Buffer.from(await c.req.arrayBuffer());
    const parts = parseMultipart(contentType, buf) || [];
    for (const part of parts) {
      if (part.name === "title") title = part.data.toString("utf8");
      else if (part.name === "link") link = part.data.toString("utf8");
      else if (part.name === "note") note = part.data.toString("utf8");
      else if (part.name === "image" && part.filename) {
        if (part.data.length > MAX_IMAGE_BYTES) {
          return c.json({ error: `Image too large (max ${MAX_IMAGE_BYTES} bytes)` }, 400);
        }
        if (!part.contentType.startsWith("image/")) {
          return c.json({ error: "File must be an image" }, 400);
        }
        const ext = path.extname(part.filename).slice(0, 8) || ".jpg";
        const filename = `${nanoid()}${ext.toLowerCase()}`;
        imagePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(imagePath, part.data);
      }
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    title = String(body.title || "");
    link = String(body.link || "");
    note = String(body.note || "");
  }

  title = title.trim().slice(0, 120);
  if (!title) return c.json({ error: "Title is required" }, 400);
  link = normalizeUrl(link);
  note = note.trim().slice(0, 500);

  const now = Date.now();
  const maxRow = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM wishes").get();
  const id = `w_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO wishes (id, title, link, note, image_path, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, link, note, imagePath, maxRow.m + 1, now, now);

  const row = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id);
  return c.json({ wish: rowToWish(row) }, 201);
});

app.put("/api/wishes/reorder", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (!ids.length) return c.json({ error: "ids required" }, 400);

  const update = db.prepare("UPDATE wishes SET sort_order = ?, updated_at = ? WHERE id = ?");
  const now = Date.now();
  db.exec("BEGIN");
  try {
    ids.forEach((id, index) => update.run(index, now, id));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return c.json({ wishes: allWishes() });
});

app.put("/api/wishes/:id", async (c) => {
  const id = c.req.param("id");
  const existing = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const contentType = c.req.header("content-type") || "";
  let title = existing.title;
  let link = existing.link;
  let note = existing.note;
  let imagePath = existing.image_path;
  let clearImage = false;

  if (contentType.includes("multipart/form-data")) {
    const buf = Buffer.from(await c.req.arrayBuffer());
    const parts = parseMultipart(contentType, buf) || [];
    for (const part of parts) {
      if (part.name === "title") title = part.data.toString("utf8");
      else if (part.name === "link") link = part.data.toString("utf8");
      else if (part.name === "note") note = part.data.toString("utf8");
      else if (part.name === "clearImage") clearImage = part.data.toString("utf8") === "1";
      else if (part.name === "image" && part.filename) {
        if (part.data.length > MAX_IMAGE_BYTES) {
          return c.json({ error: `Image too large (max ${MAX_IMAGE_BYTES} bytes)` }, 400);
        }
        if (!part.contentType.startsWith("image/")) {
          return c.json({ error: "File must be an image" }, 400);
        }
        const ext = path.extname(part.filename).slice(0, 8) || ".jpg";
        const filename = `${nanoid()}${ext.toLowerCase()}`;
        const nextPath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(nextPath, part.data);
        if (imagePath && fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch {
            /* ignore */
          }
        }
        imagePath = nextPath;
      }
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    if (body.title != null) title = String(body.title);
    if (body.link != null) link = String(body.link);
    if (body.note != null) note = String(body.note);
    if (body.clearImage) clearImage = true;
  }

  if (clearImage) {
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        /* ignore */
      }
    }
    imagePath = null;
  }

  title = String(title).trim().slice(0, 120);
  if (!title) return c.json({ error: "Title is required" }, 400);
  link = normalizeUrl(String(link || ""));
  note = String(note || "").trim().slice(0, 500);
  const now = Date.now();

  db.prepare(
    `UPDATE wishes SET title = ?, link = ?, note = ?, image_path = ?, updated_at = ? WHERE id = ?`
  ).run(title, link, note, imagePath, now, id);

  const row = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id);
  return c.json({ wish: rowToWish(row) });
});

app.delete("/api/wishes/:id", (c) => {
  const id = c.req.param("id");
  const existing = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.image_path && fs.existsSync(existing.image_path)) {
    try {
      fs.unlinkSync(existing.image_path);
    } catch {
      /* ignore */
    }
  }
  db.prepare("DELETE FROM wishes WHERE id = ?").run(id);
  return c.json({ ok: true });
});

app.use(
  "/uploads/*",
  serveStatic({
    root: "./",
  })
);

if (isProd) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", async (c) => {
    const html = fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
    return c.html(html);
  });
} else {
  app.use("/src/*", serveStatic({ root: "./" }));
  app.get("/", async (c) => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    return c.html(html);
  });
  app.use("/*", serveStatic({ root: "./" }));
}

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`WishList API + UI → http://127.0.0.1:${info.port}`);
  console.log(`SQLite: ${DB_PATH}`);
  console.log(`Uploads: ${UPLOAD_DIR}`);
});
