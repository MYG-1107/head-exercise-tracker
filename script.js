const video = document.getElementById('webcam');
const commandDisplay = document.getElementById('command-display');
const repCountDisplay = document.getElementById('rep-count');
const expressionDisplay = document.getElementById('expression-display');
const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const cameraOffOverlay = document.getElementById('camera-off-overlay');

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
  // Key points: 13 (Upper inner lip), 14 (Lower inner lip), 61 (Left corner), 291 (Right corner)
  const topLip = landmarks[13];
  const bottomLip = landmarks[14];
  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];

  const mouthCenterY = (topLip.y + bottomLip.y) / 2;
  const mouthCornersY = (leftCorner.y + rightCorner.y) / 2;
  const mouthGap = (bottomLip.y - topLip.y) / faceHeight;

  // Curvature: positive means mouth corners are raised relative to lip center
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

// 3. UI Update Logic
function updateUI(command, expression) {
  if (expression) {
    expressionDisplay.textContent = expression;
  }

  if (command === lastCommand) return;

  // Highlight active direction badge
  Object.keys(badges).forEach(dir => {
    if (dir === command) {
      badges[dir].classList.add('active');
    } else {
      badges[dir].classList.remove('active');
    }
  });

  // Rep counter logic (CENTER -> DIRECTION -> CENTER = 1 Rep)
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

// 4. Process Camera Frames
function onResults(results) {
  if (!isCameraOn) return;

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

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

// 5. Camera Control Handler
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
    // Turn Camera Off
    isCameraOn = false;
    camera.stop();
    cameraOffOverlay.classList.remove('hidden');
    toggleCameraBtn.textContent = '🟢 Turn Camera On';
    toggleCameraBtn.className = 'btn btn-success';
    commandDisplay.textContent = 'Camera is paused';
    expressionDisplay.textContent = 'Feeling: Camera Off';
  } else {
    // Turn Camera On
    isCameraOn = true;
    cameraOffOverlay.classList.add('hidden');
    toggleCameraBtn.textContent = '🔴 Turn Camera Off';
    toggleCameraBtn.className = 'btn btn-danger';
    commandDisplay.textContent = 'Starting camera...';
    camera.start();
  }
});

// Start camera on page load
camera.start()
  .then(() => {
    commandDisplay.textContent = 'Camera active. Start moving your head!';
  })
  .catch((err) => {
    console.error('Camera error:', err);
    commandDisplay.textContent = 'Error starting camera.';
  });
