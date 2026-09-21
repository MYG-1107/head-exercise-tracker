const video = document.getElementById('webcam');
const commandDisplay = document.getElementById('command-display');
const repCountDisplay = document.getElementById('rep-count');

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

// Initialize MediaPipe FaceMesh
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

function updateUI(command) {
  if (command === lastCommand) return;

  // Highlight current active direction badge
  Object.keys(badges).forEach(dir => {
    if (dir === command) {
      badges[dir].classList.add('active');
    } else {
      badges[dir].classList.remove('active');
    }
  });

  // Rep counting logic (CENTER -> DIRECTION -> CENTER = 1 Rep)
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

function onResults(results) {
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

    updateUI(command);
  } else {
    commandDisplay.textContent = 'No face detected';
  }
}

// Start camera stream
const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start()
  .then(() => {
    commandDisplay.textContent = 'Camera active. Start moving your head!';
  })
  .catch((err) => {
    console.error('Camera error:', err);
    commandDisplay.textContent = 'Error starting camera.';
  });