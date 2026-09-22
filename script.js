document.addEventListener('DOMContentLoaded', () => {
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
  const videoElement = document.getElementById('webcam');
  const overlayElement = document.getElementById('camera-off-overlay');
  const expressionDisplay = document.getElementById('expression-display');
  const commandDisplay = document.getElementById('command-display');

  const badges = {
    UP: document.getElementById('badge-up'),
    DOWN: document.getElementById('badge-down'),
    LEFT: document.getElementById('badge-left'),
    RIGHT: document.getElementById('badge-right'),
    CENTER: document.getElementById('badge-center')
  };

  let isCameraActive = false;
  let cameraStream = null;
  let faceMesh = null;
  let cameraUtils = null;

  // Exercise State Variables
  let currentDirection = 'CENTER';
  let currentExpression = 'Neutral';
  let repetitionCount = 0;
  let centerHoldStartTime = null;

  // Voice Prompt Helper
  function speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  // Helper Euclidean Distance Function
  function distance(pt1, pt2) {
    return Math.sqrt(Math.pow(pt1.x - pt2.x, 2) + Math.pow(pt1.y - pt2.y, 2));
  }

  // Update Visual Badges
  function setActiveBadge(direction) {
    Object.keys(badges).forEach(dir => {
      if (badges[dir]) {
        badges[dir].classList.toggle('active', dir === direction);
      }
    });
  }

  // --- 3. MEDIAPIPE FACE MESH (POSE + EXPRESSION RECOGNITION) ---
  function onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      expressionDisplay.innerHTML = 'Status: <span>Searching for face...</span>';
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Landmark Points
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const upperLipInner = landmarks[13];
    const lowerLipInner = landmarks[14];
    const mouthCornerLeft = landmarks[61];
    const mouthCornerRight = landmarks[291];

    // --- A. HEAD POSE DETECTION ---
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

    // --- B. FACIAL EXPRESSION DETECTION ---
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

    // --- C. UPDATE UI & REPETITIONS ---
    currentExpression = detectedExpression;

    if (detectedDir !== currentDirection) {
      currentDirection = detectedDir;
      setActiveBadge(currentDirection);

      if (currentDirection !== 'CENTER') {
        repetitionCount++;
        commandDisplay.innerText = `Repetitions Completed: ${repetitionCount}`;
        speak(currentDirection.toLowerCase());
        centerHoldStartTime = null;
      } else {
        centerHoldStartTime = Date.now();
      }
    }

    // Display Both Pose & Facial Expression
    expressionDisplay.innerHTML = `Head Pose: <span>${currentDirection}</span> | Expression: <span>${currentExpression}</span>`;

    // 5-Second Center Hold for Summary Audio
    if (currentDirection === 'CENTER' && centerHoldStartTime) {
      const elapsedSeconds = Math.floor((Date.now() - centerHoldStartTime) / 1000);
      if (elapsedSeconds >= 5) {
        speak(`Exercise summary. You completed ${repetitionCount} repetitions.`);
        centerHoldStartTime = null;
      }
    }
  }

  // --- 4. CAMERA CONTROL FUNCTIONS ---
  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      videoElement.srcObject = cameraStream;
      overlayElement.style.display = 'none';

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
      toggleCamBtn.innerText = 'Turn Camera Off';
      toggleCamBtn.style.backgroundColor = '#333333';
      commandDisplay.innerText = 'Repetitions Completed: 0';
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
    videoElement.srcObject = null;
    overlayElement.style.display = 'flex';
    isCameraActive = false;
    toggleCamBtn.innerText = 'Turn Camera On';
    toggleCamBtn.style.backgroundColor = '#D02B2B';
    expressionDisplay.innerHTML = 'Head Pose: <span>Stopped</span> | Expression: <span>--</span>';
    commandDisplay.innerText = 'Press "Turn Camera On" to start';
    setActiveBadge('CENTER');
  }

  toggleCamBtn.addEventListener('click', () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  });
});
