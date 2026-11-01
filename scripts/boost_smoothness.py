import re

# 1. UPDATE static/app.js
with open('static/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Add preferCanvas: true and updateWhenIdle: true to Leaflet map init
old_leaflet_init = """    this.map = L.map('map-container', {
      center: [28.6300, 77.2150],
      zoom: 11,
      zoomControl: true,
      attributionControl: true
    });"""

new_leaflet_init = """    this.map = L.map('map-container', {
      center: [28.6300, 77.2150],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      fadeAnimation: true,
      zoomAnimation: true
    });"""

app_js_norm = app_js.replace('\r\n', '\n')
old_leaflet_init_norm = old_leaflet_init.replace('\r\n', '\n')
new_leaflet_init_norm = new_leaflet_init.replace('\r\n', '\n')

if old_leaflet_init_norm in app_js_norm:
    app_js_norm = app_js_norm.replace(old_leaflet_init_norm, new_leaflet_init_norm, 1)
    print("Added preferCanvas: true and performance flags to Leaflet Map")
else:
    print("Warning: old_leaflet_init not matched")

# Optimize 2D rain overlay: batch strokes, eliminate per-frame gradient allocations, drop count to 140
old_rain_block = """    // Particle pool for realistic falling rain
    const maxDrops = 750;
    this.mapRainDrops = [];
    for (let i = 0; i < maxDrops; i++) {
      this.mapRainDrops.push({
        x: Math.random() * (canvas.width || 1400) + 100,
        y: Math.random() * (canvas.height || 900),
        l: Math.random() * 16 + 12,
        xs: -1.8 - Math.random() * 1.6, // Wind slant
        ys: 13 + Math.random() * 11,
        alpha: 0.35 + Math.random() * 0.55
      });
    }

    // Impact splash ripples pool
    this.rainRipples = [];

    const animate2DRain = () => {
      requestAnimationFrame(animate2DRain);
      if (this.activeView !== '2d' || !this.rainCtx) return;

      const ctx = this.rainCtx;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Real-Time Radar mode is dry across Delhi (0.0 mm/h) -> completely clear sky
      if (this.rainMode === 'radar' || this.currentRainfall <= 0) {
        this.rainRipples = [];
        return;
      }

      const intensity = Math.min(1.0, this.currentRainfall / 100.0);
      const isPaused = !this.simPlaying && this.simPaused;
      const speedMult = this.simPlaying ? 1.35 : 0.95;

      // Draw and advance surface splash ripples
      for (let r = this.rainRipples.length - 1; r >= 0; r--) {
        const rip = this.rainRipples[r];
        ctx.beginPath();
        ctx.ellipse(rip.x, rip.y, rip.rx, rip.ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${rip.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (!isPaused) {
          rip.rx += 1.2;
          rip.ry += 0.5;
          rip.opacity -= 0.055;
        }

        if (rip.opacity <= 0 || rip.rx > rip.maxR) {
          this.rainRipples.splice(r, 1);
        }
      }

      // Dynamic active drop count based on mm scenario (10mm: ~130 drops, 100mm: 750 drops)
      let activeCount = Math.floor(110 + intensity * 640);
      activeCount = Math.min(this.mapRainDrops.length, activeCount);

      // Render rain streaks with glowing tips
      for (let i = 0; i < activeCount; i++) {
        const p = this.mapRainDrops[i];

        const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.xs, p.y + p.l);
        grad.addColorStop(0, `rgba(186, 230, 253, ${p.alpha * 0.15})`);
        grad.addColorStop(1, `rgba(56, 189, 248, ${p.alpha * (0.45 + intensity * 0.5)})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.1 + intensity * 0.9;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.xs, p.y + p.l);
        ctx.stroke();

        if (!isPaused) {
          p.x += p.xs * speedMult;
          p.y += p.ys * speedMult;

          if (p.y > h || p.x < -20) {
            if (this.rainRipples.length < 45 && Math.random() < (0.15 + intensity * 0.35)) {
              this.rainRipples.push({
                x: p.x,
                y: Math.min(h - 5, p.y - Math.random() * 40),
                rx: 1.5,
                ry: 0.6,
                maxR: 9 + intensity * 7,
                opacity: 0.65 + intensity * 0.25
              });
            }

            p.x = Math.random() * (w + 120);
            p.y = -15 - Math.random() * 25;
          }
        }
      }
    };"""

new_rain_block = """    // Lightweight, Hardware-Accelerated Rain Particle Pool (Zero GC allocation)
    const maxDrops = 130;
    this.mapRainDrops = [];
    for (let i = 0; i < maxDrops; i++) {
      this.mapRainDrops.push({
        x: Math.random() * (canvas.width || 1400) + 100,
        y: Math.random() * (canvas.height || 900),
        l: Math.random() * 14 + 10,
        xs: -1.5 - Math.random() * 1.2,
        ys: 12 + Math.random() * 9
      });
    }

    this.rainRipples = [];

    const animate2DRain = () => {
      requestAnimationFrame(animate2DRain);
      if (this.activeView !== '2d' || !this.rainCtx) return;

      const ctx = this.rainCtx;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (this.rainMode === 'radar' || this.currentRainfall <= 0) {
        this.rainRipples = [];
        return;
      }

      const intensity = Math.min(1.0, this.currentRainfall / 100.0);
      const isPaused = !this.simPlaying && this.simPaused;
      const speedMult = this.simPlaying ? 1.35 : 0.95;

      // 1. Draw splash ripples with single stroke batch
      if (this.rainRipples.length > 0) {
        ctx.lineWidth = 1.0;
        for (let r = this.rainRipples.length - 1; r >= 0; r--) {
          const rip = this.rainRipples[r];
          ctx.beginPath();
          ctx.ellipse(rip.x, rip.y, rip.rx, rip.ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${rip.opacity})`;
          ctx.stroke();

          if (!isPaused) {
            rip.rx += 1.2;
            rip.ry += 0.5;
            rip.opacity -= 0.06;
          }
          if (rip.opacity <= 0 || rip.rx > rip.maxR) {
            this.rainRipples.splice(r, 1);
          }
        }
      }

      // 2. Batch ALL rain lines into ONE single draw call (Zero gradient allocation!)
      const activeCount = Math.min(this.mapRainDrops.length, Math.floor(40 + intensity * 90));
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();

      for (let i = 0; i < activeCount; i++) {
        const p = this.mapRainDrops[i];
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.xs, p.y + p.l);

        if (!isPaused) {
          p.x += p.xs * speedMult;
          p.y += p.ys * speedMult;

          if (p.y > h || p.x < -20) {
            if (this.rainRipples.length < 15 && Math.random() < 0.25) {
              this.rainRipples.push({
                x: p.x,
                y: Math.min(h - 5, p.y - Math.random() * 20),
                rx: 1.2,
                ry: 0.5,
                maxR: 8,
                opacity: 0.6
              });
            }
            p.x = Math.random() * (w + 80);
            p.y = -10 - Math.random() * 20;
          }
        }
      }
      ctx.stroke(); // Single GPU stroke for all drops!
    };"""

old_rain_block_norm = old_rain_block.replace('\r\n', '\n')
new_rain_block_norm = new_rain_block.replace('\r\n', '\n')

if old_rain_block_norm in app_js_norm:
    app_js_norm = app_js_norm.replace(old_rain_block_norm, new_rain_block_norm, 1)
    print("Optimized 2D rain canvas: batched single-call drawing, zero GC allocations")
else:
    print("Warning: old_rain_block not matched")

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js_norm)
print("Updated static/app.js successfully")

