// CPU fallback (Canvas2D + ImageData) — mirror 7 công thức trừu tượng.
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

// params giống WebGPU + onProgress(0..1).
export async function renderCPU(canvas, params, onProgress) {
  const t0 = performance.now();
  const { w, h, seed, scale, warp, glow, grain, mode, variant, colors01 } = params;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không lấy được 2d context (canvas đã bị chiếm bởi WebGPU?).");
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const { fbm, h: nhash } = makeNoise(seed);
  const aspect = w / h;
  const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  const oct = w * h > 2_000_000 ? 3 : 4;
  const bokeh = (sx, sy, thresh, rad) => {
    const cx = Math.floor(sx), cy = Math.floor(sy);
    if (nhash(cx, cy) < thresh) return 0;
    const ox = nhash(cx + 7, cy + 3) * 0.6 + 0.2, oy = nhash(cx + 1, cy + 9) * 0.6 + 0.2;
    const dd = Math.hypot(sx - cx - ox, sy - cy - oy);
    const r = rad * (0.4 + 0.6 * nhash(cx + 9, cy + 1));
    const m = Math.min(1, Math.max(0, (r - dd) / (r * 0.75)));
    return m * m * (0.35 + 0.65 * nhash(cx + 1, cy + 7));
  };

  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const px_ = u * aspect * scale + seed * 0.37;
      const py = v * scale + seed * 0.37;
      let t = 0.5, light = 0;

      if (mode === 0) {           // hình học
        const cols = 4 + Math.floor(variant * 3), rows = 4 + Math.floor((1 - variant) * 3);
        const gx = u * cols, gy = v * rows;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = gx - ix, fy = gy - iy;
        const hh = nhash(ix * 1.7 + seed, iy);
        const lw = 0.055;
        const line = (fx < lw || fx > 1 - lw || fy < lw || fy > 1 - lw) ? 1 : 0;
        t = line ? 1.0 : hh * 0.78;
      } else if (mode === 1) {    // hành động
        const chaos = fbm(px_ * 2 + fbm(px_ * 3, py * 3, 3) * warp * 2, py * 2, oct);
        const s = 1 - Math.abs(Math.sin((chaos * 14 + fbm(px_ * 5, py * 5, 3) * 8) * Math.PI));
        const thin = Math.pow(s, 24), med = Math.pow(s, 6);
        const splat = bokeh(px_ * 9 + seed * 0.05, py * 9, 0.93, 0.28);
        t = Math.min(1, Math.max(0, chaos * 0.6 + med * 0.45 + thin * 0.5 + splat * 0.6));
        light = splat * 0.3 * (0.5 + glow) + thin * 0.5 * glow;
      } else if (mode === 2) {    // trường màu
        const e = 0.08 + fbm(px_ * 1.5, seed, 3) * 0.05;
        const b1 = ss(0.12 - e, 0.12 + e, v) * (1 - ss(0.48 - e, 0.48 + e, v));
        const b2 = ss(0.55 - e, 0.55 + e, v) * (1 - ss(0.88 - e, 0.88 + e, v));
        const tex = fbm(px_ * 3, py * 3, oct) * 0.25;
        t = 0.15 + tex * 0.2;
        t = t * (1 - b1 * 0.9) + (0.55 + tex) * b1 * 0.9;
        t = t * (1 - b2 * 0.9) + (0.85 + tex * 0.5) * b2 * 0.9;
        light = (b1 * (1 - b1) + b2 * (1 - b2)) * 2 * 0.35 * glow;
      } else if (mode === 3) {    // cạnh sắc
        const d1 = u * 1.2 - v * 0.6 + (fbm(seed, seed * 0.7, 3) - 0.5) * 0.6;
        const d2 = Math.hypot(u - 0.68, v - 0.38) - (0.26 + variant * 0.15);
        const d3 = v - (0.55 + (fbm(px_ * 2, seed, 3) - 0.5) * 0.3);
        t = 0.1;
        if (d1 > 0.1) t = 0.35;
        if (d3 > 0) t = 0.6;
        if (d2 < 0) t = 0.88;
      } else if (mode === 4) {    // trữ tình
        const qx = fbm(px_ * 1.2, py * 1.2, oct), qy = fbm(px_ * 1.2 + 7.3, py * 1.2 + 2.9, oct);
        const rx = fbm(px_ * 1.5 + qx * warp * 1.5 + 2.1, py * 1.5 + 2.1, oct);
        const wash = fbm(px_ * 1.6 + rx * 2, py * 1.6 + rx, oct);
        const s = 1 - Math.abs(Math.sin((px_ * 3 + py * 4 + rx * 8) * Math.PI));
        const ink = Math.pow(s, 5) * ss(0.3, 0.7, wash);
        t = Math.min(1, Math.max(0, wash * 0.9 + ink * 0.6));
        light = ink * 0.5 * glow;
      } else if (mode === 5) {    // hữu cơ
        let m = 0;
        for (let i = 0; i < 5; i++) {
          const cx = nhash(i * 3.1, seed) * 0.7 + 0.15, cy = nhash(seed, i * 7.7) * 0.7 + 0.15;
          const dx = (u - cx) * aspect, dy = v - cy;
          const rad = 0.16 + 0.10 * nhash(i, i * 2 + seed);
          m += rad * rad / (dx * dx + dy * dy + 0.001);
        }
        const body = ss(1.0, 1.6, m);
        const edge = ss(0.7, 1.2, m) - body;
        t = Math.min(1, Math.max(0, body * 0.75 + fbm(px_ * 2.5, py * 2.5, 3) * 0.35 + edge * 0.3));
        light = edge * 0.6 * glow + body * 0.1;
      } else {                    // thị giác op-art
        const dx = (u - 0.5) * aspect, dy = v - 0.5;
        const r = Math.hypot(dx, dy) * 2;
        const wv = fbm(px_ * 2, py * 2, oct) * 2;
        const rings = Math.sin((r * 24 - wv * 6 + variant * 8) * Math.PI);
        const grid = Math.sin((u * 60 + wv * 10) * Math.PI) * Math.sin((v * 60 - wv * 8) * Math.PI);
        const vv = rings * 0.65 + grid * 0.35;
        t = ss(-0.25, 0.25, vv);
        light = Math.pow(1 - Math.abs(vv), 8) * glow;
      }

      const [cr, cg, cb] = paletteMap(colors01, t);
      const g = hash01(seed, x, y) - 0.5;
      const d = Math.hypot(u - 0.5, v - 0.5);
      const vgAmt = 0.82 + 0.18 * Math.min(1, Math.max(0, (1.15 - d * 1.6) / 0.8));
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
