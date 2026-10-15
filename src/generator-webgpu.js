// Renderer WebGPU: 1 fullscreen triangle + fragment shader chứa cả 8 công thức.
let device = null;
let pipeline = null;
let uniformBuf = null;

const WGSL = /* wgsl */ `
struct U {
  res : vec2f,
  seed : f32,
  scale : f32,
  warp : f32,
  glow : f32,
  grain : f32,
  mode : f32,
  variant : f32,
  sunX : f32,
  sunY : f32,
  pad : f32,
  cols : array<vec4f, 5>,
};
@group(0) @binding(0) var<uniform> u : U;

fn hash21(p : vec2f) -> f32 {
  var h = dot(p + vec2(u.seed * 0.173, u.seed * 0.311), vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}
fn vnoise(p : vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let a = hash21(i); let b = hash21(i + vec2(1.0, 0.0));
  let c = hash21(i + vec2(0.0, 1.0)); let d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
fn fbm(p : vec2f) -> f32 {
  var v = 0.0; var a = 0.5;
  var q = p;
  for (var i = 0; i < 5; i++) { v += a * vnoise(q); q = q * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
fn pal(t : f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 4.0;
  let i = min(3, i32(floor(x)));
  let f = fract(x); let s = f * f * (3.0 - 2.0 * f);
  return mix(u.cols[i].rgb, u.cols[i + 1].rgb, s);
}

// --- từng công thức trả về t (0..1) + lượng sáng riêng ---
fn marble(p : vec2f, uv : vec2f) -> vec2f {
  let q = vec2(fbm(p + vec2(0.0, 0.0)), fbm(p + vec2(5.2, 1.3)));
  let r = vec2(fbm(p + u.warp * q + vec2(1.7, 9.2)), fbm(p + u.warp * q + vec2(8.3, 2.8)));
  var t = fbm(p + u.warp * r);
  let vein = pow(1.0 - abs(sin((p.x * 2.0 + p.y * 3.0 + (r.x + r.y) * 6.0) * 3.14159)), 8.0);
  t = clamp(t * 0.85 + vein * 0.35 * (0.4 + u.glow), 0.0, 1.0);
  return vec2(t, vein * u.glow);
}
fn nebula(p : vec2f, uv : vec2f) -> vec2f {
  let q = fbm(p * 1.1);
  let r = fbm(p * 1.3 + vec2(q * u.warp * 1.6 + u.seed, 0.0));
  var t = clamp(fbm(p + u.warp * r * 1.8) * 1.25 - 0.12, 0.0, 1.0);
  let d = length(uv - vec2(0.5, 0.5));
  let core = pow(max(0.0, 1.0 - d * 1.6), 2.0) * u.glow;
  let cell = floor(p * 90.0);
  let star = step(0.992, hash21(cell)) * smoothstep(0.35, 0.0, length(fract(p * 90.0) - 0.5)) * smoothstep(0.6, 0.2, t);
  return vec2(clamp(t + core * 0.35, 0.0, 1.0), core + star * (0.6 + u.glow));
}
fn kaleido(p : vec2f, uv : vec2f) -> vec2f {
  let c = uv - vec2(0.5, 0.5);
  let r = length(c) * 2.0;
  var a = atan2(c.y, c.x) / 6.2831853 + 0.5;
  let segs = 4.0 + floor(u.variant * 10.0);
  a = abs(fract(a * segs) * 2.0 - 1.0);
  let q = vec2(a * (2.0 + r * 5.0), r * (2.5 + u.scale) - u.seed * 0.05);
  let w = fbm(q * 2.0 + u.warp);
  let t = fract(fbm(q * u.scale * 0.7 + w * u.warp * 2.0) * 1.6 + r * 0.7);
  let ring = pow(1.0 - abs(sin(r * 18.0 - u.seed)), 6.0) * 0.5;
  return vec2(t, ring * u.glow + (1.0 - smoothstep(0.0, 1.05, r)) * 0.08 * u.glow);
}
fn topo(p : vec2f, uv : vec2f) -> vec2f {
  let h = fbm(p * 1.4);
  let iso = abs(fract(h * 10.0) - 0.5) * 2.0;
  let line = 1.0 - smoothstep(0.0, 0.12, iso);
  let peak = smoothstep(0.55, 0.9, h) * u.glow;
  return vec2(clamp(h * 1.1, 0.0, 1.0), line * 0.55 + peak);
}
fn silk(p : vec2f, uv : vec2f) -> vec2f {
  let a = fbm(p * vec2(1.0, 2.2)) * 12.56;
  let dir = vec2(cos(a), sin(a));
  let s = sin(dot(p * 22.0, dir) + fbm(p * 3.0) * 9.0);
  let streak = 1.0 - abs(s);
  let t = clamp(fbm(p * 1.6 + u.warp * 0.7) * 0.7 + pow(streak, 3.0) * 0.45, 0.0, 1.0);
  return vec2(t, pow(streak, 8.0) * u.glow);
}
fn landscape(p : vec2f, uv : vec2f) -> vec2f {
  let skyT = clamp(uv.y, 0.0, 1.0);
  var t = skyT * 0.75 + fbm(p * 2.0) * 0.12;
  // mặt trời
  let sd = length((uv - vec2f(u.sunX, u.sunY)) * vec2(u.res.x / u.res.y, 1.0));
  let sun = smoothstep(0.16, 0.02, sd);
  let halo = pow(max(0.0, 1.0 - sd * 1.8), 2.0) * u.glow;
  t = mix(t, 0.92, sun * 0.85 + halo * 0.25);
  // 3 lớp núi ridge
  var depth = 0.0;
  for (var i = 0; i < 3; i++) {
    let fi = f32(i);
    let base = 0.62 - fi * 0.14 - u.variant * 0.12;
    let ridge = 1.0 - abs(fbm(vec2(p.x * (2.0 + fi), u.seed + fi * 7.0)) * 2.0 - 1.0) * 2.0;
    let m = base - ridge * (0.10 + fi * 0.05 + u.variant * 0.08);
    if (uv.y < m) { t = clamp(m * 0.9 - fi * 0.16, 0.0, 1.0); depth = fi; }
  }
  let fog = smoothstep(0.0, 0.6, uv.y) * 0.12;
  return vec2(clamp(t + fog * (2.0 - depth) * 0.2, 0.0, 1.0), sun * (0.5 + u.glow) + halo * 0.6);
}
fn bauhaus(p : vec2f, uv : vec2f) -> vec2f {
  let n = 3.0 + floor(u.variant * 5.0);
  let g = fract(p * n * 0.55);
  let d = length(g - vec2(0.5));
  let wave = sin((p.x + p.y) * 4.0 + fbm(p) * 8.0) * 0.5 + 0.5;
  var t = (smoothstep(0.5, 0.48, d) * 0.6 + wave * 0.4 + fbm(p * 2.0) * 0.25);
  t = floor(clamp(t, 0.0, 0.999) * 5.0) / 5.0 + 0.1; // posterize phẳng
  return vec2(t, smoothstep(0.06, 0.0, abs(d - 0.32)) * u.glow * 0.7);
}
fn bokeh(pp : vec2f, thresh : f32, rad : f32) -> f32 {
  let cell = floor(pp);
  let fr = fract(pp);
  let h = hash21(cell * 1.37 + vec2(3.1, 7.7));
  if (h < thresh) { return 0.0; }
  let c = vec2(hash21(cell + 7.7), hash21(cell + 3.1)) * 0.6 + vec2(0.2, 0.2);
  let dd = length(fr - c);
  let r = rad * (0.4 + 0.6 * hash21(cell + 9.1));
  let m = smoothstep(r, r * 0.25, dd);
  return m * (0.35 + 0.65 * hash21(cell + 1.7));
}
fn neonveil(p : vec2f, uv : vec2f) -> vec2f {
  // Dải lụa neon nằm ngang giữa khung, nền tối + hạt bokeh.
  let folds = mix(4.0, 9.0, u.variant);
  let flowN = fbm(vec2(p.x * 0.85 + u.seed * 0.13, p.y * 0.85));
  let center = 0.5 + (flowN - 0.5) * 0.34 + 0.07 * sin(uv.x * 9.0 + u.seed * 0.7 + flowN * 5.0);
  let thick = mix(0.26, 0.16, u.variant) + 0.06 * fbm(vec2(p.x * 0.6, 3.7));
  let d = abs(uv.y - center) / max(thick, 0.05);
  var band = smoothstep(1.0, 0.12, d);
  band *= 0.72 + 0.28 * smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
  let q = vec2(p.x * 1.25, p.y * 2.4 + flowN * (1.0 + u.warp * 2.0));
  let w = fbm(q + u.warp * 0.7 + u.seed * 0.02);
  let layers = fbm(q * 1.35 + w * (1.5 + u.warp * 2.0) + vec2(u.seed * 0.03, 0.0));
  let ph = p.y * folds + w * 9.0 + flowN * 6.0 + p.x * 0.9;
  let s = sin(ph * 3.14159);
  let sharp = pow(1.0 - abs(s), 7.0);
  let soft = pow(1.0 - abs(s), 2.0);
  let tIn = clamp(layers * 1.2 + soft * 0.28 + (flowN - 0.5) * 0.35, 0.0, 1.0);
  let t = mix(0.04 + layers * 0.08, tIn, band);
  let rim = smoothstep(0.55, 1.0, d) * band;
  let glowAmt = band * (sharp * 1.25 + soft * 0.4) * (0.35 + u.glow * 0.9) + rim * 0.35 * u.glow;
  let dust = bokeh(p * 5.0 + vec2(u.seed, 0.0), 0.90, 0.30) * 0.7
    + bokeh(p * 11.0 + vec2(31.0, u.seed * 0.05), 0.94, 0.22) * 0.55;
  return vec2(t, glowAmt + dust * (1.0 - band * 0.55) * (0.35 + u.glow * 0.8));
}

@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  let aspect = u.res.x / u.res.y;
  let uv = vec2(pos.x / u.res.x, 1.0 - pos.y / u.res.y);
  var p = vec2(uv.x * aspect, uv.y) * u.scale + u.seed * 0.37;
  let m = i32(u.mode);
  var out2 = vec2(0.5, 0.0);
  if (m == 0) { out2 = marble(p, uv); }
  else if (m == 1) { out2 = nebula(p, uv); }
  else if (m == 2) { out2 = kaleido(p, uv); }
  else if (m == 3) { out2 = topo(p, uv); }
  else if (m == 4) { out2 = silk(p, uv); }
  else if (m == 5) { out2 = landscape(p, uv); }
  else if (m == 6) { out2 = bauhaus(p, uv); }
  else { out2 = neonveil(p, uv); }
  var col = pal(out2.x);
  col += out2.y * vec3f(1.0, 0.97, 0.92);
  // grain xác định theo seed
  let g = hash21(pos.xy + u.seed) - 0.5;
  col += g * u.grain;
  // vignette nhẹ
  let vg = smoothstep(1.15, 0.35, length(uv - vec2(0.5)));
  col *= mix(0.82, 1.0, vg);
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

export function gpuSupported() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

export async function initGPU() {
  if (device) return device;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("Không xin được GPU adapter (trình duyệt chưa bật WebGPU).");
  device = await adapter.requestDevice();
  const module = device.createShaderModule({ code: WGSL });
  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
    primitive: { topology: "triangle-list" },
  });
  uniformBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  return device;
}

// params: {w,h,seed,scale,warp,glow,grain,mode,variant,sunx,suny,colors01[5]}
export async function renderWebGPU(canvas, params) {
  await initGPU();
  const { w, h } = params;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("Không lấy được webgpu context (canvas đã bị chiếm bởi 2d?).");
  ctx.configure({ device, format: "rgba8unorm", alphaMode: "opaque" });
  const data = new Float32Array(32); // 128 bytes
  data[0] = w; data[1] = h;
  data[2] = params.seed; data[3] = params.scale;
  data[4] = params.warp; data[5] = params.glow; data[6] = params.grain; data[7] = params.mode;
  data[8] = params.variant; data[9] = params.sunx; data[10] = params.suny; data[11] = 0;
  for (let i = 0; i < 5; i++) {
    data[12 + i * 4 + 0] = params.colors01[i][0];
    data[12 + i * 4 + 1] = params.colors01[i][1];
    data[12 + i * 4 + 2] = params.colors01[i][2];
    data[12 + i * 4 + 3] = 1;
  }
  device.queue.writeBuffer(uniformBuf, 0, data);
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      loadOp: "clear", storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(3);
  pass.end();
  device.queue.submit([enc.getCommandBuffer()]);
  await device.queue.onSubmittedWorkDone();
}
