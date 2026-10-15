// Nguồn Rust tương ứng với public/wasm/noise.wasm.
// Build: rustup target add wasm32-unknown-unknown
//   rustc --crate-type=cdylib --target wasm32-unknown-unknown noise.rs -o noise.wasm
// (Không phụ thuộc ngoài std; export duy nhất `hash2i`.)

#[no_mangle]
pub extern "C" fn hash2i(seed: i32, x: i32, y: i32) -> i32 {
    let mut h: u32 =
        (seed as u32) ^ (x as u32).wrapping_mul(374761393) ^ (y as u32).wrapping_mul(668265263);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h ^= h >> 16;
    h as i32
}
