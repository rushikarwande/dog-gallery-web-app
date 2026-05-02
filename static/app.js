const state = {
  breeds: [],
  visibleBreeds: 36,
  filter: "all",
  sort: "az",
  search: "",
  currentBreed: null,
  imageOffset: 0,
  imageTotal: 0,
  loadingImages: false,
};

const els = {
  homeView: document.querySelector("#homeView"),
  breedView: document.querySelector("#breedView"),
  likedView: document.querySelector("#likedView"),
  breedGrid: document.querySelector("#breedGrid"),
  imageGrid: document.querySelector("#imageGrid"),
  likedGrid: document.querySelector("#likedGrid"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  loadMoreBreeds: document.querySelector("#loadMoreBreeds"),
  loadMoreImages: document.querySelector("#loadMoreImages"),
  retryImages: document.querySelector("#retryImages"),
  breedTitle: document.querySelector("#breedTitle"),
  breedMeta: document.querySelector("#breedMeta"),
  breedCount: document.querySelector("#breedCount"),
  likeCount: document.querySelector("#likeCount"),
  recentSection: document.querySelector("#recentSection"),
  recentStrip: document.querySelector("#recentStrip"),
  showRecent: document.querySelector("#showRecent"),
  emptyImages: document.querySelector("#emptyImages"),
  emptyLikes: document.querySelector("#emptyLikes"),
  refreshLikes: document.querySelector("#refreshLikes"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#themeToggle"),
  zoomModal: document.querySelector("#zoomModal"),
  zoomImage: document.querySelector("#zoomImage"),
  closeZoom: document.querySelector("#closeZoom"),
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
};

const labelFor = (breed) => {
  const parts = breed.split("/");
  if (parts.length === 2) return `${title(parts[1])} ${title(parts[0])}`;
  return title(breed);
};

const title = (value) => value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const showToast = (message) => {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2300);
};

const setView = (name) => {
  els.homeView.hidden = name !== "home";
  els.breedView.hidden = name !== "breed";
  els.likedView.hidden = name !== "liked";
};

const setSkeletons = (container, count, media = false) => {
  container.innerHTML = Array.from({ length: count }, () =>
    media
      ? `<article class="image-card"><div class="skeleton-media skeleton"></div><div class="image-actions"><span class="skeleton" style="height:2.2rem;width:45%"></span><span class="skeleton" style="height:2.2rem;width:35%"></span></div></article>`
      : `<article class="skeleton"></article>`
  ).join("");
};

async function loadBreeds() {
  setSkeletons(els.breedGrid, 12);
  try {
    const [breedsData, likesData, viewedData] = await Promise.all([
      api("/api/breeds"),
      api("/likes"),
      api("/viewed"),
    ]);
    state.breeds = breedsData.breeds;
    els.breedCount.textContent = state.breeds.length;
    els.likeCount.textContent = likesData.likes.length;
    renderRecent(viewedData.viewed);
    renderBreeds();
  } catch (error) {
    els.breedGrid.innerHTML = errorState("Could not load breeds.", "retryBreeds");
    document.querySelector("#retryBreeds").addEventListener("click", loadBreeds);
  }
}

function filteredBreeds() {
  const query = state.search.trim().toLowerCase();
  let items = state.breeds.filter((breed) => breed.label.toLowerCase().includes(query));
  if (state.filter === "liked") items = items.filter((breed) => breed.liked_count > 0);
  if (state.filter === "recent") items = items.filter((breed) => breed.recently_viewed);

  return [...items].sort((a, b) => {
    if (state.sort === "za") return b.label.localeCompare(a.label);
    if (state.sort === "likes") return b.liked_count - a.liked_count || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });
}

function renderBreeds() {
  const items = filteredBreeds();
  const visible = items.slice(0, state.visibleBreeds);
  els.breedGrid.innerHTML = visible.map((breed) => `
    <a class="breed-card" href="/breed/${breed.name}" data-link>
      <span>
        <h3>${breed.label}</h3>
        <p>${breed.group === breed.name ? "Pure breed gallery" : `${title(breed.group)} family`}</p>
      </span>
      <span class="badge-row">
        ${breed.liked_count ? `<span class="badge">${breed.liked_count} liked</span>` : ""}
        ${breed.recently_viewed ? `<span class="badge">recent</span>` : ""}
      </span>
    </a>
  `).join("");
  if (!visible.length) els.breedGrid.innerHTML = `<div class="empty-state">No breeds match the current filters.</div>`;
  els.loadMoreBreeds.hidden = items.length <= state.visibleBreeds;
}

function renderRecent(items) {
  els.recentSection.hidden = !items.length;
  els.recentStrip.innerHTML = items.map((item) => `
    <a href="/breed/${item.breed}" class="recent-card" data-link>${item.label}</a>
  `).join("");
}

async function openBreed(breed, imageIndex = 0) {
  setView("breed");
  state.currentBreed = breed;
  state.imageOffset = 0;
  state.imageTotal = 0;
  els.imageGrid.innerHTML = "";
  els.emptyImages.hidden = true;
  els.retryImages.hidden = true;
  els.breedTitle.textContent = labelFor(breed);
  els.breedMeta.textContent = "Loading gallery...";
  await api("/viewed", { method: "POST", body: JSON.stringify({ breed }) }).catch(() => {});
  await loadImages(Math.max(0, imageIndex - (imageIndex % 10)));
  if (imageIndex) {
    document.querySelector(`[data-image-index="${imageIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  loadBreeds();
}

async function loadImages(offset = state.imageOffset) {
  if (state.loadingImages || !state.currentBreed) return;
  state.loadingImages = true;
  els.loadMoreImages.disabled = true;
  if (offset === 0) setSkeletons(els.imageGrid, 6, true);
  try {
    const data = await api(`/api/breed/${state.currentBreed}/images?offset=${offset}&limit=10`);
    state.imageOffset = data.offset + data.images.length;
    state.imageTotal = data.total;
    els.breedMeta.textContent = `${data.total} images available`;
    const html = data.images.map(imageCard).join("");
    els.imageGrid.innerHTML = offset === 0 ? html : els.imageGrid.innerHTML + html;
    els.emptyImages.hidden = Boolean(data.total);
    els.loadMoreImages.hidden = state.imageOffset >= state.imageTotal;
  } catch (error) {
    if (offset === 0) els.imageGrid.innerHTML = "";
    els.breedMeta.textContent = "The gallery could not be loaded.";
    els.retryImages.hidden = false;
    showToast("Image loading failed. Please retry.");
  } finally {
    state.loadingImages = false;
    els.loadMoreImages.disabled = false;
  }
}

function imageCard(image) {
  return `
    <article class="image-card" data-image-index="${image.index}">
      <img src="${image.url}" alt="${labelFor(state.currentBreed || image.breed)} dog image" loading="lazy" data-zoom="${image.url}" />
      <div class="image-actions">
        <button class="${image.liked ? "liked" : ""}" type="button" data-like="${image.url}" data-breed="${state.currentBreed || image.breed}" data-index="${image.index}" title="Like image">♥</button>
        <button type="button" data-share="${image.url}" data-breed="${state.currentBreed || image.breed}" data-index="${image.index}" title="Share image">Share</button>
      </div>
    </article>
  `;
}

async function loadLiked() {
  setView("liked");
  setSkeletons(els.likedGrid, 6, true);
  try {
    const data = await api("/likes");
    els.likeCount.textContent = data.likes.length;
    els.emptyLikes.hidden = Boolean(data.likes.length);
    els.likedGrid.innerHTML = data.likes.map((like) => `
      <article class="image-card">
        <img src="${like.image_url}" alt="${like.label} dog image" loading="lazy" data-zoom="${like.image_url}" />
        <div class="image-actions">
          <a class="back-link" href="/breed/${like.breed}?img=${like.image_index || 0}" data-link>${like.label}</a>
          <button class="liked" type="button" data-like="${like.image_url}" data-breed="${like.breed}" data-index="${like.image_index || 0}" title="Unlike image">♥</button>
        </div>
      </article>
    `).join("");
  } catch (error) {
    els.likedGrid.innerHTML = errorState("Could not load liked images.", "retryLikes");
    document.querySelector("#retryLikes").addEventListener("click", loadLiked);
  }
}

async function toggleLike(button) {
  const liked = button.classList.contains("liked");
  const payload = {
    image_url: button.dataset.like,
    breed: button.dataset.breed,
    image_index: Number(button.dataset.index),
  };
  try {
    if (liked) {
      await api("/like", { method: "DELETE", body: JSON.stringify({ image_url: payload.image_url }) });
      button.classList.remove("liked");
      showToast("Removed from liked images");
    } else {
      await api("/like", { method: "POST", body: JSON.stringify(payload) });
      button.classList.add("liked");
      showToast("Saved to liked images");
    }
    const likes = await api("/likes");
    els.likeCount.textContent = likes.likes.length;
  } catch (error) {
    showToast("Could not update like");
  }
}

async function shareImage(button) {
  const breed = button.dataset.breed;
  const index = Number(button.dataset.index);
  const url = `${window.location.origin}/breed/${breed}?img=${index}`;
  const titleText = `${labelFor(breed)} image`;
  try {
    if (navigator.share) {
      await navigator.share({ title: titleText, text: "Take a look at this dog gallery image.", url });
      showToast("Share sheet opened");
    } else {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
    }
  } catch (error) {
    showToast("Sharing was cancelled");
  }
}

function errorState(message, id) {
  return `<div class="empty-state">${message}<br><br><button id="${id}" class="primary-button" type="button">Retry</button></div>`;
}

function route() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === "/liked") {
    loadLiked();
    return;
  }
  if (path.startsWith("/breed/")) {
    const breed = decodeURIComponent(path.replace("/breed/", ""));
    openBreed(breed, Number(params.get("img") || 0));
    return;
  }
  setView("home");
  renderBreeds();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-link]");
  const like = event.target.closest("[data-like]");
  const share = event.target.closest("[data-share]");
  const zoom = event.target.closest("[data-zoom]");
  if (link) {
    event.preventDefault();
    history.pushState({}, "", link.href);
    route();
  } else if (like) {
    toggleLike(like);
  } else if (share) {
    shareImage(share);
  } else if (zoom) {
    els.zoomImage.src = zoom.dataset.zoom;
    els.zoomModal.hidden = false;
  }
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  state.visibleBreeds = 36;
  renderBreeds();
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    state.visibleBreeds = 36;
    renderBreeds();
  });
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderBreeds();
});

els.loadMoreBreeds.addEventListener("click", () => {
  state.visibleBreeds += 36;
  renderBreeds();
});

els.loadMoreImages.addEventListener("click", () => loadImages());
els.retryImages.addEventListener("click", () => loadImages(0));
els.refreshLikes.addEventListener("click", loadLiked);
els.showRecent.addEventListener("click", () => {
  state.filter = "recent";
  document.querySelector('[data-filter="recent"]').click();
  window.scrollTo({ top: els.homeView.offsetTop - 80, behavior: "smooth" });
});
els.closeZoom.addEventListener("click", () => els.zoomModal.hidden = true);
els.zoomModal.addEventListener("click", (event) => {
  if (event.target === els.zoomModal) els.zoomModal.hidden = true;
});
els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});
window.addEventListener("popstate", route);

document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
loadBreeds().then(route);
