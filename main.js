document.addEventListener('DOMContentLoaded', () => {
  try {
    let rafId = null; // for requestAnimationFrame
function startVisualizer() {
  // Prevent multiple starts
  if (rafId !== null) return;
  // Start the loop (drawVisualizer should schedule subsequent frames)
  rafId = requestAnimationFrame(drawVisualizer);
}

function stopVisualizer() {
  if (rafId === null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}
    startVisualizer();
    let micStream = null;
let micSource = null;
let micAnalyser = null;
let micDataArray = null;

    let volu = document.getElementById('volu');
    let vol = document.getElementById('vol');
    let isplaying = false;
    
    // DOM Elements
    let canplay = false;
    let avg = 0;
    let canshake = true;
    
    // Recording variables
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let recordingStartTime = 0;
    let recordingTimer = null;
    let recordings = [];
    
    function shake(shakeSpeed = 1, duration = 500) {
      if (canshake) {
        canshake = false;
        shakeSpeed = Math.min(Math.max(shakeSpeed, 0.1), 5);
        const styleId = "custom-shake-style";
        let styleTag = document.getElementById(styleId);
        if (styleTag) styleTag.remove();
        const px = Math.floor(shakeSpeed * 5);
        styleTag = document.createElement("style");
        styleTag.id = styleId;
        const animDuration = (0.6 / shakeSpeed).toFixed(2);
        styleTag.innerHTML = `
          @keyframes shakeAll {
            0%   { transform: translate(0, 0); }
            25%  { transform: translate(-${px}px, ${px}px); }
            50%  { transform: translate(${px}px, -${px}px); }
            75%  { transform: translate(-${px}px, ${px}px); }
            100% { transform: translate(0, 0); }
          }
          * {
            animation: shakeAll ${animDuration}s infinite;
          }
        `;
        document.head.appendChild(styleTag);
        setTimeout(() => {
          document.head.removeChild(styleTag);
          canshake = true;
        }, duration);
      }
    }
    
    function vri(intensity, duration) {
      if (!navigator.vibrate) return false;
      
      // Validate parameters
      intensity = Math.min(Math.max(intensity, 0.001), 1000);
      duration = Math.min(Math.max(duration, 1), 3000);
      
      // Create a smooth pattern with micro-pulses
      const pattern = [];
      const totalPulses = Math.floor(duration / 20);
      
      for (let i = 0; i < totalPulses; i++) {
        const pulseWidth = 10 + (5 * intensity) + (Math.random() * 5);
        pattern.push(pulseWidth);
        
        const gapWidth = 5 - (4 * intensity);
        if (i < totalPulses - 1) {
          pattern.push(Math.max(1, gapWidth));
        }
      }
      
      try {
        return navigator.vibrate(pattern);
      } catch (e) {
        console.warn("Smooth vibration failed, using fallback:", e);
        return navigator.vibrate(duration * intensity);
      }
    }

    // Global audio management state
    const audioState = {
      context: null,
      source: null,
      analyser: null,
      isClosing: false
    };
async function initMicVisualizer() {
  try {
    if (!navigator.mediaDevices) return;
    
    // Create AudioContext if not already
    if (!audioCtx) audioCtx = new(window.AudioContext || window.webkitAudioContext)();
    
    // Get mic input
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micSource = audioCtx.createMediaStreamSource(micStream);
    
    // Create analyser
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 2048; // you can increase for more resolution
    micSource.connect(micAnalyser);
    
    // Data array
    micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    
    // Calculate Hz per bin for mic analyser
    hzPerBin = audioCtx.sampleRate / 2 / micAnalyser.frequencyBinCount;
    
    // Start visualizer immediately (even without recording)
    drawVisualizer();
  } catch (err) {
    console.error("Mic visualization error:", err);
  }
}
    async function getAudioContext() {
      if (audioState.context && !audioState.isClosing && audioState.context.state !== 'closed') {
        return audioState;
      }

      await closeAudioContext();

      audioState.context = new (window.AudioContext || window.webkitAudioContext)();
      audioState.analyser = audioState.context.createAnalyser();
      audioState.source = null;
      audioState.isClosing = false;

      return audioState;
    }

    async function closeAudioContext() {
      if (!audioState.context || audioState.isClosing) return;

      audioState.isClosing = true;

      try {
        if (audioState.source) {
          audioState.source.disconnect();
        }
        if (audioState.analyser) {
          audioState.analyser.disconnect();
        }

        if (audioState.context.state !== 'closed') {
          await audioState.context.close();
        }
      } catch (e) {
        console.warn('AudioContext cleanup error:', e);
      } finally {
        audioState.context = null;
        audioState.source = null;
        audioState.analyser = null;
        audioState.isClosing = false;
      }
    }

    // Recording functions
    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          saveRecording(audioBlob);
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        recordBtn.innerHTML = `<i class="fas fa-stop"></i> Stop Recording`;
        recordBtn.classList.add('recording');
        recordingStatus.textContent = 'Recording...';
        document.body.classList.add('recording-flash');
        
        // Start timer
        updateRecordingTimer();
        
      } catch (err) {
        console.error('Error starting recording:', err);
        recordingStatus.textContent = 'Error: ' + err.message;
      }
    }
    
    function stopRecording() {
      if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI
        recordBtn.innerHTML = `<i class="fas fa-circle"></i> Start Recording`;
        recordBtn.classList.remove('recording');
        recordingStatus.textContent = 'Recording saved';
        document.body.classList.remove('recording-flash');
        
        // Clear timer
        clearTimeout(recordingTimer);
      }
    }
    
    function updateRecordingTimer() {
      if (!isRecording) return;
      
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      recordingStatus.textContent = `Recording... ${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      recordingTimer = setTimeout(updateRecordingTimer, 1000);
    }
    
    function saveRecording(blob) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const recordingName = `recording-${timestamp}.webm`;
      
      // Create object URL
      const audioURL = URL.createObjectURL(blob);
      
      // Add to recordings list
      recordings.push({
        name: recordingName,
        url: audioURL,
        blob: blob,
        date: new Date()
      });
      
      // Save to localStorage
      saveRecordingsToStorage();
      
      // Update UI
      displayRecordings();
      
      // Provide download link
      const a = document.createElement('a');
      a.href = audioURL;
      a.download = recordingName;
      a.click();
    }
    
    function saveRecordingsToStorage() {
      // Convert blobs to base64 for storage
      const recordingsForStorage = recordings.map(rec => ({
        name: rec.name,
        date: rec.date.toISOString(),
        // Note: Storing large blobs in localStorage isn't practical
        // In a real app, you would use IndexedDB instead
      }));
      
      localStorage.setItem('mediaPlayerRecordings', JSON.stringify(recordingsForStorage));
    }
    
    function loadRecordingsFromStorage() {
      const stored = localStorage.getItem('mediaPlayerRecordings');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Note: We can't store the actual audio data in localStorage
        // So we're just storing metadata
        recordings = parsed.map(rec => ({
          name: rec.name,
          date: new Date(rec.date),
          url: null, // Would need to be regenerated from blob if stored properly
          blob: null
        }));
        
        displayRecordings();
      }
    }
    
    function displayRecordings() {
      const container = document.getElementById('recordingsContainer');
      container.innerHTML = '';
      
      if (recordings.length === 0) {
        container.innerHTML = '<p>No recordings yet</p>';
        return;
      }
      
      // Show most recent first
      const sortedRecordings = [...recordings].reverse();
      
      sortedRecordings.forEach((recording, index) => {
        const item = document.createElement('div');
        item.className = 'recording-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'recording-name';
        nameSpan.textContent = recording.name;
        
        const actions = document.createElement('div');
        actions.className = 'recording-actions';
        
        const playBtn = document.createElement('button');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.onclick = () => playRecording(recording);
        
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.onclick = () => downloadRecording(recording);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => deleteRecording(index);
        
        actions.appendChild(playBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(deleteBtn);
        
        item.appendChild(nameSpan);
        item.appendChild(actions);
        
        container.appendChild(item);
      });
    }
    
    function playRecording(recording) {
      if (recording.url) {
        setMediaSource(recording.url, 'url');
      } else if (recording.blob) {
        const url = URL.createObjectURL(recording.blob);
        setMediaSource(url, 'url');
      }
    }
    
    function downloadRecording(recording) {
      if (recording.blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(recording.blob);
        a.download = recording.name;
        a.click();
      }
    }
    
    function deleteRecording(index) {
      // Adjust index for reversed display
      const actualIndex = recordings.length - 1 - index;
      recordings.splice(actualIndex, 1);
      saveRecordingsToStorage();
      displayRecordings();
    }
    
    // UI Elements
    const fileOption = document.getElementById("fileOption");
    const urlOption = document.getElementById("urlOption");
    const recordOption = document.getElementById("recordOption");
    const fileInputContainer = document.getElementById("fileInputContainer");
    const urlInputContainer = document.getElementById("urlInputContainer");
    const recordContainer = document.getElementById("recordContainer");
    const fileInput = document.getElementById("fileInput");
    const urlInput = document.getElementById("urlInput");
    const loadUrlBtn = document.getElementById("loadUrlBtn");
    const recordBtn = document.getElementById("recordBtn");
    const recordingStatus = document.getElementById("recordingStatus");
    const changeFolderBtn = document.getElementById("changeFolderBtn");
    const playBtn = document.getElementById("playBtn");
    const loopBtn = document.getElementById("loopBtn");
    const seek = document.getElementById("seek");
    const timeDisplay = document.getElementById("timeDisplay");
    const durationDisplay = document.querySelector(".duration");
    const video = document.getElementById("videoElement");
    const audio = document.getElementById("audioElement");
    const canvas = document.getElementById("visualizer");
    const ctx = canvas.getContext("2d");
    const volLow = document.getElementById("volLow");
    const volMed = document.getElementById("volMed");
    const volHigh = document.getElementById("volHigh");
    const vibrationStatus = document.getElementById("vibrationStatus");
    const volumeLevel = document.getElementById("volumeLevel");
    const loopStatus = document.getElementById("loopStatus");
    const skipBackBtn = document.getElementById("skipBackBtn");
    const skipForwardBtn = document.getElementById("skipForwardBtn");

    // Audio Analysis Variables
    
    
    
    // Player State
    let mediaElement, isLooping = false, lastVibrate = 0;
    let lastVolumeLevel = null;
    let flashTimeout = null;
    let isVideo = false;
    
    // Check vibration API support
    const supportsVibration = "vibrate" in navigator;
    vibrationStatus.textContent = supportsVibration ? "Supported" : "Not Supported";
    vibrationStatus.style.color = supportsVibration ? "#4caf50" : "#f44336";
    
    let main = 0;
    // ensure there's a single rafId global (you already had one, make sure it's used)


    // Format time as HH:MM:SS:mmm
    function formatTime(seconds) {
      const ms = Math.floor((seconds % 1) * 1000);
      const totalSec = Math.floor(seconds);
      
      // Only show hours if duration is 1 hour or more
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      
      if (h > 0) {
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms).padStart(3, "0")}`;
      } else {
          return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms).padStart(3, "0")}`;
      }
    }

    // Parse time string into seconds
    function parseTime(timeStr) {
      // Handle both formats (with or without hours)
      const parts = timeStr.split(":").map(Number);
      
      if (parts.length === 4) { // HH:MM:SS:mmm
          const [h, m, s, ms] = parts;
          return h * 3600 + m * 60 + s + ms / 1000;
      } else if (parts.length === 3) { // MM:SS:mmm
          const [m, s, ms] = parts;
          return m * 60 + s + ms / 1000;
      }
      
      return null; // Invalid format
    }

    // Update volume level indicators
    function updateVolumeIndicator(level) {
      if (level === lastVolumeLevel){
        main = avg / 100;
        return;
      }
      if (isplaying) {
        if (main < avg / 1000) {
          main = avg / 1000;
          vri(main, 5);
        } else if (main > avg / 1000) {
          main = avg / 1000;
          vri(main, 1);
        } else {
          main = avg / 1000;
        }
      }
      
      volLow.classList.remove('active');
      volMed.classList.remove('active');
      volHigh.classList.remove('active');
      
      if (level === 'low') {
        volLow.classList.add('active');
        volumeLevel.textContent = "Low";
        volumeLevel.style.color = "#1e88e5";
      } else if (level === 'medium') {
        volMed.classList.add('active');
        volumeLevel.textContent = "Medium";
        volumeLevel.style.color = "#ffc107";
      } else if (level === 'high') {
        volHigh.classList.add('active');
        volumeLevel.textContent = "High";
        volumeLevel.style.color = "#4caf50";
        shake(3, 500);
      }
      
      lastVolumeLevel = level;
    }

    // Flash background based on volume level
    function flashBackground(type) {
      if (flashTimeout) {
        clearTimeout(flashTimeout);
        document.body.classList.remove("flash-white", "flash-green", "shake");
      }
      
      if (type === 'medium') {
        document.body.classList.add("flash-white", "shake");
      } else if (type === 'high') {
        document.body.classList.add("flash-green", "shake");
      }
      
      flashTimeout = setTimeout(() => {
        document.body.classList.remove("flash-white", "flash-green", "shake");
      }, type === 'medium' ? 300 : 200);
    }
    
    let avg2 = 0;
    let t = 0;
function updateTime(delta = 0.016) { // ~60 FPS
    t += delta;
}
    let lastTimestamp = 0;

function drawVisualizer(timestamp) {
    // Initialize timestamp for first frame
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;
    t += delta; // increment global time for stickman animation

    if (!analyser && !micAnalyser) return;

    // 4-speaker visualizer
    draw4SpeakerDivs();

    // Fetch frequency data from media playback and mic
    const playbackData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const micData = micAnalyser ? new Uint8Array(micAnalyser.frequencyBinCount) : null;

    if (analyser) analyser.getByteFrequencyData(playbackData);
    if (micAnalyser) micAnalyser.getByteFrequencyData(micData);

    const length = playbackData ? playbackData.length : micData.length;
    const combinedData = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
        const p = playbackData ? playbackData[i] : 0;
        const m = micData ? micData[i] : 0;
        combinedData[i] = Math.max(p, m);
    }

    // Find peak frequency
    let maxIndex = 0, maxValue = 0;
    for (let i = 0; i < combinedData.length; i++) {
        if (combinedData[i] > maxValue) {
            maxValue = combinedData[i];
            maxIndex = i;
        }
    }
    const peakHz = binToHz(maxIndex);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / combinedData.length) * 2.5;
    let x = 0;
    let sum = 0, sumFirst = 0;

    for (let i = 0; i < combinedData.length; i++) {
        const barHeight = combinedData[i] / 2;
        sum += combinedData[i];
        if (i < 8) sumFirst += combinedData[i];

        const r = barHeight + 25;
        const g = 250 - barHeight;
        const b = barHeight + 100;
        ctx.fillStyle = `rgb(${r},${g},${b},1)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }

    avg2 = sumFirst / 7;
    avg = sum / combinedData.length;

    volu.innerHTML = `
        .....all avg: ${avg.toFixed(1)} <br>
        main avg: ${avg2.toFixed(1)} <br>
        peak freq: ${Math.round(peakHz)} Hz
    `;
  // Update color and shake effects based on avg2
  if (avg2 < 179) {
    vol.style.boxShadow = "0 0 10px rgba(0, 255, 58, 0.58)";
    volu.style.color = "green";
    document.body.style.background = "green";
  } else if (avg2 < 199) {
    vol.style.boxShadow = "0 0 10px rgba(255, 255, 0, 0.58)";
    shake(0.5, 100);
    volu.style.color = "yellow";
    document.body.style.background = "yellow";
  } else if (avg2 < 250) {
    vol.style.boxShadow = "0 0 10px rgba(255, 0, 0, 0.58)";
    shake(1, 50);
    volu.style.color = "red";
    document.body.style.background = "red";
  } else if (avg2 < 279) {
    vol.style.boxShadow = "0 0 10px rgba(255, 0, 0, 0.58)";
    shake(1.5, 50);
    volu.style.color = "red";
    document.body.style.background = "darkred";
  } else {
    vol.style.boxShadow = "0 0 10px rgba(255, 0, 0, 0.58)";
    shake(2, 50);
    volu.style.color = "red";
    document.body.style.background = "black";
  }
    // Stickman head/body/arms/legs
    drawStickmanAI(avg, peakHz);

    // Volume effects (color, shake, vibration)
    let currentVolumeLevel = 'low';
    if (avg >= 100 && avg < 180) currentVolumeLevel = 'medium';
    else if (avg >= 180) currentVolumeLevel = 'high';
    updateVolumeIndicator(currentVolumeLevel);

    if (supportsVibration && mediaElement && !mediaElement.paused) {
        const now = Date.now();
        if (currentVolumeLevel === 'medium' && now - lastVibrate >= 600) {
            navigator.vibrate(300);
            flashBackground('medium');
            lastVibrate = now;
        } else if (currentVolumeLevel === 'high' && now - lastVibrate >= 400) {
            navigator.vibrate(200);
            flashBackground('high');
            lastVibrate = now;
        }
    }

    // Update seek/time display
    if (mediaElement && mediaElement.duration) {
        seek.value = (mediaElement.currentTime / mediaElement.duration) * 100;
        timeDisplay.value = formatTime(mediaElement.currentTime);
    }

    // Request next frame
    rafId = requestAnimationFrame(drawVisualizer);
}

    // Initialize Web Audio API
    // Global variables at the top
