// Loader cho public/wasm/noise.wasm — export hash2i(seed,x,y) -> u32.
// Fallback JS thuần khi fetch wasm thất bại (vd. mở file://).
let wasmHash = null;

const jsHash = (seed, x, y) => {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
};

export async function initWasm(statusCb) {
  try {
    const res = await fetch(new URL("../public/wasm/noise.wasm", import.meta.url));
    if (!res.ok) throw new Error("http " + res.status);
    const buf = await res.arrayBuffer();
    const mod = await WebAssembly.instantiate(buf, {});
    const fn = mod.instance.exports.hash2i;
    if (typeof fn !== "function") throw new Error("missing export hash2i");
    wasmHash = fn;
    statusCb?.(true);
    return true;
  } catch (e) {
    wasmHash = null;
    statusCb?.(false);
    return false;
  }
}

// Trả về số nguyên 32-bit deterministic. Dùng cho grain/dither + stars ở CPU path.
export function hash2i(seed, x, y) {
  if (wasmHash) {
    try { return wasmHash(seed | 0, x | 0, y | 0) >>> 0; } catch { /* rơi xuống JS */ }
  }
  return jsHash(seed, x, y);
}

export function hash01(seed, x, y) {
  return hash2i(seed, x, y) / 4294967296;
}
