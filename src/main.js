import { STYLES, hexToRgb01 } from "./palettes.js";
import { gpuSupported, initGPU, renderWebGPU } from "./generator-webgpu.js";
import { renderCPU } from "./generator-2d.js";
import { initWasm } from "./wasm-noise.js";

const $ = (id) => document.getElementById(id);
let stage = $("stage");
const stageBox = $("stage-box");
const statusEl = $("status");
const gpuCanvas = document.createElement("canvas");
const cpuCanvas = document.createElement("canvas");
function blitToStage(src) {
  stage.width = src.width; stage.height = src.height;
  const ctx = stage.getContext("2d");
  ctx.drawImage(src, 0, 0);
}

const RATIOS = [
  { label: "1 : 1", w: 1, h: 1 },
  { label: "4 : 5", w: 4, h: 5 },
  { label: "3 : 2", w: 3, h: 2 },
  { label: "16 : 9", w: 16, h: 9 },
  { label: "9 : 16", w: 9, h: 16 },
  { label: "21 : 9", w: 21, h: 9 },
];
let activeRatio = 0;
let activeStyle = 0;
let gpuOK = false;
let wasmOK = false;
let rendering = false;

// ---- style cards + minh họa thumbnail ----
const stylesBox = $("styles");
const thumbCanvases = [];
STYLES.forEach((s, i) => {
  const b = document.createElement("button");
  b.className = "style-card" + (i === activeStyle ? " active" : "");
  b.innerHTML = `<canvas width="144" height="96"></canvas>
    <span class="style-name">${i + 1} · ${s.name}</span>
    <span class="style-artists">${s.artists}</span>`;
  b.onclick = () => selectStyle(i);
  stylesBox.appendChild(b);
  thumbCanvases.push(b.querySelector("canvas"));
});

function selectStyle(i) {
  activeStyle = i;
  [...stylesBox.children].forEach((el, j) => el.classList.toggle("active", j === i));
  const s = STYLES[i];
  $("style-info").innerHTML =
    `<h3>${i + 1} · ${s.name}</h3>
     <p class="si-artists">${s.artists}</p>
     <p>${s.desc}</p>
     <p class="si-ex">Gợi hứng: <em>${s.example}</em></p>`;
  schedulePreview();
}

const ratioBox = $("ratios");
RATIOS.forEach((r, i) => {
  const b = document.createElement("button");
  b.textContent = r.label;
  if (i === activeRatio) b.classList.add("active");
  b.onclick = () => {
    activeRatio = i;
    [...ratioBox.children].forEach((el, j) => el.classList.toggle("active", j === i));
    const base = 1600;
    const k = base / Math.max(r.w, r.h);
    $("cw").value = Math.round(r.w * k);
    $("ch").value = Math.round(r.h * k);
    layoutStage();
    schedulePreview();
  };
  ratioBox.appendChild(b);
});

function layoutStage() {
  const w = +$("cw").value || 1600, h = +$("ch").value || 1600;
  stageBox.style.aspectRatio = `${w} / ${h}`;
}
$("btn-apply-wh").onclick = () => { layoutStage(); schedulePreview(); };

function syncLabels() {
  $("seed-val").textContent = "#" + $("seed").value;
}
$("seed").addEventListener("input", () => { syncLabels(); schedulePreview(); });
$("btn-random").onclick = () => {
  $("seed").value = Math.floor(Math.random() * 99999);
  syncLabels(); schedulePreview();
};
syncLabels(); layoutStage();

// ---- params: màu + thông số khóa theo từng trường phái ----
function styleParams() {
  const s = STYLES[activeStyle];
  return {
    mode: activeStyle,
    colors01: s.colors.map(hexToRgb01),
    scale: s.params.scale, warp: s.params.warp,
    glow: s.params.glow, grain: s.params.grain, variant: s.params.variant,
  };
}
function collectParams(w, h) {
  const sp = styleParams();
  return {
    w, h,
    seed: (+$("seed").value || 0),
    ...sp,
    sunx: 0.68, suny: 0.38,
  };
}
function previewSize() {
  const w = +$("cw").value || 1600, h = +$("ch").value || 1600;
  const long = Math.max(w, h);
  const cap = 880;
  if (long <= cap) return { w, h };
  const k = cap / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function setStatus(s) { statusEl.textContent = s; }

// ---- render ----
let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => render(false), 120);
}

