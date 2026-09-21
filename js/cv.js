/**
 * On-device visible articulation coach.
 * MediaPipe Face Mesh runs in the browser. It measures only visible lip/face
 * evidence; it never claims to infer hidden tongue positions.
 */
const MouthTracker = {
  video: null, canvas: null, ctx: null, stream: null, faceMesh: null,
  animationId: null, isTracking: false, latestMetrics: null,

  async startCamera(videoElement, canvasElement, category) {
    this.stopCamera();
    this.latestMetrics = null;
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.category = category;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.video.style.display = 'block';
      this.resizeCanvas();
      window.addEventListener('resize', this.resizeCanvasBound = () => this.resizeCanvas());
      this.isTracking = true;
      if (window.FaceMesh) this.setupFaceMesh();
      else this.drawStatus('Camera active — visual landmarks unavailable offline');
      return true;
    } catch (error) {
      console.warn('Camera access failed', error);
      this.stopCamera();
      return false;
    }
  },

  setupFaceMesh() {
    this.faceMesh = new FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    this.faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    this.faceMesh.onResults(results => this.onResults(results));
    const process = async () => {
      if (!this.isTracking) return;
      if (this.video.readyState >= 2) await this.faceMesh.send({ image: this.video });
      this.animationId = requestAnimationFrame(process);
    };
    process();
  },

  onResults(results) {
    this.resizeCanvas();
    const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!landmarks) {
      this.latestMetrics = { confidence: 'limited', opening: 'Not assessed', rounding: 'Not assessed', tip: 'Keep your full face in the guide so visible-mouth coaching can start.' };
      this.drawStatus('Face not found — move into the guide');
      return;
    }
    const metrics = this.measureLandmarks(landmarks);
    this.latestMetrics = metrics;
    this.drawLips(landmarks, metrics);
  },

  measureLandmarks(points) {
    const p = index => points[index];
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // Face Mesh outer mouth corners 61/291; upper/lower inner lip 13/14.
    const width = distance(p(61), p(291));
    const opening = distance(p(13), p(14));
    const ratio = width ? opening / width : 0;
    const centered = p(1).x > 0.18 && p(1).x < 0.82 && p(1).y > 0.12 && p(1).y < 0.72;
    const expectedWide = this.category === 'vowels';
    const expectedRound = this.category === 'v-w';
    const openingLabel = ratio > 0.23 ? 'Open' : ratio > 0.12 ? 'Moderate' : 'Narrow';
    const roundingLabel = width < 0.17 ? 'Rounded' : 'Relaxed';
    let tip = 'Keep your face still and copy the reference mouth movement.';
    if (!centered) tip = 'Move closer and centre your face for a reliable visible-mouth check.';
    else if (expectedWide && ratio < 0.16) tip = 'For this vowel drill, open your jaw a little wider than your normal speaking shape.';
    else if (expectedRound && width > 0.22) tip = 'For this lip-shape drill, bring your lip corners inward before you speak.';
    else if (String(this.category).startsWith('th-')) tip = 'For TH, use the close-up guide; the camera can only confirm visible mouth framing, not hidden tongue position.';
    return { confidence: centered ? 'good' : 'limited', opening: openingLabel, rounding: roundingLabel, tip, ratio: Number(ratio.toFixed(3)) };
  },

  drawLips(points, metrics) {
    const w = this.canvas.width, h = this.canvas.height;
    const map = point => ({ x: (1 - point.x) * w, y: point.y * h });
    const outer = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146].map(index => map(points[index]));
    const inner = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95].map(index => map(points[index]));
    const drawPath = (path, color, lineWidth) => {
      this.ctx.beginPath(); path.forEach((point, index) => index ? this.ctx.lineTo(point.x, point.y) : this.ctx.moveTo(point.x, point.y)); this.ctx.closePath();
      this.ctx.strokeStyle = color; this.ctx.lineWidth = lineWidth; this.ctx.stroke();
    };
    drawPath(outer, metrics.confidence === 'good' ? '#a78bfa' : '#fbbf24', 2.4);
    drawPath(inner, '#34d399', 1.5);
    this.ctx.fillStyle = 'rgba(0,0,0,.62)'; this.ctx.fillRect(10, 10, 152, 27);
    this.ctx.fillStyle = '#fff'; this.ctx.font = "600 10px Inter, sans-serif";
    this.ctx.fillText(`VISIBLE MOUTH: ${metrics.confidence.toUpperCase()}`, 17, 28);
  },

  drawStatus(message) {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = 'rgba(0,0,0,.55)'; this.ctx.fillRect(10, 10, Math.min(this.canvas.width - 20, 250), 30);
    this.ctx.fillStyle = '#fff'; this.ctx.font = "600 10px Inter, sans-serif"; this.ctx.fillText(message, 17, 29);
  },

  resizeCanvas() {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (this.canvas.width !== Math.round(rect.width) || this.canvas.height !== Math.round(rect.height)) {
      this.canvas.width = Math.round(rect.width); this.canvas.height = Math.round(rect.height);
    }
  },

  getLatestMetrics() {
    return this.latestMetrics || { confidence: 'not assessed', opening: 'Not assessed', rounding: 'Not assessed', tip: 'Camera evidence was not available for this attempt.' };
  },

  captureFrame() {
    if (!this.video || this.video.readyState < 2 || !this.latestMetrics || this.latestMetrics.confidence !== 'good') return '';
    const sourceWidth = this.video.videoWidth || 0;
    const sourceHeight = this.video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return '';
    const targetWidth = Math.min(420, sourceWidth);
    const targetHeight = Math.round((targetWidth / sourceWidth) * sourceHeight);
    const snapshot = document.createElement('canvas');
    snapshot.width = targetWidth;
    snapshot.height = targetHeight;
    snapshot.getContext('2d').drawImage(this.video, 0, 0, targetWidth, targetHeight);
    return snapshot.toDataURL('image/jpeg', 0.62);
  },

  stopCamera() {
    this.isTracking = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (this.resizeCanvasBound) window.removeEventListener('resize', this.resizeCanvasBound);
    this.resizeCanvasBound = null;
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
