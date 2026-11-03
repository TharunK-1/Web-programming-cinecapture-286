/* ═══════════════════════════════════════════════════════════
   CineCapture — Main Application Logic
   All frame extraction runs 100% in-browser via Canvas API
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────── STATE ──────────────── */
const state = {
  videoFile: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,
  estimatedFPS: 30,
  extractedFrames: [],   // { blob, url, name, timestamp, sharpness, brightness, isSceneChange }
  extractionMode: 'nth', // 'nth' | 'timerange' | 'all' | 'keyframes'
  cancelled: false,
  lightboxIndex: 0,
  viewMode: 'grid',      // 'grid' | 'list'
  edgeView: false,
  cvState: {
    preprocessing: 'none',  // 'none' | 'grayscale' | 'edge'
    skipBlurry: false,
    blurThreshold: 30,
    sensitivity: 'medium',  // for keyframes mode
    lastSceneChanges: new Set(),
  },
};

/* ──────────────── ELEMENT REFS ──────────────── */
const $ = id => document.getElementById(id);

const els = {
  dropZone:          $('drop-zone'),
  dropContent:       $('drop-content'),
  dropLoaded:        $('drop-loaded'),
  videoInput:        $('video-input'),
  loadedName:        $('loaded-name'),
  loadedMeta:        $('loaded-meta'),
  changeVideoBtn:    $('change-video-btn'),
  previewSection:    $('preview-section'),
  videoPlayer:       $('video-player'),
  videoOverlay:      $('video-overlay'),
  playBtn:           $('play-btn'),
  seekBar:           $('seek-bar'),
  currentTimeDisp:   $('current-time-display'),
  durationDisp:      $('duration-display'),
  hiddenCanvas:      $('hidden-canvas'),
  infoResolution:    $('info-resolution'),
  infoDuration:      $('info-duration'),
  infoFPS:           $('info-fps'),
  infoFrames:        $('info-frames'),
  settingsSection:   $('settings-section'),
  modeTabs:          $('mode-tabs'),
  nthSlider:         $('nth-slider'),
  nthValueDisp:      $('nth-value-display'),
  rangeIntervalSl:   $('range-interval-slider'),
  rangeNthDisp:      $('range-nth-display'),
  timeStart:         $('time-start'),
  timeEnd:           $('time-end'),
  workflowSteps:     document.querySelectorAll('.step-item'),
  formatSelector:    $('format-selector'),
  fmtJpg:            $('fmt-jpg'),
  fmtPng:            $('fmt-png'),
  radioJpg:          $('radio-jpg'),
  radioPng:          $('radio-png'),
  qualityBlock:      $('quality-block'),
  qualitySlider:     $('quality-slider'),
  qualityDisplay:    $('quality-display'),
  prefixInput:       $('prefix-input'),
  prefixPreview:     $('prefix-preview'),
  estFrames:         $('est-frames'),
  estTime:           $('est-time'),
  estimateBar:       $('estimate-bar'),
  estimateNote:      $('estimate-note'),
  extractBtn:        $('extract-btn'),
  progressSection:   $('progress-section'),
  progressSub:       $('progress-sub'),
  progressFill:      $('progress-fill'),
  progressCount:     $('progress-count'),
  progressPct:       $('progress-pct'),
  cancelBtn:         $('cancel-btn'),
  gallerySection:    $('gallery-section'),
  gallerySub:        $('gallery-sub'),
  frameGrid:         $('frame-grid'),
  downloadAllBtn:    $('download-all-btn'),
  clearGalleryBtn:   $('clear-gallery-btn'),
  extractAgainBtn:   $('extract-again-btn'),
  lightbox:          $('lightbox'),
  lightboxBackdrop:  $('lightbox-backdrop'),
  lightboxImg:       $('lightbox-img'),
  lightboxLabel:     $('lightbox-label'),
  lightboxClose:     $('lightbox-close'),
  lightboxPrev:      $('lightbox-prev'),
  lightboxNext:      $('lightbox-next'),
  lightboxDownload:  $('lightbox-download'),
  viewGridBtn:       $('view-grid-btn'),
  viewListBtn:       $('view-list-btn'),
  viewEdgeBtn:       $('view-edge-btn'),
  statusPill:        $('status-pill'),
  toastContainer:    $('toast-container'),
  // CV elements
  preprocSelector:   $('preproc-selector'),
  preprocHint:       $('preproc-hint'),
  skipBlurryToggle:  $('skip-blurry-toggle'),
  blurThreshRow:     $('blur-threshold-row'),
  blurThreshSlider:  $('blur-thresh-slider'),
  blurThreshVal:     $('blur-thresh-val'),
  sensitivitySel:    $('sensitivity-selector'),
  sceneHint:         $('scene-hint'),
  cvAnalysis:        $('cv-analysis'),
};

