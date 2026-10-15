# ◈ Abstract Art Generator — WebGPU + WASM

Tool tự động sinh ảnh abstract nghệ thuật, chạy 100% local, không cần build.

## Chạy thử (2 cách)

**Cách 1 — mở trực tiếp:** double-click `index.html` (chế độ này WASM + WebGPU có thể
bị chặn bởi `file://`, tool tự rơi về CPU + JS hash — vẫn chạy).

**Cách 2 — đúng chuẩn (khuyên dùng):**
```bash
cd /Users/thienlam/Desktop/abstract-art-generator
npx serve .        # hoặc: python3 -m http.server 8080
# mở http://localhost:3000 (serve) hoặc http://localhost:8080
```
WebGPU yêu cầu **Chrome/Edge ≥ 113** (hoặc Safari 26+), bật qua `chrome://gpu` nếu cần.

## Tính năng

- **7 công thức** (`src/formulas.md` giải thích toán): Marble Flow, Nebula, Kaleidoscope,
  Topography, Silk Strands, Phong cảnh núi + mặt trời, Bauhaus Arcs.
- **Tăng tốc:** WebGPU/WGSL render song song từng pixel (2048px vài chục ms);
  CPU fallback dùng `public/wasm/noise.wasm` (`hash2i`, nguồn Rust ở `src/wasm-src/noise.rs`)
  cho grain deterministic — nhanh hơn `Math.random()` trên ImageData lớn.
- **Tùy chỉnh:** 8 palette mẫu + 5 ô màu custom; sliders chi tiết / warp / glow /
  grain / biến thể; vị trí mặt trời (mode phong cảnh); seed + 🎲 ngẫu nhiên.
- **Tỉ lệ & xuất ảnh:** preset 1:1, 4:5, 3:2, 16:9, 9:16, 21:9 + W×H custom;
  export cạnh dài 1536 / 2048 / 3072px, nút ⬇ PNG / JPG. Preview luôn giữ đúng aspect.

## Cấu trúc

```
index.html  styles.css
src/
  main.js               # UI + điều phối render + export
  generator-webgpu.js   # pipeline WebGPU + toàn bộ shader WGSL
  generator-2d.js       # CPU fallback (port JS của cùng công thức)
  palettes.js           # 8 palette + hàm map màu
  wasm-noise.js         # loader noise.wasm + fallback JS
  formulas.md           # ghi chú công thức toán
  wasm-src/noise.rs     # nguồn Rust của module WASM
public/wasm/noise.wasm  # binary build sẵn, chạy offline
```

## Build lại WASM (tùy chọn)

```bash
rustup target add wasm32-unknown-unknown
rustc --crate-type=cdylib --target wasm32-unknown-unknown \
  src/wasm-src/noise.rs -o public/wasm/noise.wasm
```
