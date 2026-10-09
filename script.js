(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const directions = window.HeadTrackerCore.DIRECTIONS;
    const targetSelect = $('target-per-direction');
    let tracker = window.HeadTrackerCore.createRepetitionTracker(Number(targetSelect.value));
    const state = {
      mode: 'camera', session: 'idle', stream: null, cameraHelper: null, faceMesh: null,
      facingMode: 'user', elapsed: 0, timer: null, voice: false, calibrating: false,
      calibrationSamples: [], baseline: null, smoothedPose: null, candidate: 'CENTER',
      candidateFrames: 0, stable: 'CENTER', startGeneration: 0, frameErrorShown: false
    };
    const faceVersion = '0.4.1633559619';
    const cameraVersion = '0.3.1675466862';
    const scripts = new Map();
    const symbols = { CENTER: '•', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };
    const labels = { CENTER: 'Centre', UP: 'Up', DOWN: 'Down', LEFT: 'Screen left', RIGHT: 'Screen right' };

    function setStatus(message) { if ($('tracking-status').textContent !== message) $('tracking-status').textContent = message; }
    function setDirection(direction, guidance) {
      $('live-direction').textContent = labels[direction] || direction;
      $('live-direction-symbol').textContent = symbols[direction] || '•';
      $('live-guidance').textContent = guidance;
      directions.forEach(key => $(`stat-${key}`).classList.toggle('direction-active', key === direction));
    }
    function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
    function snapshot() { return tracker.getSnapshot(); }
    function renderProgress() {
      const snap = snapshot();
      $('total-progress').textContent = `${snap.total} / ${snap.totalTarget}`;
      $('timer-display').textContent = formatTime(state.elapsed);
      $('overall-progress-fill').style.width = `${snap.totalTarget ? (snap.total / snap.totalTarget) * 100 : 0}%`;
      $('overall-progress').setAttribute('aria-valuemax', String(snap.totalTarget));
      $('overall-progress').setAttribute('aria-valuenow', String(snap.total));
      directions.forEach(dir => {
        $(`count-${dir}`).textContent = String(snap.counts[dir]);
        $(`stat-${dir}`).classList.toggle('goal-reached', snap.counts[dir] >= snap.targetPerDirection);
      });
      document.querySelectorAll('.per-direction-target').forEach(node => node.textContent = String(snap.targetPerDirection));
    }
    function renderState() {
      const states = { idle: 'Ready', starting: 'Starting…', running: state.mode === 'manual' ? 'Manual session' : 'Tracking', paused: 'Paused', ended: 'Stopped', complete: 'Complete' };
      $('session-state-text').textContent = states[state.session] || 'Ready';
      $('session-state').dataset.state = state.session;
      $('start-session-btn').disabled = ['starting', 'running'].includes(state.session);
      $('start-session-btn').textContent = state.session === 'starting' ? 'Starting…' : state.session === 'paused' ? 'Resume session' : ['ended', 'complete'].includes(state.session) ? 'Start new session' : state.mode === 'manual' ? 'Start manual session' : 'Start camera session';
      $('pause-resume-btn').disabled = !['running', 'paused'].includes(state.session);
      $('pause-resume-btn').textContent = state.session === 'paused' ? 'Resume' : 'Pause';
      $('end-session-btn').disabled = !['starting', 'running', 'paused'].includes(state.session);
      $('mode-toggle-btn').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('target-per-direction').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('calibrate-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('flip-camera-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('camera-stage').hidden = state.mode === 'manual';
      $('calibration-row').hidden = state.mode === 'manual';
      $('calibration-progress-wrap').hidden = state.mode === 'manual' || !state.calibrating;
      $('manual-panel').hidden = state.mode !== 'manual';
      $('mode-toggle-btn').textContent = state.mode === 'manual' ? 'Use camera mode' : 'Use manual mode';
      $('voice-btn').textContent = state.voice ? 'Voice on' : 'Voice off';
      $('voice-btn').setAttribute('aria-pressed', String(state.voice));
      document.querySelectorAll('[data-manual-direction]').forEach(button => button.disabled = state.mode !== 'manual' || state.session !== 'running');
      renderProgress();
    }
    function startTimer() {
      stopTimer();
      state.timer = window.setInterval(() => { if (state.session === 'running') { state.elapsed += 1; $('timer-display').textContent = formatTime(state.elapsed); } }, 1000);
    }
    function stopTimer() { if (state.timer !== null) clearInterval(state.timer); state.timer = null; }
    function stopCamera() {
      if (state.cameraHelper) { try { state.cameraHelper.stop(); } catch (_) {} state.cameraHelper = null; }
      if (state.stream) { state.stream.getTracks().forEach(track => { try { track.stop(); } catch (_) {} }); state.stream = null; }
      $('webcam').srcObject = null;
      $('camera-overlay').hidden = false;
      $('camera-live-pill').hidden = true;
      $('pose-status').textContent = 'Camera off';
      $('calibrate-btn').disabled = true;
      $('flip-camera-btn').disabled = true;
    }
    function disposeFaceMesh() {
      if (!state.faceMesh) return;
      const mesh = state.faceMesh; state.faceMesh = null;
      try { const result = mesh.close?.(); result?.catch?.(() => {}); } catch (_) {}
    }
    function speak(message) {
      if (!state.voice || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message); utterance.rate = 0.92; window.speechSynthesis.speak(utterance);
    }
    function startCalibration(manualClick = false) {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.calibrating = true; state.calibrationSamples = []; state.baseline = null;
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; tracker.interruptMovement();
      $('calibration-progress-fill').style.width = '0%';
      $('calibration-progress-text').textContent = 'Looking for a stable neutral position…';
      $('calibration-title').textContent = manualClick ? 'Recalibrating…' : 'Calibrating neutral position…';
      $('calibration-description').textContent = 'Look straight ahead comfortably and hold still for a moment.';
      $('calibration-dot').classList.add('is-working');
      $('calibration-progress-wrap').hidden = false;
      setDirection('CENTER', 'Hold a comfortable neutral position.');
      setStatus('Calibration started automatically. Look straight ahead and hold still briefly.');
      renderState();
    }
    function resetDebounce({ interrupt = true } = {}) {
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER';
      if (interrupt) tracker.interruptMovement();
      setDirection('CENTER', state.baseline ? 'Move gently in one direction, then return to centre.' : 'Calibrate your neutral position first.');
    }
    function onTrackingEvent(event) {
      renderProgress();
      if (event.type === 'movement-started') {
        setDirection(event.direction, `${labels[event.direction]} detected. Return to centre to count this cycle.`);
        setStatus(`${labels[event.direction]} detected — return to centre to complete one repetition.`);
      } else if (event.type === 'repetition') {
        setDirection('CENTER', 'Cycle counted. Return to centre before your next movement.');
        setStatus(`${labels[event.direction]} repetition counted: ${event.counts[event.direction]} of ${event.targetPerDirection}.`);
        speak(`${labels[event.direction]} counted`);
        finishIfComplete();
      } else if (event.type === 'direction-switch-without-neutral') {
        setDirection(event.direction, 'Return to centre before changing direction.');
        setStatus('No count yet. Return to centre before moving in another direction.');
      }
    }
    function finishIfComplete() {
      const snap = snapshot(); if (!snap.complete || state.session === 'complete') return;
      state.session = 'complete'; state.calibrating = false; stopTimer(); stopCamera(); disposeFaceMesh();
      setDirection('CENTER', 'Session goal reached.');
      setStatus('Goal reached. Camera is off. No session history was saved.');
      $('completion-summary').textContent = `You recorded ${snap.total} of ${snap.totalTarget} movement cycles in ${formatTime(state.elapsed)}. The camera is off and this session was not saved.`;
      renderState(); $('completion-dialog').showModal(); speak('Session goal reached.');
    }
    function addScript(url) {
      if (scripts.has(url)) return scripts.get(url);
      const promise = new Promise((resolve, reject) => {
        const tag = document.createElement('script'); tag.src = url; tag.async = true; tag.crossOrigin = 'anonymous'; tag.referrerPolicy = 'no-referrer';
        tag.onload = resolve;
        tag.onerror = () => { tag.remove(); scripts.delete(url); reject(new Error('Could not load the camera tracking library. Check your connection or use manual mode.')); };
        document.head.appendChild(tag);
      }); scripts.set(url, promise); return promise;
    }
    async function loadCameraLibraries() {
      await addScript(`https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@${cameraVersion}/camera_utils.js`);
      await addScript(`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceVersion}/face_mesh.js`);
      if (typeof window.Camera !== 'function' || typeof window.FaceMesh !== 'function') throw new Error('Camera tracker failed to load. Try again or choose manual mode.');
    }
    function createFaceMesh() {
      if (state.faceMesh) return;
      const mesh = new window.FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceVersion}/${file}` });
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      mesh.onResults(onFaceResults); state.faceMesh = mesh;
    }
    async function startCameraSession() {
      const previous = state.session; const generation = ++state.startGeneration;
      state.session = 'starting'; renderState(); setStatus('Starting camera. Allow access when your browser asks.');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open this HTTPS page or use manual mode.');
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: state.facingMode }, width: { ideal: 960 }, height: { ideal: 720 } } });
        if (generation !== state.startGeneration || state.session !== 'starting') { stopCamera(); return; }
        const video = $('webcam'); video.srcObject = state.stream; await video.play();
        if (generation !== state.startGeneration || state.session !== 'starting') { stopCamera(); return; }
        setStatus('Loading the on-device tracker…'); await loadCameraLibraries();
        if (generation !== state.startGeneration || state.session !== 'starting') { stopCamera(); return; }
        createFaceMesh();
        state.cameraHelper = new window.Camera(video, { onFrame: async () => { if (state.session === 'running' && state.mode === 'camera' && state.faceMesh) await state.faceMesh.send({ image: video }); }, width: 960, height: 720 });
        state.session = 'running'; $('camera-overlay').hidden = true; $('camera-live-pill').hidden = false; $('pose-status').textContent = 'Searching for face';
        await state.cameraHelper.start();
        if (generation !== state.startGeneration || state.session !== 'running') return;
        startTimer(); renderState();
        setStatus('Camera ready. Keep your face in view; neutral calibration starts automatically.');
        setDirection('CENTER', 'Look straight ahead while automatic calibration starts.');
      } catch (error) {
        stopCamera(); stopTimer(); disposeFaceMesh(); state.calibrating = false;
        if (generation !== state.startGeneration) return;
        state.session = previous === 'paused' ? 'paused' : 'idle';
        renderState(); setStatus(error?.message || 'Camera could not start. Try manual mode.');
      }
    }
    function resetCalibrationUI() {
      $('calibration-title').textContent = 'Neutral position not set';
      $('calibration-description').textContent = 'Starts automatically when a face is detected.';
      $('calibration-dot').classList.remove('is-working');
      $('calibration-progress-fill').style.width = '0%';
      $('calibration-progress-text').textContent = 'Waiting for face…';
      $('calibration-progress-wrap').hidden = true;
    }
    function resetCounts() {
      tracker = window.HeadTrackerCore.createRepetitionTracker(Number(targetSelect.value));
      state.elapsed = 0; state.calibrating = false; state.calibrationSamples = []; state.baseline = null; state.smoothedPose = null;
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER';
      resetDebounce(); resetCalibrationUI(); renderProgress();
    }
    function startNewSession() {
      tracker = window.HeadTrackerCore.createRepetitionTracker(Number(targetSelect.value));
      state.elapsed = 0; state.calibrating = false; state.calibrationSamples = []; state.baseline = null; state.smoothedPose = null;
      resetDebounce(); resetCalibrationUI(); renderProgress();
    }
    async function startSession() {
      if (['running', 'starting'].includes(state.session)) return;
      if (state.session === 'paused') {
        if (state.mode === 'manual') { state.session = 'running'; startTimer(); renderState(); setStatus('Manual session resumed.'); }
        else await startCameraSession();
        return;
      }
      if (['ended', 'complete'].includes(state.session)) startNewSession();
      else if (state.session === 'idle') startNewSession();
      if (state.mode === 'manual') { state.session = 'running'; startTimer(); renderState(); setDirection('CENTER', 'Record a completed cycle after returning to centre.'); setStatus('Manual session started. Camera access is not used.'); }
      else await startCameraSession();
    }
    function pauseSession() {
      if (state.session !== 'running') return;
      stopTimer(); if (state.mode === 'camera') { stopCamera(); disposeFaceMesh(); }
      state.calibrating = false; resetDebounce(); state.session = 'paused'; renderState();
      setStatus('Session paused. Camera released. Resume when ready.');
    }
    function endSession() {
      if (!['starting', 'running', 'paused'].includes(state.session)) return;
      state.startGeneration += 1; stopTimer(); state.calibrating = false; stopCamera(); disposeFaceMesh(); resetDebounce(); state.session = 'ended'; renderState(); setStatus('Session stopped. Counts remain here until reset or page refresh.');
    }
    function poseFromLandmarks(landmarks) {
      const nose = landmarks[1], leftEye = landmarks[33], rightEye = landmarks[263];
      if (!nose || !leftEye || !rightEye) return null;
      const centerX = (leftEye.x + rightEye.x) / 2, centerY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
      if (!Number.isFinite(eyeDistance) || eyeDistance < 0.001) return null;
      return { horizontal: (nose.x - centerX) / eyeDistance, vertical: (nose.y - centerY) / eyeDistance };
    }
    function finishCalibration() {
      const n = state.calibrationSamples.length;
      if (n < 30) return;
      state.baseline = state.calibrationSamples.reduce((sum, sample) => ({ horizontal: sum.horizontal + sample.horizontal / n, vertical: sum.vertical + sample.vertical / n }), { horizontal: 0, vertical: 0 });
      state.calibrating = false; state.calibrationSamples = []; $('calibration-progress-wrap').hidden = true;
      $('calibration-title').textContent = 'Neutral position ready'; $('calibration-description').textContent = 'Tracking is ready. Recalibrate if you change position or camera.'; $('calibration-dot').classList.remove('is-working');
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; tracker.interruptMovement();
      setDirection('CENTER', 'Move gently in one direction, then return to centre.'); setStatus('Calibration complete. Live direction tracking is active.');
      renderState();
    }
    function onFaceResults(results) {
      if (state.session !== 'running' || state.mode !== 'camera') return;
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) {
        $('pose-status').textContent = 'Face not detected'; $('camera-live-pill').hidden = false;
        if (state.calibrating) { state.calibrationSamples = []; $('calibration-progress-fill').style.width = '0%'; $('calibration-progress-text').textContent = 'Face lost — return to frame to calibrate'; }
        resetDebounce(); setStatus('Face not detected. Move into the camera frame; no incomplete cycle was counted.'); return;
      }
      $('pose-status').textContent = 'Face detected';
      const pose = poseFromLandmarks(landmarks); if (!pose) return;
      const alpha = 0.38;
      state.smoothedPose = state.smoothedPose ? { horizontal: alpha * pose.horizontal + (1 - alpha) * state.smoothedPose.horizontal, vertical: alpha * pose.vertical + (1 - alpha) * state.smoothedPose.vertical } : pose;
      if (!state.baseline && !state.calibrating) startCalibration(false);
      if (state.calibrating) {
        const samples = state.calibrationSamples; const previous = samples[samples.length - 1];
        if (previous && Math.hypot(state.smoothedPose.horizontal - previous.horizontal, state.smoothedPose.vertical - previous.vertical) > 0.11) {
          state.calibrationSamples = []; $('calibration-progress-fill').style.width = '0%';
        }
        state.calibrationSamples.push({ ...state.smoothedPose });
        const count = state.calibrationSamples.length, percent = Math.min(100, Math.round(count / 45 * 100));
        $('calibration-progress-fill').style.width = `${percent}%`; $('calibration-progress-text').textContent = `Hold still… ${Math.min(count, 45)} / 45 frames`;
        if (count >= 45) finishCalibration();
        return;
      }
      if (!state.baseline) return;
      const inferred = window.HeadTrackerCore.directionFromPose(state.smoothedPose, state.baseline, { horizontal: 0.20, vertical: 0.18 });
      if (inferred !== state.candidate) { state.candidate = inferred; state.candidateFrames = 1; } else state.candidateFrames += 1;
      const required = inferred === 'CENTER' ? 4 : 3;
      if (state.candidateFrames >= required) {
        if (state.stable !== inferred) { state.stable = inferred; const event = tracker.observe(inferred); onTrackingEvent(event); }
        if (inferred === 'CENTER') setDirection('CENTER', 'Centre detected. Ready for the next movement.');
        else setDirection(inferred, `${labels[inferred]} detected. Return to centre to count.`);
      } else if (inferred !== 'CENTER') {
        setDirection(inferred, `Recognising ${labels[inferred].toLowerCase()}… return to centre after the movement.`);
      }
    }
    function recordManual(direction) {
      if (state.mode !== 'manual' || state.session !== 'running') return;
      const event = tracker.recordManual(direction); renderProgress();
      if (event.type === 'direction-goal-reached') { setStatus(`${labels[direction]} goal is already complete.`); return; }
      setDirection(direction, 'Manual cycle recorded. Continue at your own pace.'); setStatus(`${labels[direction]} cycle recorded manually. This is self-reported.`); speak(`${labels[direction]} recorded`); finishIfComplete();
    }
    async function flipCamera() {
      if (state.mode !== 'camera' || state.session !== 'running') return;
      state.facingMode = state.facingMode === 'user' ? 'environment' : 'user'; stopCamera(); disposeFaceMesh(); state.baseline = null; state.smoothedPose = null; state.calibrating = false;
      state.session = 'paused'; renderState(); setStatus('Camera changed. Resume the session and recalibrate.'); await startCameraSession();
    }
    function toggleMode() {
      if (['starting', 'running', 'paused'].includes(state.session)) return;
      stopCamera(); disposeFaceMesh(); state.mode = state.mode === 'camera' ? 'manual' : 'camera'; state.baseline = null; state.calibrating = false; resetDebounce();
      renderState(); setDirection('CENTER', state.mode === 'manual' ? 'Manual mode. Tap only after a completed cycle.' : 'Start a camera session to begin.'); setStatus(state.mode === 'manual' ? 'Manual mode selected. Camera is not used.' : 'Camera mode selected. The camera remains off until you press Start.');
    }

    $('start-session-btn').addEventListener('click', startSession);
    $('pause-resume-btn').addEventListener('click', () => state.session === 'paused' ? startSession() : pauseSession());
    $('end-session-btn').addEventListener('click', endSession);
    $('reset-btn').addEventListener('click', () => { state.startGeneration += 1; stopTimer(); stopCamera(); disposeFaceMesh(); state.session = 'idle'; resetCounts(); renderState(); setDirection('CENTER', 'Start a session to begin tracking.'); setStatus('Counts reset. Camera is off. Start a new session when ready.'); });
    $('calibrate-btn').addEventListener('click', () => startCalibration(true));
    $('flip-camera-btn').addEventListener('click', flipCamera);
    $('mode-toggle-btn').addEventListener('click', toggleMode);
    $('voice-btn').addEventListener('click', () => { state.voice = !state.voice; if (!state.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel(); renderState(); if (state.voice) speak('Voice prompts enabled'); });
    targetSelect.addEventListener('change', () => { tracker.setTargetPerDirection(Number(targetSelect.value)); renderProgress(); setStatus(`Goal set to ${targetSelect.value} per direction.`); });
    document.querySelectorAll('[data-manual-direction]').forEach(button => button.addEventListener('click', () => recordManual(button.dataset.manualDirection)));
    document.querySelectorAll('[data-dialog-open]').forEach(button => button.addEventListener('click', () => { const dialog = $(button.dataset.dialogOpen); if (dialog?.showModal) dialog.showModal(); }));
    document.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
    document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    $('new-session-btn').addEventListener('click', () => { $('completion-dialog').close(); state.startGeneration += 1; stopTimer(); stopCamera(); disposeFaceMesh(); state.session = 'idle'; resetCounts(); renderState(); startSession(); });

    renderState(); setDirection('CENTER', 'Start a session to begin tracking.'); $('pose-status').textContent = 'Camera off';
  });
})();
