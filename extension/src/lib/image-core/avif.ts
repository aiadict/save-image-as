// AVIF encoding via libavif compiled to WebAssembly (@jsquash/avif, the
// codec behind Squoosh). Chrome's canvas has no AVIF encoder:
// convertToBlob({ type: "image/avif" }) silently returns a PNG instead.
//
// Uses the codec's single-threaded build directly, not the package's entry
// point: that one picks a module with dynamic import(), which service workers
// don't allow, and its multi-threaded build needs SharedArrayBuffer.
//
// The .wasm (~3.5 MB) ships inside the extension and is only loaded on the
// first AVIF save, so nobody else pays for it. Needs 'wasm-unsafe-eval' in
// the manifest's extension_pages CSP.

import avifEncoderFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import { defaultOptions } from "@jsquash/avif/meta.js";
import { initEmscriptenModule } from "@jsquash/avif/utils.js";

/**
 * libavif's 0–100 quality, not JPG's. 60 is visually close to a high-quality
 * JPG at a fraction of the size, which is the point of choosing AVIF.
 */
const AVIF_QUALITY = 60;
/** 0 (slowest, smallest) – 10 (fastest). 7 keeps a typical photo around a second. */
const AVIF_SPEED = 7;

interface AvifModule {
  encode(data: Uint8Array, width: number, height: number, options: typeof defaultOptions): Uint8Array | null;
}

let wasmUrl: string | undefined;
let modulePromise: Promise<AvifModule> | undefined;

/** Where the packaged avif_enc.wasm lives (an extension URL, or a site URL for the web converter). */
export function configureAvifWasm(url: string): void {
  wasmUrl = url;
}

function loadModule(): Promise<AvifModule> {
  if (!wasmUrl) throw new Error("configureAvifWasm() was not called");
  const url = wasmUrl;
  modulePromise ??= (async () => {
    // telemetry-guard: allow packaged-codec
    const wasm = await WebAssembly.compileStreaming(fetch(url));
    return (await initEmscriptenModule(avifEncoderFactory, wasm)) as AvifModule;
  })();
  // A failed load (e.g. missing file) shouldn't poison every later attempt.
  modulePromise.catch(() => {
    modulePromise = undefined;
  });
  return modulePromise;
}

/** Encode RGBA pixels as AVIF. Keeps transparency. */
export async function encodeAvif(pixels: ImageData): Promise<Blob> {
  const module = await loadModule();
  const output = module.encode(new Uint8Array(pixels.data.buffer), pixels.width, pixels.height, {
    ...defaultOptions,
    quality: AVIF_QUALITY,
    speed: AVIF_SPEED,
  });
  if (!output) throw new Error("AVIF encoder returned nothing");
  // Copy out of the wasm heap: the encoder's view is reused by its next call.
  return new Blob([output.slice()], { type: "image/avif" });
}
