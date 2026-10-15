// 8 palette mẫu, mỗi palette 5 màu (đủ cho gradient piecewise trong shader).
export const PALETTES = [
  { name: "Aurora — cực quang", colors: ["#0b1026", "#1b3a6b", "#2ec4b6", "#e9f5db", "#ff9f1c"] },
  { name: "Sunset Dunes — hoàng hôn", colors: ["#2b2d42", "#8d2f56", "#ef8354", "#f9c74f", "#fff3d6"] },
  { name: "Deep Ocean — biển sâu", colors: ["#03071e", "#0a4d68", "#088395", "#05bfdb", "#d9f4ff"] },
  { name: "Matcha Ink — mực trà", colors: ["#0d1b1e", "#1e3d34", "#4c8c72", "#d8c99b", "#f7f3e3"] },
  { name: "Neon Candy — neon", colors: ["#10002b", "#5a189a", "#ff4d8d", "#ffca3a", "#e0fbfc"] },
  { name: "Ember — than hồng", colors: ["#16090a", "#5c1a1b", "#d7263d", "#f46036", "#ffe66d"] },
  { name: "Porcelain — sứ pastel", colors: ["#2b2d5c", "#7b8fc4", "#b8c7e0", "#f2d5cf", "#fdf6ec"] },
  { name: "Mono Ink — đơn sắc", colors: ["#0a0a0b", "#2e2e33", "#6b6b76", "#c9c9d1", "#ffffff"] },
  { name: "Neon Veil — lụa neon", colors: ["#070718", "#b5179e", "#4cc9f0", "#ffd166", "#ff2fb3"] },
];

export function hexToRgb01(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function hexToRgb8(hex) {
  const [r, g, b] = hexToRgb01(hex);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Map t in [0,1] qua 5 màu — dùng chung cho CPU fallback (mirror của WGSL).
export function paletteMap(colors01, t) {
  const x = Math.min(0.99999, Math.max(0, t)) * (colors01.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = colors01[i], b = colors01[Math.min(colors01.length - 1, i + 1)];
  const s = f * f * (3 - 2 * f); // smoothstep nội suy mượt
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}
