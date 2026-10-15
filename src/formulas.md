# Công thức sinh ảnh abstract — ghi chú nghiên cứu

Tool này dùng 7 công thức, tất cả chạy trên cùng một fullscreen-shader WebGPU
(`src/generator-webgpu.js`) + bản port CPU Canvas2D (`src/generator-2d.js`).

## Khối nền tảng chung

### 1. Value noise + fBm (Fractal Brownian Motion)
```glsl
hash = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)   // pseudo-random 0..1
valueNoise(p) = bilinear interpolate của hash tại 4 góc ô lưới (smoothstep)
fbm(p) = Σ amp * valueNoise(p * freq) , 5 octaves, amp *= 0.5, freq *= 2.02
```
Tham khảo: Inigo Quilez — "Fractal Brownian Motion", The Book of Shaders ch.13.

### 2. Domain warping (xoắn miền)
```glsl
q = fbm(p + seed)
r = fbm(p + k*q + offset)        // k = uWarp
t = fbm(p + k*r)                 // marble / nebula dùng t này để map màu
```
Tham khảo: IQ — "Domain Warping" (2017). `uWarp = 0` → vân thẳng, `uWarp ≈ 1–2` → vân đá/cẩm thạch.

### 3. Palette mapping 5 điểm
`t ∈ [0,1]` đi qua 5 màu `c0..c4`, nội suy smoothstep từng đoạn.
Mọi mode đều trả về một `t` rồi map — nên đổi palette là đổi toàn bộ mood ảnh.

## 7 công thức cụ thể

| # | Mode | Công thức |
|---|------|-----------|
| 0 | Marble Flow | `t = fbm(p*scale + warp*r)`; thêm sợi sáng `pow(1-abs(sin(...)))` tạo vân đá |
| 1 | Nebula | 2 lớp fbm warp ngược chiều + `stars = step(0.998, hash(floor(p*300)))` + glow trung tâm |
| 2 | Kaleidoscope | chuyển `uv → polar (r, θ)`, gấp góc `θ = abs(fract(θ/2π * N) * 2 - 1)`, N = 4 + variant*10, rồi fbm trên `(θ*R, r)` |
| 3 | Topography | `h = fbm(p*scale)`; đường đồng mức `iso = abs(fract(h*12)-0.5)` → line = smoothstep; tô màu theo độ cao |
| 4 | Silk Strands | field hướng `a = fbm(p)*π*4`; streak `s = sin((x*cos a + y*sin a)*40 + fbm*6)`; làm mờ anisotropic bằng fbm scale-y khác scale-x |
| 5 | Phong cảnh | SDF bầu trời gradient + mặt trời disc `d=length(uv-sun)` + 3 lớp núi `ridge = 1-abs(fbm)` theo từng dải y, sương mù theo chiều sâu |
| 6 | Bauhaus Arcs | lưới vòm `d = length(fract(p*N)-0.5)` + sóng sin dịch theo fbm, posterize 5 bậc để ra mảng màu phẳng |

## Tăng tốc

- **WebGPU (WGSL):** mỗi pixel là 1 invocation song song trên GPU → 2048px render vài chục ms.
  Uniform 128 bytes (`res, seed, scale, warp, glow, grain, mode, variant, sun, 5×vec4 màu`).
- **WebAssembly:** file `public/wasm/noise.wasm` export `hash2i(seed,x,y)->i32`
  (integer hash, không float). CPU fallback gọi WASM cho hạt grain + dither thay vì
  `Math.random()` — nhanh hơn ~2–5× trên vòng lặp ImageData lớn, và deterministic theo seed.
  Nguồn Rust xem `src/wasm-src/noise.rs`; bản `.wasm` được build sẵn để chạy offline.
- **CPU fallback:** cùng công thức nhưng value-noise JS + ImageData; preview render ở
  480–720px rồi upscale, export mới render full-res (có progress từng dòng quét).
