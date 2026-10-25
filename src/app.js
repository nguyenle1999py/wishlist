import {
  listWishes,
  createWish,
  updateWish,
  deleteWish,
  reorderWishes,
} from "./api.js";

const els = {
  list: document.getElementById("wish-list"),
  empty: document.getElementById("empty-state"),
  count: document.getElementById("wish-count"),
  loadError: document.getElementById("load-error"),
  dialog: document.getElementById("wish-dialog"),
  form: document.getElementById("wish-form"),
  dialogTitle: document.getElementById("dialog-title"),
  fieldTitle: document.getElementById("field-title"),
  fieldLink: document.getElementById("field-link"),
  fieldNote: document.getElementById("field-note"),
  fieldImage: document.getElementById("field-image"),
  btnPickImage: document.getElementById("btn-pick-image"),
  btnClearImage: document.getElementById("btn-clear-image"),
  imagePreview: document.getElementById("image-preview"),
  imagePreviewImg: document.getElementById("image-preview-img"),
  imageHint: document.getElementById("image-hint"),
  btnSave: document.getElementById("btn-save"),
  btnCancel: document.getElementById("btn-cancel"),
  btnClose: document.getElementById("btn-close-dialog"),
  btnAddHero: document.getElementById("btn-add-hero"),
  btnAddEmpty: document.getElementById("btn-add-empty"),
  fab: document.getElementById("fab-add"),
  toast: document.getElementById("toast"),
};

/** @type {Array<{id:string,title:string,link:string,note:string,imageUrl:string|null}>} */
let wishes = [];
/** @type {string|null} */
let editingId = null;
/** @type {File|null} */
let pendingFile = null;
/** @type {string|null} */
let existingImageUrl = null;
let clearExistingImage = false;
let toastTimer = 0;
/** @type {string|null} */
let dragId = null;
let saving = false;

function showToast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function openDialog(wish = null) {
  editingId = wish ? wish.id : null;
  els.dialogTitle.textContent = wish ? "Edit wish" : "New wish";
  els.btnSave.textContent = wish ? "Save changes" : "Save wish";
  els.fieldTitle.value = wish?.title || "";
  els.fieldLink.value = wish?.link || "";
  els.fieldNote.value = wish?.note || "";
  pendingFile = null;
  existingImageUrl = wish?.imageUrl || null;
  clearExistingImage = false;
  els.fieldImage.value = "";
  updateImagePreview();
  els.imageHint.textContent = "Photos upload to the server (max ~2 MB).";
  els.imageHint.classList.remove("error");
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
  else els.dialog.setAttribute("open", "");
  requestAnimationFrame(() => els.fieldTitle.focus());
}

function closeDialog() {
  if (els.dialog.open) els.dialog.close();
  editingId = null;
  pendingFile = null;
  existingImageUrl = null;
  clearExistingImage = false;
  els.form.reset();
  updateImagePreview();
}

function updateImagePreview() {
  const url = pendingFile
    ? URL.createObjectURL(pendingFile)
    : clearExistingImage
      ? null
      : existingImageUrl;
  if (url) {
    els.imagePreview.hidden = false;
    els.imagePreviewImg.src = url;
    els.btnClearImage.hidden = false;
  } else {
    els.imagePreview.hidden = true;
    els.imagePreviewImg.removeAttribute("src");
    els.btnClearImage.hidden = true;
  }
}

function render() {
  const n = wishes.length;
  els.count.textContent = n === 0 ? "" : n === 1 ? "1 wish" : `${n} wishes`;
  els.empty.hidden = n !== 0;
  els.list.hidden = n === 0;
  els.list.innerHTML = "";
  wishes.forEach((wish, index) => {
    els.list.appendChild(buildWishItem(wish, index));
  });
}

