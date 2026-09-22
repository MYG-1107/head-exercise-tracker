document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // ☁️ CLOUDINARY CONFIGURATION
  // Replace these credentials with your Cloudinary details
  // ==========================================
  const CLOUDINARY_CLOUD_NAME = 'YOUR_CLOUD_NAME';       // e.g., 'my-cloud-123'
  const CLOUDINARY_UPLOAD_PRESET = 'YOUR_UPLOAD_PRESET'; // Unsigned upload preset name

  // --- 1. MODAL NAVIGATION SYSTEM ---
  const modalTriggers = [
    { triggerIds: ['link-how-it-works'], modalId: 'modal-how-it-works' },
    { triggerIds: ['link-about', 'footer-link-about'], modalId: 'modal-about' },
    { triggerIds: ['link-developer', 'footer-link-developer'], modalId: 'modal-developer' },
    { triggerIds: ['link-privacy', 'footer-link-privacy'], modalId: 'modal-privacy' },
    { triggerIds: ['footer-link-disclaimer'], modalId: 'modal-disclaimer' },
    { triggerIds: ['view-gallery-btn'], modalId: 'modal-gallery' }
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
  const capturePhotoBtn = document.getElementById('capture-photo-btn');
  const videoElement = document.getElementById('webcam');
  const overlayElement = document.getElementById('camera-off-overlay');
  const expressionDisplay = document.getElementById('expression-display');
  const commandDisplay = document.getElementById('command-display');
  const photoCanvas = document.getElementById('photo-canvas');
  const galleryContainer = document.getElementById('gallery-container');
  const photoCountSpan = document.getElementById('photo-count');

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

  // Exercise & Screenshot State
  let currentDirection = 'CENTER';
  let currentExpression = 'Neutral';
  let repetitionCount = 0;
  let centerHoldStartTime = null;
  let capturedPhotos = [];

  function speak(text) {
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

  // --- 3. CLOUDINARY UPLOAD LOGIC ---
  async function uploadToCloudinary(base64Image, label) {
    if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME' || CLOUDINARY_UPLOAD_PRESET === 'YOUR_UPLOAD_PRESET') {
      console.warn('Cloudinary credentials not set. Falling back to local display.');
      return null;
    }

    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('tags', `head_exercise,${label.toLowerCase()}`);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Cloudinary upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.secure_url; // Cloudinary Hosted Image URL
    } catch (error) {
      console.error('Cloudinary Upload Error:', error);
      return null;
    }
  }

  async function capturePhoto(label = 'Manual') {
    if (!isCameraActive || !videoElement.videoWidth) return;

    const ctx = photoCanvas.getContext('2d');
    photoCanvas.width = videoElement.videoWidth;
    photoCanvas.height = videoElement.videoHeight;

    // Mirror horizontal canvas draw to match webcam video CSS
    ctx.translate(photoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, photoCanvas.width, photoCanvas.height);

    const dataUrl = photoCanvas.toDataURL('image/jpeg', 0.85);

    commandDisplay.innerText = '☁️ Uploading photo to Cloudinary...';

    const cloudinaryUrl = await uploadToCloudinary(dataUrl, label);
    const photoUrl = cloudinaryUrl || dataUrl; // Use Cloudinary URL if available, fallback to local base64

    const photoItem = {
      id: Date.now(),
      url: photoUrl,
      isCloudinary: !!cloudinaryUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      info: `${currentDirection} | ${currentExpression}`
    };

    capturedPhotos.unshift(photoItem);
    updateGalleryUI();

    if (cloudinaryUrl) {
      commandDisplay.innerText = `Uploaded to Cloudinary! Total Reps: ${repetitionCount}`;
    } else {
      commandDisplay.innerText = `Saved locally (Cloudinary config needed). Reps: ${repetitionCount}`;
    }
  }

  function updateGalleryUI() {
    photoCountSpan.innerText = capturedPhotos.length;

    if (capturedPhotos.length === 0) {
      galleryContainer.innerHTML = '<p class="empty-msg">No snapshots taken yet. Click "📸 Take Screenshot" or perform an exercise movement!</p>';
      return;
    }

    galleryContainer.innerHTML = capturedPhotos.map(photo => `
      <div class="photo-card" id="photo-${photo.id}">
        <a href="${photo.url}" target="_blank" title="View full size image">
          <img src="${photo.url}" alt="Screenshot ${photo.timestamp}" />
        </a>
        <div class="photo-card-info">
          <span>${photo.info}</span>
          <div class="photo-card-actions">
            <a href="${photo.url}" target="_blank" download="head-exercise-${photo.id}.jpg" class="photo-btn download">
              ${photo.isCloudinary ? '☁️ Link' : '💾 Save'}
            </a>
            <button class="photo-btn delete" onclick="deletePhoto(${photo.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  window.deletePhoto = function(id) {
    capturedPhotos = capturedPhotos.filter(p => p.id !== id);
    updateGalleryUI();
  };

  capturePhotoBtn.addEventListener('click', () => {
    capturePhoto('Manual');
  });

  // --- 4. MEDIAPIPE FACE MESH (POSE + EXPRESSION TRACKING) ---
  function onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      expressionDisplay.innerHTML = 'Status: <span>Searching for face...</span>';
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

    // Head Pose calculations
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

    // Facial Expression calculations
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
        repetitionCount++;
        commandDisplay.innerText = `Repetitions Completed: ${repetitionCount}`;
        speak(currentDirection.toLowerCase());
        centerHoldStartTime = null;

        // Auto snapshot on movement trigger
        capturePhoto('Auto-Movement');
      } else {
        centerHoldStartTime = Date.now();
      }
    }

    expressionDisplay.innerHTML = `Head Pose: <span>${currentDirection}</span> | Expression: <span>${currentExpression}</span>`;

    if (currentDirection === 'CENTER' && centerHoldStartTime) {
      const elapsedSeconds = Math.floor((Date.now() - centerHoldStartTime) / 1000);
      if (elapsedSeconds >= 5) {
        speak(`Exercise summary. You completed ${repetitionCount} repetitions.`);
        centerHoldStartTime = null;
      }
    }
  }

  // --- 5. CAMERA CONTROL ---
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
      capturePhotoBtn.disabled = false;
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
    capturePhotoBtn.disabled = true;
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
