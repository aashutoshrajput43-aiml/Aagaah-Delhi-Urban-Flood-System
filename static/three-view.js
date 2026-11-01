/**
 * Delhi Urban Flood Nowcasting System - 3D Terrain & Hydro Engine
 * High-fidelity Three.js visualizations matching SIH 2026 AquaPredict Demo
 * Includes:
 * 1. 3D Elevation with Billboard Landmark Labels, Colormap DEM, and Raycast Inspector
 * 2. 3D Flood Simulation with Dynamic Water Surface, Vertex Waves, Rising Inundation Plane
 * 3. Falling Rain Droplet Particle System (speeds, counts, and density scaling with scenario)
 * 4. In-Terrain Gravity Flow Runoff Particles (water shifting downslope from Ridge to Yamuna)
 * 5. Drainage Network Surcharge Tubes with Dynamic Red/Green Shift & Pulsing Emissive Glow
 * 6. Concentric Pulsing Warning Rings on Flooded Underpass Hotspots
 * 7. Interactive 3D Terrain & Hydro Inspector HUD
 */

const ThreeEngine = {
  // Elevation View References
  elevScene: null,
  elevCamera: null,
  elevRenderer: null,
  elevControls: null,
  elevMesh: null,
  elevLandmarkGroup: null,

  // Flood Simulation View References
  floodScene: null,
  floodCamera: null,
  floodRenderer: null,
  floodControls: null,
  floodMesh: null,
  floodWaterMesh: null,
  floodWaterGeom: null,
  floodWaterPositionsOrig: null,
  floodTubes: [],
  stars: null,

  // Particle Systems
  rainSystem: null,
  rainPositions: null,
  rainVelocities: null,
  rainCount: 3500,

  flowSystem: null,
  flowPositions: null,
  flowVelocities: null,
  flowCount: 1600,

  hotspotRings: [],

  // Simulation & Hydraulic State
  currentRainfall: 10,
  currentHorizon: 60,
  isSimPlaying: false,
  baseTargetWaterY: 5.2,
  currentWaterY: 5.2,
  clock: null,
  animId: null,

  init() {
    this.clock = new THREE.Clock();
    this.initElevationView();
    this.initFloodView();
    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  },

  // ==========================================
  // SHARED TOPOGRAPHY MATH
  // ==========================================
  sampleTerrainElevation(x, z) {
    // Delhi NCT Topography:
    // High Ridge in South-West (x ~ -55, z ~ 25) reaching ~310m MSL
    // Sloping gently eastward down to Yamuna trench (x ~ 38) at ~195m MSL
    const distToRidge = Math.hypot(x + 55, z - 25);
    const distToYamuna = Math.abs(x - (38 + Math.sin(z * 0.06) * 12));

    let height = 0;
    // Ridge Highland Peak (Aravalli spur)
    height += Math.max(0, 36 * Math.exp(-Math.pow(distToRidge / 45, 2)));
    // Eastward regional descent
    height += (26 - x * 0.28);
    // Yamuna river cut / incision
    height -= Math.max(0, 9 * Math.exp(-Math.pow(distToYamuna / 10, 2)));
    // Urban micro-undulation & underpass depressions
    height += Math.sin(x * 0.12) * Math.cos(z * 0.12) * 2.2;

    return height;
  },

  sampleTerrainGradient(x, z) {
    const eps = 0.8;
    const h1 = this.sampleTerrainElevation(x + eps, z);
    const h0 = this.sampleTerrainElevation(x - eps, z);
    const h3 = this.sampleTerrainElevation(x, z + eps);
    const h2 = this.sampleTerrainElevation(x, z - eps);

    const dhdx = (h1 - h0) / (2 * eps);
    const dhdz = (h3 - h2) / (2 * eps);
    return { dhdx, dhdz };
  },

  // ==========================================
  // 1. 3D ELEVATION VIEW
  // ==========================================
  initElevationView() {
    const container = document.getElementById('canvas-3d-elevation-target');
    if (!container) return;

    const width = container.clientWidth || (window.innerWidth - 580);
    const height = container.clientHeight || (window.innerHeight - 90);

    this.elevScene = new THREE.Scene();
    this.elevScene.background = new THREE.Color(0x060b13);
    this.elevScene.fog = new THREE.FogExp2(0x060b13, 0.002);

    this.elevCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    this.elevCamera.position.set(75, 150, 140);
    this.elevCamera.lookAt(-10, 14, -5);

    this.elevRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.elevRenderer.setSize(width, height);
    this.elevRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.elevRenderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(this.elevRenderer.domElement);

    if (window.THREE.OrbitControls) {
      this.elevControls = new THREE.OrbitControls(this.elevCamera, this.elevRenderer.domElement);
      this.elevControls.enableDamping = true;
      this.elevControls.dampingFactor = 0.06;
      this.elevControls.target.set(-10, 14, -5);
      this.elevControls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.elevControls.minDistance = 40;
      this.elevControls.maxDistance = 500;
      this.elevControls.update();
    }

    // Illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.elevScene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(120, 220, 100);
    this.elevScene.add(dirLight);

    const cyanLight = new THREE.PointLight(0x00e5ff, 0.4, 300);
    cyanLight.position.set(-50, 100, 50);
    this.elevScene.add(cyanLight);

    // Build DEM Colored Terrain
    this.buildElevationTerrain();

    // Landmark 3D Billboard Cards
    this.add3DLandmarkBillboards();

    // Raycast Inspector
    this.initElevationRaycaster();
  },

  buildElevationTerrain() {
    const gridX = 140;
    const gridZ = 140;
    const size = 210;

    const geometry = new THREE.PlaneGeometry(size, size, gridX, gridZ);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const count = pos.count;
    const colors = [];

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const height = this.sampleTerrainElevation(x, z);
      pos.setY(i, height);

      // Vertex color according to elevation matching video demo:
      // Low (Yamuna) = Deep Blue/Purple -> Mid = Green -> High = Yellow -> Ridge Peak = Red/White
      const norm = Math.min(1.0, Math.max(0.0, (height + 6) / 44.0));
      let r, g, b;

      if (norm < 0.22) {
        // Deep purple to royal blue (<205m)
        r = 0.25; g = 0.12; b = 0.85;
      } else if (norm < 0.40) {
        // Cyan / Blue transition (205-212m)
        r = 0.05; g = 0.65; b = 0.95;
      } else if (norm < 0.65) {
        // Vibrant Emerald Green (212-230m)
        r = 0.10; g = 0.80; b = 0.25;
      } else if (norm < 0.85) {
        // Golden Yellow (230-265m)
        r = 0.92; g = 0.75; b = 0.08;
      } else {
        // Ruby Red Ridge Peak (>265m)
        r = 0.95; g = 0.15; b = 0.15;
      }

      colors.push(r, g, b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      wireframe: false
    });

    this.elevMesh = new THREE.Mesh(geometry, material);
    this.elevMesh.receiveShadow = true;
    this.elevScene.add(this.elevMesh);

    // Subtle GIS contour wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    });
    const wireMesh = new THREE.Mesh(geometry, wireMat);
    wireMesh.position.y += 0.08;
    this.elevScene.add(wireMesh);
  },

  add3DLandmarkBillboards() {
    this.elevLandmarkGroup = new THREE.Group();

    const landmarks = [
      { name: "Central Ridge (245m)", x: -45, z: 20, y: 32, borderColor: '#fbbf24', textColor: '#fef08a' },
      { name: "Connaught Place (215m)", x: 0, z: 0, y: 16, borderColor: '#475569', textColor: '#ffffff' },
      { name: "Minto Bridge (208m)", x: 8, z: -8, y: 13, borderColor: '#475569', textColor: '#ffffff' },
      { name: "ITO Ring Rd (205m)", x: 26, z: -4, y: 9, borderColor: '#ef4444', textColor: '#fca5a5' },
      { name: "Yamuna Floodplain (181m)", x: 44, z: 12, y: 4, borderColor: '#00e5ff', textColor: '#a5f3fc' }
    ];

    landmarks.forEach(lm => {
      // 1. Vertical connector stem
      const stemGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lm.x, lm.y, lm.z),
        new THREE.Vector3(lm.x, lm.y + 12, lm.z)
      ]);
      const stemMat = new THREE.LineBasicMaterial({ color: new THREE.Color(lm.borderColor), transparent: true, opacity: 0.85 });
      const stem = new THREE.Line(stemGeom, stemMat);
      this.elevLandmarkGroup.add(stem);

      // 2. Base pin sphere
      const sphereGeom = new THREE.SphereGeometry(1.2, 12, 12);
      const sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(lm.borderColor) });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.position.set(lm.x, lm.y, lm.z);
      this.elevLandmarkGroup.add(sphere);

      // 3. Billboard Card Sprite
      const sprite = this.createBillboardSprite(lm.name, lm.borderColor, lm.textColor);
      sprite.position.set(lm.x, lm.y + 16, lm.z);
      this.elevLandmarkGroup.add(sprite);
    });

    this.elevScene.add(this.elevLandmarkGroup);
  },

  createBillboardSprite(text, borderColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    const x = 8, y = 8, w = 496, h = 104, r = 16;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(8, 14, 24, 0.94)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    ctx.font = 'bold 36px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(text, 256, 60);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(34, 8, 1);
    return sprite;
  },

  initElevationRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.elevRenderer.domElement.addEventListener('mousemove', (event) => {
      const rect = this.elevRenderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.elevCamera);
      const intersects = raycaster.intersectObject(this.elevMesh);

      if (intersects.length > 0) {
        const p = intersects[0].point;
        const normElev = Math.max(0, Math.min(1, (p.y + 6) / 44.0));
        const elevM = (195.0 + normElev * 115.0).toFixed(1);
        const slopeDeg = (0.6 + (1.0 - normElev) * 3.8).toFixed(1);

        const elevEl = document.getElementById('hud-elev-val');
        const slopeEl = document.getElementById('hud-slope-val');
        const waterEl = document.getElementById('hud-water-val');

        if (elevEl) elevEl.textContent = `${elevM} m`;
        if (slopeEl) slopeEl.textContent = `${slopeDeg}°`;
        if (waterEl) waterEl.textContent = normElev < 0.22 ? '0.24 m' : '0.00 m (Dry)';
      }
    });
  },

  // ==========================================
  // 2. 3D FLOOD SIMULATION VIEW
  // ==========================================
  initFloodView() {
    const container = document.getElementById('canvas-3d-flood-target');
    if (!container) return;

    const width = container.clientWidth || 880;
    const height = container.clientHeight || 560;

    this.floodScene = new THREE.Scene();
    this.floodScene.background = new THREE.Color(0x07111e); // Atmospheric deep navy
    this.floodScene.fog = new THREE.FogExp2(0x07111e, 0.001);

    this.floodCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    this.floodCamera.position.set(75, 140, 135);
    this.floodCamera.lookAt(-10, 14, -5);

    this.floodRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.floodRenderer.setSize(width, height);
    this.floodRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.floodRenderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(this.floodRenderer.domElement);

    if (window.THREE && window.THREE.OrbitControls) {
      this.floodControls = new THREE.OrbitControls(this.floodCamera, this.floodRenderer.domElement);
      this.floodControls.enableDamping = true;
      this.floodControls.dampingFactor = 0.06;
      this.floodControls.target.set(-10, 14, -5);
      this.floodControls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.floodControls.minDistance = 35;
      this.floodControls.maxDistance = 500;
      this.floodControls.update();
    }

    // High-visibility lighting
    const ambient = new THREE.AmbientLight(0xffffff, 1.25);
    this.floodScene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfff6ea, 1.5);
    sunLight.position.set(100, 220, 90);
    sunLight.castShadow = true;
    this.floodScene.add(sunLight);

    const cyanFill = new THREE.DirectionalLight(0x38bdf8, 0.95);
    cyanFill.position.set(-80, 130, -50);
    this.floodScene.add(cyanFill);

    // 1. Starfield Particle Sky
    this.buildStarfieldSky();

    // 2. High-Fidelity Colored Topographic Terrain Mesh
    this.buildFloodTerrain();

    // 3. Dynamic Rising Cyan Water Surface Mesh
    this.buildWaterSurface();

    // 4. Falling Rain Droplet Particle System
    this.buildRainParticleSystem();

    // 5. In-Terrain Gravity Flow Particles
    this.buildRunoffFlowParticles();

    // 6. Drainage Network Surcharge Tubes
    this.buildFloodDrainTubes();

    // 7. Concentric Warning Rings at Sinks
    this.buildHotspotWarningRings();

    // 8. 3D Landmark Billboards
    this.addFloodLandmarkBillboards();

    // 9. Raycast Inspector for Flood View
    this.initFloodRaycaster();

    // Initial state setup
    this.baseTargetWaterY = 24.5;
    this.currentWaterY = 24.5;
  },

  buildStarfieldSky() {
    const starCount = 600;
    const geom = new THREE.BufferGeometry();
    const positions = [];

    for (let i = 0; i < starCount; i++) {
      const x = (Math.random() - 0.5) * 800;
      const y = Math.random() * 300 + 40;
      const z = (Math.random() - 0.5) * 800;
      positions.push(x, y, z);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 1.5, transparent: true, opacity: 0.6 });
    this.stars = new THREE.Points(geom, mat);
    this.floodScene.add(this.stars);
  },

  buildFloodTerrain() {
    const gridX = 140;
    const gridZ = 140;
    const size = 210;
    const geometry = new THREE.PlaneGeometry(size, size, gridX, gridZ);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const count = pos.count;
    const colors = [];

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const height = this.sampleTerrainElevation(x, z);
      pos.setY(i, height);

      // Smooth topographic colormap
      const hNorm = Math.max(0, Math.min(1, (height - 6) / 46.0));
      let r, g, b;
      if (hNorm < 0.20) {
        // Deep River Channel / Trench (<15m MSL)
        const t = hNorm / 0.20;
        r = 0.06 + t * 0.04;
        g = 0.22 + t * 0.22;
        b = 0.55 + t * 0.20;
      } else if (hNorm < 0.45) {
        // Lowland Flood Margin (15m - 26m)
        const t = (hNorm - 0.20) / 0.25;
        r = 0.10 + t * 0.10;
        g = 0.44 + t * 0.32;
        b = 0.75 - t * 0.40;
      } else if (hNorm < 0.75) {
        // Urban Plains (26m - 40m)
        const t = (hNorm - 0.45) / 0.30;
        r = 0.20 + t * 0.55;
        g = 0.76 - t * 0.10;
        b = 0.35 - t * 0.20;
      } else {
        // High Aravalli Ridge (>40m)
        const t = (hNorm - 0.75) / 0.25;
        r = 0.75 + t * 0.20;
        g = 0.66 - t * 0.35;
        b = 0.15 - t * 0.05;
      }
      colors.push(r, g, b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      wireframe: false
    });

    this.floodMesh = new THREE.Mesh(geometry, mat);
    this.floodMesh.receiveShadow = true;
    this.floodScene.add(this.floodMesh);

    // Glowing topographic wireframe contours
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    const wireMesh = new THREE.Mesh(geometry, wireMat);
    wireMesh.position.y += 0.08;
    this.floodScene.add(wireMesh);
  },

  buildWaterSurface() {
    const size = 210;
    const segs = 90;
    this.floodWaterGeom = new THREE.PlaneGeometry(size, size, segs, segs);
    this.floodWaterGeom.rotateX(-Math.PI / 2);

    const pos = this.floodWaterGeom.attributes.position;
    this.floodWaterPositionsOrig = new Float32Array(pos.array);

    // Translucent electric cyan/aquamarine water with reflections
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.78,
      roughness: 0.05,
      metalness: 0.82,
      side: THREE.DoubleSide
    });

    this.floodWaterMesh = new THREE.Mesh(this.floodWaterGeom, waterMat);
    this.baseTargetWaterY = 24.5; // Baseline visible water height
    this.currentWaterY = 24.5;
    this.floodWaterMesh.position.y = this.currentWaterY;
    this.floodScene.add(this.floodWaterMesh);
  },

  addFloodLandmarkBillboards() {
    const group = new THREE.Group();
    const landmarks = [
      { name: "Central Ridge (245m)", x: -45, z: 20, y: 32, borderColor: '#fbbf24', textColor: '#fef08a' },
      { name: "Connaught Place (215m)", x: 0, z: 0, y: 16, borderColor: '#38bdf8', textColor: '#ffffff' },
      { name: "Minto Bridge Underpass (208m)", x: 8, z: -8, y: 13, borderColor: '#ef4444', textColor: '#fca5a5' },
      { name: "ITO Ring Road (205m)", x: 26, z: -4, y: 9, borderColor: '#ef4444', textColor: '#fca5a5' },
      { name: "Yamuna River (195m)", x: 44, z: 12, y: 4, borderColor: '#00e5ff', textColor: '#a5f3fc' }
    ];

    landmarks.forEach(lm => {
      const stemGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lm.x, lm.y, lm.z),
        new THREE.Vector3(lm.x, lm.y + 12, lm.z)
      ]);
      const stemMat = new THREE.LineBasicMaterial({ color: new THREE.Color(lm.borderColor), transparent: true, opacity: 0.85 });
      const stem = new THREE.Line(stemGeom, stemMat);
      group.add(stem);

      const sphereGeom = new THREE.SphereGeometry(1.2, 12, 12);
      const sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(lm.borderColor) });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.position.set(lm.x, lm.y, lm.z);
      group.add(sphere);

      const sprite = this.createBillboardSprite(lm.name, lm.borderColor, lm.textColor);
      sprite.position.set(lm.x, lm.y + 16, lm.z);
      group.add(sprite);
    });

    this.floodScene.add(group);
  },

  // 4. Falling Rain Droplet Particles
  buildRainParticleSystem() {
    const count = this.rainCount;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 220;
      positions[i * 3 + 1] = Math.random() * 160 + 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 220;

      velocities[i * 3 + 0] = -0.4; // Wind drift westward
      velocities[i * 3 + 1] = -(2.5 + Math.random() * 2.5); // Downward fall
      velocities[i * 3 + 2] = 0.15;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainPositions = positions;
    this.rainVelocities = velocities;

    // Create a circular glowing raindrop texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(16, 0, 16, 64);
    grad.addColorStop(0, 'rgba(180, 230, 255, 0.9)');
    grad.addColorStop(0.8, 'rgba(100, 200, 255, 0.4)');
    grad.addColorStop(1, 'rgba(50, 150, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(16, 32, 6, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 2.2,
      map: texture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.rainSystem = new THREE.Points(geom, mat);
    this.floodScene.add(this.rainSystem);
  },

  // 5. In-Terrain Gravity Flow Particles (Runoff Shifting Downhill to Yamuna)
  buildRunoffFlowParticles() {
    const count = this.flowCount;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.resetFlowParticle(i, positions, velocities, true);
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.flowPositions = positions;
    this.flowVelocities = velocities;

    const mat = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 2.0,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.flowSystem = new THREE.Points(geom, mat);
    this.floodScene.add(this.flowSystem);
  },

  resetFlowParticle(i, positions, velocities, initial = false) {
    // Spawn particles on the upper slopes (Delhi Ridge in West/South)
    const x = -70 + Math.random() * 55; // [-70, -15]
    const z = -45 + Math.random() * 90; // [-45, 45]
    const y = this.sampleTerrainElevation(x, z) + 0.35;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Initial velocity downhill along negative gradient
    const grad = this.sampleTerrainGradient(x, z);
    const speed = 0.5 + Math.random() * 0.4;
    velocities[i * 3 + 0] = -grad.dhdx * speed * 0.4 + 0.35; // Net eastward flow to Yamuna
    velocities[i * 3 + 1] = 0;
    velocities[i * 3 + 2] = -grad.dhdz * speed * 0.4;
  },

  // 6. Drainage Network Tubes
  buildFloodDrainTubes() {
    const drainCurves = [
      // 1. Najafgarh Trunk Drain (West to Yamuna Outfall)
      [
        new THREE.Vector3(-75, 24, 50),
        new THREE.Vector3(-35, 18, 25),
        new THREE.Vector3(5, 15, -5),
        new THREE.Vector3(36, 6, -15)
      ],
      // 2. Barapullah Trunk Drain (Central-South to Yamuna)
      [
        new THREE.Vector3(-20, 16, -30),
        new THREE.Vector3(10, 12, -20),
        new THREE.Vector3(38, 5, -8)
      ],
      // 3. Shahdara Link Drain (Trans-Yamuna)
      [
        new THREE.Vector3(55, 6, -40),
        new THREE.Vector3(45, 5, 0),
        new THREE.Vector3(40, 4, 35)
      ]
    ];

    drainCurves.forEach(pts => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeom = new THREE.TubeGeometry(curve, 64, 1.4, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(tubeGeom, tubeMat);
      mesh.position.y += 0.8;
      this.floodScene.add(mesh);
      this.floodTubes.push(mesh);
    });
  },

  // 7. Hotspot Warning Rings
  buildHotspotWarningRings() {
    const sinks = [
      { name: "Minto Bridge", x: 8, z: -8, y: 10.2 },
      { name: "Kashmere Gate ISBT", x: 12, z: -30, y: 8.5 },
      { name: "ITO Ring Road", x: 26, z: -4, y: 7.8 }
    ];

    sinks.forEach(sink => {
      const ringGeom = new THREE.RingGeometry(1.5, 3.2, 32);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.set(sink.x, sink.y, sink.z);
      this.floodScene.add(ring);
      this.hotspotRings.push({ mesh: ring, baseY: sink.y, progress: Math.random() });
    });
  },

  initFloodRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.floodRenderer.domElement.addEventListener('mousemove', (event) => {
      const rect = this.floodRenderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.floodCamera);
      const intersects = raycaster.intersectObject(this.floodMesh);

      if (intersects.length > 0) {
        const p = intersects[0].point;
        const normElev = Math.max(0, Math.min(1, (p.y + 6) / 44.0));
        const elevM = (195.0 + normElev * 115.0).toFixed(1);
        const slopeDeg = (0.6 + (1.0 - normElev) * 3.8).toFixed(1);

        const waterDepthM = Math.max(0, (this.currentWaterY - p.y) * 0.08).toFixed(2);

        // Update flood inspector if elements exist
        const elevEl = document.getElementById('hud-elev-val') || document.getElementById('hud-flood-elev');
        const waterEl = document.getElementById('hud-water-val') || document.getElementById('hud-flood-water');
        const slopeEl = document.getElementById('hud-slope-val') || document.getElementById('hud-flood-slope');

        if (elevEl) elevEl.textContent = `${elevM} m`;
        if (slopeEl) slopeEl.textContent = `${slopeDeg}°`;
        if (waterEl) {
          waterEl.textContent = parseFloat(waterDepthM) > 0.01 ? `${waterDepthM} m` : '0.00 m (Dry)';
        }
      }
    });
  },

  // ==========================================
  // SIMULATION & HYDRAULIC CONTROL
  // ==========================================
  setSimulationState(rainfall_mm, horizon_min, isPlaying) {
    this.currentRainfall = rainfall_mm;
    this.currentHorizon = horizon_min;
    this.isSimPlaying = isPlaying;

    // Storm hydrograph modulation:
    // Peak at 60 minutes
    const stormPeakMin = 60;
    const stormSigma = 55;
    const hydroFactor = Math.exp(-Math.pow((horizon_min - stormPeakMin) / stormSigma, 2));

    // Water level calibration:
    // At 10mm (Normal): Water at 16.5m (Yamuna active river channel)
    // At 50mm (Storm): Water rises to 25.5m (Inundates floodplains & Minto depression)
    // At 100mm (Cloudburst): Water rises to 33.5m (Massive urban lowland inundation)
    let peakWaterLevel = 16.5;
    let targetColor = 0x00e5ff;
    let targetOpacity = 0.72;

    if (rainfall_mm >= 100) {
      peakWaterLevel = 33.5;
      targetColor = 0xdc2626; // Critical Ruby Red
      targetOpacity = 0.85;
    } else if (rainfall_mm >= 75) {
      peakWaterLevel = 29.0;
      targetColor = 0xea580c; // Severe Amber Orange
      targetOpacity = 0.80;
    } else if (rainfall_mm >= 50) {
      peakWaterLevel = 25.5;
      targetColor = 0x0284c7; // Deep Storm Blue
      targetOpacity = 0.75;
    } else if (rainfall_mm >= 25) {
      peakWaterLevel = 21.0;
      targetColor = 0x00bcd4;
      targetOpacity = 0.70;
    }

    // Smooth wave modulation with hydroFactor
    this.baseTargetWaterY = 14.0 + (peakWaterLevel - 14.0) * (0.35 + 0.65 * hydroFactor);

    if (this.floodWaterMesh) {
      this.floodWaterMesh.material.color.setHex(targetColor);
      this.floodWaterMesh.material.opacity = targetOpacity;
    }

    // Update drainage tubes color (Green -> Red on surcharge)
    const isHeavy = rainfall_mm >= 50 && horizon_min >= 30;
    this.floodTubes.forEach((tube, idx) => {
      // At 50mm, major trunk drains overload; minor drain (idx 2) stays normal
      const isOverloaded = (rainfall_mm >= 100) || (isHeavy && idx < 2);
      tube.material.color.setHex(isOverloaded ? 0xef4444 : 0x10b981);
    });

    // Adjust rain particle density & visibility
    if (this.rainSystem) {
      if (rainfall_mm <= 0) {
        this.rainSystem.material.opacity = 0.0;
      } else {
        const rainIntensity = (rainfall_mm / 100.0) * (0.4 + 0.6 * hydroFactor);
        this.rainSystem.material.opacity = Math.min(0.95, 0.35 + rainIntensity * 0.6);
        this.rainSystem.material.size = 1.6 + rainIntensity * 1.4;
      }
    }
  },

  updateRainfallScenario(mm) {
    this.setSimulationState(mm, this.currentHorizon, this.isSimPlaying);
  },

  // ==========================================
  // RENDER & ANIMATION LOOP
  // ==========================================
  animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock ? this.clock.getDelta() : 0.016;
    const time = this.clock ? this.clock.getElapsedTime() : (Date.now() * 0.001);

    if (this.elevControls) this.elevControls.update();
    if (this.floodControls) this.floodControls.update();

    // 1. Smooth Lerp of Water Elevation
    this.currentWaterY += (this.baseTargetWaterY - this.currentWaterY) * 0.06;

    // 2. Water Surface Wave Ripples
    if (this.floodWaterMesh && this.floodWaterGeom && this.floodWaterPositionsOrig) {
      this.floodWaterMesh.position.y = this.currentWaterY;
      const pos = this.floodWaterGeom.attributes.position;
      const count = pos.count;
      const waveSpeed = 2.4;

      for (let i = 0; i < count; i++) {
        const x = this.floodWaterPositionsOrig[i * 3 + 0];
        const z = this.floodWaterPositionsOrig[i * 3 + 2];
        const wave = Math.sin(x * 0.14 + time * waveSpeed) * 0.18 +
                     Math.cos(z * 0.16 + time * (waveSpeed * 0.8)) * 0.14;
        pos.setY(i, wave);
      }
      pos.needsUpdate = true;
    }

    // 3. Falling Rain Particles
    if (this.rainSystem && this.rainPositions && this.rainVelocities) {
      const count = this.rainCount;
      const pos = this.rainPositions;
      const vel = this.rainVelocities;
      const fallSpeedMult = this.currentRainfall > 0 ? (this.isSimPlaying ? 1.3 : 0.85) : 0.0;

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] += vel[i * 3 + 0] * fallSpeedMult;
        pos[i * 3 + 1] += vel[i * 3 + 1] * fallSpeedMult;
        pos[i * 3 + 2] += vel[i * 3 + 2] * fallSpeedMult;

        const x = pos[i * 3 + 0];
        const z = pos[i * 3 + 2];
        const groundY = this.sampleTerrainElevation(x, z);

        // Reset particle to top of sky when it hits ground or water
        if (pos[i * 3 + 1] < Math.max(groundY, this.currentWaterY)) {
          pos[i * 3 + 0] = (Math.random() - 0.5) * 220;
          pos[i * 3 + 1] = 140 + Math.random() * 30;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
        }
      }
      this.rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    // 4. In-Terrain Gravity Flow Runoff Particles (Water Shifting Downslope)
    if (this.flowSystem && this.flowPositions && this.flowVelocities) {
      const count = this.flowCount;
      const pos = this.flowPositions;
      const vel = this.flowVelocities;
      const flowMult = this.isSimPlaying ? 1.2 : 0.7;

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] += vel[i * 3 + 0] * flowMult;
        pos[i * 3 + 2] += vel[i * 3 + 2] * flowMult;

        const x = pos[i * 3 + 0];
        const z = pos[i * 3 + 2];

        // Particle reached Yamuna river trench (x > 42) or left boundaries -> respawn on Ridge
        if (x > 42 || x < -80 || z < -55 || z > 55) {
          this.resetFlowParticle(i, pos, vel, false);
        } else {
          // Adjust vertical position to glide right over terrain surface
          pos[i * 3 + 1] = this.sampleTerrainElevation(x, z) + 0.35;

          // Re-steer downhill
          const grad = this.sampleTerrainGradient(x, z);
          vel[i * 3 + 0] = vel[i * 3 + 0] * 0.95 + (-grad.dhdx * 0.3 + 0.25) * 0.05;
          vel[i * 3 + 2] = vel[i * 3 + 2] * 0.95 + (-grad.dhdz * 0.3) * 0.05;
        }
      }
      this.flowSystem.geometry.attributes.position.needsUpdate = true;
    }

    // 5. Pulsing Hotspot Warning Rings
    if (this.hotspotRings.length > 0) {
      const isSurcharged = this.currentRainfall >= 50;
      this.hotspotRings.forEach(item => {
        item.mesh.visible = isSurcharged;
        if (isSurcharged) {
          item.progress = (item.progress + delta * 0.8) % 1.0;
          const s = 1.0 + item.progress * 4.5;
          item.mesh.scale.set(s, s, 1);
          item.mesh.material.opacity = Math.max(0, 0.9 * (1.0 - item.progress));
          item.mesh.position.y = this.currentWaterY + 0.15;
        }
      });
    }

    // 6. Surcharge Tube Pulsing Glow
    if (this.currentRainfall >= 50) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 5.0);
      this.floodTubes.forEach(tube => {
        if (tube.material.color.getHex() === 0xef4444) {
          tube.material.opacity = pulse;
        }
      });
    }

    // 7. Render Active Views
    if (this.elevRenderer && this.elevScene && this.elevCamera) {
      this.elevRenderer.render(this.elevScene, this.elevCamera);
    }
    if (this.floodRenderer && this.floodScene && this.floodCamera) {
      this.floodRenderer.render(this.floodScene, this.floodCamera);
    }
  },

  onWindowResize() {
    const elevContainer = document.getElementById('canvas-3d-elevation-target');
    if (elevContainer && this.elevCamera && this.elevRenderer) {
      const w = elevContainer.clientWidth || (elevContainer.parentElement ? elevContainer.parentElement.clientWidth : 880);
      const h = elevContainer.clientHeight || 560;
      if (w > 0 && h > 0) {
        this.elevCamera.aspect = w / h;
        this.elevCamera.updateProjectionMatrix();
        this.elevRenderer.setSize(w, h);
      }
    }

    const floodContainer = document.getElementById('canvas-3d-flood-target');
    if (floodContainer && this.floodCamera && this.floodRenderer) {
      const rect = floodContainer.getBoundingClientRect();
      const parentRect = floodContainer.parentElement ? floodContainer.parentElement.getBoundingClientRect() : rect;
      const w = Math.floor(floodContainer.clientWidth || rect.width || parentRect.width || 880);
      const h = Math.floor(floodContainer.clientHeight || rect.height || parentRect.height || 560);
      if (w > 0 && h > 0) {
        this.floodCamera.aspect = w / h;
        this.floodCamera.updateProjectionMatrix();
        this.floodRenderer.setSize(w, h);
      }
    }
  }
};

