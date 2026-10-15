// 7 phong cách trừu tượng + màu/params mặc định cho từng phong cách.
export const STYLES = [
  {
    name: "Hình học — Geometric",
    artists: "Kandinsky · Malevich · Mondrian",
    example: "Broadway Boogie Woogie — Piet Mondrian",
    desc: "Mảng màu phẳng + đường thẳng, lưới ô vuông tương phản cao.",
    colors: ["#f2ede4", "#d62828", "#1d4ed8", "#f4d35e", "#111111"],
    params: { scale: 3.0, warp: 0.4, glow: 0.15, grain: 0.04, variant: 0.5 },
  },
  {
    name: "Hành động — Action Painting",
    artists: "Pollock · de Kooning · Kline",
    example: "No. 5, 1948 — Jackson Pollock",
    desc: "Vệt sơn hỗn loạn, tia bắn và nhỏ giọt tự phát trên nền sáng.",
    colors: ["#e8e2d5", "#ffffff", "#d9a441", "#c1272d", "#141414"],
    params: { scale: 3.4, warp: 1.6, glow: 0.7, grain: 0.07, variant: 0.5 },
  },
  {
    name: "Trường màu — Color Field",
    artists: "Rothko · Newman · Still",
    example: "Cam & Vàng — Mark Rothko",
    desc: "Hai khối màu mềm xếp chồng, chuyển êm, thiền định.",
    colors: ["#450a0a", "#7f1d1d", "#ea580c", "#fbbf24", "#fef3c7"],
    params: { scale: 2.4, warp: 0.5, glow: 0.8, grain: 0.05, variant: 0.5 },
  },
  {
    name: "Cạnh sắc — Hard-edge",
    artists: "Benjamin · Lundeberg · Feitelson",
    example: "Phong cảnh vàng — Karl Benjamin",
    desc: "Mảng phẳng ranh giới sắc, tương phản vàng–xanh–hồng.",
    colors: ["#ffd60a", "#3a86ff", "#ff006e", "#06d6a0", "#1a1a2e"],
    params: { scale: 2.6, warp: 0.3, glow: 0.2, grain: 0.03, variant: 0.45 },
  },
  {
    name: "Trữ tình — Lyrical",
    artists: "Wols · Schneider · Gorky",
    example: "It's All Over, The City — Wols",
    desc: "Vệt mực chảy tự do, loang mềm như dòng ý thức.",
    colors: ["#101014", "#3a3a40", "#6b7280", "#7c8ba1", "#e8e2d5"],
    params: { scale: 3.0, warp: 1.4, glow: 0.5, grain: 0.06, variant: 0.5 },
  },
  {
    name: "Hữu cơ — Organic",
    artists: "Miró · Moore · O'Keeffe",
    example: "Từ hồ nước — Georgia O'Keeffe",
    desc: "Hình tròn mềm như sỏi, vỏ sò, cánh hoa trong tự nhiên.",
    colors: ["#10201c", "#1a3c34", "#7fb069", "#ece3ce", "#ca6b4a"],
    params: { scale: 2.8, warp: 1.0, glow: 0.6, grain: 0.05, variant: 0.5 },
  },
  {
    name: "Thị giác — Op-art",
    artists: "Vasarely · Riley · Matos",
    example: "Cataract III — Bridget Riley",
    desc: "Sóng đen–trắng tạo ảo giác chuyển động, xoáy thị giác.",
    colors: ["#000000", "#3a3a3a", "#888888", "#e8e8e8", "#ffffff"],
    params: { scale: 3.2, warp: 1.0, glow: 0.9, grain: 0.02, variant: 0.5 },
  },
];

export function hexToRgb01(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Map t in [0,1] qua 5 màu — dùng chung cho CPU fallback (mirror của WGSL).
export function paletteMap(colors01, t) {
  const x = Math.min(0.99999, Math.max(0, t)) * (colors01.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = colors01[i], b = colors01[Math.min(colors01.length - 1, i + 1)];
  const s = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}
