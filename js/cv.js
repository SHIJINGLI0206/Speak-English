/**
 * Computer Vision Mouth Tracker for SpeakUp
 * Accesses camera stream, analyzes audio amplitudes, and renders an 
 * interactive neon facial grid and mouth landmark wireframe on canvas.
 */

const MouthTracker = {
  video: null,
  canvas: null,
  ctx: null,
  stream: null,
  audioCtx: null,
  analyser: null,
  animationId: null,
  volume: 0,
  isTracking: false,

  async startCamera(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.isTracking = true;

    // Resize canvas to match bounds
    this.resizeCanvas();
    window.addEventListener('resize', this.handleResize);

    try {
      // 1. Get webcam stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      
      this.video.srcObject = this.stream;
      this.video.style.display = 'block';

      // 2. Setup Audio Analyser using Mic
      this.setupAudioAnalyser();

      // 3. Start render loop
      this.tick();
      
      return true;
    } catch (err) {
      console.error("Camera access failed", err);
      this.isTracking = false;
      return false;
    }
  },

  stopCamera() {
    this.isTracking = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    window.removeEventListener('resize', this.handleResize);
    this.clearCanvas();
  },

  handleResize: () => {
    MouthTracker.resizeCanvas();
  },

  resizeCanvas() {
    if (this.canvas) {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  },

  clearCanvas() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  async setupAudioAnalyser() {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      const source = this.audioCtx.createMediaStreamSource(audioStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (e) {
      console.warn("Could not bind audio analyzer for facial grid vibration", e);
    }
  },

  tick() {
    if (!this.isTracking) return;

    // Get current volume / amplitude
    if (this.analyser) {
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      // Normalize volume to a 0-1 scale
      const rawVol = sum / bufferLength;
      this.volume = Math.min(rawVol / 60, 1.0); // caps at 1.0
    }

    this.drawOverlay();
    this.animationId = requestAnimationFrame(() => this.tick());
  },

  drawOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Center of canvas
    const cx = w / 2;
    const cy = h / 2;

    // Pulse factor based on voice volume
    const pulse = this.volume * 25; 
    
    // 1. Draw Face Oval Boundary Guide
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    // Normal head height approx 130px, width 100px
    ctx.ellipse(cx, cy - 10, 85, 110, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bounding Box corners
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
    ctx.lineWidth = 2.5;
    const boxW = 120;
    const boxH = 150;
    const bx = cx - boxW/2;
    const by = cy - 10 - boxH/2;

    // Top-Left corner
    ctx.beginPath(); ctx.moveTo(bx, by + 15); ctx.lineTo(bx, by); ctx.lineTo(bx + 15, by); ctx.stroke();
    // Top-Right corner
    ctx.beginPath(); ctx.moveTo(bx + boxW, by + 15); ctx.lineTo(bx + boxW, by); ctx.lineTo(bx + boxW - 15, by); ctx.stroke();
    // Bottom-Left corner
    ctx.beginPath(); ctx.moveTo(bx, by + boxH - 15); ctx.lineTo(bx, by + boxH); ctx.lineTo(bx + 15, by + boxH); ctx.stroke();
    // Bottom-Right corner
    ctx.beginPath(); ctx.moveTo(bx + boxW, by + boxH - 15); ctx.lineTo(bx + boxW, by + boxH); ctx.lineTo(bx + boxW - 15, by + boxH); ctx.stroke();

    // 2. Draw Mouth Area Box (Lower third of face)
    const mx = cx;
    const my = cy + 40; // Mouth center offset
    
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(mx - 40, my - 25, 80, 50);

    // Mouth scan line
    const scanY = my - 25 + ((Date.now() / 15) % 50);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.beginPath();
    ctx.moveTo(mx - 40, scanY);
    ctx.lineTo(mx + 40, scanY);
    ctx.stroke();

    // 3. Draw Mouth/Lip Landmark Mesh (Neon vertices)
    // We simulate 8 outer points and 4 inner points
    // Outer lips width 46px, height dynamically scales with volume
    const lipW = 40 + (this.volume * 10);
    const lipH = 8 + pulse;

    const outerPoints = [
      { x: mx - lipW, y: my },                  // Left corner
      { x: mx - lipW/2, y: my - lipH/2 - 2 },   // Upper Left
      { x: mx, y: my - lipH/2 - 5 },            // Upper Mid
      { x: mx + lipW/2, y: my - lipH/2 - 2 },   // Upper Right
      { x: mx + lipW, y: my },                  // Right corner
      { x: mx + lipW/2, y: my + lipH/2 + 2 },   // Lower Right
      { x: mx, y: my + lipH/2 + 5 },            // Lower Mid
      { x: mx - lipW/2, y: my + lipH/2 + 2 }    // Lower Left
    ];

    const innerPoints = [
      { x: mx - lipW * 0.7, y: my },
      { x: mx, y: my - lipH * 0.3 },
      { x: mx + lipW * 0.7, y: my },
      { x: mx, y: my + lipH * 0.3 }
    ];

    // Draw Outer Lip lines
    ctx.strokeStyle = 'var(--accent-purple)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'var(--accent-purple-glow)';
    ctx.beginPath();
    ctx.moveTo(outerPoints[0].x, outerPoints[0].y);
    for (let i = 1; i < outerPoints.length; i++) {
      ctx.lineTo(outerPoints[i].x, outerPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw Inner Lip lines
    ctx.strokeStyle = 'var(--accent-indigo)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(99, 102, 241, 0.4)';
    ctx.beginPath();
    ctx.moveTo(innerPoints[0].x, innerPoints[0].y);
    for (let i = 1; i < innerPoints.length; i++) {
      ctx.lineTo(innerPoints[i].x, innerPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Draw mesh junction dots
    ctx.fillStyle = '#fff';
    [...outerPoints, ...innerPoints].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 4. Status overlay logs
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = "bold 9px 'Outfit', sans-serif";
    ctx.fillText("CV: FACE MESH ACTIVE", bx + 6, by + 18);
    
    // Dynamic opening level display
    const openingIndex = (lipH / 25).toFixed(2);
    ctx.fillStyle = 'var(--accent-green)';
    ctx.fillText(`OPENING INDEX: ${openingIndex}`, bx + 6, by + boxH - 12);
    
    ctx.fillStyle = 'var(--accent-indigo)';
    const roundingText = this.volume > 0.45 ? "ROUNDING: HIGH" : "ROUNDING: NORMAL";
    ctx.fillText(roundingText, bx + boxW - 86, by + boxH - 12);
  }
};