let audioCtx = null;
let sourceNode = null;
let analyser = null;
let dataArray = null;
let hzPerBin = 0; // will be set after creating analyser

// Global helper function
function binToHz(i) {
  return i * hzPerBin;
}

// Initialize audio context
function initAudioContext() {
  try {
    // Close previous context if exists
    if (audioCtx) {
      audioCtx.close();
      if (sourceNode) sourceNode.disconnect();
      if (analyser) analyser.disconnect();
    }
    
    // Create new AudioContext
    audioCtx = new(window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(mediaElement);
    analyser = audioCtx.createAnalyser();
    
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Set hzPerBin after analyser is created
    let sampleRate = audioCtx.sampleRate; // usually 44100
    let nyquist = sampleRate / 2; // max frequency ~22050 Hz
    let binCount = analyser.frequencyBinCount;
    hzPerBin = nyquist / binCount;
  } catch (e) {
    console.error("Error initializing audio context:", e);
  }
}

    async function setMediaSource(source, type = "file") {
      // Clean up previous media
      if (mediaElement) {
        try {
          // Pause and reset current media
          mediaElement.pause();
          mediaElement.currentTime = 0;
          
          // Disconnect audio nodes
          if (sourceNode) sourceNode.disconnect();
          if (analyser) analyser.disconnect();
          
          // Close audio context
          if (audioCtx) {
            await audioCtx.close();
          }
          
          // Cancel animation frame
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          
          // Clear media source
          mediaElement.src = '';
          mediaElement.removeAttribute('src');
          mediaElement.load();
          
          // Reset vibration
          if (supportsVibration) navigator.vibrate(0);
          document.body.classList.remove("flash-white", "flash-green", "shake");
        } catch (cleanupError) {
          console.warn("Cleanup error:", cleanupError);
        }
      }

      // Set up new media
      isVideo = type === "file" ? source.type.startsWith("video/") : 
                source.endsWith(".mp4") || source.endsWith(".webm") || 
                source.endsWith(".ogg") || source.endsWith(".mov");

      mediaElement = isVideo ? video : audio;
      video.style.display = isVideo ? "block" : "none";
      audio.style.display = isVideo ? "none" : "block";

      try {
        if (type === "file") {
          const url = URL.createObjectURL(source);
          mediaElement.src = url;
        } else {
          mediaElement.src = source;
        }

        // Initialize new audio context when ready
        mediaElement.addEventListener('canplay', function initWhenReady() {
  mediaElement.removeEventListener('canplay', initWhenReady);
  initAudioContext();
  init4SpeakerVisualizer(); // <-- Add this
}, { once: true });

        mediaElement.loop = isLooping;
        playBtn.disabled = false;
        loopBtn.disabled = false;
        playBtn.innerHTML = `<i class="fas fa-play"></i> Play`;
        
      } catch (loadError) {
        console.error("Media load error:", loadError);
        alert("Error loading media. Please try another file.");
      }
    }

    // Toggle play/pause
    function togglePlayback() {
      try {
        if (!mediaElement || !mediaElement.src) return;
      
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume();
        }

        if (mediaElement.paused) {
          mediaElement.play()
            .then(() => {
              playBtn.innerHTML = `<i class="fas fa-pause"></i> Pause`;
              isplaying = true;
              drawVisualizer();
            })
            .catch(e => {
              console.error("Playback error:", e);
              isplaying = false;
            });
        } else {
          mediaElement.pause();
          isplaying = false;
          playBtn.innerHTML = `<i class="fas fa-play"></i> Play`;
          cancelAnimationFrame(rafId);
          document.body.classList.remove("flash-white", "flash-green", "shake");
        }
      } catch (e) {
        isplaying = false;
        alert('Error playing media!');
      }
    }

    // Toggle loop mode
    function toggleLoop() {
      isLooping = !isLooping;
      if (mediaElement) {
        mediaElement.loop = isLooping;
      }
      loopBtn.textContent = `Loop: ${isLooping ? "On" : "Off"}`;
      loopStatus.textContent = isLooping ? "On" : "Off";
      loopBtn.className = isLooping ? "loop-on" : "";
    }

    // Update playback position from seek slider
    function updateSeekPosition() {
      if (mediaElement && mediaElement.duration) {
        const time = (seek.value / 100) * mediaElement.duration;
        mediaElement.currentTime = time;
      }
    }

    // Update playback position from time input
    function updateTimeDisplay() {
      if (!mediaElement || !mediaElement.duration) return;
      
      const seconds = parseTime(timeDisplay.value);
      if (seconds !== null) {
        mediaElement.currentTime = Math.min(seconds, mediaElement.duration);
      }
    }

    // Handle playback end
    function handlePlaybackEnd() {
      if (!mediaElement.loop) {
        playBtn.innerHTML = `<i class="fas fa-play"></i> Play`;
        seek.value = 0;
        timeDisplay.value = "00:00:00:000";
        cancelAnimationFrame(rafId);
        if (supportsVibration) navigator.vibrate(0);
        updateVolumeIndicator(null);
        volumeLevel.textContent = "Idle";
        volumeLevel.style.color = "#90caf9";
        document.body.classList.remove("flash-white", "flash-green", "shake");
      }
    }

    // Skip backward
    function skipBackward() {
      if (!mediaElement) return;
      mediaElement.currentTime = Math.max(0, mediaElement.currentTime - 10);
      vri(3, 50); // Short vibration feedback
    }

    // Skip forward
    function skipForward() {
      if (!mediaElement) return;
      mediaElement.currentTime = Math.min(mediaElement.duration, mediaElement.currentTime + 10);
      vri(3, 50); // Short vibration feedback
    }

    // Toggle recording
    function toggleRecording() {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }

    // Change folder (placeholder - in a real app, this would use a proper folder picker)
    function changeFolder() {
      alert("In a real application, this would open a folder picker dialog. For security reasons, browsers don't allow direct folder access from web pages.");
    }

    // Event Listeners
    fileOption.addEventListener("click", () => {
      fileOption.classList.add("selected");
      urlOption.classList.remove("selected");
      recordOption.classList.remove("selected");
      fileInputContainer.style.display = "block";
      urlInputContainer.style.display = "none";
      recordContainer.style.display = "none";
    });
    
    urlOption.addEventListener("click", () => {
      urlOption.classList.add("selected");
      fileOption.classList.remove("selected");
      recordOption.classList.remove("selected");
      urlInputContainer.style.display = "block";
      fileInputContainer.style.display = "none";
      recordContainer.style.display = "none";
    });
    
    recordOption.addEventListener("click", async () => {
  recordOption.classList.add("selected");
  fileOption.classList.remove("selected");
  urlOption.classList.remove("selected");

  recordContainer.style.display = "block";
  fileInputContainer.style.display = "none";
  urlInputContainer.style.display = "none";

  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // 🎤 Start mic visualizer
  await initMicVisualizer();   // wait until mic is ready
  startVisualizer();           // start animation loop

  // Optional: if you use drawVisualizer directly
  if (!rafId) drawVisualizer();
});
    
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (file) {
        try {
          isplaying = false;
          canplay = false;
          await setMediaSource(file, "file");
          canplay = true;
        } catch (e) {
          console.error("Error loading file:", e);
          alert("Error loading file. Please try another file.");
        }
      }
    });

    loadUrlBtn.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (url) {
        try {
          await setMediaSource(url, "url");
        } catch (e) {
          console.error("Error loading URL:", e);
          alert("Error loading URL. Please check the link.");
        }
      }
    });
    
    urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const url = urlInput.value.trim();
        if (url) {
          setMediaSource(url, "url");
        }
      }
    });
    
    playBtn.addEventListener("click", togglePlayback);
    loopBtn.addEventListener("click", toggleLoop);
    seek.addEventListener("input", updateSeekPosition);
    timeDisplay.addEventListener("blur", updateTimeDisplay);
    audio.addEventListener("ended", handlePlaybackEnd);
    video.addEventListener("ended", handlePlaybackEnd);
    skipBackBtn.addEventListener("click", skipBackward);
    skipForwardBtn.addEventListener("click", skipForward);
    recordBtn.addEventListener("click", toggleRecording);
    changeFolderBtn.addEventListener("click", changeFolder);
    
    // Add keyboard shortcuts (left/right arrows)
    document.addEventListener("keydown", (e) => {
      if (!mediaElement) return;
      
      switch (e.key) {
        case "ArrowLeft":
          skipBackward();
          break;
        case "ArrowRight":
          skipForward();
          break;
      }
    });
    
    // Initialize with sample URL
    urlInput.value = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
    
    // Load recordings from storage
    loadRecordingsFromStorage();
    // 4-speaker setup
