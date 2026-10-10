(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const Core = window.HeadTrackerCore;
    if (!Core) {
      $('tracking-status').textContent = 'The tracker could not load. Refresh the page; if the problem continues, try manual mode after reloading.';
      return;
    }

    const directions = Core.DIRECTIONS;
    const targetSelect = $('target-per-direction');
    const faceVersion = '0.4.1633559619';
    const faceScriptUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceVersion}/face_mesh.js`;
    const scriptPromises = new Map();
    let tracker = Core.createRepetitionTracker(Number(targetSelect.value));
    const state = {
      mode: 'camera', session: 'idle', facingMode: 'user', stream: null, faceMesh: null,
      elapsed: 0, timer: null, voice: false, calibrating: false, samples: [], baseline: null,
      smoothedPose: null, candidate: 'CENTER', candidateFrames: 0, stable: 'CENTER',
      startGeneration: 0, frameHandle: null, frameHandleType: null, frameInFlight: false,
      lastVideoTime: -1, frameErrorShown: false
    };
    const labels = { CENTER: 'Centre', UP: 'Up', DOWN: 'Down', LEFT: 'Screen left', RIGHT: 'Screen right' };
    const symbols = { CENTER: '•', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };

    function setStatus(message) {
      const node = $('tracking-status');
      if (node && node.textContent !== message) node.textContent = message;
    }
    function setDirection(direction, guidance) {
      $('live-direction').textContent = labels[direction] || 'Ready';
      $('live-direction-symbol').textContent = symbols[direction] || '•';
      $('live-guidance').textContent = guidance;
      directions.forEach(key => $(`stat-${key}`).classList.toggle('direction-active', key === direction));
    }
    function formatTime(seconds) {
      return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function snapshot() { return tracker.getSnapshot(); }
    function renderProgress() {
      const data = snapshot();
      $('total-progress').textContent = `${data.total} / ${data.totalTarget}`;
      $('timer-display').textContent = formatTime(state.elapsed);
      $('overall-progress-fill').style.width = `${data.totalTarget ? data.total / data.totalTarget * 100 : 0}%`;
      $('overall-progress').setAttribute('aria-valuemax', String(data.totalTarget));
      $('overall-progress').setAttribute('aria-valuenow', String(data.total));
      directions.forEach(direction => {
        $(`count-${direction}`).textContent = String(data.counts[direction]);
        $(`stat-${direction}`).classList.toggle('goal-reached', data.counts[direction] >= data.targetPerDirection);
      });
      document.querySelectorAll('.per-direction-target').forEach(node => { node.textContent = String(data.targetPerDirection); });
    }
    function renderState() {
      const names = { idle: 'Ready', starting: 'Starting…', running: state.mode === 'manual' ? 'Manual session' : 'Tracking', paused: 'Paused', ended: 'Stopped', complete: 'Complete' };
      $('session-state-text').textContent = names[state.session] || 'Ready';
      $('session-state').dataset.state = state.session;
      $('start-session-btn').disabled = ['starting', 'running'].includes(state.session);
      $('start-session-btn').textContent = state.session === 'starting' ? 'Starting…' : state.session === 'paused' ? 'Resume session' : ['ended', 'complete'].includes(state.session) ? 'Start new session' : state.mode === 'manual' ? 'Start manual session' : 'Start camera session';
      $('pause-resume-btn').disabled = !['running', 'paused'].includes(state.session);
      $('pause-resume-btn').textContent = state.session === 'paused' ? 'Resume' : 'Pause';
      $('end-session-btn').disabled = !['starting', 'running', 'paused'].includes(state.session);
      $('mode-toggle-btn').disabled = ['starting', 'running', 'paused'].includes(state.session);
      targetSelect.disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('calibrate-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('flip-camera-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('camera-column').hidden = state.mode === 'manual';
      $('workspace').classList.toggle('manual-mode', state.mode === 'manual');
      $('calibration-row').hidden = state.mode === 'manual';
      $('calibration-progress-wrap').hidden = state.mode === 'manual' || !state.calibrating;
      $('manual-panel').hidden = state.mode !== 'manual';
      $('mode-toggle-btn').textContent = state.mode === 'manual' ? 'Use camera mode' : 'Use manual mode';
      $('voice-btn').textContent = state.voice ? 'Voice on' : 'Voice off';
      $('voice-btn').setAttribute('aria-pressed', String(state.voice));
      document.querySelectorAll('[data-manual-direction]').forEach(button => { button.disabled = state.mode !== 'manual' || state.session !== 'running'; });
      renderProgress();
    }
    function startTimer() {
      stopTimer();
      state.timer = window.setInterval(() => {
        if (state.session === 'running') {
          state.elapsed += 1;
          $('timer-display').textContent = formatTime(state.elapsed);
        }
      }, 1000);
    }
    function stopTimer() { if (state.timer !== null) window.clearInterval(state.timer); state.timer = null; }
    function stopTracks(stream) { if (stream) stream.getTracks().forEach(track => { try { track.stop(); } catch (_) {} }); }

    function cancelFrameLoop() {
      const video = $('webcam');
      if (state.frameHandle !== null) {
        try {
          if (state.frameHandleType === 'video' && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(state.frameHandle);
          else window.cancelAnimationFrame(state.frameHandle);
        } catch (_) {}
      }
      state.frameHandle = null;
      state.frameHandleType = null;
    }
    function stopCamera() {
      cancelFrameLoop();
      const stream = state.stream;
      state.stream = null;
      stopTracks(stream);
      const video = $('webcam');
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
      $('camera-overlay').hidden = false;
      $('camera-live-pill').hidden = true;
      $('pose-status').textContent = 'Camera off';
      $('flip-camera-btn').disabled = true;
      $('calibrate-btn').disabled = true;
    }
    function disposeFaceMesh() {
      const mesh = state.faceMesh;
      state.faceMesh = null;
      if (!mesh) return;
      try { const closeResult = mesh.close?.(); closeResult?.catch?.(() => {}); } catch (_) {}
    }
    function speak(message) {
      if (!state.voice || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    }
    function addScript(url) {
      if (scriptPromises.has(url)) return scriptPromises.get(url);
      const promise = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = url; tag.async = true; tag.crossOrigin = 'anonymous'; tag.referrerPolicy = 'no-referrer';
        tag.onload = () => resolve();
        tag.onerror = () => { tag.remove(); scriptPromises.delete(url); reject(new Error('The camera tracker could not be downloaded. Check your connection or use manual mode.')); };
        document.head.appendChild(tag);
      });
      scriptPromises.set(url, promise);
      return promise;
    }
    async function loadFaceMeshLibrary() {
      await addScript(faceScriptUrl);
      if (typeof window.FaceMesh !== 'function') throw new Error('The camera model did not initialise. Try again or use manual mode.');
    }
    function createFaceMesh() {
      const mesh = new window.FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceVersion}/${file}` });
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
      mesh.onResults(results => { if (state.faceMesh === mesh) onFaceResults(results); });
      state.faceMesh = mesh;
    }

    function isFrameLoopCurrent(generation) {
      return generation === state.startGeneration && state.session === 'running' && state.mode === 'camera' && !!state.stream && !!state.faceMesh;
    }
    function frameFailure(error) {
      if (state.frameErrorShown) return;
      state.frameErrorShown = true;
      stopTimer(); state.startGeneration += 1; state.calibrating = false; state.samples = [];
      stopCamera(); disposeFaceMesh(); resetCalibrationUI();
      state.session = 'paused'; renderState();
      setStatus('Live tracking stopped safely because frame processing failed. Resume to retry or switch to manual mode.');
      console.error('Head tracker frame processing failed:', error);
    }
    function scheduleNextFrame(generation) {
      if (!isFrameLoopCurrent(generation)) return;
      const video = $('webcam');
      if (typeof video.requestVideoFrameCallback === 'function') {
        state.frameHandleType = 'video';
        state.frameHandle = video.requestVideoFrameCallback(async () => {
          state.frameHandle = null; state.frameHandleType = null;
          if (!isFrameLoopCurrent(generation)) return;
          if (state.frameInFlight) { scheduleNextFrame(generation); return; }
          state.frameInFlight = true;
          try { await state.faceMesh.send({ image: video }); }
          catch (error) { frameFailure(error); }
          finally { state.frameInFlight = false; scheduleNextFrame(generation); }
        });
      } else {
        state.frameHandleType = 'animation';
        state.frameHandle = window.requestAnimationFrame(async () => {
          state.frameHandle = null; state.frameHandleType = null;
          if (!isFrameLoopCurrent(generation)) return;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== state.lastVideoTime && !state.frameInFlight) {
            state.lastVideoTime = video.currentTime;
            state.frameInFlight = true;
            try { await state.faceMesh.send({ image: video }); }
            catch (error) { frameFailure(error); }
            finally { state.frameInFlight = false; }
          }
          scheduleNextFrame(generation);
        });
      }
    }

    async function startCameraSession() {
      const previousSession = state.session;
      const generation = ++state.startGeneration;
      let acquiredStream = null;
      state.session = 'starting';
      renderState();
      setStatus('Requesting camera access…');
      if (previousSession === 'paused') {
        state.baseline = null; state.smoothedPose = null; state.samples = []; state.calibrating = false;
      }
      try {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error('Camera access is unavailable in this browser. Open the HTTPS site or use manual mode.');
        }
        // This is the only camera acquisition path. MediaPipe's Camera helper is intentionally not used.
        acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: state.facingMode }, width: { ideal: 640 }, height: { ideal: 480 } } });
        if (generation !== state.startGeneration || state.session !== 'starting') { stopTracks(acquiredStream); return; }
        state.stream = acquiredStream;
        const video = $('webcam');
        video.srcObject = acquiredStream;
        await video.play();
        if (generation !== state.startGeneration || state.session !== 'starting') { if (state.stream === acquiredStream) stopCamera(); else stopTracks(acquiredStream); return; }
        setStatus('Loading the on-device movement tracker…');
        await loadFaceMeshLibrary();
        if (generation !== state.startGeneration || state.session !== 'starting') { if (state.stream === acquiredStream) stopCamera(); else stopTracks(acquiredStream); return; }
        createFaceMesh();
        state.frameInFlight = false; state.lastVideoTime = -1; state.frameErrorShown = false;
        state.session = 'running';
        $('camera-overlay').hidden = true;
        $('camera-live-pill').hidden = false;
        $('pose-status').textContent = 'Searching for face';
        startTimer(); renderState();
        setDirection('CENTER', 'Keep your face in view. Calibration starts automatically.');
        setStatus('Camera is active. Look straight ahead while neutral calibration starts.');
        scheduleNextFrame(generation);
      } catch (error) {
        if (generation !== state.startGeneration) { if (acquiredStream && state.stream !== acquiredStream) stopTracks(acquiredStream); return; }
        stopCamera(); disposeFaceMesh(); stopTimer(); state.calibrating = false; resetCalibrationUI();
        state.session = previousSession === 'paused' ? 'paused' : 'idle';
        renderState();
        setStatus(error?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser or switch to manual mode.' : error?.message || 'Camera could not start. Try manual mode.');
      }
    }

    function startCalibration(manual = false) {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.calibrating = true; state.samples = []; state.baseline = null;
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; tracker.interruptMovement();
      $('calibration-progress-fill').style.width = '0%';
      $('calibration-progress-text').textContent = 'Waiting for a stable neutral position…';
      $('calibration-title').textContent = manual ? 'Recalibrating…' : 'Calibrating automatically…';
      $('calibration-description').textContent = 'Look straight ahead comfortably and hold still for a moment.';
      $('calibration-dot').classList.add('is-working');
      $('calibration-progress-wrap').hidden = false;
      setDirection('CENTER', 'Hold a comfortable neutral position.');
      setStatus('Calibration in progress. Keep your face visible and hold still briefly.');
      renderState();
    }
    function resetCalibrationUI() {
      $('calibration-title').textContent = 'Calibration starts automatically';
      $('calibration-description').textContent = 'Once your face is detected, hold a comfortable neutral position.';
      $('calibration-dot').classList.remove('is-working');
      $('calibration-progress-fill').style.width = '0%';
      $('calibration-progress-text').textContent = 'Waiting for face…';
      $('calibration-progress-wrap').hidden = true;
    }
    function finishCalibration() {
      const count = state.samples.length;
      if (count < 45) return;
      state.baseline = state.samples.reduce((sum, sample) => ({ horizontal: sum.horizontal + sample.horizontal / count, vertical: sum.vertical + sample.vertical / count }), { horizontal: 0, vertical: 0 });
      state.calibrating = false; state.samples = [];
      $('calibration-progress-wrap').hidden = true;
      $('calibration-title').textContent = 'Neutral position ready';
      $('calibration-description').textContent = 'Tracking is live. Recalibrate if your camera or sitting position changes.';
      $('calibration-dot').classList.remove('is-working');
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; tracker.interruptMovement();
      setDirection('CENTER', 'Move gently in one direction, then return to centre.');
      setStatus('Calibration complete. Live direction tracking is active.');
      renderState();
    }
    function resetDebounce(interrupt = true) {
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER';
      if (interrupt) tracker.interruptMovement();
      setDirection('CENTER', state.baseline ? 'Centre / face reacquired. Begin a new movement when ready.' : 'Calibrate your neutral position first.');
    }
    function onFaceResults(results) {
      if (state.session !== 'running' || state.mode !== 'camera') return;
      const landmarks = results?.multiFaceLandmarks?.[0];
      if (!landmarks) {
        $('pose-status').textContent = 'Face not detected';
        if (state.calibrating) { state.samples = []; $('calibration-progress-fill').style.width = '0%'; $('calibration-progress-text').textContent = 'Face lost — return to frame'; }
        resetDebounce();
        setStatus('Face not detected. Move into view; an incomplete movement will not count.');
        return;
      }
      $('pose-status').textContent = 'Face detected';
      const pose = poseFromLandmarks(landmarks);
      if (!pose) { setStatus('Face landmarks are unstable. Adjust lighting or camera position.'); return; }
      const alpha = 0.35;
      state.smoothedPose = state.smoothedPose ? {
        horizontal: alpha * pose.horizontal + (1 - alpha) * state.smoothedPose.horizontal,
        vertical: alpha * pose.vertical + (1 - alpha) * state.smoothedPose.vertical
      } : pose;

      if (!state.baseline && !state.calibrating) startCalibration(false);
      if (state.calibrating) {
        const anchor = state.samples[0];
        if (anchor && Math.hypot(state.smoothedPose.horizontal - anchor.horizontal, state.smoothedPose.vertical - anchor.vertical) > 0.10) {
          state.samples = [];
        }
        state.samples.push({ ...state.smoothedPose });
        const amount = state.samples.length;
        $('calibration-progress-fill').style.width = `${Math.min(100, Math.round(amount / 45 * 100))}%`;
        $('calibration-progress-text').textContent = `Hold still… ${Math.min(amount, 45)} / 45 frames`;
        if (amount >= 45) finishCalibration();
        return;
      }
      if (!state.baseline) return;

      const inferred = Core.directionFromPose(state.smoothedPose, state.baseline, {
        activeDirection: state.stable,
        horizontalEnter: 0.13, verticalEnter: 0.12, horizontalExit: 0.065, verticalExit: 0.06
      });
      if (inferred !== state.candidate) { state.candidate = inferred; state.candidateFrames = 1; }
      else state.candidateFrames += 1;
      const required = inferred === 'CENTER' ? 4 : 3;
      if (state.candidateFrames >= required && state.stable !== inferred) {
        state.stable = inferred;
        const event = tracker.observe(inferred);
        onTrackingEvent(event);
      }
      if (state.candidateFrames >= required) {
        if (inferred === 'CENTER') setDirection('CENTER', 'Centre detected. Ready for the next movement.');
        else setDirection(inferred, `${labels[inferred]} detected. Return to centre to count.`);
      } else if (inferred !== 'CENTER') {
        setDirection(inferred, `Recognising ${labels[inferred].toLowerCase()}… return to centre after the movement.`);
      }
    }
    function poseFromLandmarks(landmarks) {
      const nose = landmarks[1], leftEye = landmarks[33], rightEye = landmarks[263];
      if (!nose || !leftEye || !rightEye) return null;
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
      if (!Number.isFinite(eyeDistance) || eyeDistance < 0.001) return null;
      return { horizontal: (nose.x - eyeCenterX) / eyeDistance, vertical: (nose.y - eyeCenterY) / eyeDistance };
    }
    function onTrackingEvent(event) {
      renderProgress();
      if (event.type === 'movement-started') {
        setDirection(event.direction, `${labels[event.direction]} detected. Return to centre to complete one repetition.`);
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
      const data = snapshot();
      if (!data.complete || state.session === 'complete') return;
      state.session = 'complete'; stopTimer(); state.calibrating = false;
      state.startGeneration += 1; stopCamera(); disposeFaceMesh(); resetCalibrationUI();
      setDirection('CENTER', 'Session goal reached.');
      setStatus('Goal reached. Camera is off. Session data was not saved.');
      $('completion-summary').textContent = `You recorded ${data.total} of ${data.totalTarget} movement cycles in ${formatTime(state.elapsed)}. The camera is off; this session was not saved.`;
      renderState(); showDialog('completion-dialog'); speak('Session goal reached.');
    }
    function recordManual(direction) {
      if (state.mode !== 'manual' || state.session !== 'running') return;
      const event = tracker.recordManual(direction);
      renderProgress();
      if (event.type === 'direction-goal-reached') { setStatus(`${labels[direction]} goal is already complete.`); return; }
      setDirection(direction, 'Manual cycle recorded. Continue at your own pace.');
      setStatus(`${labels[direction]} cycle recorded manually. This is self-reported.`);
      speak(`${labels[direction]} recorded`);
      finishIfComplete();
    }
    function resetCountsAndSession() {
      state.startGeneration += 1; stopTimer(); stopCamera(); disposeFaceMesh();
      state.session = 'idle'; state.elapsed = 0; state.calibrating = false; state.samples = []; state.baseline = null; state.smoothedPose = null;
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; state.frameErrorShown = false;
      tracker = Core.createRepetitionTracker(Number(targetSelect.value));
      resetCalibrationUI(); renderState(); setDirection('CENTER', 'Start a session to begin.');
      setStatus('Counts reset. Camera is off.');
      if ($('completion-dialog').open) $('completion-dialog').close();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    function startNewSessionState() {
      tracker = Core.createRepetitionTracker(Number(targetSelect.value));
      state.elapsed = 0; state.calibrating = false; state.samples = []; state.baseline = null; state.smoothedPose = null;
      state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER'; state.frameErrorShown = false;
      resetCalibrationUI(); renderProgress(); setDirection('CENTER', 'Start a session to begin.');
    }
    async function startSession() {
      if (['running', 'starting'].includes(state.session)) return;
      if (state.session === 'paused' && state.mode === 'manual') {
        state.session = 'running'; startTimer(); renderState(); setStatus('Manual session resumed.'); return;
      }
      if (state.session === 'paused' && state.mode === 'camera') {
        await startCameraSession(); return;
      }
      if (['idle', 'ended', 'complete'].includes(state.session)) startNewSessionState();
      if (state.mode === 'manual') {
        state.session = 'running'; startTimer(); renderState();
        setDirection('CENTER', 'Record each cycle after you return to centre.');
        setStatus('Manual session started. Camera access is not used.');
      } else await startCameraSession();
    }
    function pauseSession() {
      if (state.session !== 'running') return;
      stopTimer(); state.startGeneration += 1;
      if (state.mode === 'camera') { stopCamera(); disposeFaceMesh(); state.baseline = null; state.smoothedPose = null; resetCalibrationUI(); }
      state.calibrating = false; state.samples = []; resetDebounce(); state.session = 'paused'; renderState();
      setStatus(state.mode === 'camera' ? 'Paused. Camera released. Resume to recalibrate and continue.' : 'Manual session paused.');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    function endSession() {
      if (!['starting', 'running', 'paused'].includes(state.session)) return;
      state.startGeneration += 1; stopTimer(); state.calibrating = false; state.samples = [];
      stopCamera(); disposeFaceMesh(); resetCalibrationUI(); resetDebounce(); state.session = 'ended'; renderState();
      setStatus('Session stopped. Counts remain visible until you reset or refresh.');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    async function flipCamera() {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      stopTimer(); state.startGeneration += 1; stopCamera(); disposeFaceMesh();
      state.baseline = null; state.smoothedPose = null; state.calibrating = false; state.samples = [];
      state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
      resetCalibrationUI(); state.session = 'paused'; renderState(); setStatus('Switching camera… you will recalibrate when it reconnects.');
      await startCameraSession();
    }
    function toggleMode() {
      if (['starting', 'running', 'paused'].includes(state.session)) return;
      stopTimer(); stopCamera(); disposeFaceMesh(); state.mode = state.mode === 'camera' ? 'manual' : 'camera';
      state.baseline = null; state.calibrating = false; state.samples = []; resetCalibrationUI(); renderState();
      setDirection('CENTER', state.mode === 'manual' ? 'Manual mode. Record a completed cycle.' : 'Camera mode selected. Start when ready.');
      setStatus(state.mode === 'manual' ? 'Manual mode selected. No camera access will be requested.' : 'Camera mode selected. The camera stays off until you press Start.');
    }
    function showDialog(id) { const dialog = $(id); if (dialog?.showModal && !dialog.open) dialog.showModal(); }

    $('start-session-btn').addEventListener('click', startSession);
    $('pause-resume-btn').addEventListener('click', () => { if (state.session === 'paused') startSession(); else pauseSession(); });
    $('end-session-btn').addEventListener('click', endSession);
    $('reset-btn').addEventListener('click', resetCountsAndSession);
    $('calibrate-btn').addEventListener('click', () => startCalibration(true));
    $('flip-camera-btn').addEventListener('click', flipCamera);
    $('mode-toggle-btn').addEventListener('click', toggleMode);
    $('voice-btn').addEventListener('click', () => {
      state.voice = !state.voice;
      if (!state.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      renderState(); if (state.voice) speak('Voice prompts enabled');
    });
    targetSelect.addEventListener('change', () => {
      tracker.setTargetPerDirection(Number(targetSelect.value)); renderProgress();
      setStatus(`Goal set to ${targetSelect.value} cycles per direction. This is a tracking setting, not a medical recommendation.`);
    });
    document.querySelectorAll('[data-manual-direction]').forEach(button => button.addEventListener('click', () => recordManual(button.dataset.manualDirection)));
    document.querySelectorAll('[data-dialog-open]').forEach(button => button.addEventListener('click', () => showDialog(button.dataset.dialogOpen)));
    document.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => { if (dialog.id === 'completion-dialog') $('start-session-btn').focus(); });
    });
    $('new-session-btn').addEventListener('click', async () => { $('completion-dialog').close(); state.session = 'ended'; await startSession(); });

    renderState(); setDirection('CENTER', 'Start a session to begin.'); $('pose-status').textContent = 'Camera off';
  });
})();
