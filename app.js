const state = {
  tool: "pencil",
  strokeColor: "#151515",
  strokeSize: 10,
  dpr: window.devicePixelRatio || 1,
  activeStroke: false,
  strokeSource: null,
};

const canvas = document.getElementById("sketch-canvas");
const pageStack = document.getElementById("page-stack");
const canvasStage = document.querySelector(".canvas-stage");
const controlStrip = document.getElementById("control-strip");
const stripHandle = document.getElementById("strip-handle");
const ctx = canvas.getContext("2d");

const colorPicker = document.getElementById("color-picker");
const colorValue = document.getElementById("color-value");
const sizeSlider = document.getElementById("size-slider");
const sizeValue = document.getElementById("size-value");
const toolButtons = document.querySelectorAll(".tool-toggle");
const clearButton = document.getElementById("clear-canvas");
const saveButton = document.getElementById("save-png");
const menuToggle = document.getElementById("menu-toggle");
const menuDropdown = document.getElementById("menu-dropdown");
const cursorCache = new Map();

let points = [];
let rafHandle = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  offscreen.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = Math.round(rect.width * state.dpr);
  canvas.height = Math.round(rect.height * state.dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(state.dpr, state.dpr);

  ctx.drawImage(offscreen, 0, 0, offscreen.width, offscreen.height, 0, 0, canvas.width / state.dpr, canvas.height / state.dpr);
}

function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

function getCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
    pressure: evt.pressure || 0.5,
  };
}

function scheduleStroke(tool) {
  if (rafHandle) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    renderStroke(tool);
  });
}

function renderStroke(tool) {
  if (!points.length) return;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = state.strokeSize * (tool === "eraser" ? 1.4 : 1);
  ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = state.strokeColor;
  ctx.fillStyle = tool === "eraser" ? "rgba(255,255,255,0.9)" : state.strokeColor;
 

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const mid = midpoint(points[i - 1], points[i]);
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, mid.x, mid.y);
  }
  ctx.stroke();
}

function beginStroke(tool, evt, source = "canvas") {
  state.activeStroke = true;
  state.strokeSource = source;
  points = [getCanvasPoint(evt)];
  scheduleStroke(tool);
}

function updateStroke(tool, evt) {
  points.push(getCanvasPoint(evt));
  scheduleStroke(tool);
}

function endStroke() {
  state.activeStroke = false;
  state.strokeSource = null;
  points = [];
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
}

canvas.addEventListener("pointerdown", (evt) => {
  evt.preventDefault();
  canvas.setPointerCapture(evt.pointerId);
  beginStroke(state.tool, evt, "canvas");
});

canvas.addEventListener("pointermove", (evt) => {
  if (!state.activeStroke) return;
  evt.preventDefault();
  updateStroke(state.tool, evt);
});

canvas.addEventListener("pointerup", () => {
  if (!state.activeStroke) return;
  endStroke();
});

canvas.addEventListener("pointerleave", () => {
  if (state.strokeSource === "canvas") {
    endStroke();
  }
});

function setCanvasCursor(tool) {
  const cursorMeta = {
    pencil: { src: "assets/pencil.png", size: 64, hotspotX: 12, hotspotY: 52 },
    eraser: { src: "assets/leaf.png", size: 54, hotspotX: 18, hotspotY: 18 },
  };

  const meta = cursorMeta[tool];
  if (!meta) {
    canvas.style.cursor = "crosshair";
    return;
  }

  if (cursorCache.has(tool)) {
    canvas.style.cursor = cursorCache.get(tool);
    return;
  }

  const img = new Image();
  img.src = meta.src;
  img.onload = () => {
    const scale = meta.size / Math.max(img.width, img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    offscreen.getContext("2d").drawImage(img, 0, 0, width, height);
    const angle = 25 * Math.PI / 180;
    const cursorURL = offscreen.toDataURL("image/png");
    const hotspotX = Math.min(width - 7.3, Math.max(0, meta.hotspotX));
    const hotspotY = Math.min(height - 0, Math.max(0, meta.hotspotY));
    const cursorValue = `url(${cursorURL}) ${hotspotX} ${hotspotY}, crosshair`;
    cursorCache.set(tool, cursorValue);
    canvas.style.cursor = cursorValue;
  };
  img.onerror = () => {
    canvas.style.cursor = "crosshair";
  };
}

function setActiveTool(toolKey) {
  state.tool = toolKey;
  toolButtons.forEach((btn) => {
    const isActive = btn.dataset.tool === toolKey;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  setCanvasCursor(toolKey);
}

function wireToolButtons() {
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTool(btn.dataset.tool);
    });
  });
}