let splitter4 = null;
let analyserSP1 = null, analyserSP2 = null, analyserSP3 = null, analyserSP4 = null;
let dataSP1 = null, dataSP2 = null, dataSP3 = null, dataSP4 = null;

function init4SpeakerVisualizer() {
  if (!audioCtx || !mediaElement) return;

  // Split stereo into 4 channels (simulate 4 speakers)
  splitter4 = audioCtx.createChannelSplitter(2); // stereo source
  sourceNode.connect(splitter4);

  // Create gain nodes to simulate extra speakers
  const gain1 = audioCtx.createGain();
  const gain2 = audioCtx.createGain();
  const gain3 = audioCtx.createGain();
  const gain4 = audioCtx.createGain();

  // Connect left/right to "virtual" speakers
  splitter4.connect(gain1, 0); // left -> sp1
  splitter4.connect(gain2, 1); // right -> sp2
  splitter4.connect(gain1, 0); // left -> sp3
  splitter4.connect(gain2, 1); // right -> sp4

  gain1.connect(audioCtx.destination);
  gain2.connect(audioCtx.destination);
  gain3.connect(audioCtx.destination);
  gain4.connect(audioCtx.destination);

  // Create analysers
  analyserSP1 = audioCtx.createAnalyser();
  analyserSP2 = audioCtx.createAnalyser();
  analyserSP3 = audioCtx.createAnalyser();
  analyserSP4 = audioCtx.createAnalyser();

  gain1.connect(analyserSP1);
  gain2.connect(analyserSP2);
  gain3.connect(analyserSP3);
  gain4.connect(analyserSP4);

  analyserSP1.fftSize = 1024;
  analyserSP2.fftSize = 1024;
  analyserSP3.fftSize = 1024;
  analyserSP4.fftSize = 1024;

  dataSP1 = new Uint8Array(analyserSP1.frequencyBinCount);
  dataSP2 = new Uint8Array(analyserSP2.frequencyBinCount);
  dataSP3 = new Uint8Array(analyserSP3.frequencyBinCount);
  dataSP4 = new Uint8Array(analyserSP4.frequencyBinCount);
}