/* ──────────────── UTILITIES ──────────────── */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}

function formatDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function setStatus(text, type = 'ready') {
  const pill = els.statusPill;
  const dot = pill.querySelector('.status-dot');
  pill.querySelector('span').textContent = text;
  dot.style.background = type === 'ready'    ? 'var(--green)'  :
                         type === 'busy'     ? 'var(--amber)'  :
                         type === 'error'    ? 'var(--red)'    : 'var(--cyan)';
  dot.style.boxShadow = `0 0 8px ${dot.style.background}`;
}

function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ──────────────── WORKFLOW STEPS ──────────────── */
function setWorkflowStep(active) {
  document.querySelectorAll('.step-item').forEach(el => {
    const n = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (n < active)  el.classList.add('done');
    if (n === active) el.classList.add('active');
  });
}

/* ──────────────── DROP ZONE ──────────────── */
els.dropZone.addEventListener('click', e => {
  if (!e.target.closest('#change-video-btn') && !e.target.closest('#drop-browse-btn')) {
    if (!state.videoFile) els.videoInput.click();
  }
});

els.dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  els.dropZone.classList.add('drag-over');
});
els.dropZone.addEventListener('dragleave', () => {
  els.dropZone.classList.remove('drag-over');
});
els.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  els.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) loadVideo(file);
  else showToast('Please drop a valid video file.', 'error');
});

els.videoInput.addEventListener('change', () => {
  if (els.videoInput.files[0]) loadVideo(els.videoInput.files[0]);
});

els.changeVideoBtn.addEventListener('click', () => {
  els.videoInput.value = '';
  els.videoInput.click();
});

/* ──────────────── LOAD VIDEO ──────────────── */
function loadVideo(file) {
  state.videoFile = file;
  const url = URL.createObjectURL(file);
  els.videoPlayer.src = url;

  // Update drop zone
  els.dropContent.classList.add('hidden');
  els.dropLoaded.classList.remove('hidden');
  els.loadedName.textContent = file.name;
  els.loadedMeta.textContent = `${formatBytes(file.size)} · ${file.type || 'video'}`;

  setStatus('Loading…', 'busy');

  els.videoPlayer.addEventListener('loadedmetadata', onVideoLoaded, { once: true });
  els.videoPlayer.load();
}