function buildWishItem(wish, index) {
  const li = document.createElement("li");
  li.className = "wish-item";
  li.dataset.id = wish.id;
  li.draggable = true;

  const handle = document.createElement("div");
  handle.className = "wish-handle";

  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "handle-grip";
  grip.title = "Drag to reorder";
  grip.setAttribute("aria-label", `Drag to reorder ${wish.title}`);
  grip.textContent = "⋮⋮";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "move-btn";
  up.textContent = "▲";
  up.title = "Move up";
  up.setAttribute("aria-label", `Move ${wish.title} up`);
  up.disabled = index === 0;
  up.addEventListener("click", () => moveWish(wish.id, -1));

  const down = document.createElement("button");
  down.type = "button";
  down.className = "move-btn";
  down.textContent = "▼";
  down.title = "Move down";
  down.setAttribute("aria-label", `Move ${wish.title} down`);
  down.disabled = index === wishes.length - 1;
  down.addEventListener("click", () => moveWish(wish.id, 1));

  handle.append(grip, up, down);

  const body = document.createElement("div");
  body.className = "wish-body";

  if (wish.imageUrl) {
    const media = document.createElement("div");
    media.className = "wish-media";
    const img = document.createElement("img");
    img.src = wish.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    media.appendChild(img);
    body.appendChild(media);
  }

  const title = document.createElement("h3");
  title.className = "wish-title";
  title.textContent = wish.title;
  body.appendChild(title);

  if (wish.note) {
    const note = document.createElement("p");
    note.className = "wish-note";
    note.textContent = wish.note;
    body.appendChild(note);
  }

  if (wish.link) {
    const a = document.createElement("a");
    a.className = "wish-link";
    a.href = wish.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open link ↗";
    body.appendChild(a);
  }

  const actions = document.createElement("div");
  actions.className = "wish-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.setAttribute("aria-label", `Edit ${wish.title}`);
  editBtn.title = "Edit";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", () => openDialog(wish));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "icon-btn delete";
  delBtn.setAttribute("aria-label", `Delete ${wish.title}`);
  delBtn.title = "Delete";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", () => onDelete(wish.id, li));

  actions.append(editBtn, delBtn);
  li.append(handle, body, actions);

  li.addEventListener("dragstart", (e) => {
    dragId = wish.id;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", wish.id);
  });
  li.addEventListener("dragend", () => {
    dragId = null;
    li.classList.remove("dragging");
    els.list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });
  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId && dragId !== wish.id) li.classList.add("drag-over");
  });
  li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    li.classList.remove("drag-over");
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    if (!fromId || fromId === wish.id) return;
    void reorderTo(fromId, wish.id);
  });

  return li;
}

async function refresh() {
  try {
    wishes = await listWishes();
    els.loadError.hidden = true;
    render();
  } catch (err) {
    els.loadError.hidden = false;
    els.loadError.textContent = `Could not load wishes: ${err.message}. Is the server running?`;
    els.empty.hidden = true;
  }
}

async function moveWish(id, delta) {
  const i = wishes.findIndex((w) => w.id === id);
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= wishes.length) return;
  const ids = wishes.map((w) => w.id);
  const [item] = ids.splice(i, 1);
  ids.splice(j, 0, item);
  try {
    wishes = await reorderWishes(ids);
    render();
    showToast("Order updated");
  } catch (err) {
    showToast(err.message);
  }
}

async function reorderTo(fromId, toId) {
  const from = wishes.findIndex((w) => w.id === fromId);
  const to = wishes.findIndex((w) => w.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const ids = wishes.map((w) => w.id);
  const [item] = ids.splice(from, 1);
  ids.splice(to, 0, item);
  try {
    wishes = await reorderWishes(ids);
    render();
    showToast("Order updated");
  } catch (err) {
    showToast(err.message);
  }
}

async function onDelete(id, li) {
  const wish = wishes.find((w) => w.id === id);
  if (!wish) return;
  if (!window.confirm(`Delete “${wish.title}”?`)) return;
  li.classList.add("leaving");
  try {
    await deleteWish(id);
    await new Promise((r) => setTimeout(r, 220));
    wishes = wishes.filter((w) => w.id !== id);
    render();
    showToast("Wish removed");
  } catch (err) {
    li.classList.remove("leaving");
    showToast(err.message);
  }
}

async function onSubmit(e) {
  e.preventDefault();
  if (saving) return;
  const title = els.fieldTitle.value.trim();
  if (!title) {
    els.fieldTitle.focus();
    showToast("Please add a title");
    return;
  }
  const link = els.fieldLink.value.trim();
  const note = els.fieldNote.value.trim();
  saving = true;
  els.btnSave.disabled = true;
  try {
    if (editingId) {
      await updateWish(editingId, {
        title,
        link,
        note,
        imageFile: pendingFile,
        clearImage: clearExistingImage && !pendingFile,
      });
      showToast("Wish updated");
    } else {
      await createWish({ title, link, note, imageFile: pendingFile });
      showToast("Wish added ♡");
    }
    closeDialog();
    await refresh();
  } catch (err) {
    showToast(err.message);
  } finally {
    saving = false;
    els.btnSave.disabled = false;
  }
}

els.btnAddHero.addEventListener("click", () => openDialog());
els.btnAddEmpty.addEventListener("click", () => openDialog());
els.fab.addEventListener("click", () => openDialog());
els.btnCancel.addEventListener("click", closeDialog);
els.btnClose.addEventListener("click", closeDialog);
els.form.addEventListener("submit", onSubmit);
els.dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDialog();
});

els.btnPickImage.addEventListener("click", () => els.fieldImage.click());
els.btnClearImage.addEventListener("click", () => {
  pendingFile = null;
  els.fieldImage.value = "";
  if (existingImageUrl) clearExistingImage = true;
  updateImagePreview();
});

els.fieldImage.addEventListener("change", () => {
  const file = els.fieldImage.files?.[0] || null;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    els.imageHint.textContent = "Please choose an image file.";
    els.imageHint.classList.add("error");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    els.imageHint.textContent = "Image is larger than 2 MB.";
    els.imageHint.classList.add("error");
    els.fieldImage.value = "";
    return;
  }
  pendingFile = file;
  clearExistingImage = false;
  els.imageHint.classList.remove("error");
  els.imageHint.textContent = "Photo ready to upload.";
  updateImagePreview();
});

refresh();