function updateColorValue(hex) {
  const normalized = hex.toUpperCase();
  colorValue.textContent = normalized;
}

colorPicker.addEventListener("input", (evt) => {
  state.strokeColor = evt.target.value;
  updateColorValue(evt.target.value);
});

sizeSlider.addEventListener("input", (evt) => {
  state.strokeSize = Number(evt.target.value);
  sizeValue.textContent = `${state.strokeSize} px`;
});

clearButton.addEventListener("click", () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before clearing
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(state.dpr, state.dpr); // Reapply scaling
});


function downloadPNG() {
  const stackRect = pageStack.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.round(stackRect.width * state.dpr);
  exportCanvas.height = Math.round(stackRect.height * state.dpr);
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.scale(state.dpr, state.dpr);

  exportCtx.fillStyle = "#ffffff";
  exportCtx.fillRect(0, 0, stackRect.width, stackRect.height);

  const offsetX = canvasRect.left - stackRect.left;
  const offsetY = canvasRect.top - stackRect.top;
  exportCtx.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    offsetX,
    offsetY,
    canvasRect.width,
    canvasRect.height
  );

  const link = document.createElement("a");
  link.download = `sketch-${Date.now()}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

saveButton.addEventListener("click", downloadPNG);

function syncUI() {
  updateColorValue(state.strokeColor);
  sizeValue.textContent = `${state.strokeSize} px`;
}

function initControlStripDrag() {
  if (!stripHandle || !controlStrip || !canvasStage) return;
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  stripHandle.addEventListener("pointerdown", (evt) => {
    evt.preventDefault();
    pointerId = evt.pointerId;
    const stripRect = controlStrip.getBoundingClientRect();
    offsetX = evt.clientX - stripRect.left;
    offsetY = evt.clientY - stripRect.top;
    stripHandle.setPointerCapture(pointerId);
    controlStrip.classList.add("dragging");
  });

  stripHandle.addEventListener("pointermove", (evt) => {
    if (evt.pointerId !== pointerId) return;
    evt.preventDefault();
    const stageRect = canvasStage.getBoundingClientRect();
    const maxX = stageRect.width - controlStrip.offsetWidth;
    const maxY = stageRect.height - controlStrip.offsetHeight;
    let left = evt.clientX - stageRect.left - offsetX;
    let top = evt.clientY - stageRect.top - offsetY;
    left = clamp(left, 0, maxX);
    top = clamp(top, 0, maxY);
    controlStrip.style.left = `${left}px`;
    controlStrip.style.top = `${top}px`;
    controlStrip.style.right = "auto";
    controlStrip.style.bottom = "auto";
    controlStrip.style.transform = "none";
  });

  const endDrag = (evt) => {
    if (evt.pointerId !== pointerId) return;
    stripHandle.releasePointerCapture(pointerId);
    pointerId = null;
    controlStrip.classList.remove("dragging");
  };

  stripHandle.addEventListener("pointerup", endDrag);
  stripHandle.addEventListener("pointercancel", endDrag);
}

function initMenuToggle() {
  if (!menuToggle || !menuDropdown) return;
  let isOpen = false;

  const setOpen = (open) => {
    isOpen = open;
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuDropdown.classList.toggle("is-open", open);
    menuDropdown.setAttribute("aria-hidden", open ? "false" : "true");
  };

  menuToggle.addEventListener("click", (evt) => {
    evt.stopPropagation();
    setOpen(!isOpen);
  });

  document.addEventListener("click", (evt) => {
    if (!isOpen) return;
    if (!menuDropdown.contains(evt.target) && !menuToggle.contains(evt.target)) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && isOpen) {
      setOpen(false);
    }
  });

  [clearButton, saveButton].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", () => setOpen(false));
  });
}

function init() {
  resizeCanvas();
  wireToolButtons();
  syncUI();
  setActiveTool(state.tool);
  initControlStripDrag();
  initMenuToggle();
  window.addEventListener("resize", () => {
    state.dpr = window.devicePixelRatio || 1;
    resizeCanvas();
  });
}

document.addEventListener("DOMContentLoaded", init);