function onVideoLoaded() {
  const vid = els.videoPlayer;
  state.videoDuration = vid.duration;
  state.videoWidth    = vid.videoWidth;
  state.videoHeight   = vid.videoHeight;
  state.estimatedFPS  = 30; // browsers don't expose FPS directly

  // Populate info
  els.infoResolution.textContent = `${state.videoWidth}×${state.videoHeight}`;
  els.infoDuration.textContent   = formatDuration(state.videoDuration);
  els.infoFPS.textContent        = '~30 fps';
  els.infoFrames.textContent     = `~${Math.round(state.videoDuration * 30).toLocaleString()}`;

  // Set canvas dimensions
  els.hiddenCanvas.width  = state.videoWidth  || 1280;
  els.hiddenCanvas.height = state.videoHeight || 720;

  // Set time range defaults
  els.timeEnd.value   = Math.min(10, state.videoDuration).toFixed(1);
  els.timeEnd.max     = state.videoDuration.toFixed(1);
  els.timeStart.max   = state.videoDuration.toFixed(1);
  els.durationDisp.textContent = formatTime(state.videoDuration);

  // Show sections
  els.previewSection.classList.remove('hidden');
  els.settingsSection.classList.remove('hidden');
  els.extractBtn.disabled = false;
  setWorkflowStep(2);

  // Switch from landing layout to full app layout
  const container = document.getElementById('upload-section');
  container.classList.remove('landing');
  container.style.marginTop = '';  // reset — CSS handles padding-top now
  const featureStrip = document.getElementById('feature-strip');
  if (featureStrip) featureStrip.style.display = 'none';
  const importSection = document.getElementById('import-section');
  if (importSection) importSection.classList.remove('landing-section');

  updateEstimate();
  setStatus('Ready', 'ready');
  showToast(`Loaded: ${state.videoFile.name}`, 'success', 2500);

  // Smooth scroll
  setTimeout(() => {
    els.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

/* ──────────────── VIDEO PLAYER ──────────────── */
els.videoPlayer.addEventListener('timeupdate', () => {
  const t = els.videoPlayer.currentTime;
  els.currentTimeDisp.textContent = formatTime(t);
  if (!els.videoPlayer.paused) {
    els.seekBar.value = Math.round((t / state.videoDuration) * 1000);
  }
});

els.videoPlayer.addEventListener('play',  () => { els.videoOverlay.classList.add('hidden'); });
els.videoPlayer.addEventListener('pause', () => { els.videoOverlay.classList.remove('hidden'); });
els.videoPlayer.addEventListener('ended', () => { els.videoOverlay.classList.remove('hidden'); });

els.playBtn.addEventListener('click', () => {
  if (els.videoPlayer.paused) els.videoPlayer.play();
  else els.videoPlayer.pause();
});

els.videoPlayer.addEventListener('click', () => {
  if (els.videoPlayer.paused) els.videoPlayer.play();
  else els.videoPlayer.pause();
});

els.seekBar.addEventListener('input', () => {
  const t = (els.seekBar.value / 1000) * state.videoDuration;
  els.videoPlayer.currentTime = t;
  els.currentTimeDisp.textContent = formatTime(t);
});

/* ──────────────── EXTRACTION MODE TABS ──────────────── */
els.modeTabs.addEventListener('click', e => {
  const tab = e.target.closest('.mode-tab');
  if (!tab) return;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const mode = tab.dataset.mode;
  state.extractionMode = mode;
  document.getElementById(`panel-${mode}`).classList.add('active');
  updateEstimate();
});

/* ──────────────── CV: PREPROCESSING ──────────────── */
const PREPROC_HINTS = {
  none:      'Frames exported as-is.',
  grayscale: 'Converted to grayscale (Y = 0.299R + 0.587G + 0.114B) before export.',
  edge:      'Sobel edge detection applied before export. Exports edge map.',
};
els.preprocSelector.addEventListener('click', e => {
  const btn = e.target.closest('.preproc-btn');
  if (!btn) return;
  document.querySelectorAll('.preproc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.cvState.preprocessing = btn.dataset.val;
  els.preprocHint.textContent = PREPROC_HINTS[btn.dataset.val];
});

/* ──────────────── CV: SKIP BLURRY ──────────────── */
els.skipBlurryToggle.addEventListener('change', () => {
  state.cvState.skipBlurry = els.skipBlurryToggle.checked;
  els.blurThreshRow.classList.toggle('hidden', !els.skipBlurryToggle.checked);
});
els.blurThreshSlider.addEventListener('input', () => {
  state.cvState.blurThreshold = parseInt(els.blurThreshSlider.value);
  els.blurThreshVal.textContent = els.blurThreshSlider.value;
});

/* ──────────────── CV: SENSITIVITY (KEYFRAMES) ──────────────── */
const SENS_HINTS = {
  low:    'Detects only hard cuts (large scene changes).',
  medium: 'Detects hard cuts and moderate transitions.',
  high:   'Detects subtle changes — may produce many keyframes.',
};
els.sensitivitySel.addEventListener('click', e => {
  const btn = e.target.closest('.sens-btn');
  if (!btn) return;
  document.querySelectorAll('.sens-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.cvState.sensitivity = btn.dataset.val;
  els.sceneHint.textContent = SENS_HINTS[btn.dataset.val];
});

/* ──────────────── SLIDERS ──────────────── */
els.nthSlider.addEventListener('input', () => {
  els.nthValueDisp.textContent = els.nthSlider.value;
  updateEstimate();
});

els.rangeIntervalSl.addEventListener('input', () => {
  els.rangeNthDisp.textContent = parseFloat(els.rangeIntervalSl.value).toFixed(1);
  updateEstimate();
});

els.timeStart.addEventListener('input', updateEstimate);
els.timeEnd.addEventListener('input',   updateEstimate);

/* ──────────────── FORMAT SELECTOR ──────────────── */
els.formatSelector.addEventListener('click', e => {
  const opt = e.target.closest('.format-option');
  if (!opt) return;
  document.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  opt.querySelector('input[type=radio]').checked = true;
  const isJPG = opt.querySelector('input').value === 'jpg';
  els.qualityBlock.style.display = isJPG ? 'block' : 'none';
  updatePrefixPreview();
});

els.qualitySlider.addEventListener('input', () => {
  els.qualityDisplay.textContent = els.qualitySlider.value;
});

/* ──────────────── PREFIX ──────────────── */
els.prefixInput.addEventListener('input', updatePrefixPreview);

function updatePrefixPreview() {
  const prefix = els.prefixInput.value.trim() || 'frame';
  const fmt = document.querySelector('input[name="output-format"]:checked')?.value || 'jpg';
  els.prefixPreview.textContent = `${prefix}_0001.${fmt}`;
}

/* ──────────────── ESTIMATE ──────────────── */
function updateEstimate() {
  if (!state.videoDuration) return;

  let count = 0;
  const mode = state.extractionMode;

  if (mode === 'nth') {
    const nth = parseInt(els.nthSlider.value) || 5;
    const totalFrames = Math.round(state.videoDuration * state.estimatedFPS);
    count = Math.ceil(totalFrames / nth);
  } else if (mode === 'timerange') {
    const start    = Math.max(0, parseFloat(els.timeStart.value) || 0);
    const end      = Math.min(state.videoDuration, parseFloat(els.timeEnd.value) || 10);
    const interval = Math.max(0.1, parseFloat(els.rangeIntervalSl.value) || 1);
    count = Math.max(0, Math.floor((end - start) / interval) + 1);
  } else if (mode === 'keyframes') {
    // Rough estimate: 1 scene change every 3-8 seconds
    count = Math.round(state.videoDuration / 5);
  } else {
    count = Math.round(state.videoDuration * state.estimatedFPS);
  }

  const secPerFrame = 0.08;
  const estSec = count * secPerFrame;
  const estStr = mode === 'keyframes'
    ? `~${Math.round(state.videoDuration * 15 * 0.08)}s (incl. scan)`
    : estSec < 60 ? `~${Math.round(estSec)}s` : `~${Math.round(estSec / 60)}m`;

  els.estFrames.textContent = mode === 'keyframes' ? '— (auto)' : count.toLocaleString();
  els.estTime.textContent   = estStr;

  const pct = Math.min(100, (count / 2000) * 100);
  els.estimateBar.style.width = pct + '%';

  if (mode === 'keyframes') {
    els.estimateNote.textContent = 'Scene detection will scan the full video before extracting keyframes.';
  } else if (count === 0) {
    els.estimateNote.textContent = 'No frames match the current settings.';
  } else if (count > 5000) {
    els.estimateNote.textContent = `⚠ ${count.toLocaleString()} frames is a large batch.`;
  } else {
    els.estimateNote.textContent = `Ready to extract ${count.toLocaleString()} frames in approx. ${estStr}.`;
  }
}

/* ──────────────── EXTRACT FRAMES ──────────────── */
els.extractBtn.addEventListener('click', startExtraction);
els.cancelBtn.addEventListener('click', () => {
  state.cancelled = true;
  showToast('Extraction cancelled.', 'info');
});

async function startExtraction() {
  if (!state.videoFile) return;

  // Clear previous frames
  state.extractedFrames.forEach(f => URL.revokeObjectURL(f.url));
  state.extractedFrames = [];
  state.cancelled = false;

  const mode     = state.extractionMode;
  const prefix   = els.prefixInput.value.trim() || 'frame';
  const fmt      = document.querySelector('input[name="output-format"]:checked')?.value || 'jpg';
  const quality  = parseInt(els.qualitySlider.value) / 100;
  const mimeType = fmt === 'jpg' ? 'image/jpeg' : 'image/png';

  // Build list of timestamps to capture
  let timestamps = [];

  if (mode === 'nth') {
    const nth = parseInt(els.nthSlider.value) || 5;
    const frameDuration = 1 / state.estimatedFPS;
    const totalFrames = Math.round(state.videoDuration * state.estimatedFPS);
    for (let i = 0; i < totalFrames; i++) {
      if (i % nth === 0) timestamps.push(i * frameDuration);
    }
  } else if (mode === 'timerange') {
    const start    = Math.max(0, parseFloat(els.timeStart.value) || 0);
    const end      = Math.min(state.videoDuration, parseFloat(els.timeEnd.value) || 10);
    const interval = Math.max(0.1, parseFloat(els.rangeIntervalSl.value) || 1);
    for (let t = start; t <= end + 0.001; t += interval) {
      timestamps.push(Math.min(t, state.videoDuration - 0.001));
    }
  } else {
    // All frames
    const frameDuration = 1 / state.estimatedFPS;
    const totalFrames = Math.round(state.videoDuration * state.estimatedFPS);
    for (let i = 0; i < totalFrames; i++) {
      timestamps.push(i * frameDuration);
    }
  }

  if (timestamps.length === 0 && mode !== 'keyframes') {
    showToast('No frames to extract with current settings.', 'error');
    return;
  }

  // Show progress
  els.settingsSection.classList.add('hidden');
  els.progressSection.classList.remove('hidden');
  els.gallerySection.classList.add('hidden');
  if (els.cvAnalysis) els.cvAnalysis.classList.add('hidden');
  setStatus('Extracting…', 'busy');
  setWorkflowStep(3);

  const ctx    = els.hiddenCanvas.getContext('2d');
  const video  = els.videoPlayer;
  const cv     = window.CV; // cv.js algorithms

  video.pause();

  // ── KEYFRAMES mode: run scene detection first ──
  if (mode === 'keyframes') {
    els.progressSub.textContent = 'Scanning video for scene changes…';
    els.progressFill.style.width = '0%';
    els.progressPct.textContent = '0%';
    els.progressCount.textContent = 'Scanning…';

    try {
      const result = await cv.detectSceneChanges(
        video,
        els.hiddenCanvas,
        state.cvState.sensitivity,
        (scanned, total) => {
          const pct = Math.round((scanned / total) * 50); // first 50% is scan
          els.progressFill.style.width = pct + '%';
          els.progressPct.textContent = pct + '%';
          els.progressCount.textContent = `Scanning frame ${scanned} / ${total}`;
        }
      );
      timestamps = result.keyframes;
      state.cvState.lastSceneChanges = result.sceneChanges;
      showToast(`Found ${timestamps.length} scenes`, 'success', 2000);
    } catch (err) {
      console.error('Scene detection failed', err);
      showToast('Scene detection failed — check console.', 'error');
      els.progressSection.classList.add('hidden');
      els.settingsSection.classList.remove('hidden');
      return;
    }

    if (timestamps.length === 0) {
      els.progressSection.classList.add('hidden');
      els.settingsSection.classList.remove('hidden');
      showToast('No scene changes detected. Try higher sensitivity.', 'error');
      return;
    }
  } else {
    state.cvState.lastSceneChanges = new Set();
  }

  const total = timestamps.length;
  let done = 0;
  let skipped = 0;

  function updateProgress() {
    const offset = mode === 'keyframes' ? 50 : 0;
    const pct = offset + Math.round((done / total) * (100 - offset));
    els.progressFill.style.width = pct + '%';
    els.progressCount.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} frames`;
    els.progressPct.textContent   = pct + '%';
    els.progressSub.textContent   = `Extracting frame ${done.toLocaleString()}…`;
  }

  updateProgress();

  const BATCH = 10;

  for (let i = 0; i < timestamps.length; i += BATCH) {
    if (state.cancelled) break;

    const batch = timestamps.slice(i, i + BATCH);

    for (let bi = 0; bi < batch.length; bi++) {
      if (state.cancelled) break;
      const ts = batch[bi];
      const globalIdx = i + bi;
      try {
        await seekVideo(video, ts);
        ctx.drawImage(video, 0, 0, els.hiddenCanvas.width, els.hiddenCanvas.height);

        // ── CV: compute metrics on raw frame ──
        const imageData = ctx.getImageData(0, 0, els.hiddenCanvas.width, els.hiddenCanvas.height);
        const sharpness  = cv.computeSharpness(imageData);
        const brightness = cv.computeBrightness(imageData);

        // ── CV: skip blurry frames ──
        if (state.cvState.skipBlurry && sharpness < state.cvState.blurThreshold) {
          skipped++;
          done++;
          continue;
        }

        // ── CV: apply preprocessing ──
        let exportImageData = imageData;
        if (state.cvState.preprocessing === 'grayscale') {
          exportImageData = cv.grayscaleImageData(imageData);
          ctx.putImageData(exportImageData, 0, 0);
        } else if (state.cvState.preprocessing === 'edge') {
          exportImageData = cv.sobelEdgeDetection(imageData);
          ctx.putImageData(exportImageData, 0, 0);
        }

        // ── Generate edge thumbnail (for edge-view toggle in gallery) ──
        const edgeData = (state.cvState.preprocessing === 'edge')
          ? exportImageData
          : cv.sobelEdgeDetection(imageData);

        // Edge thumbnail canvas (small)
        const eThumb = document.createElement('canvas');
        eThumb.width  = 320; eThumb.height = Math.round(320 * els.hiddenCanvas.height / els.hiddenCanvas.width);
        const eCtx = eThumb.getContext('2d');
        // Downscale edge to thumbnail
        const fullEdgeCanvas = document.createElement('canvas');
        fullEdgeCanvas.width = els.hiddenCanvas.width;
        fullEdgeCanvas.height = els.hiddenCanvas.height;
        fullEdgeCanvas.getContext('2d').putImageData(edgeData, 0, 0);
        eCtx.drawImage(fullEdgeCanvas, 0, 0, eThumb.width, eThumb.height);
        const edgeUrl = eThumb.toDataURL('image/jpeg', 0.7);

        const blob = await canvasToBlob(els.hiddenCanvas, mimeType, quality);
        const url  = URL.createObjectURL(blob);
        const num  = state.extractedFrames.length + 1;
        const name = `${prefix}_${pad(num, 4)}.${fmt}`;
        const isSceneChange = state.cvState.lastSceneChanges.has(globalIdx);

        state.extractedFrames.push({
          blob, url, name, timestamp: ts,
          sharpness:     Math.round(sharpness * 10) / 10,
          brightness:    Math.round(brightness * 10) / 10,
          isSceneChange,
          edgeUrl,
        });
        done++;
      } catch {
        done++;
      }
    }

    updateProgress();
    await new Promise(r => setTimeout(r, 0));
  }

  // Done
  els.progressSection.classList.add('hidden');

  if (state.extractedFrames.length === 0) {
    els.settingsSection.classList.remove('hidden');
    showToast('No frames were extracted.', 'error');
    setStatus('Ready', 'ready');
    return;
  }

  buildGallery();
  buildCVAnalysis(skipped);
  els.gallerySection.classList.remove('hidden');
  els.gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setStatus('Done', 'ready');
  setWorkflowStep(4);
  showToast(`Extracted ${state.extractedFrames.length.toLocaleString()} frames`, 'success', 4000);
}

/* Seek video to a specific time and wait for seeked event */
function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    const onError  = () => { video.removeEventListener('error',  onError);  reject(); };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error',  onError,  { once: true });
    video.currentTime = time;
  });
}

/* Convert canvas to blob */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality);
  });
}

/* ──────────────── GALLERY ──────────────── */
function buildGallery() {
  const frames = state.extractedFrames;
  const sub = $('gallery-sub');
  if (sub) sub.textContent = `${frames.length.toLocaleString()} frames`;
  els.frameGrid.innerHTML = '';

  frames.forEach((frame, idx) => {
    const sl = CV.sharpnessLabel(frame.sharpness);
    const card = document.createElement('div');
    card.className = 'frame-card';
    card.dataset.index = idx;

    card.innerHTML = `
      ${frame.isSceneChange ? '<span class="scene-badge">Scene</span>' : ''}
      <img class="frame-thumb orig-img" src="${frame.url}" alt="${frame.name}" loading="lazy" />
      <img class="frame-thumb edge-img" src="${frame.edgeUrl || frame.url}" alt="Edge: ${frame.name}" loading="lazy" />
      <div class="frame-overlay">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="sharp-badge ${sl.cls}">
        <span class="sb-dot"></span>${sl.label} ${frame.sharpness.toFixed(0)}
      </div>
      <div class="frame-info">
        <div class="frame-name">${frame.name}</div>
        <div class="frame-ts">⏱ ${frame.timestamp.toFixed(3)}s</div>
      </div>
      <div class="frame-dl">
        <button class="btn-ghost btn-sm" data-idx="${idx}" title="Download this frame">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          Download
        </button>
      </div>
    `;

    card.addEventListener('click', e => {
      if (e.target.closest('.frame-dl')) {
        downloadFrame(idx);
      } else {
        openLightbox(idx);
      }
    });

    els.frameGrid.appendChild(card);
  });

  applyViewMode();
}

/* ──────────────── CV ANALYSIS PANEL ──────────────── */
function buildCVAnalysis(skipped = 0) {
  if (!els.cvAnalysis) return;
  const frames = state.extractedFrames;
  const total  = frames.length;
  if (total === 0) return;

  const sharp  = frames.filter(f => f.sharpness >= 80).length;
  const fair   = frames.filter(f => f.sharpness >= 25 && f.sharpness < 80).length;
  const blurry = frames.filter(f => f.sharpness < 25).length;
  const avgSharp  = (frames.reduce((a, f) => a + f.sharpness, 0) / total).toFixed(1);
  const avgBright = (frames.reduce((a, f) => a + f.brightness, 0) / total).toFixed(1);
  const scenes = frames.filter(f => f.isSceneChange).length;

  $('cvs-total').textContent     = total;
  $('cvs-sharp').textContent     = sharp;
  $('cvs-fair').textContent      = fair;
  $('cvs-blurry').textContent    = blurry;
  $('cvs-avg-sharp').textContent = avgSharp;
  $('cvs-scenes').textContent    = scenes || '—';
  $('cvs-avg-bright').textContent= avgBright;
  $('cvs-skipped').textContent   = skipped;

  els.cvAnalysis.classList.remove('hidden');
}

/* ──────────────── VIEW TOGGLE ──────────────── */
els.viewGridBtn.addEventListener('click', () => {
  state.viewMode = 'grid';
  state.edgeView = false;
  els.viewGridBtn.classList.add('active');
  els.viewListBtn.classList.remove('active');
  els.viewEdgeBtn.classList.remove('active');
  applyViewMode();
});

els.viewListBtn.addEventListener('click', () => {
  state.viewMode = 'list';
  state.edgeView = false;
  els.viewListBtn.classList.add('active');
  els.viewGridBtn.classList.remove('active');
  els.viewEdgeBtn.classList.remove('active');
  applyViewMode();
});

els.viewEdgeBtn.addEventListener('click', () => {
  state.edgeView = !state.edgeView;
  els.viewEdgeBtn.classList.toggle('active', state.edgeView);
  els.viewGridBtn.classList.remove('active');
  els.viewListBtn.classList.remove('active');
  if (state.edgeView) {
    state.viewMode = 'grid';
    els.viewGridBtn.classList.add('active');
  }
  applyViewMode();
});

function applyViewMode() {
  if (state.viewMode === 'list') {
    els.frameGrid.classList.add('list-view');
    els.frameGrid.classList.remove('edge-view');
  } else {
    els.frameGrid.classList.remove('list-view');
    if (state.edgeView) {
      els.frameGrid.classList.add('edge-view');
    } else {
      els.frameGrid.classList.remove('edge-view');
    }
  }
}

/* ──────────────── DOWNLOAD ──────────────── */
function downloadFrame(idx) {
  const frame = state.extractedFrames[idx];
  if (!frame) return;
  const a = document.createElement('a');
  a.href = frame.url;
  a.download = frame.name;
  a.click();
}

els.downloadAllBtn.addEventListener('click', downloadAllAsZip);

async function downloadAllAsZip() {
  const frames = state.extractedFrames;
  if (frames.length === 0) return;

  const btn = els.downloadAllBtn;
  btn.disabled = true;
  btn.innerHTML = `<span class="progress-spinner" style="width:14px;height:14px;border-width:2px;"></span> Zipping…`;
  setStatus('Zipping…', 'busy');

  try {
    const zip = new JSZip();
    const folder = zip.folder('frames');

    for (const frame of frames) {
      folder.file(frame.name, frame.blob);
    }

    // ── CV: Add metadata.json ──
    const metadata = frames.map((f, i) => ({
      filename:       f.name,
      index:          i + 1,
      timestamp_s:    parseFloat(f.timestamp.toFixed(4)),
      sharpness_score: f.sharpness,
      mean_brightness: f.brightness,
      is_scene_change: f.isSceneChange || false,
      sharpness_class: CV.sharpnessLabel(f.sharpness).label.toLowerCase(),
      resolution:     [els.hiddenCanvas.width, els.hiddenCanvas.height],
      preprocessing:  state.cvState.preprocessing,
    }));
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const prefix  = els.prefixInput.value.trim() || 'frame';
    const zipName = `${prefix}_frames_${frames.length}.zip`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(a.href);

    showToast(`Downloaded ${frames.length} frames + metadata.json`, 'success');
  } catch (err) {
    showToast('Failed to create ZIP.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg> ZIP Download`;
    setStatus('Done', 'ready');
  }
}

/* ──────────────── GALLERY CONTROLS ──────────────── */
els.clearGalleryBtn.addEventListener('click', () => {
  state.extractedFrames.forEach(f => URL.revokeObjectURL(f.url));
  state.extractedFrames = [];
  els.frameGrid.innerHTML = '';
  els.gallerySection.classList.add('hidden');
  els.settingsSection.classList.remove('hidden');
  setWorkflowStep(3);
  showToast('Gallery cleared.', 'info', 2000);
});

els.extractAgainBtn.addEventListener('click', () => {
  els.gallerySection.classList.add('hidden');
  els.settingsSection.classList.remove('hidden');
  setWorkflowStep(3);
  els.settingsSection.scrollIntoView({ behavior: 'smooth' });
});

/* ──────────────── LIGHTBOX ──────────────── */
function openLightbox(idx) {
  state.lightboxIndex = idx;
  renderLightbox();
  els.lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  els.lightbox.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderLightbox() {
  const frame = state.extractedFrames[state.lightboxIndex];
  if (!frame) return;
  els.lightboxImg.src = frame.url;
  els.lightboxLabel.textContent = `${frame.name}  ·  ${frame.timestamp.toFixed(3)}s  ·  (${state.lightboxIndex + 1}/${state.extractedFrames.length})`;
}

els.lightboxClose.addEventListener('click', closeLightbox);
els.lightboxBackdrop.addEventListener('click', closeLightbox);

els.lightboxPrev.addEventListener('click', () => {
  state.lightboxIndex = (state.lightboxIndex - 1 + state.extractedFrames.length) % state.extractedFrames.length;
  renderLightbox();
});
els.lightboxNext.addEventListener('click', () => {
  state.lightboxIndex = (state.lightboxIndex + 1) % state.extractedFrames.length;
  renderLightbox();
});

els.lightboxDownload.addEventListener('click', () => downloadFrame(state.lightboxIndex));

document.addEventListener('keydown', e => {
  if (els.lightbox.classList.contains('hidden')) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   { state.lightboxIndex = (state.lightboxIndex - 1 + state.extractedFrames.length) % state.extractedFrames.length; renderLightbox(); }
  if (e.key === 'ArrowRight')  { state.lightboxIndex = (state.lightboxIndex + 1) % state.extractedFrames.length; renderLightbox(); }
});

/* ──────────────── INIT ──────────────── */
updatePrefixPreview();
setStatus('Ready', 'ready');
