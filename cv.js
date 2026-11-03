/* ═══════════════════════════════════════════════════════════
   CineCapture — Computer Vision Algorithms (cv.js)
   All algorithms implemented from scratch using Canvas API.
   No external CV library used.
   ═══════════════════════════════════════════════════════════

   Algorithms implemented:
   1. Grayscale conversion  (RGB → Luminance)
   2. Laplacian Variance    (Sharpness / Blur Detection)
   3. Luminance Histogram   (256-bin, normalized)
   4. Chi-squared Distance  (Histogram Comparison)
   5. Mean Brightness       (Average Luminance)
   6. Sobel Edge Detection  (Gradient Magnitude)
   7. Grayscale ImageData   (Export preprocessing)
   8. Scene Change Detect   (Consecutive histogram diff)
*/

'use strict';

/* ─────────────────────────────────────────────────────────────
   UTILITY: Convert ImageData to a flat grayscale Uint8Array
   Formula: Y = 0.299R + 0.587G + 0.114B  (ITU-R BT.601)
───────────────────────────────────────────────────────────── */
function toGrayArray(imageData) {
  const { data, width, height } = imageData;
  const n = width * height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) | 0;
  }
  return gray;
}

/* ─────────────────────────────────────────────────────────────
   1. SHARPNESS — Laplacian Variance
   A sharp image has high second-derivative energy (high variance).
   Kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
   Returns: variance of the Laplacian response (higher = sharper)
───────────────────────────────────────────────────────────── */
function computeSharpness(imageData) {
  const { width, height } = imageData;
  const gray = toGrayArray(imageData);

  // Sample every 2nd pixel for speed on large frames
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  let sum = 0, sumSq = 0, count = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const lap =
        gray[(y - 1) * width + x] +
        gray[(y + 1) * width + x] +
        gray[y * width + (x - 1)] +
        gray[y * width + (x + 1)] -
        4 * gray[y * width + x];
      sum   += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/* Sharpness label + CSS class */
function sharpnessLabel(score) {
  if (score >= 80)  return { label: `Sharp`,  cls: 'sharp-high',  icon: '◉' };
  if (score >= 25)  return { label: `Fair`,   cls: 'sharp-mid',   icon: '◎' };
  return               { label: `Blurry`, cls: 'sharp-low',   icon: '○' };
}

/* ─────────────────────────────────────────────────────────────
   2. LUMINANCE HISTOGRAM — 256 bins, normalized
   Used for scene change detection.
───────────────────────────────────────────────────────────── */
function computeHistogram(imageData) {
  const gray = toGrayArray(imageData);
  const hist = new Float32Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  for (let i = 0; i < 256; i++) hist[i] /= total;
  return hist;
}

/* ─────────────────────────────────────────────────────────────
   3. CHI-SQUARED HISTOGRAM DISTANCE
   Measures dissimilarity between two normalized histograms.
   Range: 0 (identical) → higher = more different
   Reference: Puzicha et al., 1997
───────────────────────────────────────────────────────────── */
function histogramDifference(h1, h2) {
  let diff = 0;
  for (let i = 0; i < 256; i++) {
    const s = h1[i] + h2[i];
    if (s > 1e-10) diff += (h1[i] - h2[i]) ** 2 / s;
  }
  return diff;
}

/* ─────────────────────────────────────────────────────────────
   4. MEAN BRIGHTNESS
   Average luminance value [0–255].
───────────────────────────────────────────────────────────── */
function computeBrightness(imageData) {
  const gray = toGrayArray(imageData);
  let sum = 0;
  for (const v of gray) sum += v;
  return sum / gray.length;
}

/* ─────────────────────────────────────────────────────────────
   5. SOBEL EDGE DETECTION
   Computes gradient magnitude using Sobel kernels.
   Gx: [-1,0,1; -2,0,2; -1,0,1]
   Gy: [-1,-2,-1; 0,0,0; 1,2,1]
   Magnitude: sqrt(Gx² + Gy²), clamped to [0, 255]
   Returns a new ImageData with edge map.
───────────────────────────────────────────────────────────── */
function sobelEdgeDetection(imageData) {
  const { width, height } = imageData;
  const gray = toGrayArray(imageData);
  const out  = new ImageData(width, height);
  const od   = out.data;

  // Fill border with 0 (already 0), process interior
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y-1)*width+(x-1)], t = gray[(y-1)*width+x], tr = gray[(y-1)*width+(x+1)];
      const ml = gray[  y  *width+(x-1)],                            mr = gray[  y  *width+(x+1)];
      const bl = gray[(y+1)*width+(x-1)], b = gray[(y+1)*width+x], br = gray[(y+1)*width+(x+1)];

      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*t  - tr + bl + 2*b  + br;
      const mag = Math.min(255, Math.sqrt(gx*gx + gy*gy) | 0);

      const idx = (y*width + x)*4;
      od[idx]   = mag;
      od[idx+1] = mag;
      od[idx+2] = mag;
      od[idx+3] = 255;
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   6. GRAYSCALE EXPORT PREPROCESSING
   Returns a new grayscale ImageData (R=G=B=Y).
