/** API client — talks to the Hono + SQLite backend (no localStorage). */

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function listWishes() {
  const res = await fetch("/api/wishes");
  const data = await parseJson(res);
  return data.wishes || [];
}

export async function createWish({ title, link, note, imageFile }) {
  const form = new FormData();
  form.set("title", title);
  form.set("link", link || "");
  form.set("note", note || "");
  if (imageFile) form.set("image", imageFile);
  const res = await fetch("/api/wishes", { method: "POST", body: form });
  const data = await parseJson(res);
  return data.wish;
}

export async function updateWish(id, { title, link, note, imageFile, clearImage }) {
  const form = new FormData();
  form.set("title", title);
  form.set("link", link || "");
  form.set("note", note || "");
  if (clearImage) form.set("clearImage", "1");
  if (imageFile) form.set("image", imageFile);
  const res = await fetch(`/api/wishes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: form,
  });
  const data = await parseJson(res);
  return data.wish;
}

export async function deleteWish(id) {
  const res = await fetch(`/api/wishes/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJson(res);
}

export async function reorderWishes(ids) {
  const res = await fetch("/api/wishes/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = await parseJson(res);
  return data.wishes || [];
}