// Call this inside your drawVisualizer function
function draw4SpeakerDivs() {
  if (!analyserSP1) return;

  // read frequency data
  analyserSP1.getByteFrequencyData(dataSP1);
  analyserSP2.getByteFrequencyData(dataSP2);
  analyserSP3.getByteFrequencyData(dataSP3);
  analyserSP4.getByteFrequencyData(dataSP4);

  const avgSP1 = dataSP1.reduce((a, b) => a + b, 0) / dataSP1.length;
  const avgSP2 = dataSP2.reduce((a, b) => a + b, 0) / dataSP2.length;
  const avgSP3 = dataSP3.reduce((a, b) => a + b, 0) / dataSP3.length;
  const avgSP4 = dataSP4.reduce((a, b) => a + b, 0) / dataSP4.length;

  // convert to percent and clamp 0..100
  const pct1 = Math.min(100, Math.max(0, (avgSP1 / 255) * 100));
  const pct2 = Math.min(100, Math.max(0, (avgSP2 / 255) * 100));
  const pct3 = Math.min(100, Math.max(0, (avgSP3 / 255) * 100));
  const pct4 = Math.min(100, Math.max(0, (avgSP4 / 255) * 100));

  const el1 = document.getElementById('sp1');
  const el2 = document.getElementById('sp2');
  const el3 = document.getElementById('sp3');
  const el4 = document.getElementById('sp4');

  if (el1) el1.style.width = pct1 + '%';
  if (el2) el2.style.width = pct2 + '%';
  if (el3) el3.style.width = pct3 + '%';
  if (el4) el4.style.width = pct4 + '%';

  // IMPORTANT: NO requestAnimationFrame() here — the main drawVisualizer() controls RAF.
}// Style fix for visibility
const stickCanvas = document.getElementById('stickCanvas');
const sctx = stickCanvas.getContext('2d');
stickCanvas.style.zIndex = "99999"; // bring to front