# 2. UPDATE static/three-view.js to pause ThreeEngine and HydroRadarEngine2D when hidden
with open('static/three-view.js', 'r', encoding='utf-8') as f:
    three_js = f.read()

three_js_norm = three_js.replace('\r\n', '\n')

old_three_anim = """  animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock ? this.clock.getDelta() : 0.016;
    const time = this.clock ? this.clock.getElapsedTime() : 0;"""

new_three_anim = """  animate() {
    // Only render when 3D container is active and visible
    const container = document.getElementById('three-container') || this.container;
    if (!container || container.offsetParent === null || container.classList.contains('hidden') || container.style.display === 'none') {
      this.animId = null;
      return;
    }

    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock ? this.clock.getDelta() : 0.016;
    const time = this.clock ? this.clock.getElapsedTime() : 0;"""

old_three_anim_norm = old_three_anim.replace('\r\n', '\n')
new_three_anim_norm = new_three_anim.replace('\r\n', '\n')

if old_three_anim_norm in three_js_norm:
    three_js_norm = three_js_norm.replace(old_three_anim_norm, new_three_anim_norm, 1)
    print("Added visibility guard to ThreeEngine.animate() loop")
else:
    print("Warning: old_three_anim not matched")

old_radar_anim = """  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    this.angle = (this.angle + 0.024) % (Math.PI * 2);
    this.render();
  },"""

new_radar_anim = """  animate() {
    // Only render when radar canvas is mounted and visible
    const canvas = document.getElementById('canvas-2d-hydro-radar') || this.canvas;
    if (!canvas || canvas.offsetParent === null) {
      this.animId = null;
      return;
    }
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    this.angle = (this.angle + 0.024) % (Math.PI * 2);
    this.render();
  },"""

old_radar_anim_norm = old_radar_anim.replace('\r\n', '\n')
new_radar_anim_norm = new_radar_anim.replace('\r\n', '\n')

if old_radar_anim_norm in three_js_norm:
    three_js_norm = three_js_norm.replace(old_radar_anim_norm, new_radar_anim_norm, 1)
    print("Added visibility guard to HydroRadarEngine2D.animate() loop")
else:
    print("Warning: old_radar_anim not matched")

with open('static/three-view.js', 'w', encoding='utf-8') as f:
    f.write(three_js_norm)
print("Updated static/three-view.js successfully")

# 3. UPDATE static/app.css for GPU hardware acceleration
with open('static/app.css', 'r', encoding='utf-8') as f:
    app_css = f.read()

gpu_css = """
/* ===================================================================
   GPU HARDWARE ACCELERATION & ULTRA-SMOOTH OPERABILITY
   =================================================================== */
#map-container,
.map-viewport-card,
.sidebar,
.bottom-analytics-row,
.ai-optimizer-card {
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.sim-slider-bar,
.sim-timeline-slider {
  touch-action: pan-y;
  cursor: grab;
}

.sim-slider-bar:active,
.sim-timeline-slider:active {
  cursor: grabbing;
}
"""

if "GPU HARDWARE ACCELERATION" not in app_css:
    with open('static/app.css', 'a', encoding='utf-8') as f:
        f.write(gpu_css)
    print("Added GPU hardware acceleration rules to static/app.css")

