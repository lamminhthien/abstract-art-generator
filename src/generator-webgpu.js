// Renderer WebGPU: 1 fullscreen triangle + 7 công thức trừu tượng.
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
fn bokeh(pp : vec2f, thresh : f32, rad : f32) -> f32 {
  let cell = floor(pp);
  let fr = fract(pp);
  let h = hash21(cell * 1.37 + vec2(3.1, 7.7));
  if (h < thresh) { return 0.0; }
  let c = vec2(hash21(cell + vec2(7.7, 1.3)), hash21(cell + vec2(3.1, 5.9))) * 0.6 + vec2(0.2, 0.2);
  let dd = length(fr - c);
  let r = rad * (0.4 + 0.6 * hash21(cell + vec2(9.1, 2.2)));
  return smoothstep(r, r * 0.25, dd) * (0.35 + 0.65 * hash21(cell + vec2(1.7, 8.4)));
}

// 0 · Hình học: lưới ô + đường đen dày kiểu Mondrian
fn geometric(p : vec2f, uv : vec2f) -> vec2f {
  let cols = 4.0 + floor(u.variant * 3.0);
  let rows = 4.0 + floor((1.0 - u.variant) * 3.0);
  let g = vec2(uv.x * cols, uv.y * rows);
  let id = floor(g);
  let f = fract(g);
  let h = hash21(id * 1.7 + vec2(u.seed, 1.0));
  let lw = 0.055;
  var line = step(f.x, lw) + step(1.0 - lw, f.x) + step(f.y, lw) + step(1.0 - lw, f.y);
  line = clamp(line, 0.0, 1.0);
  let tFill = h * 0.78;
  let t = mix(tFill, 1.0, line);
  return vec2(t, 0.0);
}
// 1 · Hành động: vệt hỗn loạn + tia bắn Pollock
fn actionP(p : vec2f, uv : vec2f) -> vec2f {
  let chaos = fbm(p * 2.0 + fbm(p * 3.0) * u.warp * 2.0);
  let sw = 1.0 - abs(sin((chaos * 14.0 + fbm(p * 5.0) * 8.0) * 3.14159));
  let thin = pow(sw, 24.0);
  let med = pow(sw, 6.0);
  let splat = bokeh(p * 9.0 + vec2(u.seed * 0.05, 0.0), 0.93, 0.28);
  let t = clamp(chaos * 0.6 + med * 0.45 + thin * 0.5 + splat * 0.6, 0.0, 1.0);
  return vec2(t, splat * 0.3 * (0.5 + u.glow) + thin * 0.5 * u.glow);
}
// 2 · Trường màu: 2 khối mềm kiểu Rothko
fn colorfield(p : vec2f, uv : vec2f) -> vec2f {
  let e = 0.08 + fbm(vec2(p.x * 1.5, u.seed)) * 0.05;
  let b1 = smoothstep(0.12 - e, 0.12 + e, uv.y) * (1.0 - smoothstep(0.48 - e, 0.48 + e, uv.y));
  let b2 = smoothstep(0.55 - e, 0.55 + e, uv.y) * (1.0 - smoothstep(0.88 - e, 0.88 + e, uv.y));
  let tex = fbm(p * 3.0) * 0.25;
  var t = 0.15 + tex * 0.2;
  t = mix(t, 0.55 + tex, b1 * 0.9);
  t = mix(t, 0.85 + tex * 0.5, b2 * 0.9);
  let edge = (b1 * (1.0 - b1) + b2 * (1.0 - b2)) * 2.0;
  return vec2(clamp(t, 0.0, 1.0), edge * 0.35 * u.glow);
}
// 3 · Cạnh sắc: mảng phẳng ranh giới cứng
fn hardedge(p : vec2f, uv : vec2f) -> vec2f {
  let d1 = uv.x * 1.2 - uv.y * 0.6 + (fbm(vec2(u.seed, u.seed * 0.7)) - 0.5) * 0.6;
  let d2 = length(uv - vec2(0.68, 0.38)) - (0.26 + u.variant * 0.15);
  let d3 = uv.y - (0.55 + (fbm(vec2(p.x * 2.0, u.seed)) - 0.5) * 0.3);
  var r = 0.1;
  if (d1 > 0.1) { r = 0.35; }
  if (d3 > 0.0) { r = 0.6; }
  if (d2 < 0.0) { r = 0.88; }
  return vec2(r, 0.0);
}
// 4 · Trữ tình: vệt mực chảy tự do
fn lyrical(p : vec2f, uv : vec2f) -> vec2f {
  let q = vec2(fbm(p * 1.2), fbm(p * 1.2 + vec2(7.3, 2.9)));
  let r = vec2(fbm(p * 1.5 + q * u.warp * 1.5 + vec2(2.1, 8.3)), fbm(p * 1.5 + q * u.warp * 1.5 + vec2(5.7, 1.2)));
  let wash = fbm(p * 1.6 + r * 2.0);
  let st = 1.0 - abs(sin((p.x * 3.0 + p.y * 4.0 + r.x * 8.0) * 3.14159));
  let ink = pow(st, 5.0) * smoothstep(0.3, 0.7, wash);
  return vec2(clamp(wash * 0.9 + ink * 0.6, 0.0, 1.0), ink * 0.5 * u.glow);
}
// 5 · Hữu cơ: metaballs mềm kiểu vỏ sò / sỏi
fn organic(p : vec2f, uv : vec2f) -> vec2f {
  var m = 0.0;
  for (var i = 0; i < 5; i++) {
    let fi = f32(i);
    let c = vec2(hash21(vec2(fi * 3.1, u.seed)), hash21(vec2(u.seed, fi * 7.7))) * 0.7 + vec2(0.15, 0.15);
    let dd = (uv - c) * vec2(u.res.x / u.res.y, 1.0);
    let rad = 0.16 + 0.10 * hash21(vec2(fi, fi * 2.0) + vec2(u.seed, 1.0));
    m += rad * rad / (dot(dd, dd) + 0.001);
  }
  let body = smoothstep(1.0, 1.6, m);
  let edge = smoothstep(0.7, 1.2, m) - body;
  let veins = fbm(p * 2.5) * 0.35;
  return vec2(clamp(body * 0.75 + veins + edge * 0.3, 0.0, 1.0), edge * 0.6 * u.glow + body * 0.1);
}
// 6 · Thị giác Op-art: sóng đen trắng gây ảo giác chuyển động
fn opart(p : vec2f, uv : vec2f) -> vec2f {
  let c = uv - vec2(0.5, 0.5);
  let r = length(c * vec2(u.res.x / u.res.y, 1.0)) * 2.0;
  let w = fbm(p * 2.0) * 2.0;
  let rings = sin((r * 24.0 - w * 6.0 + u.variant * 8.0) * 3.14159);
  let grid = sin((uv.x * 60.0 + w * 10.0) * 3.14159) * sin((uv.y * 60.0 - w * 8.0) * 3.14159);
  let v = mix(rings, grid, 0.35);
  return vec2(smoothstep(-0.25, 0.25, v), pow(1.0 - abs(v), 8.0) * u.glow);
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
  if (m == 0) { out2 = geometric(p, uv); }
  else if (m == 1) { out2 = actionP(p, uv); }
  else if (m == 2) { out2 = colorfield(p, uv); }
  else if (m == 3) { out2 = hardedge(p, uv); }
  else if (m == 4) { out2 = lyrical(p, uv); }
  else if (m == 5) { out2 = organic(p, uv); }
  else { out2 = opart(p, uv); }
  var col = pal(out2.x);
  col += out2.y * vec3f(1.0, 0.97, 0.92);
  let g = hash21(pos.xy + u.seed) - 0.5;
  col += g * u.grain;
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
