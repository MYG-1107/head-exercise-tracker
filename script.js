(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const directions = window.HeadTrackerCore.DIRECTIONS;
    const targetSelect = $('target-per-direction');
    let tracker = window.HeadTrackerCore.createRepetitionTracker(Number(targetSelect.value));

    const state = {
      mode: 'camera',
      session: 'idle', // idle | starting | running | paused | ended | complete
      stream: null,
      cameraHelper: null,
      faceMesh: null,
      currentFacingMode: 'user',
      elapsedSeconds: 0,
      timer: null,
      voiceEnabled: false,
      calibrating: false,
      calibrationSamples: [],
      neutralBaseline: null,
      smoothedPose: null,
      candidateDirection: 'CENTER',
      candidateFrames: 0,
      stableDirection: 'CENTER',
      lastDirectionStatus: '',
      startGeneration: 0
    };

    const faceMeshVersion = '0.4.1633559619';
    const cameraUtilsVersion = '0.3.1675466862';
    const libraryPromises = new Map();

    function setStatus(message) {
      const node = $('tracking-status');
      if (node && node.textContent !== message) node.textContent = message;
    }

    function formatTime(seconds) {
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const remainder = (seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${remainder}`;
    }

    function sessionSnapshot() {
      return tracker.getSnapshot();
    }

    function renderProgress() {
      const snapshot = sessionSnapshot();
      $('total-progress').textContent = `${snapshot.total} / ${snapshot.totalTarget}`;
      $('timer-display').textContent = `${formatTime(state.elapsedSeconds)} elapsed`;
      $('overall-progress-fill').style.width = `${snapshot.totalTarget ? (snapshot.total / snapshot.totalTarget) * 100 : 0}%`;
      $('overall-progress').setAttribute('aria-valuemax', String(snapshot.totalTarget));
      $('overall-progress').setAttribute('aria-valuenow', String(snapshot.total));
      directions.forEach(direction => {
        $(`count-${direction}`).textContent = String(snapshot.counts[direction]);
        $(`stat-${direction}`).classList.toggle('goal-reached', snapshot.counts[direction] >= snapshot.targetPerDirection);
      });
      document.querySelectorAll('.per-direction-target').forEach(node => {
        node.textContent = String(snapshot.targetPerDirection);
      });
    }

    function renderSessionState() {
      const labels = {
        idle: 'Ready', starting: 'Starting', running: state.mode === 'manual' ? 'Manual tracking' : 'Tracking',
        paused: 'Paused', ended: 'Ended', complete: 'Complete'
      };
      $('session-state-text').textContent = labels[state.session] || 'Ready';
      $('session-state').dataset.state = state.session;
      $('start-session-btn').disabled = state.session === 'starting' || state.session === 'running';
      $('pause-resume-btn').disabled = !['running', 'paused'].includes(state.session);
      $('pause-resume-btn').textContent = state.session === 'paused' ? 'Resume session' : 'Pause session';
      $('end-session-btn').disabled = !['running', 'paused', 'starting'].includes(state.session);
      $('mode-toggle-btn').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('target-per-direction').disabled = ['starting', 'running', 'paused'].includes(state.session);
      $('calibrate-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('flip-camera-btn').disabled = state.mode !== 'camera' || state.session !== 'running' || !state.stream;
      $('start-session-btn').textContent = state.session === 'paused' ? (state.mode === 'manual' ? 'Resume manual session' : 'Resume camera session') :
        state.session === 'complete' || state.session === 'ended' ? (state.mode === 'manual' ? 'Start new manual session' : 'Start new camera session') :
        state.mode === 'manual' ? 'Start manual session' : 'Start camera session';
      document.querySelectorAll('[data-manual-direction]').forEach(button => {
        button.disabled = state.mode !== 'manual' || state.session !== 'running';
      });
      $('camera-layout').hidden = state.mode === 'manual';
      $('manual-panel').hidden = state.mode !== 'manual';
      $('camera-privacy-note').hidden = state.mode === 'manual';
      $('mode-toggle-btn').textContent = state.mode === 'camera' ? 'Switch to manual mode' : 'Switch to camera mode';
      $('mode-help').textContent = state.mode === 'camera' ?
        'Camera tracking requests permission only after you start.' :
        'Manual mode uses no camera and does not load tracking libraries.';
      $('voice-btn').setAttribute('aria-pressed', String(state.voiceEnabled));
      $('voice-btn').querySelector('span').textContent = state.voiceEnabled ? 'Voice prompts on' : 'Voice prompts off';
      renderProgress();
    }

    function startTimer() {
      stopTimer();
      state.timer = window.setInterval(() => {
        if (state.session === 'running') {
          state.elapsedSeconds += 1;
          $('timer-display').textContent = `${formatTime(state.elapsedSeconds)} elapsed`;
        }
      }, 1000);
    }

    function stopTimer() {
      if (state.timer !== null) window.clearInterval(state.timer);
      state.timer = null;
    }

    function stopCameraResources() {
      if (state.cameraHelper) {
        try { state.cameraHelper.stop(); } catch (_) { /* A helper may not have finished starting. */ }
        state.cameraHelper = null;
      }
      if (state.stream) {
        state.stream.getTracks().forEach(track => {
          try { track.stop(); } catch (_) { /* Track may already be stopped. */ }
        });
        state.stream = null;
      }
      const video = $('webcam');
      if (video) video.srcObject = null;
      $('camera-overlay').hidden = false;
      $('camera-live-pill').hidden = true;
      $('flip-camera-btn').disabled = true;
      $('calibrate-btn').disabled = true;
      $('calibration-progress-wrap').hidden = true;
    }

    function disposeFaceMesh() {
      if (!state.faceMesh) return;
      const mesh = state.faceMesh;
      state.faceMesh = null;
      try {
        const closing = typeof mesh.close === 'function' ? mesh.close() : null;
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch (_) { /* Cleanup must not block stopping a session. */ }
    }

    function resetDebounceState() {
      state.candidateDirection = 'CENTER';
      state.candidateFrames = 0;
      state.stableDirection = 'CENTER';
      state.smoothedPose = null;
      tracker.interruptMovement();
      renderDirectionHighlight('CENTER');
    }

    function renderDirectionHighlight(direction) {
      directions.forEach(key => $(`stat-${key}`).classList.toggle('direction-active', key === direction));
    }

    function speak(message) {
      if (!state.voiceEnabled || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.92;
      window.speechSynthesis.speak(utterance);
    }

    function openDialog(id) {
      const dialog = $(id);
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    }

    function maybeFinishSession() {
      const snapshot = sessionSnapshot();
      if (!snapshot.complete || state.session === 'complete') return;
      state.session = 'complete';
      state.calibrating = false;
      stopTimer();
      stopCameraResources();
      disposeFaceMesh();
      setStatus('Goal reached. The camera is off. Your session data was not saved.');
      $('completion-summary').textContent = `You recorded ${snapshot.total} of ${snapshot.totalTarget} movement cycles in ${formatTime(state.elapsedSeconds)}. Your camera is off; this session was not saved.`;
      renderSessionState();
      openDialog('completion-dialog');
      speak('Session goal reached. Your camera is off.');
    }

    function handleTrackerEvent(event) {
      renderProgress();
      if (event.type === 'movement-started') {
        setStatus(`Direction detected: ${event.direction.toLowerCase()}. Return to centre to complete this cycle.`);
      } else if (event.type === 'repetition') {
        setStatus(`${event.direction} cycle counted after return to centre.`);
        speak(`${event.direction.toLowerCase()} cycle counted`);
        maybeFinishSession();
      } else if (event.type === 'direction-switch-without-neutral') {
        setStatus('No cycle counted. Return to centre before moving to another direction.');
        speak('Return to centre before changing direction');
      }
    }

    function addScript(src) {
      if (libraryPromises.has(src)) return libraryPromises.get(src);
      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          libraryPromises.delete(src);
          reject(new Error('A camera tracking library could not be loaded. Check your connection and try again.'));
        };
        document.head.appendChild(script);
      });
      libraryPromises.set(src, promise);
      return promise;
    }

    async function loadCameraLibraries() {
      const cameraUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@${cameraUtilsVersion}/camera_utils.js`;
      const faceUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceMeshVersion}/face_mesh.js`;
      await addScript(cameraUrl);
      await addScript(faceUrl);
      if (typeof window.Camera !== 'function' || typeof window.FaceMesh !== 'function') {
        throw new Error('Camera tracking did not initialise. Try reloading the page or use manual mode.');
      }
    }

    function createFaceMeshIfNeeded() {
      if (state.faceMesh) return;
      state.faceMesh = new window.FaceMesh({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${faceMeshVersion}/${file}`
      });
      state.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      state.faceMesh.onResults(onFaceResults);
    }

    function startNewSessionState() {
      tracker = window.HeadTrackerCore.createRepetitionTracker(Number(targetSelect.value));
      state.elapsedSeconds = 0;
      state.calibrating = false;
      state.calibrationSamples = [];
      state.neutralBaseline = null;
      state.smoothedPose = null;
      state.lastDirectionStatus = '';
      resetDebounceState();
      renderProgress();
    }

    async function startCameraSession() {
      const previousSession = state.session;
      const generation = ++state.startGeneration;
      state.session = 'starting';
      renderSessionState();
      setStatus('Requesting camera permission. After startup, video frames are processed in this browser.');
      try {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error('Camera access is not available in this browser or context. Try HTTPS or use manual mode.');
        }
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: state.currentFacingMode }, width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (state.startGeneration !== generation || state.session !== 'starting') { stopCameraResources(); return; }
        const video = $('webcam');
        video.srcObject = state.stream;
        await video.play();
        if (state.startGeneration !== generation || state.session !== 'starting') { stopCameraResources(); return; }
        await loadCameraLibraries();
        if (state.startGeneration !== generation || state.session !== 'starting') { stopCameraResources(); return; }
        createFaceMeshIfNeeded();
        state.cameraHelper = new window.Camera(video, {
          onFrame: async () => {
            if (state.session === 'running' && state.mode === 'camera' && state.faceMesh) {
              await state.faceMesh.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });
        state.session = 'running';
        $('camera-overlay').hidden = true;
        $('camera-live-pill').hidden = false;
        state.cameraHelper.start();
        startTimer();
        if (!state.neutralBaseline) setStatus('Camera is active on this device. Look straight ahead and choose Calibrate neutral position.');
        else setStatus('Camera resumed. Recalibrate if your position or camera has changed.');
        renderSessionState();
      } catch (error) {
        stopCameraResources();
        if (state.startGeneration !== generation) return;
        stopTimer();
        state.session = previousSession === 'paused' ? 'paused' : 'idle';
        renderSessionState();
        setStatus(error && error.message ? error.message : 'Camera could not start. Try manual mode.');
      }
    }

    async function startSession() {
      if (state.session === 'running' || state.session === 'starting') return;
      if (state.session === 'paused') {
        if (state.mode === 'manual') {
          state.session = 'running';
          startTimer();
          renderSessionState();
          setStatus('Manual session resumed.');
        } else {
          await startCameraSession();
        }
        return;
      }

      startNewSessionState();
      if (state.mode === 'manual') {
        state.session = 'running';
        startTimer();
        renderSessionState();
        setStatus('Manual session started. Count only after completing a movement and returning to centre.');
      } else {
        await startCameraSession();
      }
    }

    function pauseSession() {
      if (state.session !== 'running') return;
      stopTimer();
      if (state.mode === 'camera') stopCameraResources();
      resetDebounceState();
      state.calibrating = false;
      state.session = 'paused';
      renderSessionState();
      setStatus(state.mode === 'camera' ? 'Session paused and camera released. Resume when ready.' : 'Manual session paused.');
      speak('Session paused');
    }

    function endSession() {
      if (!['running', 'paused', 'starting'].includes(state.session)) return;
      state.startGeneration += 1;
      stopTimer();
      state.calibrating = false;
      stopCameraResources();
      disposeFaceMesh();
      resetDebounceState();
      state.session = 'ended';
      renderSessionState();
      setStatus('Session ended. Counts remain on screen until you reset or reload the page.');
      speak('Session ended');
    }

    function resetSession() {
      state.startGeneration += 1;
      stopTimer();
      stopCameraResources();
      disposeFaceMesh();
      state.session = 'idle';
      startNewSessionState();
      renderSessionState();
      setStatus('Counts reset. Your camera is off.');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function poseFromLandmarks(landmarks) {
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      if (!nose || !leftEye || !rightEye) return null;
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
      if (!Number.isFinite(eyeDistance) || eyeDistance < 0.001) return null;
      return {
        horizontal: (nose.x - eyeCenterX) / eyeDistance,
        vertical: (nose.y - eyeCenterY) / eyeDistance
      };
    }

    function onFaceResults(results) {
      if (state.session !== 'running' || state.mode !== 'camera') return;
      const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
      if (!landmarks) {
        resetDebounceState();
        $('pose-status').textContent = 'No face detected';
        setStatus('Face not detected. Adjust the camera or return to the frame. No cycle was counted.');
        return;
      }
      $('pose-status').textContent = 'Face detected';
      const pose = poseFromLandmarks(landmarks);
      if (!pose) return;
      const alpha = 0.32;
      state.smoothedPose = state.smoothedPose ? {
        horizontal: alpha * pose.horizontal + (1 - alpha) * state.smoothedPose.horizontal,
        vertical: alpha * pose.vertical + (1 - alpha) * state.smoothedPose.vertical
      } : pose;

      if (state.calibrating) {
        state.calibrationSamples.push(state.smoothedPose);
        const progress = Math.min(100, Math.round(state.calibrationSamples.length / 45 * 100));
        $('calibration-progress-fill').style.width = `${progress}%`;
        $('calibration-progress-text').textContent = `Hold still… ${Math.min(state.calibrationSamples.length, 45)} / 45 frames`;
        if (state.calibrationSamples.length >= 45) {
          state.neutralBaseline = state.calibrationSamples.reduce((sum, sample) => ({
            horizontal: sum.horizontal + sample.horizontal / state.calibrationSamples.length,
            vertical: sum.vertical + sample.vertical / state.calibrationSamples.length
          }), { horizontal: 0, vertical: 0 });
          state.calibrating = false;
          state.calibrationSamples = [];
          $('calibration-progress-wrap').hidden = true;
          resetDebounceState();
          setStatus('Calibration complete. Begin from centre and return to centre after each direction.');
          renderSessionState();
        }
        return;
      }

      if (!state.neutralBaseline) {
        setStatus('Calibrate your neutral position before tracking repetitions.');
        return;
      }

      const inferred = window.HeadTrackerCore.directionFromPose(state.smoothedPose, state.neutralBaseline, { horizontal: 0.30, vertical: 0.27 });
      if (inferred !== state.candidateDirection) {
        state.candidateDirection = inferred;
        state.candidateFrames = 1;
      } else {
        state.candidateFrames += 1;
      }
      const requiredFrames = inferred === 'CENTER' ? 4 : 3;
      if (state.candidateFrames >= requiredFrames && state.stableDirection !== inferred) {
        state.stableDirection = inferred;
        renderDirectionHighlight(inferred);
        const event = tracker.observe(inferred);
        handleTrackerEvent(event);
      }
    }

    function beginCalibration() {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.calibrating = true;
      state.calibrationSamples = [];
      state.neutralBaseline = null;
      resetDebounceState();
      $('calibration-progress-wrap').hidden = false;
      $('calibration-progress-fill').style.width = '0%';
      $('calibration-progress-text').textContent = 'Hold a comfortable neutral position…';
      setStatus('Calibrating. Keep your head in a comfortable neutral position and look toward the camera.');
      renderSessionState();
    }

    function recordManual(direction) {
      if (state.mode !== 'manual' || state.session !== 'running') return;
      const event = tracker.recordManual(direction);
      renderProgress();
      if (event.type === 'direction-goal-reached') {
        setStatus(`Your ${direction.toLowerCase()} goal is already complete.`);
        return;
      }
      setStatus(`${direction} cycle recorded manually. Only self-reported, completed cycles are counted.`);
      speak(`${direction.toLowerCase()} cycle recorded`);
      maybeFinishSession();
    }

    async function flipCamera() {
      if (state.mode !== 'camera' || state.session !== 'running' || !state.stream) return;
      state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
      stopCameraResources();
      resetDebounceState();
      state.neutralBaseline = null;
      setStatus('Switching camera. Please recalibrate the neutral position after it reconnects.');
      await new Promise(resolve => window.setTimeout(resolve, 250));
      await startCameraSession();
    }

    function toggleMode() {
      if (['starting', 'running', 'paused'].includes(state.session)) return;
      stopCameraResources();
      disposeFaceMesh();
      state.mode = state.mode === 'camera' ? 'manual' : 'camera';
      state.neutralBaseline = null;
      resetDebounceState();
      renderSessionState();
      setStatus(state.mode === 'manual' ? 'Manual mode selected. No camera will be requested.' : 'Camera mode selected. The camera stays off until you start a session.');
    }

    $('start-session-btn').addEventListener('click', startSession);
    $('pause-resume-btn').addEventListener('click', () => state.session === 'paused' ? startSession() : pauseSession());
    $('end-session-btn').addEventListener('click', endSession);
    $('reset-btn').addEventListener('click', resetSession);
    $('calibrate-btn').addEventListener('click', beginCalibration);
    $('flip-camera-btn').addEventListener('click', flipCamera);
    $('mode-toggle-btn').addEventListener('click', toggleMode);
    $('voice-btn').addEventListener('click', () => {
      state.voiceEnabled = !state.voiceEnabled;
      if (!state.voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      renderSessionState();
      if (state.voiceEnabled) speak('Voice prompts enabled');
    });
    targetSelect.addEventListener('change', () => {
      tracker.setTargetPerDirection(Number(targetSelect.value));
      renderProgress();
      setStatus(`Goal updated to ${targetSelect.value} cycles per direction. This is a tracking setting, not a medical recommendation.`);
    });
    document.querySelectorAll('[data-manual-direction]').forEach(button => {
      button.addEventListener('click', () => recordManual(button.dataset.manualDirection));
    });
    document.querySelectorAll('[data-dialog-open]').forEach(button => {
      button.addEventListener('click', () => openDialog(button.dataset.dialogOpen));
    });
    document.querySelectorAll('[data-dialog-close]').forEach(button => {
      button.addEventListener('click', () => button.closest('dialog')?.close());
    });
    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
    });
    $('new-session-btn').addEventListener('click', () => {
      $('completion-dialog').close();
      resetSession();
      startSession();
    });

    renderSessionState();
    $('pose-status').textContent = 'Camera not started';
    $('camera-overlay').hidden = false;
  });
})();