const brain = {
    armPhase: 0,
    legPhase: 0
};
// In drawStickmanAI()
function drawStickmanAI(avg, peakHz) {
  const stickCanvas = document.getElementById('stickCanvas');
  if (!stickCanvas) return;
  
  const sctx = stickCanvas.getContext('2d');
  const cx = stickCanvas.width / 2; // 100px
  const cy = stickCanvas.height / 2 + 20; // 150px + 20 = 170px (lower center)
  const size = 40; // Bigger for 200x300 canvas
  
  // Clear canvas
  sctx.clearRect(0, 0, stickCanvas.width, stickCanvas.height);
  
  // Physics-based movement
  const jumpForce = Math.min(avg / 30, 20);
  const gravity = 1.5;
  
  if (!window.stickmanState) {
    window.stickmanState = { jumpHeight: 0, velocity: 0, isJumping: false };
  }
  
  if (jumpForce > 5 && !window.stickmanState.isJumping) {
    window.stickmanState.velocity = -jumpForce;
    window.stickmanState.isJumping = true;
  }
  
  window.stickmanState.velocity += gravity;
  window.stickmanState.jumpHeight += window.stickmanState.velocity;
  
  if (window.stickmanState.jumpHeight >= 0) {
    window.stickmanState.jumpHeight = 0;
    window.stickmanState.isJumping = false;
    window.stickmanState.velocity = 0;
  }
  
  // Limb movements
  const armSwing = Math.sin(t * 8) * Math.min(avg / 60, 2) * 20;
  const legSwing = Math.sin(t * 8 + Math.PI) * Math.min(avg / 60, 2) * 15;
  const bodySway = Math.sin(t * 6) * Math.min(avg / 80, 1.5) * 10;
  
  // Body positions for 200x300 canvas
  const headY = cy - 30 - window.stickmanState.jumpHeight;
  const neckY = headY + 10;
  const bodyTopY = neckY + 5;
  const bodyBottomY = bodyTopY + 40;
  
  // Draw head
  sctx.beginPath();
  sctx.arc(cx + bodySway * 0.3, headY, 12, 0, Math.PI * 2);
  sctx.strokeStyle = "white";
  sctx.lineWidth = 3;
  sctx.stroke();
  
  // Draw neck
  sctx.beginPath();
  sctx.moveTo(cx + bodySway * 0.3, neckY);
  sctx.lineTo(cx + bodySway, bodyTopY);
  sctx.stroke();
  
  // Draw body
  sctx.beginPath();
  sctx.moveTo(cx + bodySway, bodyTopY);
  sctx.lineTo(cx + bodySway * 0.8, bodyBottomY);
  sctx.stroke();
  
  // Draw arms with hands
  const shoulderY = bodyTopY + 8;
  sctx.beginPath();
  // Left arm
  sctx.moveTo(cx + bodySway, shoulderY);
  sctx.lineTo(cx - 20 + armSwing + bodySway, shoulderY + 15);
  // Left hand
  sctx.lineTo(cx - 20 + armSwing + bodySway - 4, shoulderY + 15 + 4);
  
  // Right arm
  sctx.moveTo(cx + bodySway, shoulderY);
  sctx.lineTo(cx + 20 - armSwing + bodySway, shoulderY + 15);
  // Right hand
  sctx.lineTo(cx + 20 - armSwing + bodySway + 4, shoulderY + 15 + 4);
  sctx.stroke();
  
  // Draw legs with feet
  const hipY = bodyBottomY;
  sctx.beginPath();
  // Left leg
  sctx.moveTo(cx + bodySway * 0.8, hipY);
  sctx.lineTo(cx - 12 + legSwing + bodySway * 0.5, hipY + 25);
  // Left foot
  sctx.lineTo(cx - 12 + legSwing + bodySway * 0.5 - 6, hipY + 25);
  
  // Right leg
  sctx.moveTo(cx + bodySway * 0.8, hipY);
  sctx.lineTo(cx + 12 - legSwing + bodySway * 0.5, hipY + 25);
  // Right foot
  sctx.lineTo(cx + 12 - legSwing + bodySway * 0.5 + 6, hipY + 25);
  sctx.stroke();
  
  // Facial features
  sctx.beginPath();
  sctx.strokeStyle = "white";
  if (avg > 20) {
    // Excited face
    sctx.arc(cx + bodySway * 0.3 - 5, headY - 3, 3, 0, Math.PI * 2);
    sctx.arc(cx + bodySway * 0.3 + 5, headY - 3, 3, 0, Math.PI * 2);
    sctx.moveTo(cx + bodySway * 0.3 - 7, headY + 5);
    sctx.arc(cx + bodySway * 0.3, headY + 5, 7, 0, Math.PI, false);
  } else {
    // Normal face
    sctx.arc(cx + bodySway * 0.3 - 4, headY - 3, 2, 0, Math.PI * 2);
    sctx.arc(cx + bodySway * 0.3 + 4, headY - 3, 2, 0, Math.PI * 2);
    sctx.moveTo(cx + bodySway * 0.3 - 5, headY + 5);
    sctx.lineTo(cx + bodySway * 0.3 + 5, headY + 5);
  }
  sctx.stroke();
}
  } catch (e) {
    alert('Error initializing player');
    console.error('emotional damage: unkown error says "Initialization error:', e+'"');
  }
});
document.addEventListener('DOMContentLoaded', () => {try {
  // --- Settings defaults ---
  const defaultSettings = {
    maxFPS60: false,
    reduceShake: false,
    reduceColor: false,
    showURLOption: true,
    showInstructions: true
  };

  // Load settings from localStorage or use defaults
  const savedSettings = JSON.parse(localStorage.getItem('playerSettings')) || {};
  const settings = { ...defaultSettings, ...savedSettings };

  // --- Create settings button ---
  const settingsBtn = document.createElement('div');
  settingsBtn.style.position = 'fixed';
  settingsBtn.id = "sett";

  settingsBtn.style.top = '10px';
  settingsBtn.style.left = '10px';
  settingsBtn.style.width = '30px';
  settingsBtn.style.height = '30px';
  settingsBtn.style.borderRadius = '50%';
// Try to use sett.png
const img = new Image();
img.src = 'sett.png';
img.onload = () => {
  settingsBtn.style.backgroundImage = `url(${img.src})`;
  settingsBtn.style.backgroundSize = 'cover';
  settingsBtn.style.backgroundPosition = 'center';
};
img.onerror = () => {
  // fallback to black if image doesn't exist
  settingsBtn.style.backgroundColor = 'black';
};

document.body.appendChild(settingsBtn);
  settingsBtn.style.cursor = 'pointer';
  settingsBtn.style.zIndex = 9999;
  settingsBtn.title = 'Open Settings';
  document.body.appendChild(settingsBtn);

  // --- Settings panel ---
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '50px';
  panel.style.left = '10px';
  panel.style.width = '220px';
  panel.style.padding = '10px';
  panel.style.backgroundColor = 'rgba(0,0,0,0.85)';
  panel.style.color = 'white';
  panel.style.fontSize = '14px';
  panel.style.borderRadius = '8px';
  panel.style.display = 'none';
  panel.style.zIndex = 9999;
  panel.style.maxHeight = '90vh';
  panel.style.overflowY = 'auto';
  panel.innerHTML = `<h4 style="margin:5px 0;">Settings</h4>`;
  document.body.appendChild(panel);

  // --- Helper to create checkbox ---
  function createCheckbox(name, label, checked) {
    const wrapper = document.createElement('div');
    wrapper.style.margin = '5px 0';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `chk-${name}`;
    input.checked = checked;
    const lbl = document.createElement('label');
    lbl.htmlFor = input.id;
    lbl.textContent = ' ' + label;
    wrapper.appendChild(input);
    wrapper.appendChild(lbl);
    panel.appendChild(wrapper);
    return input;
  }

  // --- Add checkboxes ---
  const chkMaxFPS = createCheckbox('maxFPS60', 'Max FPS 60', settings.maxFPS60);
  const chkShake = createCheckbox('reduceShake', 'Reduce Shake', settings.reduceShake);
  const chkColor = createCheckbox('reduceColor', 'Reduce Color Party', settings.reduceColor);
  const chkURL = createCheckbox('showURLOption', 'Show URL Option', settings.showURLOption);
  const chkInstructions = createCheckbox('showInstructions', 'Show Instructions', settings.showInstructions);

  // --- Reset button ---
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset Settings';
  resetBtn.style.marginTop = '10px';
  resetBtn.style.width = '100%';
  panel.appendChild(resetBtn);

  // --- Event listeners for checkboxes ---
  [chkMaxFPS, chkShake, chkColor, chkURL, chkInstructions].forEach(chk => {
    chk.addEventListener('change', () => {
      settings.maxFPS60 = chkMaxFPS.checked;
      settings.reduceShake = chkShake.checked;
      settings.reduceColor = chkColor.checked;
      settings.showURLOption = chkURL.checked;
      settings.showInstructions = chkInstructions.checked;

      localStorage.setItem('playerSettings', JSON.stringify(settings));

      // Apply immediate changes
      window.targetFPS = settings.maxFPS60 ? 60 : 120;
    });
  });

  resetBtn.addEventListener('click', () => {
    localStorage.removeItem('playerSettings');
    location.reload();
  });
  if(panel){
    panel.id="panel";
  }
// --- Toggle panel visibility ---
settingsBtn.addEventListener('click', function() {
  const isOpening = !panel.classList.contains('opening');
  if(isOpening) {
    // Opening state
    this.classList.remove('closing');
    this.classList.add('opening');
    panel.classList.remove('closing');
    panel.classList.add('opening');
    panel.style.display = 'block'; // Ensure panel is visible for transition
  } else {
    // Closing state
    this.classList.remove('opening');
    this.classList.add('closing');
    panel.classList.remove('opening');
    panel.classList.add('closing');
    
  }
});

  // --- Apply initial settings ---
  chkMaxFPS.dispatchEvent(new Event('change'));

  // --- Continuous enforcement every 10ms ---
  setInterval(() => {
    // Shake enforcement
    canShake = !settings.reduceShake;

    // Body background color enforcement
    setInterval(() => {
  if (settings.reduceColor) {
    document.body.style.backgroundColor = 'black';
  }
}, 10);

    // URL option enforcement
    const urlEl = document.getElementById('urlOption');
    if (urlEl) urlEl.style.display = settings.showURLOption ? 'block' : 'none';

    // Instructions enforcement
    document.querySelectorAll('.instructions').forEach(el => {
      el.style.display = settings.showInstructions ? 'block' : 'none';
    });
  }, 10);

} catch (e) {
  console.error('Settings panel error:', e);
}});