async function render(isExport) {
  if (rendering) return;
  rendering = true;
  try {
    let w, h;
    if (isExport) {
      const cw = +$("cw").value || 1600, ch = +$("ch").value || 1600;
      const target = +$("quality").value || 1;
      if (target === 1) { ({ w, h } = previewSize()); }
      else {
        const k = target / Math.max(cw, ch);
        w = Math.round(cw * k); h = Math.round(ch * k);
      }
    } else {
      ({ w, h } = previewSize());
    }
    const params = collectParams(w, h);
    const t0 = performance.now();
    let actualEngine = gpuOK ? "WebGPU" : "CPU";
    if (gpuOK) {
      try {
        await renderWebGPU(gpuCanvas, params);
        blitToStage(gpuCanvas);
      } catch (e) {
        setStatus("WebGPU lỗi, rơi về CPU: " + e.message);
        await renderCPU(cpuCanvas, params, (p) => setStatus(`CPU fallback ${(p * 100) | 0}%…`));
        blitToStage(cpuCanvas);
        actualEngine = "CPU";
      }
    } else {
      await renderCPU(cpuCanvas, params, (p) => {
        if (p < 1) setStatus(`CPU render ${(p * 100) | 0}%… (WASM ${wasmOK ? "bật" : "tắt"})`);
      });
      blitToStage(cpuCanvas);
    }
    const ms = performance.now() - t0;
    $("stat-time").textContent = `render: ${ms.toFixed(0)} ms · ${w}×${h} · ${actualEngine}`;
    if (!isExport) setStatus(`Xong preview ${w}×${h} trong ${ms.toFixed(0)} ms bằng ${actualEngine}.`);
    return { w, h, ms };
  } finally {
    rendering = false;
  }
}

$("btn-generate").onclick = () => render(false);

async function download(kind) {
  setStatus("Đang render bản export…");
  const info = await render(true);
  if (!info) return;
  const a = document.createElement("a");
  const ts = Date.now();
  if (kind === "jpg") {
    const c = document.createElement("canvas");
    c.width = stage.width; c.height = stage.height;
    const cx = c.getContext("2d");
    cx.fillStyle = "#000"; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(stage, 0, 0);
    a.href = c.toDataURL("image/jpeg", 0.92);
    a.download = `abstract-${ts}.jpg`;
  } else {
    a.href = stage.toDataURL("image/png");
    a.download = `abstract-${ts}.png`;
  }
  a.click();
  setStatus(`Đã xuất ${info.w}×${info.h} (${kind.toUpperCase()}).`);
  schedulePreview();
}
$("btn-png").onclick = () => download("png");
$("btn-jpg").onclick = () => download("jpg");

// Render thumbnail minh họa cho từng card (seed cố định, res nhỏ)
async function renderThumbs() {
  for (let i = 0; i < STYLES.length; i++) {
    try {
      const s = STYLES[i];
      await renderCPU(thumbCanvases[i], {
        w: 144, h: 96, seed: 7,
        mode: i,
        colors01: s.colors.map(hexToRgb01),
        scale: s.params.scale, warp: s.params.warp,
        glow: s.params.glow, grain: 0, variant: s.params.variant,
        sunx: 0.68, suny: 0.38,
      });
    } catch { /* bỏ qua, card vẫn hiện tên */ }
  }
}

// ---- khởi động ----
(async () => {
  const bG = $("badge-gpu"), bW = $("badge-wasm");
  if (gpuSupported()) {
    try { await initGPU(); gpuOK = true; bG.textContent = "WebGPU: sẵn sàng"; bG.classList.add("ok"); }
    catch { bG.textContent = "WebGPU: không khả dụng"; bG.classList.add("no"); }
  } else { bG.textContent = "WebGPU: không hỗ trợ"; bG.classList.add("no"); }

  wasmOK = await initWasm((ok) => {
    bW.textContent = ok ? "WASM: sẵn sàng" : "WASM: fallback JS";
    bW.classList.add(ok ? "ok" : "no");
  });

  selectStyle(0);
  setStatus(gpuOK ? "WebGPU sẵn sàng — bấm Generate." : "Dùng CPU fallback — bấm Generate.");
  render(false);
  renderThumbs();
})();