window.ThreeEngine = ThreeEngine;


// ==========================================
// 3. 2D HYDRODYNAMIC RADAR SIMULATION ENGINE
// High-performance Canvas 2D Solver & Radar Scanner
// ==========================================
const HydroRadarEngine2D = {
  canvas: null,
  ctx: null,
  animId: null,
  angle: 0,
  time: 0,
  rainfall: 50,
  horizon: 60,
  isPlaying: false,
  particles: [],
  initialized: false,
  logicalWidth: 880,
  logicalHeight: 560,
  mouse: { x: -1, y: -1, isHover: false },

  init(canvasId) {
    this.canvas = document.getElementById(canvasId || 'canvas-2d-hydro-radar');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.initialized) {
      this.initParticles();
      this.bindEvents();
      this.initialized = true;
    }
    this.resize();
    if (!this.animId) {
      this.animate();
    }
  },

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width || parent.clientWidth || 880));
    const h = Math.max(300, Math.floor(rect.height || parent.clientHeight || 560));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
    }
    this.logicalWidth = w;
    this.logicalHeight = h;
  },

  initParticles() {
    this.particles = [];
    const count = 140;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * 0.35 + 0.18,
        y: Math.random() * 0.70 + 0.15,
        speed: 0.0016 + Math.random() * 0.0024,
        size: 1.5 + Math.random() * 2.0,
        alpha: 0.35 + Math.random() * 0.65
      });
    }
  },

  bindEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.isHover = true;

      const normX = this.mouse.x / (this.logicalWidth || 880);
      const normY = this.mouse.y / (this.logicalHeight || 560);
      const elev = (280 - normX * 85 + Math.sin(normY * 6) * 12).toFixed(1);
      const depth = normX > 0.55 ? (this.rainfall >= 50 ? (0.45 + (this.rainfall / 100) * 0.55).toFixed(2) : '0.12') : '0.00 (Dry)';
      const slope = (0.8 + (1 - normX) * 2.2).toFixed(1);

      const elevEl = document.getElementById('hud-elev-val');
      const waterEl = document.getElementById('hud-water-val');
      const slopeEl = document.getElementById('hud-slope-val');
      if (elevEl) elevEl.textContent = `${elev} m`;
      if (waterEl) waterEl.textContent = depth.includes('Dry') ? depth : `${depth} m`;
      if (slopeEl) slopeEl.textContent = `${slope}°`;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.isHover = false;
    });

    window.addEventListener('resize', () => this.resize());
  },

  setScenario(mm, horizon, isPlaying) {
    this.rainfall = mm;
    this.horizon = horizon;
    this.isPlaying = isPlaying;
  },

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    this.angle = (this.angle + 0.024) % (Math.PI * 2);
    this.render();
  },

  render() {
    if (!this.ctx || !this.logicalWidth) return;
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const ctx = this.ctx;

    // 1. Background Grid
    ctx.fillStyle = '#060d17';
    ctx.fillRect(0, 0, w, h);

    // Subtle coordinate grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = 45;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 2. Delhi NCT Regional Boundary & Terrain Mask
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.12);
    ctx.bezierCurveTo(w * 0.45, h * 0.08, w * 0.65, h * 0.10, w * 0.76, h * 0.18);
    ctx.bezierCurveTo(w * 0.88, h * 0.32, w * 0.85, h * 0.60, w * 0.78, h * 0.78);
    ctx.bezierCurveTo(w * 0.68, h * 0.92, w * 0.45, h * 0.90, w * 0.30, h * 0.82);
    ctx.bezierCurveTo(w * 0.15, h * 0.72, w * 0.12, h * 0.45, w * 0.18, h * 0.26);
    ctx.closePath();

    // Fill terrain interior
    const grad = ctx.createLinearGradient(w * 0.2, h * 0.5, w * 0.8, h * 0.5);
    grad.addColorStop(0, '#0f291e'); // High western green ridge
    grad.addColorStop(0.4, '#0e2238'); // Central slate urban plain
    grad.addColorStop(1, '#071829'); // Eastern lowland Yamuna basin
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 3. Central Ridge Elevation Shading
    ctx.save();
    ctx.fillStyle = 'rgba(217, 119, 6, 0.18)';
    ctx.beginPath();
    ctx.ellipse(w * 0.32, h * 0.48, w * 0.12, h * 0.28, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 4. Meandering Yamuna River Trench
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.08);
    ctx.bezierCurveTo(w * 0.68, h * 0.25, w * 0.62, h * 0.42, w * 0.66, h * 0.58);
    ctx.bezierCurveTo(w * 0.70, h * 0.72, w * 0.74, h * 0.85, w * 0.72, h * 0.95);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.85)';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Flow wavelets on Yamuna
    for (let k = 1; k <= 5; k++) {
      const t = (k * 0.18 + this.time * 0.1) % 0.9 + 0.05;
      const py = h * (0.1 + t * 0.8);
      const px = w * (0.64 + Math.sin(t * 3.8) * 0.05);
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Inundation Zones (Scaled by rainfall scenario)
    const factor = Math.min(1.0, this.rainfall / 100.0);
    const floodAlpha = 0.25 + factor * 0.45;
    const floodColor = this.rainfall >= 100 ? `rgba(239, 68, 68, ${floodAlpha})` :
                       this.rainfall >= 50 ? `rgba(245, 158, 11, ${floodAlpha})` :
                       `rgba(56, 189, 248, ${floodAlpha})`;

    // East Delhi Inundation Zone
    ctx.save();
    ctx.fillStyle = floodColor;
    ctx.beginPath();
    ctx.ellipse(w * 0.72, h * 0.46, w * 0.10 * (0.7 + factor * 0.5), h * 0.18 * (0.7 + factor * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.rainfall >= 50 ? '#ef4444' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pulsing flood wave ring in East Delhi
    const pulseR = ((this.time * 25) % 35) + 10;
    ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, 0.8 - pulseR / 45)})`;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.46, pulseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // North Delhi Inundation Zone
    ctx.save();
    ctx.fillStyle = floodColor;
    ctx.beginPath();
    ctx.ellipse(w * 0.60, h * 0.28, w * 0.07 * (0.6 + factor * 0.4), h * 0.09 * (0.6 + factor * 0.4), 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. Surface Runoff Flow Particles (Downslope D8 from Ridge to Yamuna)
    ctx.save();
    ctx.fillStyle = '#00e5ff';
    const flowSpeedMult = this.rainfall > 0 ? (0.6 + factor * 1.2) : 0.2;
    this.particles.forEach(p => {
      p.x += p.speed * flowSpeedMult;
      p.y += (Math.sin(p.x * 12 + this.time) * 0.0006);

      // Reached Yamuna river -> respawn on west Ridge
      if (p.x > 0.68 || p.y > 0.88 || p.y < 0.12) {
        p.x = 0.20 + Math.random() * 0.20;
        p.y = 0.15 + Math.random() * 0.70;
      }

      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 7. Doppler Radar Radial Sweep from Safdarjung
    const radarCenter = { x: w * 0.48, y: h * 0.52 }; // Safdarjung
    ctx.save();

    // Concentric range rings
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.setLineDash([3, 5]);
    [40, 85, 130, 180].forEach(r => {
      ctx.beginPath();
      ctx.arc(radarCenter.x, radarCenter.y, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Rotating sweep cone
    const sweepAngle = 0.45;
    const gradSweep = ctx.createRadialGradient(
      radarCenter.x, radarCenter.y, 5,
      radarCenter.x, radarCenter.y, 220
    );
    gradSweep.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
    gradSweep.addColorStop(0.8, 'rgba(16, 185, 129, 0.15)');
    gradSweep.addColorStop(1, 'rgba(16, 185, 129, 0)');

    ctx.fillStyle = gradSweep;
    ctx.beginPath();
    ctx.moveTo(radarCenter.x, radarCenter.y);
    ctx.arc(radarCenter.x, radarCenter.y, 220, this.angle - sweepAngle, this.angle);
    ctx.closePath();
    ctx.fill();

    // Leading sweep beam
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(radarCenter.x, radarCenter.y);
    ctx.lineTo(
      radarCenter.x + Math.cos(this.angle) * 220,
      radarCenter.y + Math.sin(this.angle) * 220
    );
    ctx.stroke();
    ctx.restore();

    // 8. Hotspot Markers & Real-Time Depth Gauges
    const hotspots = [
      { name: "Minto Bridge", x: w * 0.52, y: h * 0.42, depth: this.rainfall >= 50 ? 0.85 : 0.18 },
      { name: "ITO Ring Road", x: w * 0.64, y: h * 0.48, depth: this.rainfall >= 50 ? 0.65 : 0.12 },
      { name: "Kashmere Gate", x: w * 0.58, y: h * 0.26, depth: this.rainfall >= 50 ? 0.50 : 0.08 },
      { name: "Pul Prahladpur", x: w * 0.68, y: h * 0.78, depth: this.rainfall >= 50 ? 0.95 : 0.22 }
    ];

    hotspots.forEach(hs => {
      const isCritical = hs.depth >= 0.50;
      const col = isCritical ? '#ef4444' : '#10b981';

      ctx.save();
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isCritical) {
        const ringS = ((this.time * 20) % 24) + 6;
        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, 0.9 - ringS / 30)})`;
        ctx.beginPath();
        ctx.arc(hs.x, hs.y, ringS, 0, Math.PI * 2);
        ctx.stroke();
      }

      const labelText = `${hs.name}: ${hs.depth.toFixed(2)}m`;
      ctx.font = 'bold 11px "Inter", sans-serif';
      const textWidth = ctx.measureText(labelText).width;

      const cardX = hs.x + 10;
      const cardY = hs.y - 12;
      const cardW = textWidth + 14;
      const cardH = 22;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 5);
      else ctx.rect(cardX, cardY, cardW, cardH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, cardX + 7, cardY + cardH / 2);
      ctx.restore();
    });

    // 9. Overlay Legend Box
    ctx.save();
    const legX = 14;
    const legY = h - 110;
    ctx.fillStyle = 'rgba(8, 15, 28, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(legX, legY, 215, 96, 6);
    else ctx.rect(legX, legY, 215, 96);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10.5px "Inter", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('2D HYDRODYNAMIC RADAR', legX + 10, legY + 16);

    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(legX + 10, legY + 28, 12, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('Yamuna Channel & Safe Zone', legX + 28, legY + 36);

    ctx.fillStyle = this.rainfall >= 50 ? '#ef4444' : '#10b981';
    ctx.fillRect(legX + 10, legY + 46, 12, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(this.rainfall >= 50 ? 'Critical Inundation (>0.5m)' : 'Low Ponding (<0.2m)', legX + 28, legY + 54);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(legX + 10, legY + 64, 12, 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('IMD Doppler Radar Beam (Safdarjung)', legX + 28, legY + 68);

    ctx.fillStyle = '#00e5ff';
    ctx.beginPath(); ctx.arc(legX + 16, legY + 84, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('Runoff Flow Particles (Ridge -> Yamuna)', legX + 28, legY + 86);
    ctx.restore();

    // 10. Mouse Cursor Inspector Crosshair
    if (this.mouse.isHover && this.mouse.x > 0 && this.mouse.y > 0) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(this.mouse.x, 0); ctx.lineTo(this.mouse.x, h);
      ctx.moveTo(0, this.mouse.y); ctx.lineTo(w, this.mouse.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(this.mouse.x, this.mouse.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
};

window.HydroRadarEngine2D = HydroRadarEngine2D;
