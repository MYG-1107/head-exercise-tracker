(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const Core = window.HeadTrackerCore;
    if (!Core) {
      $('tracking-status').textContent = 'The tracker could not start. Refresh the page or use a supported browser.';
      $('start-session-btn').disabled = true;
      return;
    }
    const DIRECTIONS = Core.DIRECTIONS;
    const targetSelect = $('target-per-direction');
    const state = {
      mode: 'camera', session: 'idle', facingMode: 'user', stream: null, mesh: null,
      generation: 0, startRequest: 0, raf: 0, timer: null, elapsed: 0,
      voice: false, baseline: null, calibrating: false, calibrationSamples: [],
      smoothPose: null, candidate: 'CENTER', candidateFrames: 0, stable: 'CENTER',
      tracker: Core.createTracker(Number(targetSelect.value)), scripts: new Map()
    };
    const FACE_VERSION = '0.4.1633559619';

    function setStatus(message) { if ($('tracking-status').textContent !== message) $('tracking-status').textContent = message; }
    function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
    function snapshot() { return state.tracker.getSnapshot(); }
    function setDirection(direction, guidance) {
      const symbols = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', CENTER: '•', READY: '•', NO_FACE: '○' };
      const labels = { UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', CENTER: 'Centre', READY: 'Ready', NO_FACE: 'No face' };
      $('live-direction-symbol').textContent = symbols[direction] || '•';
      $('live-direction').textContent = labels[direction] || direction;
      $('live-guidance').textContent = guidance || '';
      DIRECTIONS.forEach(key => $(`stat-${key}`).classList.toggle('direction-active', key === direction));
    }
    function renderProgress() {
      const data = snapshot();
      $('total-progress').textContent = String(data.total);
      $('total-target').textContent = `/ ${data.totalTarget}`;
      $('timer-display').textContent = formatTime(state.elapsed);
      $('overall-progress-fill').style.width = `${Math.min(100, data.total / data.totalTarget * 100)}%`;
      $('overall-progress').setAttribute('aria-valuemax', String(data.totalTarget));
      $('overall-progress').setAttribute('aria-valuenow', String(data.total));
      DIRECTIONS.forEach(direction => {
        $(`count-${direction}`).textContent = String(data.counts[direction]);
        $(`stat-${direction}`).classList.toggle('goal-reached', data.counts[direction] >= data.targetPerDirection);
      });
      document.querySelectorAll('.per-direction-target').forEach(node => { node.textContent = String(data.targetPerDirection); });
    }
    function renderState() {
      const labels = { idle: 'Ready', starting: 'Starting', running: state.mode === 'manual' ? 'Manual' : 'Tracking', paused: 'Paused', ended: 'Stopped', complete: 'Complete' };
      $('session-state-text').textContent = labels[state.session] || 'Ready';
      $('session-state').dataset.state = state.session;
      $('start-session-btn').disabled = ['starting', 'running'].includes(state.session);
      $('start-session-btn').textContent = state.session === 'starting' ? 'Starting…' : state.session === 'paused' ? 'Resume' : ['ended', 'complete'].includes(state.session) ? 'New session' : state.mode === 'manual' ? 'Start manual session' : 'Start camera';
      $('pause-resume-btn').disabled = !['running', 'paused'].includes(state.session);
      $('pause-resume-btn').textContent = state.session === 'paused' ? 'Resume' : 'Pause';
      $('end-session-btn').disabled = !['starting', 'running', 'paused'].includes(state.session);
      $('mode-toggle-btn').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('target-per-direction').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('calibrate-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('flip-camera-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('flip-camera-btn').setAttribute('aria-disabled', String($('flip-camera-btn').disabled));
      $('flip-camera-btn').title = 'Flip camera';
      $('voice-btn').setAttribute('aria-pressed', String(state.voice));
      $('voice-btn').setAttribute('aria-label', state.voice ? 'Turn voice prompts off' : 'Turn voice prompts on');
      $('voice-btn').title = state.voice ? 'Voice prompts on' : 'Voice prompts off';
      $('voice-btn').querySelector('span').textContent = state.voice ? 'Voice on' : 'Voice off';
      $('camera-column').hidden = state.mode === 'manual';
      $('manual-panel').hidden = state.mode !== 'manual';
      $('mode-toggle-btn').textContent = state.mode === 'camera' ? 'Use manual mode' : 'Use camera mode';
      document.querySelectorAll('[data-manual-direction]').forEach(button => { button.disabled = state.mode !== 'manual' || state.session !== 'running'; });
      renderProgress();
    }
    function startTimer() {
      stopTimer();
      state.timer = window.setInterval(() => {
        if (state.session === 'running') { state.elapsed += 1; $('timer-display').textContent = formatTime(state.elapsed); }
      }, 1000);
    }
    function stopTimer() { if (state.timer !== null) window.clearInterval(state.timer); state.timer = null; }
    function speak(text) {
      if (!state.voice || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 0.92; window.speechSynthesis.speak(utterance);
    }
    function releaseCamera(disposeMesh = true) {
      state.generation += 1;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      const stream = state.stream;
      state.stream = null;
      if (stream) stream.getTracks().forEach(track => { try { track.stop(); } catch (_) {} });
      $('webcam').srcObject = null;
      $('camera-overlay').hidden = false;
      $('camera-overlay-title').textContent = 'Camera is off';
      $('camera-overlay-copy').textContent = 'Start when you are ready.';
      $('camera-live-pill').hidden = true;
      $('pose-status').textContent = 'Camera off';
      $('calibrate-btn').disabled = true;
      $('flip-camera-btn').disabled = true;
      if (disposeMesh && state.mesh) {
        const mesh = state.mesh; state.mesh = null;
        try { const result = mesh.close?.(); if (result?.catch) result.catch(() => {}); } catch (_) {}
      }
    }
    function resetDirectionSmoothing() {
      state.smoothPose = null; state.candidate = 'CENTER'; state.candidateFrames = 0; state.stable = 'CENTER';
      DIRECTIONS.forEach(key => $(`stat-${key}`).classList.remove('direction-active'));
    }
    function resetCounters() {
      state.tracker = Core.createTracker(Number(targetSelect.value));
      state.elapsed = 0; state.baseline = null; state.calibrating = false; state.calibrationSamples = [];
      resetDirectionSmoothing();
      $('calibration-progress-wrap').hidden = true;
      $('calibration-mark').textContent = '1';
      $('calibration-title').textContent = 'Neutral position not set';
      $('calibration-description').textContent = 'Starts automatically when your face is detected.';
      $('calibration-mark').classList.remove('ready');
      renderProgress();
    }
    function startNewSession() { resetCounters(); state.session = 'idle'; setDirection('READY', 'Start a session to begin.'); renderState(); }

    function loadScript(url) {
      if (state.scripts.has(url)) return state.scripts.get(url);
      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url; script.async = true; script.crossOrigin = 'anonymous'; script.referrerPolicy = 'no-referrer';
        script.onload = resolve;
        script.onerror = () => { script.remove(); state.scripts.delete(url); reject(new Error('Camera tracking could not load. Check your connection or use manual mode.')); };
        document.head.appendChild(script);
      });
      state.scripts.set(url, promise); return promise;
    }
    async function loadFaceMesh() {
      await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_VERSION}/face_mesh.js`);
      if (typeof window.FaceMesh !== 'function') throw new Error('Camera tracking did not initialise. Try again or use manual mode.');
    }
    function createMesh(generation) {
      const mesh = new window.FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_VERSION}/${file}` });
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      mesh.onResults(results => { if (generation === state.generation) onFaceResults(results); });
      state.mesh = mesh;
    }
    async function startCameraSession() {
      const previous = state.session;
      const requestId = ++state.startRequest;
      let acquiredStream = null;
      const requestIsCurrent = () => requestId === state.startRequest && state.session === 'starting';
      state.session = 'starting'; renderState();
      setStatus('Starting camera. Allow access when your browser asks.');
      try {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') throw new Error('Camera is not available. Open this site over HTTPS or use manual mode.');
        acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: state.facingMode }, width: { ideal: 960 }, height: { ideal: 720 } } });
        if (!requestIsCurrent()) { acquiredStream.getTracks().forEach(track => track.stop()); return; }
        state.stream = acquiredStream;
        $('camera-overlay-title').textContent = 'Preparing tracker…';
        $('camera-overlay-copy').textContent = 'Camera is active. Loading tracking tools in this browser.';
        setStatus('Camera is active. Loading tracking tools in this browser…');
        const video = $('webcam'); video.srcObject = acquiredStream;
        await video.play();
        if (!requestIsCurrent()) {
          if (state.stream === acquiredStream) releaseCamera();
          else acquiredStream.getTracks().forEach(track => track.stop());
          return;
        }
        setStatus('Loading the on-device tracker…');
        await loadFaceMesh();
        if (!requestIsCurrent()) {
          if (state.stream === acquiredStream) releaseCamera();
          else acquiredStream.getTracks().forEach(track => track.stop());
          return;
        }
        const generation = ++state.generation;
        createMesh(generation);
        state.session = 'running';
        $('camera-overlay').hidden = true; $('camera-live-pill').hidden = false; $('pose-status').textContent = 'Looking for face';
        state.baseline = null; state.calibrating = false; state.calibrationSamples = []; resetDirectionSmoothing();
        startTimer(); renderState();
        setStatus('Look toward the camera. Calibration will start when your face is detected.');
        startFrameLoop(generation);
      } catch (error) {
        if (requestId !== state.startRequest) {
          if (acquiredStream && state.stream !== acquiredStream) acquiredStream.getTracks().forEach(track => track.stop());
          return;
        }
        releaseCamera(); stopTimer(); state.session = previous === 'paused' ? 'paused' : 'idle'; renderState();
        setStatus(error?.message || 'Camera could not start. Try manual mode.');
      }
    }
    function startFrameLoop(generation) {
      const video = $('webcam');
      const mesh = state.mesh;
      let processing = false;
      const tick = async () => {
        if (generation !== state.generation || state.session !== 'running' || state.mode !== 'camera' || state.mesh !== mesh) return;
        if (!processing && mesh && video.readyState >= 2) {
          processing = true;
          try { await mesh.send({ image: video }); }
          catch (error) {
            if (generation === state.generation) {
              stopTimer(); releaseCamera(); state.calibrating = false; state.baseline = null; state.session = 'ended'; renderState();
              setDirection('READY', 'Tracking stopped.');
              setStatus('A camera frame could not be processed. The camera was stopped. Restart or use manual mode.');
            }
          }
          finally { processing = false; }
        }
        if (generation === state.generation && state.session === 'running' && state.mesh === mesh) state.raf = requestAnimationFrame(tick);
      };
      state.raf = requestAnimationFrame(tick);
    }
    function beginCalibration(manual = false) {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.calibrating = true; state.baseline = null; state.calibrationSamples = [];
      state.tracker.resetMovement(); resetDirectionSmoothing();
      $('calibration-progress-fill').style.width = '0%'; $('calibration-progress-text').textContent = 'Looking for a stable face…'; $('calibration-progress-wrap').hidden = false;
      $('calibration-mark').textContent = '…'; $('calibration-mark').classList.remove('ready');
      $('calibration-title').textContent = manual ? 'Recalibrating…' : 'Calibrating…';
      $('calibration-description').textContent = 'Look straight ahead comfortably and hold still.';
      setDirection('CENTER', 'Hold a comfortable neutral position.');
      setStatus('Calibrating. Hold a comfortable neutral position.');
    }
    function poseFromLandmarks(landmarks) {
      const nose = landmarks?.[1], leftEye = landmarks?.[33], rightEye = landmarks?.[263];
      if (!nose || !leftEye || !rightEye) return null;
      const eyeX = (leftEye.x + rightEye.x) / 2, eyeY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
      if (!Number.isFinite(eyeDistance) || eyeDistance < 0.001) return null;
      return { horizontal: (nose.x - eyeX) / eyeDistance, vertical: (nose.y - eyeY) / eyeDistance };
    }
    function onFaceResults(results) {
      if (state.session !== 'running' || state.mode !== 'camera') return;
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) {
        $('pose-status').textContent = 'No face detected';
        if (state.calibrating) { state.calibrationSamples = []; $('calibration-progress-fill').style.width = '0%'; $('calibration-progress-text').textContent = 'Face lost — look toward the camera'; }
        state.tracker.interruptMovement(); resetDirectionSmoothing();
        setDirection('NO_FACE', 'Move into view to continue.'); setStatus('Face not detected. No repetition was counted.'); return;
      }
      $('pose-status').textContent = 'Face detected';
      const pose = poseFromLandmarks(landmarks); if (!pose) return;
      const smoothing = 0.34;
      state.smoothPose = state.smoothPose ? { horizontal: smoothing * pose.horizontal + (1 - smoothing) * state.smoothPose.horizontal, vertical: smoothing * pose.vertical + (1 - smoothing) * state.smoothPose.vertical } : pose;
      if (state.calibrating) {
        state.calibrationSamples.push(state.smoothPose);
        const maxFrames = 36, progress = Math.min(100, Math.round(state.calibrationSamples.length / maxFrames * 100));
        $('calibration-progress-fill').style.width = `${progress}%`;
        $('calibration-progress-text').textContent = `Hold still… ${Math.min(maxFrames, state.calibrationSamples.length)} / ${maxFrames}`;
        if (state.calibrationSamples.length >= maxFrames) {
          const samples = state.calibrationSamples;
          const hValues = samples.map(sample => sample.horizontal), vValues = samples.map(sample => sample.vertical);
          const hRange = Math.max(...hValues) - Math.min(...hValues), vRange = Math.max(...vValues) - Math.min(...vValues);
          if (hRange > 0.20 || vRange > 0.20) {
            state.calibrationSamples = [];
            $('calibration-progress-fill').style.width = '0%';
            $('calibration-progress-text').textContent = 'Movement detected — hold still and try again';
            setStatus('Hold a steady, comfortable neutral position to calibrate.');
            return;
          }
          state.baseline = samples.reduce((sum, sample) => ({ horizontal: sum.horizontal + sample.horizontal / samples.length, vertical: sum.vertical + sample.vertical / samples.length }), { horizontal: 0, vertical: 0 });
          state.calibrating = false; state.calibrationSamples = []; state.tracker.resetMovement();
          $('calibration-progress-wrap').hidden = true; $('calibration-mark').textContent = '✓'; $('calibration-mark').classList.add('ready');
          $('calibration-title').textContent = 'Ready to track'; $('calibration-description').textContent = 'Move gently. Return to centre after each direction.';
          setDirection('CENTER', 'Ready. Move gently and return to centre.'); setStatus('Calibration complete. Move in one direction and return to centre to count a repetition.');
          renderState();
        }
        return;
      }
      if (!state.baseline) { beginCalibration(false); return; }
      const inferred = Core.directionFromPose(state.smoothPose, state.baseline, { horizontal: 0.09, vertical: 0.10, neutralHorizontal: 0.045, neutralVertical: 0.05 });
      if (inferred !== state.candidate) { state.candidate = inferred; state.candidateFrames = 1; } else state.candidateFrames += 1;
      const needed = inferred === 'CENTER' ? 5 : 4;
      if (state.candidateFrames >= needed && state.stable !== inferred) {
        state.stable = inferred;
        const event = state.tracker.observe(inferred);
        if (inferred !== 'CENTER') {
          setDirection(inferred, 'Return to centre to complete this repetition.');
          if (event.type === 'direction-switch-without-neutral') { setStatus('Return to centre before changing direction. No repetition counted.'); }
          else if (event.type === 'waiting-for-neutral') { setStatus('Return to centre first to reset tracking after losing face detection.'); }
          else setStatus(`${inferred[0] + inferred.slice(1).toLowerCase()} detected. Return to centre to count.`);
        } else {
          setDirection('CENTER', event.type === 'repetition' ? 'Repetition counted. Ready for the next movement.' : 'Centre detected. Choose a comfortable direction.');
          if (event.type === 'repetition') {
            setStatus(`${event.direction[0] + event.direction.slice(1).toLowerCase()} repetition counted.`); speak(`${event.direction.toLowerCase()} repetition counted`); renderProgress();
            if (event.complete) finishSession();
          } else if (event.type === 'neutral-restored') setStatus('Centre detected. Tracking is ready again.');
        }
        renderProgress();
      } else if (state.candidateFrames >= needed && inferred === 'CENTER' && state.stable === 'CENTER') {
        // Confirm a return to neutral after face loss, even if the display was already showing centre.
        const event = state.tracker.observe('CENTER');
        if (event.type === 'neutral-restored') setStatus('Centre confirmed. Tracking is ready again.');
      }
    }
    function finishSession() {
      stopTimer(); releaseCamera(); state.session = 'complete'; state.calibrating = false;
      setDirection('CENTER', 'Session complete. Your camera is off.'); setStatus('Goal reached. Your camera is off. Counts have not been saved.'); renderState(); speak('Session complete');
    }
    function startTimer() { stopTimer(); state.timer = window.setInterval(() => { if (state.session === 'running') { state.elapsed += 1; $('timer-display').textContent = formatTime(state.elapsed); } }, 1000); }
    function stopSession() {
      if (!['starting', 'running', 'paused'].includes(state.session)) return;
      state.startRequest += 1; stopTimer(); releaseCamera(); state.calibrating = false; state.session = 'ended'; state.baseline = null; resetDirectionSmoothing();
      renderState(); setDirection('READY', 'Session stopped.'); setStatus('Session stopped. Counts stay here until you reset or reload.');
    }
    function pauseSession() {
      if (state.session === 'paused') { if (state.mode === 'manual') { state.session = 'running'; startTimer(); renderState(); setStatus('Manual session resumed.'); } else startCameraSession(); return; }
      if (state.session !== 'running') return;
      stopTimer(); releaseCamera(); state.calibrating = false; state.baseline = null; state.session = 'paused';
      state.tracker.interruptMovement(); resetDirectionSmoothing(); renderState(); setDirection('READY', 'Resume when you are ready.'); setStatus('Paused. Camera released. Recalibration will start when you resume.');
    }
    function startSession() {
      if (state.session === 'running' || state.session === 'starting') return;
      if (state.session === 'paused') { if (state.mode === 'manual') { state.session = 'running'; startTimer(); renderState(); setStatus('Manual session resumed.'); } else startCameraSession(); return; }
      if (['ended', 'complete'].includes(state.session)) resetCounters();
      if (state.mode === 'manual') {
        state.session = 'running'; startTimer(); renderState(); setDirection('READY', 'Tap a direction after a completed movement.'); setStatus('Manual mode started. Camera stays off.');
      } else startCameraSession();
    }
    function recordManual(direction) {
      if (state.mode !== 'manual' || state.session !== 'running') return;
      const event = state.tracker.recordManual(direction); renderProgress();
      if (event.type === 'direction-goal-reached') { setStatus(`${direction.toLowerCase()} goal is already complete.`); return; }
      setDirection(direction, 'Recorded manually. Choose another direction when ready.'); setStatus(`${direction.toLowerCase()} repetition recorded. This entry is self-reported.`); speak(`${direction.toLowerCase()} repetition recorded`);
      if (event.complete) finishManualSession();
    }
    function finishManualSession() { stopTimer(); state.session = 'complete'; renderState(); setDirection('READY', 'Session complete.'); setStatus('Goal reached. Your counts have not been saved.'); speak('Session complete'); }
    async function flipCamera() {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.startRequest += 1; state.facingMode = state.facingMode === 'user' ? 'environment' : 'user'; stopTimer(); releaseCamera(); state.baseline = null; state.calibrating = false; state.session = 'paused'; renderState();
      setStatus('Camera changed. Reconnect to continue and calibrate again.'); await startCameraSession();
    }
    function toggleMode() {
      if (['starting', 'running', 'paused'].includes(state.session)) return;
      state.startRequest += 1; releaseCamera(); resetDirectionSmoothing(); state.mode = state.mode === 'camera' ? 'manual' : 'camera'; state.baseline = null; state.calibrating = false;
      renderState();
      if (state.mode === 'manual') { setDirection('READY', 'Record a completed movement below.'); setStatus('Manual mode selected. Camera is not used.'); }
      else { setDirection('READY', 'Start a session to begin.'); setStatus('Camera mode selected. Camera stays off until you start.'); }
    }

    $('start-session-btn').addEventListener('click', startSession);
    $('pause-resume-btn').addEventListener('click', pauseSession);
    $('end-session-btn').addEventListener('click', stopSession);
    $('reset-btn').addEventListener('click', () => {
      state.startRequest += 1; stopTimer(); releaseCamera(); state.session = 'idle'; resetCounters(); renderState(); setDirection('READY', 'Start a session to begin.'); setStatus('Counts reset. Camera is off.');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    $('calibrate-btn').addEventListener('click', () => beginCalibration(true));
    $('flip-camera-btn').addEventListener('click', flipCamera);
    $('voice-btn').addEventListener('click', () => {
      state.voice = !state.voice;
      if (!state.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      renderState(); if (state.voice) speak('Voice prompts on');
    });
    $('mode-toggle-btn').addEventListener('click', toggleMode);
    targetSelect.addEventListener('change', () => {
      state.tracker.setTargetPerDirection(Number(targetSelect.value)); renderProgress();
      setStatus(`Goal set to ${targetSelect.value} repetitions per direction. This is a tracking setting, not medical advice.`);
    });
    document.querySelectorAll('[data-manual-direction]').forEach(button => button.addEventListener('click', () => recordManual(button.dataset.manualDirection)));
    renderState(); setDirection('READY', 'Start a session to begin.');
  });
})();
