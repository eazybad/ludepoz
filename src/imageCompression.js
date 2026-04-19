// ═══════════════════════════════════════════════════════════════════════
// KAMPASIKA IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════════════════
//
// Compresses images aggressively on the user's device BEFORE upload.
// This saves:
//   • The student's mobile data (files are tiny by the time they upload)
//   • Your Firebase Storage costs (20x less storage)
//   • Your bandwidth costs (20x less egress when people view listings)
//
// HOW IT WORKS:
//   1. User picks an image (from camera or gallery)
//   2. We load it into a <canvas> in the browser
//   3. Resize it down to a sensible max dimension
//   4. Re-encode as JPEG at 75-80% quality
//   5. Return a tiny Blob ready for Firebase upload
//
// NO BACKEND NEEDED. All compression happens on the phone.
// ═══════════════════════════════════════════════════════════════════════

// ─── PRESETS ───
// Tuned for Kampasika's specific use cases.
// Target sizes aim for ~150-250KB per image (vs 3-5MB raw).

export const COMPRESSION_PRESETS = {
  // Profile photos: small, square, fast-loading
  avatar: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.8,
    maxSizeKB: 80,
    label: "avatar",
  },

  // Standard listing photos: balance between detail and size
  listing: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.75,
    maxSizeKB: 200,
    label: "listing",
  },

  // Room photos: slightly larger (students need to see detail — corners, amenities)
  room: {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.78,
    maxSizeKB: 280,
    label: "room",
  },

  // Chat image attachments: smaller, users just need to see roughly what it is
  chat: {
    maxWidth: 1000,
    maxHeight: 1000,
    quality: 0.7,
    maxSizeKB: 120,
    label: "chat",
  },

  // Payment screenshots / M-Pesa receipts: need to be readable
  receipt: {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 0.82,
    maxSizeKB: 250,
    label: "receipt",
  },

  // Verification photos (YOU take these for verified rooms — slightly higher quality)
  verification: {
    maxWidth: 1800,
    maxHeight: 1800,
    quality: 0.82,
    maxSizeKB: 350,
    label: "verification",
  },
};

// ─── CORE COMPRESSOR ───
/**
 * Compress a single image file.
 *
 * @param {File | Blob} file - image file from input[type=file]
 * @param {object} preset - one of COMPRESSION_PRESETS, or custom {maxWidth, maxHeight, quality, maxSizeKB}
 * @param {function} onProgress - optional (0..1) progress callback
 * @returns {Promise<{blob: Blob, file: File, originalSize: number, compressedSize: number, ratio: number, width: number, height: number}>}
 */
export async function compressImage(file, preset = COMPRESSION_PRESETS.listing, onProgress) {
  if (!file) throw new Error("No file provided");
  if (!file.type?.startsWith("image/")) throw new Error("Not an image file");

  onProgress?.(0.05);

  // 1. Load into Image element
  const dataUrl = await fileToDataURL(file);
  onProgress?.(0.2);

  const img = await loadImage(dataUrl);
  onProgress?.(0.4);

  // 2. Compute target dimensions (maintain aspect ratio)
  const { width, height } = fitInside(img.naturalWidth, img.naturalHeight, preset.maxWidth, preset.maxHeight);

  // 3. Draw to canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  // White background for transparency (prevents black fill on JPEG)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  // High-quality rescaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  onProgress?.(0.7);

  // 4. Try to hit maxSizeKB target with iterative quality reduction
  let quality = preset.quality;
  let blob = await canvasToBlob(canvas, quality);
  const targetBytes = (preset.maxSizeKB || 300) * 1024;
  let attempts = 0;
  while (blob.size > targetBytes && quality > 0.4 && attempts < 4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
    attempts++;
  }
  onProgress?.(0.95);

  // 5. Wrap as a File for Firebase compatibility
  const outName = renameToJpg(file.name || "image.jpg");
  const outFile = new File([blob], outName, { type: "image/jpeg", lastModified: Date.now() });

  onProgress?.(1);

  return {
    blob,
    file: outFile,
    originalSize: file.size,
    compressedSize: blob.size,
    ratio: file.size > 0 ? blob.size / file.size : 1,
    width,
    height,
    quality,
  };
}

/**
 * Compress multiple images. Runs sequentially so a phone with limited RAM
 * doesn't choke on 10 simultaneous canvas operations.
 */
export async function compressImages(files, preset = COMPRESSION_PRESETS.listing, onProgress) {
  const results = [];
  const arr = Array.from(files);
  for (let i = 0; i < arr.length; i++) {
    const res = await compressImage(arr[i], preset, (p) => {
      const overall = (i + p) / arr.length;
      onProgress?.(overall, i, arr.length);
    });
    results.push(res);
  }
  return results;
}

// ─── VIDEO VALIDATION ───
// Browser video compression is unreliable and slow. Instead: enforce sensible
// limits at upload time. Reject anything too long or too large — prompt the
// user to re-record shorter.

export const VIDEO_LIMITS = {
  maxDurationSec: 30,      // 30 seconds plenty for a room tour
  maxSizeMB: 25,           // Firebase upload stays manageable
  recommendedMB: 10,       // Show a hint if over this
};

/**
 * Validate a video file BEFORE upload.
 * Returns { ok: boolean, reason?: string, durationSec, sizeMB }
 */
export async function validateVideo(file, limits = VIDEO_LIMITS) {
  if (!file) return { ok: false, reason: "No file" };
  if (!file.type?.startsWith("video/")) return { ok: false, reason: "Not a video" };

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > limits.maxSizeMB) {
    return {
      ok: false,
      reason: `Video ni kubwa sana (${sizeMB.toFixed(1)}MB). Kiwango cha juu ni ${limits.maxSizeMB}MB. Jaribu kupunguza urefu au ubora.`,
      sizeMB,
    };
  }

  // Duration check via metadata
  const durationSec = await getVideoDuration(file).catch(() => null);
  if (durationSec != null && durationSec > limits.maxDurationSec) {
    return {
      ok: false,
      reason: `Video ni ndefu sana (sekunde ${Math.round(durationSec)}). Kiwango cha juu ni sekunde ${limits.maxDurationSec}.`,
      durationSec,
      sizeMB,
    };
  }

  return {
    ok: true,
    durationSec,
    sizeMB,
    warning: sizeMB > limits.recommendedMB
      ? `Video hii ni ${sizeMB.toFixed(1)}MB — itakuchukua data nyingi. Inashauriwa chini ya ${limits.recommendedMB}MB.`
      : null,
  };
}

// ─── HELPERS ───

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function fitInside(w, h, maxW, maxH) {
  // If already smaller than max, don't upscale
  if (w <= maxW && h <= maxH) return { width: w, height: h };
  const ratio = Math.min(maxW / w, maxH / h);
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
  };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas to Blob failed"))),
      "image/jpeg",
      quality
    );
  });
}

function renameToJpg(name) {
  return name.replace(/\.(png|webp|gif|heic|heif|bmp|tiff?|jpeg|jpg)$/i, "") + ".jpg";
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read video metadata"));
    };
    v.src = url;
  });
}

// ─── CONVENIENCE: nice stats for UI display ───
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function compressionSummary(result) {
  const saved = ((1 - result.ratio) * 100).toFixed(0);
  return `${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)} (${saved}% smaller)`;
}
