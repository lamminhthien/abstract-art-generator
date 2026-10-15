import { PALETTES, hexToRgb01 } from "./palettes.js";
import { gpuSupported, initGPU, renderWebGPU } from "./generator-webgpu.js";
import { renderCPU } from "./generator-2d.js";
import { initWasm } from "./wasm-noise.js";

const $ = (id) => document.getElementById(id);
let stage = $("stage");
const stageBox = $("stage-box");
const statusEl = $("status");
// Canvas hiển thị luôn giữ context 2d. WebGPU/CPU render ra offscreen
// rồi blit vào — vì 1 <canvas> chỉ giữ được 1 loại context duy nhất
// (đổi webgpu <-> 2d trên cùng canvas sẽ làm getContext() trả về null).
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

let gpuOK = false;
let wasmOK = false;
let rendering = false;

// ---- dựng UI ----
const palSel = $("palette");
PALETTES.forEach((p, i) => {
  const o = document.createElement("option");
  o.value = i; o.textContent = p.name;
  palSel.appendChild(o);
});

const colorBox = $("custom-colors");
let colorInputs = [];
function setColors(hexes) {
  colorBox.innerHTML = "";
  colorInputs = hexes.map((hex, i) => {
    const lab = document.createElement("label");
    lab.innerHTML = `C${i + 1}<input type="color" value="${hex}" />`;
    const inp = lab.querySelector("input");
    inp.addEventListener("input", () => schedulePreview());
    colorBox.appendChild(lab);
    return inp;
  });
}
setColors(PALETTES[0].colors);
palSel.addEventListener("change", () => {
  setColors(PALETTES[+palSel.value].colors);
  schedulePreview();
});

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

const sliderIds = ["scale", "warp", "glow", "grain", "variant", "sunx", "suny"];
function paintRange(el) {
  const min = +el.min, max = +el.max, v = +el.value;
  const p = max > min ? ((v - min) / (max - min)) * 100 : 50;
  el.style.setProperty("--p", p.toFixed(1) + "%");
}
function syncLabels() {
  for (const id of sliderIds) {
    const el = $("v-" + id);
    if (el) el.textContent = $("" + id).value;
    const sl = $("" + id);
    if (sl) paintRange(sl);
  }
  $("seed-val").textContent = "#" + $("seed").value;
  $("sun-opts").classList.toggle("hidden", $("mode").value !== "5");
}
for (const id of sliderIds) $("" + id).addEventListener("input", () => { syncLabels(); schedulePreview(); });
$("mode").addEventListener("change", () => {
  if ($("mode").value === "7") {
    palSel.value = String(PALETTES.length - 1); // Neon Veil palette
    setColors(PALETTES[PALETTES.length - 1].colors);
  }
  syncLabels(); schedulePreview();
});
$("seed").addEventListener("input", () => { syncLabels(); schedulePreview(); });
$("engine").addEventListener("change", () => schedulePreview());
$("btn-random").onclick = () => {
  $("seed").value = Math.floor(Math.random() * 99999);
  syncLabels(); schedulePreview();
};

// ---- random tinh chỉnh + random màu ----
function randStep(min, max, step) {
  const v = min + Math.random() * (max - min);
  const q = Math.round(v / step) * step;
  return +Math.min(max, Math.max(min, q)).toFixed(4);
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Bộ 5 màu ngẫu nhiên nhưng vẫn hài hòa: xoay hue theo golden-ratio + biến thiên S/L.
function randomHarmoniousPalette() {
  const base = Math.random() * 360;
  const gold = 137.508;
  const dark = Math.random() < 0.35;
  return Array.from({ length: 5 }, (_, i) => {
    const h = base + i * gold + (Math.random() - 0.5) * 24;
    const s = 0.35 + Math.random() * 0.55;
    const l = dark ? 0.08 + Math.random() * 0.75 : 0.15 + (i / 4) * 0.6 + (Math.random() - 0.5) * 0.12;
    return hslToHex(h, s, Math.min(0.92, Math.max(0.05, l)));
  });
}

$("btn-random-tune").onclick = () => {
  for (const id of ["scale", "warp", "glow", "grain", "variant"]) {
    const el = $(id);
    $(id).value = randStep(+el.min, +el.max, +el.step);
  }
  syncLabels(); schedulePreview();
};
$("btn-random-colors").onclick = () => {
  setColors(randomHarmoniousPalette());
  schedulePreview();
};
syncLabels(); layoutStage();

// ---- params ----
function collectParams(w, h) {
  return {
    w, h,
    seed: (+$("seed").value || 0),
    scale: +$("scale").value, warp: +$("warp").value,
    glow: +$("glow").value, grain: +$("grain").value,
    mode: +$("mode").value, variant: +$("variant").value,
    sunx: +$("sunx").value, suny: +$("suny").value,
    colors01: colorInputs.map((i) => hexToRgb01(i.value)),
  };
}
function previewSize() {
  const w = +$("cw").value || 1600, h = +$("ch").value || 1600;
  const long = Math.max(w, h);
  const cap = 880; // preview WebGPU vẫn rẻ, CPU thì nhẹ
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
    const want = $("engine").value;
    const useGPU = want === "webgpu" ? true : want === "cpu" ? false : gpuOK;

    const t0 = performance.now();
    let actualEngine = useGPU ? "WebGPU" : "CPU";
    if (useGPU) {
      try {
        await renderWebGPU(gpuCanvas, params);
        blitToStage(gpuCanvas);
      } catch (e) {
        if (want === "webgpu") throw e;
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
  schedulePreview(); // vẽ lại preview nhỏ cho nhẹ
}
$("btn-png").onclick = () => download("png");
$("btn-jpg").onclick = () => download("jpg");

// ---- khởi động: check WebGPU + WASM song song ----
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

  setStatus(gpuOK ? "WebGPU sẵn sàng — bấm Generate." : "Dùng CPU fallback — bấm Generate.");
  render(false);
})();
