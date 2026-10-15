// CPU fallback (Canvas2D + ImageData). Cùng công thức với shader nhưng rút gọn
// octave để preview nhanh; dùng WASM hash cho grain/stars (deterministic theo seed).
import { paletteMap } from "./palettes.js";
import { hash01 } from "./wasm-noise.js";

function makeNoise(seed) {
  const h = (x, y) => {
    const s = Math.sin((x + seed * 0.173) * 127.1 + (y + seed * 0.311) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (x, y, oct = 4) => {
    let v = 0, amp = 0.5, fx = x, fy = y;
    for (let i = 0; i < oct; i++) {
      v += amp * vn(fx, fy);
      fx = fx * 2.02 + 1.7; fy = fy * 2.02 + 9.2; amp *= 0.5;
    }
    return v;
  };
  return { h, vn, fbm };
}

// params giống WebGPU + onProgress(0..1). Trả về ms render.
export async function renderCPU(canvas, params, onProgress) {
  const t0 = performance.now();
  const { w, h, seed, scale, warp, glow, grain, mode, variant, sunx, suny, colors01 } = params;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không lấy được 2d context (canvas đã bị chiếm bởi WebGPU?).");
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const { fbm, h: nhash } = makeNoise(seed);
  const aspect = w / h;
  const segs = 4 + Math.floor(variant * 10);
  const oct = w * h > 2_000_000 ? 3 : 4; // ảnh export lớn → bớt octave cho đỡ lag

  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const px_ = u * aspect * scale + seed * 0.37;
      const py = v * scale + seed * 0.37;
      let t = 0.5, light = 0;

      if (mode === 0) {           // marble
        const qx = fbm(px_, py, oct), qy = fbm(px_ + 5.2, py + 1.3, oct);
        const rx = fbm(px_ + warp * qx + 1.7, py + warp * qy + 9.2, oct);
        const ry = fbm(px_ + warp * qx + 8.3, py + warp * qy + 2.8, oct);
        t = fbm(px_ + warp * rx, py + warp * ry, oct);
        const vein = Math.pow(1 - Math.abs(Math.sin((px_ * 2 + py * 3 + (rx + ry) * 6) * Math.PI)), 8);
        t = Math.min(1, Math.max(0, t * 0.85 + vein * 0.35 * (0.4 + glow)));
        light = vein * glow;
      } else if (mode === 1) {    // nebula
        const q = fbm(px_ * 1.1, py * 1.1, oct);
        const r = fbm(px_ * 1.3 + q * warp * 1.6 + seed, py * 1.3, oct);
        t = Math.min(1, Math.max(0, fbm(px_ + warp * r * 1.8, py, oct) * 1.25 - 0.12));
        const dx = u - 0.5, dy = v - 0.5;
        const core = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) * 1.6 * 1.4), 2) * glow;
        const cx = Math.floor(px_ * 22), cy = Math.floor(py * 22);
        const star = nhash(cx, cy) > 0.985 ? Math.max(0, 1 - Math.hypot(px_ * 22 - cx - 0.5, py * 22 - cy - 0.5) * 2) * 0.8 : 0;
        t = Math.min(1, t + core * 0.35); light = core + star * (0.6 + glow);
      } else if (mode === 2) {    // kaleido
        const cx = (u - 0.5) * 2, cy = (v - 0.5) * 2;
        const r = Math.hypot(cx, cy);
        let a = Math.atan2(cy, cx) / (Math.PI * 2) + 0.5;
        a = Math.abs(((a * segs) % 1) * 2 - 1);
        const qx = a * (2 + r * 5), qy = r * (2.5 + scale) - seed * 0.05;
        const wr = fbm(qx * 2, qy * 2, 3);
        t = (fbm(qx * scale * 0.7 + wr * warp * 2, qy * scale * 0.7, oct) * 1.6 + r * 0.7) % 1;
        if (t < 0) t += 1;
        light = Math.pow(1 - Math.abs(Math.sin(r * 18 - seed)), 6) * 0.5 * glow;
      } else if (mode === 3) {    // topo
        const hh = fbm(px_ * 1.4, py * 1.4, oct);
        const iso = Math.abs(((hh * 10) % 1 + 1) % 1 - 0.5) * 2;
        const line = 1 - Math.min(1, Math.max(0, iso / 0.12));
        t = Math.min(1, Math.max(0, hh * 1.1));
        light = line * 0.55 + (hh > 0.55 ? Math.min(1, (hh - 0.55) / 0.35) * glow : 0);
      } else if (mode === 4) {    // silk
        const a = fbm(px_, py * 2.2, oct) * Math.PI * 4;
        const s = Math.sin((px_ * 22 * Math.cos(a) + py * 22 * Math.sin(a)) + fbm(px_ * 3, py * 3, 3) * 9);
        const streak = 1 - Math.abs(s);
        t = Math.min(1, Math.max(0, fbm(px_ * 1.6 + warp * 0.7, py * 1.6, oct) * 0.7 + Math.pow(streak, 3) * 0.45));
        light = Math.pow(streak, 8) * glow;
      } else if (mode === 5) {    // landscape
        t = Math.min(1, v * 0.75 + fbm(px_ * 2, py * 2, oct) * 0.12);
        const sdx = (u - sunx) * aspect, sdy = (v - suny);
        const sd = Math.hypot(sdx, sdy);
        const sunM = sd < 0.02 ? 1 : sd < 0.16 ? 1 - (sd - 0.02) / 0.14 : 0;
        const halo = Math.pow(Math.max(0, 1 - sd * 1.8), 2) * glow;
        t = t * (1 - sunM * 0.85) + 0.92 * sunM * 0.85 + halo * 0.25 * (1 - sunM);
        for (let i = 0; i < 3; i++) {
          const base = 0.62 - i * 0.14 - variant * 0.12;
          const ridge = 1 - Math.abs(fbm(px_ * (2 + i) * 2, seed + i * 7, 3) * 2 - 1) * 2;
          const m = base - ridge * (0.10 + i * 0.05 + variant * 0.08);
          if (v < m) { t = Math.min(1, Math.max(0, m * 0.9 - i * 0.16)); }
        }
        light = sunM * (0.5 + glow) + halo * 0.6;
      } else if (mode === 6) {    // bauhaus
        const n = 3 + Math.floor(variant * 5);
        const gx = ((px_ * n * 0.55) % 1 + 1) % 1, gy = ((py * n * 0.55) % 1 + 1) % 1;
        const d = Math.hypot(gx - 0.5, gy - 0.5);
        const wave = Math.sin((px_ + py) * 4 + fbm(px_, py, 3) * 8) * 0.5 + 0.5;
        let raw = (d < 0.5 ? 0.6 : 0) + wave * 0.4 + fbm(px_ * 2, py * 2, 3) * 0.25;
        t = Math.floor(Math.min(0.999, Math.max(0, raw)) * 5) / 5 + 0.1;
        light = Math.abs(d - 0.32) < 0.06 ? glow * 0.7 : 0;
      } else {                    // neonveil — dải lụa neon + bokeh
        const folds = 4 + variant * 5;
        const flowN = fbm(px_ * 0.85 + seed * 0.13, py * 0.85, oct);
        const center = 0.5 + (flowN - 0.5) * 0.34 + 0.07 * Math.sin(u * 9 + seed * 0.7 + flowN * 5);
        const thick = (0.26 + (0.16 - 0.26) * variant) + 0.06 * fbm(px_ * 0.6, 3.7, 3);
        const d = Math.abs(v - center) / Math.max(thick, 0.05);
        const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
        let band = 1 - ss(0.12, 1.0, d);
        band *= 0.72 + 0.28 * ss(0, 0.08, u) * (1 - ss(0.92, 1.0, u));
        const qx = px_ * 1.25, qy = py * 2.4 + flowN * (1 + warp * 2);
        const wv = fbm(qx + warp * 0.7 + seed * 0.02, qy, oct);
        const layers = fbm(qx * 1.35 + wv * (1.5 + warp * 2) + seed * 0.03, qy * 1.35, oct);
        const ph = py * folds + wv * 9 + flowN * 6 + px_ * 0.9;
        const s = Math.sin(ph * Math.PI);
        const sharp = Math.pow(1 - Math.abs(s), 7);
        const soft = Math.pow(1 - Math.abs(s), 2);
        const tIn = Math.min(1, Math.max(0, layers * 1.2 + soft * 0.28 + (flowN - 0.5) * 0.35));
        t = (0.04 + layers * 0.08) * (1 - band) + tIn * band;
        const rim = ss(0.55, 1.0, d) * band;
        const bokeh = (sx, sy, thresh, rad) => {
          const cx = Math.floor(sx), cy = Math.floor(sy);
          if (nhash(cx, cy) < thresh) return 0;
          const ox = nhash(cx + 7, cy + 3) * 0.6 + 0.2, oy = nhash(cx + 1, cy + 9) * 0.6 + 0.2;
          const dd = Math.hypot(sx - cx - ox, sy - cy - oy);
          const r = rad * (0.4 + 0.6 * nhash(cx + 9, cy + 1));
          const m = Math.min(1, Math.max(0, (r - dd) / (r * 0.75)));
          return m * m * (0.35 + 0.65 * nhash(cx + 1, cy + 7));
        };
        const dust = bokeh(px_ * 5 + seed, py * 5, 0.90, 0.30) * 0.7
          + bokeh(px_ * 11 + 31, py * 11 + seed * 0.05, 0.94, 0.22) * 0.55;
        light = band * (sharp * 1.25 + soft * 0.4) * (0.35 + glow * 0.9)
          + rim * 0.35 * glow + dust * (1 - band * 0.55) * (0.35 + glow * 0.8);
      }

      const [cr, cg, cb] = paletteMap(colors01, t);
      const g = hash01(seed, x, y) - 0.5; // WASM hash
      const vgAmt = (() => { const d = Math.hypot(u - 0.5, v - 0.5); const k = Math.min(1, Math.max(0, (1.15 - d * 1.6) / 0.8)); return 0.82 + 0.18 * k; })();
      let R = (cr + light) + g * grain, G = (cg + light * 0.97) + g * grain, B = (cb + light * 0.92) + g * grain;
      R *= vgAmt; G *= vgAmt; B *= vgAmt;
      const o = (y * w + x) * 4;
      px[o] = Math.min(255, Math.max(0, R * 255)) | 0;
      px[o + 1] = Math.min(255, Math.max(0, G * 255)) | 0;
      px[o + 2] = Math.min(255, Math.max(0, B * 255)) | 0;
      px[o + 3] = 255;
    }
    if ((y & 63) === 63) { onProgress?.((y + 1) / h); await new Promise((r) => setTimeout(r, 0)); }
  }
  ctx.putImageData(img, 0, 0);
  onProgress?.(1);
  return performance.now() - t0;
}