───────────────────────────────────────────────────────────── */
function grayscaleImageData(imageData) {
  const { width, height } = imageData;
  const gray = toGrayArray(imageData);
  const out  = new ImageData(width, height);
  const od   = out.data;
  for (let i = 0; i < width * height; i++) {
    const v = gray[i];
    od[i*4]   = v;
    od[i*4+1] = v;
    od[i*4+2] = v;
    od[i*4+3] = 255;
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   7. SCENE CHANGE DETECTION
   Pre-scans the video at coarse intervals, computes histograms,
   and marks timestamps where histogram difference exceeds the threshold.
   threshold sensitivity map:
     High   → threshold = 0.005  (detects subtle changes)
     Medium → threshold = 0.02   (balanced)
     Low    → threshold = 0.05   (only hard cuts)
───────────────────────────────────────────────────────────── */
const SCENE_SENSITIVITY_MAP = {
  high:   0.005,
  medium: 0.02,
  low:    0.05,
};

/**
 * Scan video for scene changes.
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {string} sensitivity - 'high' | 'medium' | 'low'
 * @param {function} onProgress - called with (scanned, total)
 * @returns {Promise<{keyframes: number[], sceneChanges: Set<number>}>}
 *   keyframes = array of timestamps (s), sceneChanges = set of indices in keyframes where scene changed
 */
async function detectSceneChanges(video, canvas, sensitivity, onProgress) {
  const threshold = SCENE_SENSITIVITY_MAP[sensitivity] ?? 0.02;
  const duration  = video.duration;
  const scanInterval = 1 / 15; // sample at 15 fps for speed

  const ctx  = canvas.getContext('2d');
  const w    = canvas.width;
  const h    = canvas.height;

  // Use a small thumbnail canvas for histogram speed
  const thumbW = 160, thumbH = Math.round(160 * h / w);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width  = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');

  const timestamps = [];
  for (let t = 0; t < duration; t += scanInterval) {
    timestamps.push(Math.min(t, duration - 0.001));
  }

  const keyframes    = [];
  const sceneChanges = new Set();
  let prevHist = null;
  let prevTs   = -1;

  const total = timestamps.length;

  for (let i = 0; i < total; i++) {
    const ts = timestamps[i];

    await seekVideoTo(video, ts);
    thumbCtx.drawImage(video, 0, 0, thumbW, thumbH);
    const imageData = thumbCtx.getImageData(0, 0, thumbW, thumbH);
    const hist      = computeHistogram(imageData);

    if (prevHist === null) {
      // First frame is always a keyframe
      keyframes.push(ts);
      sceneChanges.add(0);
    } else {
      const diff = histogramDifference(prevHist, hist);
      if (diff > threshold) {
        keyframes.push(ts);
        sceneChanges.add(keyframes.length - 1);
      }
    }

    prevHist = hist;
    prevTs   = ts;

    if (onProgress) onProgress(i + 1, total);
    if (i % 20 === 0) await yieldFrame(); // keep UI responsive
  }

  return { keyframes, sceneChanges };
}

/* ─────────────────────────────────────────────────────────────
   HELPER: seek video and resolve on 'seeked'
───────────────────────────────────────────────────────────── */
function seekVideoTo(video, time) {
  return new Promise((resolve, reject) => {
    const done  = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); resolve(); };
    const fail  = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); reject(); };
    video.addEventListener('seeked', done,  { once: true });
    video.addEventListener('error', fail,   { once: true });
    video.currentTime = time;
  });
}

function yieldFrame() {
  return new Promise(r => setTimeout(r, 0));
}

/* ─────────────────────────────────────────────────────────────
   EXPORT — make functions available globally
───────────────────────────────────────────────────────────── */
window.CV = {
  computeSharpness,
  sharpnessLabel,
  computeHistogram,
  histogramDifference,
  computeBrightness,
  sobelEdgeDetection,
  grayscaleImageData,
  detectSceneChanges,
  seekVideoTo,
  yieldFrame,
};
