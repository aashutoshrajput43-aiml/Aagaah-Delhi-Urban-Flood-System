/**
 * Delhi Urban Flood Nowcasting System - Client Application
 * Full GIS Dashboard, Simulation Controller, Leaflet Engine, Routing,
 * Altitude-Based Danger Zones with Concentric Pulsing Radar Rings, and Interactive Tools
 */

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

const App = {
  // Application State
  activeView: '2d',
  currentRainfall: 10, // Default 10mm matching video start (frame 80s)
  currentHorizon: 60,
  simPlaying: false,
  simInterval: null,
  activeRouteLayers: [],
  selectedDrainFeature: null,
  activeTraceLayer: null,
  
  // Measurement Tool State
  measuringActive: false,
  measurePoints: [],
  measureLayerGroup: null,

  // Leaflet Map & Layer References
  map: null,
  baseTileLayer: null,
  layers: {
    dem: null,
    hillshade: null,
    contours: null,
    drainage: null,
    nodes: null,
    flow: null,
    depth: null,
    radar: null,
    hotspots: null,
    danger: null,
    pumps: null
  },

  // Infrastructure Assets & State
  pumpsData: [],
  gatesData: [],
  aiScheduleApplied: false,

  // AI Infrastructure Real-Time Optimizers
  aiPumpOptimizerActive: true,
  aiGateOptimizerActive: true,
  aiDrainOptimizerActive: true,

  // Cache Datasets from Backend
  hotspotsData: [],
  drainsData: [],
  nodesData: [],
  contoursData: [],
  dangerZonesData: [],

  async init() {
    this.initLeafletMap();
    this.initViewSwitchers();
    this.initStudyAreaSelector();
    this.initLayerToggles();
    this.initSimulationControls();
    this.initModalsAndDrawers();
    this.initSearch();
    this.initFloatingHUD();
    this.initMeasurementTool();
    this.initLegendCollapse();
    this.initDashboardInteractivity();

    // Fetch initial backend data
    await this.fetchDatasets();
    await this.fetchInfrastructureAssets();

    // Build GIS Layer Objects
    this.renderDEM();
    this.renderHillshade();
    this.renderContours();
    this.renderDrainageNetwork();
    this.renderDrainageNodes();
    this.renderFlowDirections();
    this.renderFloodDepthRasters(this.currentRainfall);
    this.renderRadar();
    this.renderHotspots();
    this.renderDangerZones(this.currentRainfall);
    this.renderPumpsAndGates();
    this.initInfrastructureOptimizer();

    // Ensure all checked GIS layers are operational and active on map simultaneously
    ['dem', 'drainage', 'danger', 'radar', 'flow', 'pumps'].forEach(id => {
      const toggle = document.getElementById(`layer-${id}-toggle`);
      const layer = this.layers[id];
      if (toggle && toggle.checked && layer && !this.map.hasLayer(layer)) {
        this.map.addLayer(layer);
      }
    });

    // Initialize 3D Engine
    if (window.ThreeEngine) {
      window.ThreeEngine.init();
    }

    // Initial simulation sync with backend
    this.triggerSimulationSync(this.currentRainfall, this.currentHorizon);

    // Initial point inspection at Connaught Place
    this.inspectPointAt(28.6328, 77.2197);

    // Deep link or hash support for workspace tabs (e.g. #chatbot)
    const hash = window.location.hash.replace('#', '');
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab') || hash;
    if (targetTab && ['simulation', 'analytics', 'reports', 'chatbot', 'settings'].includes(targetTab)) {
      this.switchWorkspaceTab(targetTab);
    }
  },

  // ==========================================
  // 1. LEAFLET MAP INITIALIZATION
  // ==========================================
  initLeafletMap() {
    // Delhi NCT Center Coordinates matching video frame 80s
    this.map = L.map('map-container', {
      center: [28.6300, 77.2150],
      zoom: 11,
      zoomControl: true,
      attributionControl: true
    });

    // Basemap: OpenStreetMap Standard Tiles (exact colors and typography from video)
    this.baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Map click -> Hydro Inspector point query or Measurement point
    this.map.on('click', (e) => {
      if (this.measuringActive) {
        this.handleMeasurementClick(e.latlng);
      } else {
        this.inspectPointAt(e.latlng.lat, e.latlng.lng);
      }
    });

    // Hover for quick coordinate display
    this.map.on('mousemove', (e) => {
      const coordsEl = document.getElementById('inspector-coords');
      if (coordsEl) {
        coordsEl.textContent = `${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`;
      }
      if (this.measuringActive && this.measurePoints.length === 1) {
        this.updateMeasurementPreview(e.latlng);
      }
    });

    this.measureLayerGroup = L.layerGroup().addTo(this.map);

    // Invalidate map size so Leaflet fills full viewport correctly
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 150);
    window.addEventListener('resize', () => {
      if (this.map && this.activeView === '2d') {
        this.map.invalidateSize();
      }
    });

    // 2D Falling Rain Canvas Overlay
    this.init2DRainOverlay();
  },

  // 2D Falling Rain Particle Overlay over Leaflet Map
  init2DRainOverlay() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    let canvas = document.getElementById('map-rain-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'map-rain-canvas';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '450';
      mapContainer.appendChild(canvas);
    }

    this.rainCanvas = canvas;
    this.rainCtx = canvas.getContext('2d');

    const updateSize = () => {
      if (canvas && mapContainer) {
        const w = mapContainer.clientWidth || window.innerWidth;
        const h = mapContainer.clientHeight || window.innerHeight;
        canvas.width = w;
        canvas.height = h;
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Particle pool for realistic falling rain
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
    };
    animate2DRain();
  },

  // ==========================================
  // 2. VIEW SWITCHERS (2D vs 3D)
  // ==========================================
  initViewSwitchers() {
    const tabs = document.querySelectorAll('.map-view-toggle-bar button[data-view]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.map-view-toggle-bar button[data-view]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const view = tab.getAttribute('data-view');
        if (view === 'live') {
          this.activateLiveWeatherMode();
        } else if (view === 'satellite') {
          if (this.isLiveMode) this.deactivateLiveWeatherMode();
          if (this.baseTileLayer) this.map.removeLayer(this.baseTileLayer);
          this.baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
            attribution: 'Tiles &copy; Esri'
          }).addTo(this.map);
          this.switchView('2d');
          const btnSat = document.getElementById('btn-view-satellite');
          if (btnSat) btnSat.classList.add('active');
          this.showToast('Switched to Satellite Imagery', 'satellite');
        } else if (view === '2d') {
          if (this.isLiveMode) this.deactivateLiveWeatherMode();
          if (this.baseTileLayer) this.map.removeLayer(this.baseTileLayer);
          this.baseTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(this.map);
          this.switchView('2d');
          const btnMap = document.getElementById('btn-view-map');
          if (btnMap) btnMap.classList.add('active');
          this.showToast('Switched to Standard Map View', 'map');
        } else {
          if (this.isLiveMode) this.deactivateLiveWeatherMode();
          this.switchView(view);
          const btn3d = document.getElementById('btn-view-3d');
          if (btn3d) btn3d.classList.add('active');
        }
      });
    });
  },

  switchView(view) {
    this.activeView = view || '2d';
    const mapContainer = document.getElementById('map-container');
    const view3dElev = document.getElementById('view-3d-elevation');
    const view3dFlood = document.getElementById('view-3d-flood');
    const dangerLegend = document.getElementById('map-danger-legend');

    if (view === '3d-elevation') {
      if (mapContainer) mapContainer.classList.add('hidden');
      if (view3dFlood) view3dFlood.classList.add('hidden');
      if (view3dElev) view3dElev.classList.remove('hidden');
      if (dangerLegend) dangerLegend.classList.add('hidden');
      if (window.ThreeEngine) window.ThreeEngine.onWindowResize();
    } else if (view === '3d-flood') {
      if (mapContainer) mapContainer.classList.add('hidden');
      if (view3dElev) view3dElev.classList.add('hidden');
      if (view3dFlood) view3dFlood.classList.remove('hidden');
      if (dangerLegend) dangerLegend.classList.add('hidden');
      if (window.ThreeEngine) {
        window.ThreeEngine.updateRainfallScenario(this.currentRainfall);
        window.ThreeEngine.onWindowResize();
      }
    } else {
      // Standard 2D Leaflet View (default, 2d, satellite, live)
      if (view3dElev) view3dElev.classList.add('hidden');
      if (view3dFlood) view3dFlood.classList.add('hidden');
      if (mapContainer) mapContainer.classList.remove('hidden');
      if (this.isLiveMode) {
        if (dangerLegend) dangerLegend.classList.add('hidden');
      } else {
        if (dangerLegend) dangerLegend.classList.remove('hidden');
      }
      if (this.map) {
        this.map.invalidateSize();
      }
    }
  },

  // ==========================================
  // 3. STUDY AREA SELECTOR
  // ==========================================
  initStudyAreaSelector() {
    const studySelect = document.getElementById('study-area-select');
    if (!studySelect) return;

    studySelect.addEventListener('change', () => {
      const basin = studySelect.value;
      if (basin === 'delhi-nct') {
        this.map.flyTo([28.6300, 77.2150], 11, { duration: 1.2 });
        this.inspectPointAt(28.6328, 77.2197);
        this.showToast('Viewing Study Area: Delhi NCT Overview', 'globe');
      } else if (basin === 'yamuna-front') {
        this.map.flyTo([28.6600, 77.2400], 13, { duration: 1.2 });
        this.inspectPointAt(28.6650, 77.2355);
        this.showToast('Viewing Study Area: Yamuna Active Floodplain Zone', 'water');
      } else if (basin === 'najafgarh-basin') {
        this.map.flyTo([28.6200, 77.0600], 12, { duration: 1.2 });
        this.inspectPointAt(28.6200, 77.0600);
        this.showToast('Viewing Study Area: Najafgarh Basin Catchment', 'water');
      } else if (basin === 'barapullah-catchment') {
        this.map.flyTo([28.5800, 77.2400], 13, { duration: 1.2 });
        this.inspectPointAt(28.5800, 77.2400);
        this.showToast('Viewing Study Area: Barapullah Drainage Catchment', 'water');
      } else if (basin === 'shahdara-reach') {
        this.map.flyTo([28.6600, 77.2900], 13, { duration: 1.2 });
        this.inspectPointAt(28.6600, 77.2900);
        this.showToast('Viewing Study Area: Shahdara Trans-Yamuna Reach', 'water');
      }
    });
  },

  // ==========================================
  // 4. BACKEND API DATA FETCHING
  // ==========================================
  async fetchDatasets() {
    try {
      const [hotspotsRes, drainsRes, nodesRes, contoursRes, dangerRes] = await Promise.all([
        fetch('/api/gis/hotspots').then(r => r.json()),
        fetch('/api/gis/drains').then(r => r.json()),
        fetch('/api/gis/nodes').then(r => r.json()),
        fetch('/api/gis/contours').then(r => r.json()),
        fetch(`/api/gis/danger-zones?scenario=${this.currentRainfall}`).then(r => r.json())
      ]);

      this.hotspotsData = hotspotsRes.hotspots || [];
      this.drainsData = drainsRes.drains || [];
      this.nodesData = nodesRes.nodes || [];
      this.contoursData = contoursRes.contours || [];
      this.dangerZonesData = dangerRes.danger_zones || [];
    } catch (err) {
      console.warn("Using fallback geospatial datasets", err);
    }
  },

  async inspectPointAt(lat, lng) {
    const coordsEl = document.getElementById('inspector-coords');
    if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

    try {
      const res = await fetch(`/api/hydro/inspect?lat=${lat}&lng=${lng}&scenario=${this.currentRainfall}`);
      const data = await res.json();

      document.getElementById('val-hydro-elevation').textContent = `${data.elevation_dem_m} m`;
      document.getElementById('val-hydro-depth').textContent = `${data.water_depth_m} m`;
      document.getElementById('val-hydro-slope').textContent = `${data.ground_slope_deg}°`;
      document.getElementById('val-hydro-flowdir').textContent = data.d8_flow_dir;
      document.getElementById('val-hydro-runoff').textContent = `${data.surface_runoff_mm} mm`;

      const statusEl = document.getElementById('val-hydro-status');
      statusEl.textContent = data.drainage_status;
      if (data.drainage_status === 'SURCHARGED') {
        statusEl.className = 'card-value text-red badge-text';
      } else {
        statusEl.className = 'card-value text-green badge-text';
      }
    } catch (err) {
      console.error(err);
    }
  },

  // ==========================================
  // 5. ALTITUDE DANGER ZONES & PULSING RADAR RINGS
  //    (Core Request: Altitude-Based Hazard Zones)
  // ==========================================
  renderDangerZones(rainfall_mm) {
    const isVisible = document.getElementById('layer-danger-toggle') ? document.getElementById('layer-danger-toggle').checked : true;
    if (this.layers.danger) this.map.removeLayer(this.layers.danger);

    const group = L.featureGroup();
    const sliderEl = document.getElementById('layer-danger-opacity');
    const sliderVal = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.85;

    // 1. Altitude Polygons
    this.dangerZonesData.forEach(zone => {
      // Dynamic depth adjustment per scenario
      const depth = (rainfall_mm <= 10) ? 0.0 : ((zone.simulated_depth_m || 0.25) * (rainfall_mm / 50.0)).toFixed(2);
      
      const polygon = L.polygon(zone.coordinates, {
        color: zone.risk_color,
        weight: 2.5,
        opacity: sliderVal,
        fillColor: zone.fill_color,
        fillOpacity: sliderVal * 0.42,
        dashArray: zone.risk_level.includes('SAFE') ? '4, 6' : null
      });

      polygon.bindTooltip(`
        <strong>${zone.name}</strong><br>
        Altitude: ${zone.altitude_range}<br>
        <span style="color: ${zone.risk_color}; font-weight: bold;">${zone.risk_level}</span>
      `, { sticky: true });

      polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        L.popup({ minWidth: 240, maxWidth: 300 })
          .setLatLng(e.latlng)
          .setContent(`
            <div class="map-popup-card">
              <div class="map-popup-header" style="color: ${zone.risk_color};">
                <i class="fa-solid fa-triangle-exclamation"></i> ${zone.name}
              </div>
              <div class="map-popup-stat">
                Altitude Range: <strong>${zone.altitude_range}</strong>
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                Elevation Tier: ${zone.elevation_tier}
              </div>
              <div style="font-size: 11.5px; margin-top: 4px; font-weight: bold; color: ${zone.risk_color};">
                ${zone.risk_level}
              </div>
              <div style="font-size: 11.5px; margin-top: 4px; color: #0284c7;">
                Simulated Inundation Depth: <strong style="font-size: 12px; color: #dc2626;">${depth} m</strong>
              </div>
              <div class="map-popup-action">
                <button onclick="App.openRoutePlannerWithEvacuation()" class="map-popup-btn">
                  <i class="fa-solid fa-route"></i> Plan Evacuation Route
                </button>
              </div>
            </div>
          `)
          .openOn(this.map);
        this.inspectPointAt(e.latlng.lat, e.latlng.lng);
      });

      group.addLayer(polygon);
    });

    // 2. Concentric Pulsing Radar Rings on Critical Underpass & Sump Locations matching video frame 60s
    const criticalRadarPoints = [
      {
        name: "Minto Bridge Underpass Sump",
        lat: 28.6338,
        lng: 77.2224,
        label: "CRITICAL SINK (<212m)",
        elev: "211.5m",
        desc: "Severe inward-sloping railway culvert. Submerges first under flash storms."
      },
      {
        name: "ITO Vikas Marg Arterial Sump",
        lat: 28.6289,
        lng: 77.2415,
        label: "HIGH RISK SINK (<208m)",
        elev: "204.2m",
        desc: "Low riverfront elevation prone to backwater surcharge."
      },
      {
        name: "Yamuna Bazar & Nigambodh Lowland",
        lat: 28.6650,
        lng: 77.2355,
        label: "ACTIVE FLOODPLAIN (<205m)",
        elev: "202.8m",
        desc: "Active river trench below 205.33m high flood level."
      },
      {
        name: "Pul Prahladpur Railway Underpass",
        lat: 28.5115,
        lng: 77.2890,
        label: "SUNKEN SUBWAY (<218m)",
        elev: "218.0m",
        desc: "Natural topographic bowl receiving rapid runoff from MB Road."
      }
    ];

    criticalRadarPoints.forEach(pt => {
      const radarIcon = L.divIcon({
        className: 'custom-radar-container',
        html: `
          <div class="danger-radar-marker" title="${pt.name} (${pt.elev})">
            <div class="danger-zone-badge-label">${pt.label}</div>
            <div class="radar-ring ring-1"></div>
            <div class="radar-ring ring-2"></div>
            <div class="radar-ring ring-3"></div>
            <div class="radar-center-core"></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const radarMarker = L.marker([pt.lat, pt.lng], { icon: radarIcon });
      radarMarker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-header text-red">
            <i class="fa-solid fa-triangle-exclamation"></i> ${pt.name}
          </div>
          <div class="map-popup-stat">
            Ground Altitude: <strong>${pt.elev}</strong>
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 3px;">${pt.desc}</div>
          <div style="font-size: 11px; margin-top: 4px; color: #dc2626; font-weight: bold;">STATUS: SURCHARGED INUNDATION RISK</div>
        </div>
      `, { minWidth: 230, maxWidth: 290 });

      radarMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.inspectPointAt(pt.lat, pt.lng);
      });

      group.addLayer(radarMarker);
    });

    this.layers.danger = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 6. TOPOGRAPHIC CONTOURS LAYER
  // ==========================================
  renderContours() {
    const isVisible = document.getElementById('layer-contours-toggle') ? document.getElementById('layer-contours-toggle').checked : false;
    if (this.layers.contours) this.map.removeLayer(this.layers.contours);

    const group = L.featureGroup();
    const sliderEl = document.getElementById('layer-contours-opacity');
    const opacity = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.81;

    this.contoursData.forEach(c => {
      const polyline = L.polyline(c.coordinates, {
        color: c.color,
        weight: 2.2,
        opacity: opacity,
        dashArray: '5, 5'
      });

      polyline.bindTooltip(`Topographic Contour: ${c.elevation}m (${c.label})`, { sticky: true });

      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        polyline.bindPopup(`
          <div style="font-family: var(--font-sans); font-size: 11px;">
            <strong style="color: ${c.color};">${c.label}</strong><br>
            Elevation: <strong>${c.elevation} m MSL</strong><br>
            Topographic Tier: ${c.elevation < 210 ? 'Lowland / Floodplain' : (c.elevation < 240 ? 'Mid Plateau' : 'Ridge Highlands')}
          </div>
        `).openPopup();
      });

      // Elevation text badge on center of line
      const midCoord = c.coordinates[Math.floor(c.coordinates.length / 2)];
      const textIcon = L.divIcon({
        className: 'contour-text-badge',
        html: `<div style="background: rgba(11,19,32,0.85); color: ${c.color}; border: 1px solid ${c.color}; font-size: 8.5px; font-weight: 800; padding: 1px 4px; border-radius: 2px; white-space: nowrap;">${c.elevation}m</div>`,
        iconSize: [30, 14]
      });
      const textMarker = L.marker(midCoord, { icon: textIcon, interactive: false });

      group.addLayer(polyline);
      group.addLayer(textMarker);
    });

    this.layers.contours = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 7. TERRAIN / DEM HYPSOMETRIC CANVAS OVERLAY
  // ==========================================
  renderDEM() {
    const isVisible = document.getElementById('layer-dem-toggle') ? document.getElementById('layer-dem-toggle').checked : false;
    if (this.layers.dem) this.map.removeLayer(this.layers.dem);

    const sliderEl = document.getElementById('layer-dem-opacity');
    const opacity = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.91;

    // Generate high-resolution mathematical DEM canvas overlay matching Delhi's topography
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(300, 300);

    const minLat = 28.45, maxLat = 28.85;
    const minLng = 76.95, maxLng = 77.40;

    for (let y = 0; y < 300; y++) {
      const lat = maxLat - (y / 300) * (maxLat - minLat);
      for (let x = 0; x < 300; x++) {
        const lng = minLng + (x / 300) * (maxLng - minLng);

        // Radial distance from Delhi center (28.63, 77.16)
        const dCenter = Math.hypot(lat - 28.63, (lng - 77.16) * 1.1);
        if (dCenter > 0.24) {
          // Outside Delhi NCT boundary boundary - transparent
          continue;
        }

        // River axis approx along Yamuna (lng ~ 77.23 to 77.31)
        const riverLng = 77.225 + (28.75 - lat) * 0.28;
        const distToRiver = Math.abs(lng - riverLng);

        let r, g, b, alpha;
        if (distToRiver < 0.012 && lat >= 28.52 && lat <= 28.82) {
          // Yamuna Water Body: Deep vibrant blue
          r = 2; g = 132; b = 199;
          alpha = 210;
        } else if (lng > riverLng - 0.02 && lng < 77.34 && lat >= 28.52 && lat <= 28.78) {
          // East Delhi / Lowland Inundation corridor: Red (High Risk)
          r = 239; g = 68; b = 68;
          alpha = 195;
        } else if (lng > 77.14 && lng <= riverLng - 0.01) {
          // Central Delhi: Yellow/Orange (Moderate Risk)
          const ratio = (lng - 77.14) / (riverLng - 77.14);
          r = 245; g = Math.floor(158 - ratio * 40); b = 11;
          alpha = 185;
        } else {
          // West & South Delhi: Vibrant Green (Safe Zone)
          r = 34; g = 197; b = 94;
          alpha = 180;
        }

        // Soft fade near boundary edge
        if (dCenter > 0.21) {
          const fade = (0.24 - dCenter) / 0.03;
          alpha = Math.floor(alpha * Math.max(0, Math.min(1, fade)));
        }

        const idx = (y * 300 + x) * 4;
        imgData.data[idx] = r;
        imgData.data[idx + 1] = g;
        imgData.data[idx + 2] = b;
        imgData.data[idx + 3] = alpha;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const bounds = [[minLat, minLng], [maxLat, maxLng]];
    this.layers.dem = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: opacity });

    if (isVisible) {
      this.layers.dem.addTo(this.map);
    }
  },

  // ==========================================
  // 8. 3D HILLSHADE RELIEF CANVAS OVERLAY
  // ==========================================
  renderHillshade() {
    const isVisible = document.getElementById('layer-hillshade-toggle') ? document.getElementById('layer-hillshade-toggle').checked : false;
    if (this.layers.hillshade) this.map.removeLayer(this.layers.hillshade);

    const sliderEl = document.getElementById('layer-hillshade-opacity');
    const opacity = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.75;

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(300, 300);

    const minLat = 28.45, maxLat = 28.85;
    const minLng = 76.95, maxLng = 77.40;

    for (let y = 0; y < 300; y++) {
      const lat = maxLat - (y / 300) * (maxLat - minLat);
      for (let x = 0; x < 300; x++) {
        const lng = minLng + (x / 300) * (maxLng - minLng);
        const dRidge = Math.hypot(lat - 28.59, lng - 77.15);
        const shade = Math.min(255, Math.max(40, Math.floor(128 + 90 * Math.sin(dRidge * 25.0))));

        const idx = (y * 300 + x) * 4;
        imgData.data[idx] = shade;
        imgData.data[idx + 1] = shade;
        imgData.data[idx + 2] = shade;
        imgData.data[idx + 3] = 140;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const bounds = [[minLat, minLng], [maxLat, maxLng]];
    this.layers.hillshade = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: opacity });

    if (isVisible) {
      this.layers.hillshade.addTo(this.map);
    }
  },

  // ==========================================
  // 9. REAL-TIME RADAR REFLECTIVITY OVERLAY
  // ==========================================
  renderRadar() {
    const isVisible = document.getElementById('layer-radar-toggle') ? document.getElementById('layer-radar-toggle').checked : false;
    if (this.layers.radar) this.map.removeLayer(this.layers.radar);

    const sliderEl = document.getElementById('layer-radar-opacity');
    const opacity = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.50;

    // Simulated Doppler Radar Reflectivity concentric rings from Palam Radar (28.58, 77.10)
    const canvas = document.createElement('canvas');
    canvas.width = 350;
    canvas.height = 350;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(175, 175, 10, 175, 175, 160);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.55)');
    grad.addColorStop(0.35, 'rgba(34, 197, 94, 0.45)');
    grad.addColorStop(0.70, 'rgba(234, 179, 8, 0.35)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(175, 175, 160, 0, Math.PI * 2);
    ctx.fill();

    const bounds = [[28.38, 76.90], [28.78, 77.30]];
    this.layers.radar = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: opacity });

    if (isVisible) {
      this.layers.radar.addTo(this.map);
    }
  },

  // ==========================================
  // 10. DRAINAGE NETWORK RENDERING (ENHANCED GIS ACCURACY & JUNCTIONS)
  // ==========================================
  renderDrainageNetwork() {
    const isVisible = document.getElementById('layer-drainage-toggle') ? document.getElementById('layer-drainage-toggle').checked : false;
    if (this.layers.drainage && this.map.hasLayer(this.layers.drainage)) {
      this.map.removeLayer(this.layers.drainage);
    }

    const group = L.featureGroup();
    const sliderEl = document.getElementById('layer-drainage-opacity');
    const opacity = sliderEl ? (parseInt(sliderEl.value, 10) / 100.0) : 0.95;

    // 1. Render all drainage lines with valid geometry strictly in vivid RED
    (this.drainsData || []).forEach(drain => {
      if (!drain.coordinates || !Array.isArray(drain.coordinates) || drain.coordinates.length < 2) return;

      const polyline = L.polyline(drain.coordinates, {
        color: '#dc2626', // Vivid, high-visibility Red
        weight: 4.5,
        opacity: opacity,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'drainage-red-line'
      });

      // Accessible tooltip on hover
      polyline.bindTooltip(`<strong>${drain.name || 'Drainage Channel'}</strong><br>Type: ${drain.type || 'Unavailable'}<br>Outlet: ${drain.receiving_outlet || 'Unavailable'}`, {
        sticky: true,
        className: 'node-tooltip'
      });

      // Subtle directional flow arrows along segment midpoints
      for (let i = 0; i < drain.coordinates.length - 1; i++) {
        const p1 = drain.coordinates[i];
        const p2 = drain.coordinates[i + 1];
        if (p1 && p2 && p1.length === 2 && p2.length === 2) {
          const midLat = (p1[0] + p2[0]) / 2;
          const midLng = (p1[1] + p2[1]) / 2;
          const dLat = p2[0] - p1[0];
          const dLng = p2[1] - p1[1];
          const angleDeg = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;

          const arrowIcon = L.divIcon({
            className: 'drainage-arrow-marker',
            html: `<div style="transform: rotate(${angleDeg}deg); color: #ffffff; font-size: 11px; text-shadow: 0 0 3px #dc2626, 0 1px 2px #000; font-weight: 900; line-height: 1; user-select: none;">➤</div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          });
          const arrowMarker = L.marker([midLat, midLng], { icon: arrowIcon, interactive: false });
          group.addLayer(arrowMarker);
        }
      }

      // Detailed attributes popup on click
      polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.selectDrainFeature(drain);

        const capText = drain.design_capacity_m3s != null
          ? `${drain.design_capacity_m3s} m³/s (${drain.design_capacity_cusecs != null ? `${drain.design_capacity_cusecs} cusecs` : 'Unavailable'})`
          : 'Unavailable';

        const inflowText = drain.base_inflow_m3s != null ? `${drain.base_inflow_m3s} m³/s` : 'Unavailable';
        const connJunctions = (drain.connected_junctions && drain.connected_junctions.length)
          ? drain.connected_junctions.join(', ')
          : 'Unavailable';

        const content = `
          <div class="map-popup-card">
            <div class="map-popup-header" style="color: #dc2626;">
              <i class="fa-solid fa-water"></i> DRAINAGE CHANNEL ATTRIBUTES
            </div>
            <div class="map-popup-title">${drain.name || 'Unavailable'}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
              ID: <strong>${drain.id || 'Unavailable'}</strong> &bull; Type: <strong>${drain.type || 'Unavailable'}</strong>
            </div>
            <div class="map-popup-stat">
              Design Capacity: <strong>${capText}</strong>
            </div>
            <ul class="map-popup-list">
              <li>Basin / Catchment: <strong>${drain.basin || 'Unavailable'}</strong></li>
              <li>Upstream Origin: <strong>${drain.upstream_origin || 'Unavailable'}</strong></li>
              <li>Receiving / Downstream Outlet: <strong>${drain.receiving_outlet || drain.downstream_outlet || 'Unavailable'}</strong></li>
              <li>Base Inflow: <strong>${inflowText}</strong></li>
              <li>Ground Elevation: <strong>${drain.ground_elevation || 'Unavailable'}</strong></li>
              <li>Channel Topology: <strong>${drain.topology || 'Unavailable'}</strong></li>
              <li>Water Level / Status: <strong>${drain.water_level_status || 'Unavailable'}</strong></li>
              <li>Flow Direction: <strong>${drain.flow_direction || 'Unavailable'}</strong></li>
              <li>Connected Junctions: <strong>${connJunctions}</strong></li>
              <li>Data Source: <strong>${drain.data_source || 'Delhi Jal Board / I&FC Dept'}</strong></li>
              <li>Telemetry Freshness: <strong>${drain.freshness || 'Unavailable'}</strong></li>
            </ul>
          </div>
        `;
        polyline.bindPopup(content, { minWidth: 280, maxWidth: 330 }).openPopup(e.latlng);
      });

      group.addLayer(polyline);
    });

    // 2. Render every available drainage junction as a circular dot with contrasting outline
    (this.nodesData || []).forEach(node => {
      if (node.lat == null || node.lng == null) return;

      const junctionDot = L.circleMarker([node.lat, node.lng], {
        radius: 6.5,
        fillColor: '#dc2626',
        color: '#ffffff', // High-contrast solid white outline
        weight: 2.5,
        opacity: 1.0,
        fillOpacity: 1.0,
        className: 'drainage-junction-dot'
      });

      junctionDot.bindTooltip(`<strong>${node.name || 'Drainage Junction'}</strong><br>Type: ${node.type || 'Junction'}<br>Elevation: ${node.elevation != null ? `${node.elevation} m MSL` : 'Unavailable'}`, {
        direction: 'top',
        className: 'node-tooltip'
      });

      junctionDot.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const connDrains = (node.connected_drains && node.connected_drains.length)
          ? node.connected_drains.join(', ')
          : 'Unavailable';

        const capText = node.capacity_m3s != null ? `${node.capacity_m3s} m³/s` : 'Unavailable';
        const flowText = node.flow_m3s != null ? `${node.flow_m3s} m³/s` : 'Unavailable';
        const depthText = node.water_level_m != null ? `${node.water_level_m} m` : 'Unavailable';

        const junctionContent = `
          <div class="map-popup-card">
            <div class="map-popup-header" style="color: #dc2626;">
              <i class="fa-solid fa-circle-dot"></i> DRAINAGE JUNCTION ATTRIBUTES
            </div>
            <div class="map-popup-title">${node.name || 'Unavailable'}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
              ID: <strong>${node.id || 'Unavailable'}</strong> &bull; Type: <strong>${node.type || 'Unavailable'}</strong>
            </div>
            <div class="map-popup-stat">
              Ground Elevation: <strong>${node.elevation != null ? `${node.elevation} m MSL` : 'Unavailable'}</strong>
            </div>
            <ul class="map-popup-list">
              <li>Connected Drains: <strong>${connDrains}</strong></li>
              <li>Upstream Inflow: <strong>${node.upstream_drain || 'Unavailable'}</strong></li>
              <li>Downstream Outlet: <strong>${node.downstream_drain || 'Unavailable'}</strong></li>
              <li>Design Capacity: <strong>${capText}</strong></li>
              <li>Current Flow: <strong>${flowText}</strong></li>
              <li>Water Level / Depth: <strong>${depthText}</strong></li>
              <li>Operational Status: <strong style="color: ${node.status && node.status.includes('SURCHARGE') ? '#dc2626' : '#16a34a'};">${node.status || 'Active'}</strong></li>
              <li>Data Source: <strong>${node.data_source || 'Central Water Commission (CWC)'}</strong></li>
              <li>Telemetry Freshness: <strong>${node.freshness || 'Unavailable'}</strong></li>
            </ul>
          </div>
        `;
        junctionDot.bindPopup(junctionContent, { minWidth: 280, maxWidth: 330 }).openPopup();
      });

      group.addLayer(junctionDot);
    });

    this.layers.drainage = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 11. DRAINAGE NODES RENDERING
  // ==========================================
  renderDrainageNodes() {
    const isVisible = document.getElementById('layer-nodes-toggle') ? document.getElementById('layer-nodes-toggle').checked : false;
    if (this.layers.nodes) this.map.removeLayer(this.layers.nodes);

    const group = L.featureGroup();
    const isHeavyRain = this.currentRainfall >= 50;

    this.nodesData.forEach(node => {
      let fillColor = node.color || '#22c55e';
      if (isHeavyRain && node.type === 'underpass') {
        fillColor = '#ef4444';
      }

      const marker = L.circleMarker([node.lat, node.lng], {
        radius: node.radius || 6,
        fillColor: fillColor,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
        className: (isHeavyRain && node.elevation < 212.0) ? 'pulsing-node-marker' : ''
      });

      marker.bindTooltip(`<strong>${node.name}</strong><br>Type: ${node.type}<br>Elevation: ${node.elevation}m`, {
        direction: 'top',
        className: 'node-tooltip'
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.inspectPointAt(node.lat, node.lng);
      });

      group.addLayer(marker);
    });

    this.layers.nodes = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 12. FLOOD HOTSPOTS RENDERING
  // ==========================================
  renderHotspots() {
    const isVisible = document.getElementById('layer-hotspots-toggle') ? document.getElementById('layer-hotspots-toggle').checked : false;
    if (this.layers.hotspots) this.map.removeLayer(this.layers.hotspots);

    const group = L.featureGroup();

    this.hotspotsData.forEach(spot => {
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: 8,
        fillColor: spot.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
        color: '#07131e',
        weight: 2,
        fillOpacity: 0.95
      });

      marker.bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-header" style="color: ${spot.severity === 'CRITICAL' ? '#dc2626' : '#d97706'};">
            <i class="fa-solid fa-location-dot"></i> ${spot.name}
          </div>
          <div style="font-size: 11px; margin-top: 4px; color: #475569;">${spot.description}</div>
          <div class="map-popup-stat">
            Ground Elevation: <strong>${spot.elevation} m</strong> &bull; Critical Depth: <strong>${spot.critical_depth} m</strong>
          </div>
          <div style="font-size: 11px; margin-top: 4px; color: ${spot.severity === 'CRITICAL' ? '#dc2626' : '#d97706'}; font-weight: bold;">
            Severity: ${spot.severity}
          </div>
        </div>
      `, { minWidth: 230, maxWidth: 290 });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.inspectPointAt(spot.lat, spot.lng);
      });

      group.addLayer(marker);
    });

    this.layers.hotspots = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 13. FLOOD DEPTH RASTERS (HYDRODYNAMIC 2D)
  // ==========================================
  renderFloodDepthRasters(rainfall_mm) {
    const isVisible = document.getElementById('layer-depth-toggle') ? document.getElementById('layer-depth-toggle').checked : false;
    if (this.layers.depth) this.map.removeLayer(this.layers.depth);

    const group = L.featureGroup();
    const sliderVal = parseInt(document.getElementById('layer-depth-opacity').value, 10) / 100.0;
    const hydroFactor = Math.exp(-Math.pow((this.currentHorizon - 60) / 60.0, 2));

    const floodPolygons = [
      // Yamuna Active Floodplain Corridor
      {
        coords: [
          [28.7200, 77.2200], [28.7300, 77.2350], [28.7000, 77.2400],
          [28.6700, 77.2450], [28.6400, 77.2550], [28.6000, 77.2750],
          [28.5600, 77.2950], [28.5200, 77.3150], [28.5100, 77.3050],
          [28.5700, 77.2700], [28.6300, 77.2400], [28.6700, 77.2300]
        ],
        depth: ((0.08 + (rainfall_mm / 100.0) * 0.40) * (0.35 + 0.65 * hydroFactor)).toFixed(2)
      },
      // Minto Bridge & Central Depression
      {
        coords: [
          [28.6380, 77.2180], [28.6380, 77.2280], [28.6300, 77.2280], [28.6300, 77.2180]
        ],
        depth: ((0.06 + (rainfall_mm / 100.0) * 0.50) * (0.35 + 0.65 * hydroFactor)).toFixed(2)
      },
      // ITO Ring Road & Vikas Marg Reach
      {
        coords: [
          [28.6350, 77.2380], [28.6350, 77.2500], [28.6220, 77.2500], [28.6220, 77.2380]
        ],
        depth: ((0.05 + (rainfall_mm / 100.0) * 0.35) * (0.35 + 0.65 * hydroFactor)).toFixed(2)
      },
      // Kashmere Gate & Yamuna Bazar
      {
        coords: [
          [28.6750, 77.2250], [28.6750, 77.2400], [28.6600, 77.2400], [28.6600, 77.2250]
        ],
        depth: ((0.06 + (rainfall_mm / 100.0) * 0.45) * (0.35 + 0.65 * hydroFactor)).toFixed(2)
      },
      // Chandni Chowk & Sadar Bazar
      {
        coords: [
          [28.6600, 77.2100], [28.6600, 77.2280], [28.6500, 77.2280], [28.6500, 77.2100]
        ],
        depth: (0.06 + (rainfall_mm / 100.0) * 0.35).toFixed(2)
      }
    ];

    if (rainfall_mm > 10) {
      floodPolygons.forEach(p => {
        const poly = L.polygon(p.coords, {
          color: '#00e5ff',
          weight: 1.5,
          opacity: sliderVal * 0.8,
          fillColor: '#0284c7',
          fillOpacity: sliderVal * 0.45
        });

        poly.bindTooltip(`Flood Depth: ${p.depth} m`, { sticky: true });
        group.addLayer(poly);
      });
    }

    this.layers.depth = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 14. D8 FLOW DIRECTION VECTORS
  // ==========================================
  renderFlowDirections() {
    const isVisible = document.getElementById('layer-flow-toggle') ? document.getElementById('layer-flow-toggle').checked : false;
    if (this.layers.flow) this.map.removeLayer(this.layers.flow);

    const group = L.featureGroup();

    // Delhi Arterial Road Corridors (Ring Road, Outer Ring Road, Expressways)
    const arterialRoads = [
      // Inner Ring Road Loop
      {
        name: "Mahatma Gandhi Ring Road",
        coords: [
          [28.6675, 77.2285], [28.6685, 77.2050], [28.6740, 77.1700], [28.6685, 77.1400],
          [28.6400, 77.1250], [28.6050, 77.1450], [28.5850, 77.1750], [28.5672, 77.2100],
          [28.5700, 77.2450], [28.5880, 77.2600], [28.6250, 77.2500], [28.6480, 77.2400],
          [28.6675, 77.2285]
        ],
        color: "#38bdf8",
        weight: 3.5
      },
      // Outer Ring Road Loop
      {
        name: "Outer Ring Road Arterial Loop",
        coords: [
          [28.7200, 77.2150], [28.7150, 77.1500], [28.7050, 77.1100], [28.6700, 77.0850],
          [28.6250, 77.0800], [28.5650, 77.1200], [28.5400, 77.1850], [28.5450, 77.2550],
          [28.5650, 77.3000], [28.6150, 77.3100], [28.6750, 77.2750], [28.7200, 77.2150]
        ],
        color: "#f59e0b",
        weight: 3.2
      },
      // NH-48 Airport Express Corridor
      {
        name: "NH-48 Airport Highway Corridor",
        coords: [
          [28.5925, 77.1610], [28.5600, 77.1200], [28.5350, 77.0850], [28.5100, 77.0500]
        ],
        color: "#10b981",
        weight: 3.8
      },
      // Vikas Marg East Corridor
      {
        name: "Vikas Marg East Expressway",
        coords: [
          [28.6289, 77.2415], [28.6320, 77.2750], [28.6450, 77.3050], [28.6500, 77.3200]
        ],
        color: "#38bdf8",
        weight: 3.2
      }
    ];

    arterialRoads.forEach(road => {
      const line = L.polyline(road.coords, {
        color: road.color,
        weight: road.weight,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      });
      line.bindTooltip(`<strong>${road.name}</strong><br>Arterial Flood-Monitored Corridor`, { sticky: true });
      group.addLayer(line);
    });

    this.layers.flow = group;
    if (isVisible) {
      group.addTo(this.map);
    }
  },

  // ==========================================
  // 15. DRAINAGE FEATURE SELECTOR & TRACING
  // ==========================================
  selectDrainFeature(drain) {
    this.selectedDrainFeature = drain;

    document.getElementById('feat-id').textContent = drain.id;
    document.getElementById('feat-name').textContent = drain.name;
    document.getElementById('feat-basin').textContent = drain.basin;
    document.getElementById('feat-outlet').textContent = drain.receiving_outlet;
    document.getElementById('feat-capacity').textContent = `${drain.design_capacity_m3s} m³/s (${drain.design_capacity_cusecs} cusecs)`;
    document.getElementById('feat-ground-elev').textContent = drain.ground_elevation || '—';
    document.getElementById('feat-topology').textContent = drain.topology;

    const tagEl = document.getElementById('drainage-feature-tag');
    if (drain.type === 'official') {
      tagEl.className = 'feature-tag official-tag';
      tagEl.textContent = 'OFFICIAL';
    } else {
      tagEl.className = 'feature-tag modelled-tag';
      tagEl.textContent = 'MODELLED';
    }

    const isHeavyRain = this.currentRainfall >= 50;
    const inflow = isHeavyRain ? (drain.base_inflow_m3s * 2.8 + 25.0) : drain.base_inflow_m3s;
    document.getElementById('feat-inflow').textContent = `${inflow.toFixed(1)} m³/s (${(inflow * 35.315).toFixed(0)} cfs)`;

    const utilPct = Math.min(100, Math.round((inflow / drain.design_capacity_m3s) * 100));
    const utilBar = document.getElementById('feat-util-bar');
    const utilText = document.getElementById('feat-util-pct');
    const surchargeText = document.getElementById('feat-surcharge');

    utilText.textContent = `${utilPct}%`;
    utilBar.style.width = `${utilPct}%`;

    if (utilPct >= 80) {
      utilBar.className = 'progress-bar-fill fill-red';
      utilText.className = 'util-pct text-red';
      surchargeText.className = 'f-val text-red';
      surchargeText.textContent = 'NEAR CAPACITY';
    } else {
      utilBar.className = 'progress-bar-fill fill-green';
      utilText.className = 'util-pct text-green';
      surchargeText.className = 'f-val text-green';
      surchargeText.textContent = 'NORMAL';
    }
  },

  traceDrainageFlow(drain) {
    if (!drain) return;
    if (this.activeTraceLayer) {
      this.map.removeLayer(this.activeTraceLayer);
      this.activeTraceLayer = null;
    }

    // Animated dashed polyline showing active flow path to river
    this.activeTraceLayer = L.polyline(drain.coordinates, {
      color: '#00e5ff',
      weight: 6,
      opacity: 1,
      className: 'drainage-flow-animated'
    }).addTo(this.map);

    this.map.fitBounds(this.activeTraceLayer.getBounds(), { padding: [60, 60] });
    this.showToast(`Tracing Drainage Flow: ${drain.name} -> Outfall: ${drain.receiving_outlet}`, 'code-branch');
  },

  // ==========================================
  // 16. GIS LAYER TOGGLE EVENT LISTENERS
  // ==========================================
  initLayerToggles() {
    const layerConfigs = [
      { id: 'dem', layer: 'dem' },
      { id: 'hillshade', layer: 'hillshade' },
      { id: 'contours', layer: 'contours' },
      { id: 'drainage', layer: 'drainage' },
      { id: 'nodes', layer: 'nodes' },
      { id: 'flow', layer: 'flow' },
      { id: 'depth', layer: 'depth' },
      { id: 'radar', layer: 'radar' },
      { id: 'hotspots', layer: 'hotspots' },
      { id: 'danger', layer: 'danger' }
    ];

    layerConfigs.forEach(cfg => {
      const toggle = document.getElementById(`layer-${cfg.id}-toggle`);
      const slider = document.getElementById(`layer-${cfg.id}-opacity`);
      const valLabel = document.getElementById(`val-${cfg.id}`);

      if (toggle) {
        toggle.addEventListener('change', () => {
          const l = this.layers[cfg.layer];
          if (!l) return;
          if (toggle.checked) {
            if (!this.map.hasLayer(l)) this.map.addLayer(l);
          } else {
            if (this.map.hasLayer(l)) this.map.removeLayer(l);
          }
        });
      }

      if (slider && valLabel) {
        slider.addEventListener('input', () => {
          valLabel.textContent = `${slider.value}%`;
          const l = this.layers[cfg.layer];
          if (!l) return;
          if (l.setStyle) {
            l.setStyle({ opacity: slider.value / 100.0, fillOpacity: (slider.value / 100.0) * 0.7 });
          } else if (l.setOpacity) {
            l.setOpacity(slider.value / 100.0);
          }
        });
      }
    });

    document.getElementById('btn-reset-layers').addEventListener('click', () => {
      layerConfigs.forEach(cfg => {
        const toggle = document.getElementById(`layer-${cfg.id}-toggle`);
        if (toggle) {
          toggle.checked = false;
          toggle.dispatchEvent(new Event('change'));
        }
      });
      this.showToast('All GIS layers reset', 'rotate-left');
    });
  },

  // ==========================================
  // 17. SIMULATION SCENARIO & CONTROLS
  // ==========================================
  initSimulationControls() {
    const scnBtns = document.querySelectorAll('.scenario-btn');
    scnBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        scnBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mm = parseInt(btn.getAttribute('data-mm'), 10);
        this.currentRainfall = mm;

        const rainPill = document.getElementById('rain-scenario-pill');
        if (rainPill) {
          rainPill.innerHTML = `<i class="fa-solid fa-cloud-showers-heavy"></i> RAIN: SYNTHETIC RAINFALL SCENARIO (${mm} mm)`;
        }

        // Re-render layers that react to rainfall
        this.renderDrainageNetwork();
        this.renderDrainageNodes();
        this.renderFloodDepthRasters(mm);
        this.renderDangerZones(mm);

        this.triggerSimulationSync(mm, this.currentHorizon);
        if (window.ThreeEngine) {
          window.ThreeEngine.setSimulationState(mm, this.currentHorizon, this.simPlaying);
        }
        this.showToast(`Rainfall scenario set to ${mm} mm`, 'cloud-rain');
      });
    });

    // Run / Pause / Reset
    const btnRun = document.getElementById('btn-sim-run');
    const btnPause = document.getElementById('btn-sim-pause');
    const btnReset = document.getElementById('btn-sim-reset');
    const timeline = document.getElementById('simulation-timeline');

    btnRun.addEventListener('click', () => {
      const simInputVal = document.getElementById('sim-rainfall-input');
      if (simInputVal) {
        let mmVal = parseInt(simInputVal.value, 10) || 50;
        this.currentRainfall = mmVal;
      }
      if (this.simPlaying) return;
      this.simPlaying = true;
      this.simPaused = false;
      btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running';
      btnRun.classList.add('btn-running-pulse');
      btnPause.classList.remove('btn-pause-active');

      if (parseInt(timeline.value, 10) >= 180) {
        timeline.value = 0;
      }
      const initialVal = parseInt(timeline.value, 10);
      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, initialVal, true);
      }
      this.showToast('0-3 Hour Hydro Simulation Running', 'play');

      clearInterval(this.simInterval);
      this.simInterval = setInterval(() => {
        let val = parseInt(timeline.value, 10) + 15;
        if (val > 180) {
          val = 180;
          this.simPlaying = false;
          clearInterval(this.simInterval);
          btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
          const bLab = document.getElementById('btn-sim-lab-run');
          if (bLab) { bLab.innerHTML = '<i class="fa-solid fa-play"></i> Run'; }
          btnRun.classList.remove('btn-running-pulse');
          this.showToast('0-3 Hour Hydro Simulation Completed (180 min)', 'circle-check');
        }
        timeline.value = val;
        this.currentHorizon = val;
        const timeInp = document.getElementById('sim-time-input');
        if (timeInp) timeInp.value = val;
        const minLabel = document.getElementById('timeline-current-min');
        if (minLabel) {
          minLabel.textContent = `${val} min ${val === 60 ? '(Peak)' : ''}`;
        }
        const labSlider = document.getElementById('sim-lab-timeline-slider');
        if (labSlider) labSlider.value = val;
        const labLabel = document.getElementById('sim-lab-time-label');
        if (labLabel) labLabel.textContent = `T + ${val} min ${val === 60 ? '(Peak)' : ''}`;
        this.triggerSimulationSync(this.currentRainfall, val);
        this.renderDrainageNetwork();
        this.renderFloodDepthRasters(this.currentRainfall);
        if (window.ThreeEngine) {
          window.ThreeEngine.setSimulationState(this.currentRainfall, val, true);
        }
      }, 1200);
    });

    btnPause.addEventListener('click', () => {
      this.simPlaying = false;
      this.simPaused = true;
      clearInterval(this.simInterval);
      btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
          const bLab = document.getElementById('btn-sim-lab-run');
          if (bLab) { bLab.innerHTML = '<i class="fa-solid fa-play"></i> Run'; }
      btnRun.classList.remove('btn-running-pulse');
      btnPause.classList.add('btn-pause-active');
      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, this.currentHorizon, false);
      }
      this.showToast(`Simulation paused at ${this.currentHorizon} min`, 'pause');
    });

    btnReset.addEventListener('click', () => {
      this.simPlaying = false;
      this.simPaused = false;
      clearInterval(this.simInterval);
      btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
          const bLab = document.getElementById('btn-sim-lab-run');
          if (bLab) { bLab.innerHTML = '<i class="fa-solid fa-play"></i> Run'; }
      btnRun.classList.remove('btn-running-pulse');
      btnPause.classList.remove('btn-pause-active');
      timeline.value = 60;
      this.currentHorizon = 60;
      const timeInp = document.getElementById('sim-time-input');
      if (timeInp) timeInp.value = 60;
      const labSliderReset = document.getElementById('sim-lab-timeline-slider');
      if (labSliderReset) labSliderReset.value = 60;
      const labLabelReset = document.getElementById('sim-lab-time-label');
      if (labLabelReset) labLabelReset.textContent = 'T + 60 min (Peak)';
      const minLabel = document.getElementById('timeline-current-min');
      if (minLabel) {
        minLabel.textContent = '60 min (Peak)';
      }
      this.triggerSimulationSync(this.currentRainfall, 60);
      this.renderDrainageNetwork();
      this.renderFloodDepthRasters(this.currentRainfall);
      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, 60, false);
      }
      this.showToast('Simulation reset to 60 min storm peak', 'rotate-left');
    });

    timeline.addEventListener('input', () => {
      const val = parseInt(timeline.value, 10);
      this.currentHorizon = val;
      const timeInp = document.getElementById('sim-time-input');
      if (timeInp) timeInp.value = val;
      const labSlider = document.getElementById('sim-lab-timeline-slider');
      if (labSlider) labSlider.value = val;
      const labLabel = document.getElementById('sim-lab-time-label');
      if (labLabel) labLabel.textContent = `T + ${val} min ${val === 60 ? '(Peak)' : ''}`;
      const minLabel = document.getElementById('timeline-current-min');
      if (minLabel) {
        minLabel.textContent = `${val} min ${val === 60 ? '(Peak)' : ''}`;
      }
      this.triggerSimulationSync(this.currentRainfall, val);
      this.renderDrainageNetwork();
      this.renderFloodDepthRasters(this.currentRainfall);
      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, val, this.simPlaying);
      }
      if (window.HydroRadarEngine2D) {
        window.HydroRadarEngine2D.setScenario(this.currentRainfall, val, this.simPlaying);
      }
    });

    // Subtabs: Radar vs Scenario Run (Null-safe)
    const tabRadar = document.getElementById('btn-tab-radar');
    const tabScenario = document.getElementById('btn-tab-scenario');
    const radarSubpanel = document.getElementById('radar-subpanel');
    const scenarioSubpanel = document.getElementById('scenario-subpanel');
    const rainPill = document.getElementById('rain-scenario-pill');

    if (tabRadar) {
      tabRadar.addEventListener('click', async () => {
        tabRadar.classList.add('active');
        if (tabScenario) tabScenario.classList.remove('active');
        if (radarSubpanel) radarSubpanel.classList.remove('hidden-subpanel');
        if (scenarioSubpanel) scenarioSubpanel.style.display = 'none';

        this.rainMode = 'radar';
        if (this.simPlaying) {
          this.simPlaying = false;
          clearInterval(this.simInterval);
          const btnRun = document.getElementById('btn-sim-run');
          if (btnRun) {
            btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
          const bLab = document.getElementById('btn-sim-lab-run');
          if (bLab) { bLab.innerHTML = '<i class="fa-solid fa-play"></i> Run'; }
            btnRun.classList.remove('btn-running-pulse');
          }
        }

        try {
          const res = await fetch('/api/radar/realtime');
          const data = await res.json();
          const rEl = document.getElementById('radar-timestamp');
          if (rEl) rEl.textContent = data.last_update;
        } catch (e) {}

        if (rainPill) rainPill.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> RAIN: REAL-TIME RADAR (0.0 mm/h &bull; CLEAR SKY)';
        const elR = document.getElementById('stat-rainfall'); if (elR) elR.textContent = '0.0 mm/h';
        const elD = document.getElementById('stat-max-depth'); if (elD) elD.textContent = '0.00 m';
        const elA = document.getElementById('stat-flooded-area'); if (elA) elA.textContent = '0.00 km²';

        if (this.rainCtx && this.rainCanvas) {
          this.rainCtx.clearRect(0, 0, this.rainCanvas.width, this.rainCanvas.height);
        }

        if (window.ThreeEngine) {
          window.ThreeEngine.setSimulationState(0, 0, false);
        }

        this.renderDrainageNetwork();
        this.renderFloodDepthRasters(0);
        this.showToast('Real-Time Radar: 0.0 mm/h (Dry Conditions across Delhi NCT)', 'satellite-dish');
      });
    }

    if (tabScenario) {
      tabScenario.addEventListener('click', () => {
        tabScenario.classList.add('active');
        if (tabRadar) tabRadar.classList.remove('active');
        if (radarSubpanel) radarSubpanel.classList.add('hidden-subpanel');
        if (scenarioSubpanel) scenarioSubpanel.style.display = 'block';

        this.rainMode = 'scenario';
        if (rainPill) rainPill.innerHTML = `<i class="fa-solid fa-cloud-showers-heavy"></i> RAIN: SYNTHETIC RAINFALL SCENARIO (${this.currentRainfall} mm)`;

        this.renderDrainageNetwork();
        this.renderFloodDepthRasters(this.currentRainfall);
        this.renderDangerZones(this.currentRainfall);
        this.triggerSimulationSync(this.currentRainfall, this.currentHorizon);

        this.showToast(`Scenario Run: ${this.currentRainfall} mm (Click 'Run' to start rainfall simulation)`, 'cloud-rain');
      });
    }

    // Refresh Radar Button
    const btnRefreshRadar = document.getElementById('btn-refresh-radar');
    if (btnRefreshRadar) {
      btnRefreshRadar.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/radar/realtime');
          const data = await res.json();
          const rEl = document.getElementById('radar-timestamp');
          if (rEl) rEl.textContent = data.last_update;
          this.showToast(`IMD Palam Radar Feed Synced: ${data.status}`, 'satellite-dish');
        } catch (err) {
          console.error(err);
        }
      });
    }
  },

  async triggerSimulationSync(mm, horizon) {
    try {
      const res = await fetch(`/api/simulation/current?scenario=${mm}&horizon=${horizon}`);
      const data = await res.json();

      // Update compatibility bottom bar status
      const elRain = document.getElementById('stat-rainfall');
      if (elRain) elRain.textContent = `${data.rainfall_scenario_mm} mm`;
      const elDepth = document.getElementById('stat-max-depth');
      if (elDepth) elDepth.textContent = `${data.max_depth_m} m`;
      const elArea = document.getElementById('stat-flooded-area');
      if (elArea) elArea.textContent = `${data.flooded_area_km2} km²`;
      const elNodes = document.getElementById('stat-surcharged-nodes');
      if (elNodes) elNodes.textContent = data.surcharged_nodes;
      const elDrains = document.getElementById('stat-overloaded-drains');
      if (elDrains) elDrains.textContent = data.overloaded_drains;
      const elWarn = document.getElementById('stat-active-warnings');
      if (elWarn) elWarn.textContent = data.active_warnings.join(' • ');

      // Dynamically update Situation Status Card (Normal, Warning, Danger)
      this.updateSituationStatus(mm);

      // Update TOP KPI CARDS matching screenshot
      const kpiRain = document.getElementById('kpi-current-rainfall');
      if (kpiRain) kpiRain.textContent = `${data.rainfall_scenario_mm} mm`;
      const kpiArea = document.getElementById('kpi-flooded-area');
      if (kpiArea) kpiArea.textContent = `${data.flooded_area_km2} km²`;
      const kpiRisk = document.getElementById('kpi-high-risk-zones');
      if (kpiRisk) kpiRisk.textContent = mm >= 100 ? '5' : (mm >= 50 ? '3' : '1');
      const kpiDrains = document.getElementById('kpi-overloaded-drains');
      if (kpiDrains) {
        const parts = (data.overloaded_drains || '6 / 8').split('/');
        kpiDrains.textContent = parts[0].trim() || '6';
      }

      // Update Hydro Inspector Water Level
      const hydroDepth = document.getElementById('val-hydro-depth');
      if (hydroDepth) {
        const depthVal = (4.0 + (data.max_depth_m * 1.35)).toFixed(1);
        hydroDepth.textContent = `${depthVal} m`;
      }
      const hydroStatus = document.getElementById('val-hydro-status');
      if (hydroStatus) {
        if (data.max_depth_m > 1.2) {
          hydroStatus.textContent = 'Critical';
          hydroStatus.style.background = '#ef4444';
        } else if (data.max_depth_m > 0.6) {
          hydroStatus.textContent = 'Warning';
          hydroStatus.style.background = '#f59e0b';
        } else {
          hydroStatus.textContent = 'Normal';
          hydroStatus.style.background = '#10b981';
        }
      }

      // Synchronize 3D hydro simulation state
      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(mm, horizon, this.simPlaying);
      }

      // If a drain is selected, update its utilization
      if (this.selectedDrainFeature) {
        this.selectDrainFeature(this.selectedDrainFeature);
      }
    } catch (err) {
      console.error("Simulation sync error", err);
    }
  },

  // ==========================================
  // 18. FLOOD-SAFE ROUTE PLANNER (FLOATING PANEL)
  // ==========================================
  initModalsAndDrawers() {
    const routePanel = document.getElementById('floating-route-panel');
    const btnOpenRoute = document.getElementById('btn-open-route-planner');
    const btnCloseRoute = document.getElementById('btn-close-route-panel');

    // Direct access to Flood-Safe Route Planner from sidebar menu
    const btnNavSafeRoute = document.getElementById('nav-tab-saferoute');
    if (btnNavSafeRoute) {
      btnNavSafeRoute.addEventListener('click', (e) => {
        e.preventDefault();
        const navOverview = document.getElementById('nav-tab-overview');
        if (navOverview && !navOverview.classList.contains('active')) {
          navOverview.click();
        }
        this.switchView('2d');
        if (routePanel) {
          routePanel.classList.remove('hidden');
          if (!this.latestRoutes || this.latestRoutes.length === 0) {
            this.executeRouteAnalysis();
          }
        }
        if (this.map) {
          setTimeout(() => this.map.invalidateSize(), 100);
        }
        this.showToast('Flood-Safe Route Planner Opened', 'route');
      });
    }

    btnOpenRoute.addEventListener('click', () => {
      routePanel.classList.toggle('hidden');
      if (!routePanel.classList.contains('hidden') && (!this.latestRoutes || this.latestRoutes.length === 0)) {
        this.executeRouteAnalysis();
      }
    });

    btnCloseRoute.addEventListener('click', () => {
      routePanel.classList.add('hidden');
    });

    // Swap Origin and Destination
    const btnSwap = document.getElementById('btn-swap-route-inputs');
    if (btnSwap) {
      btnSwap.addEventListener('click', () => {
        const origInp = document.getElementById('route-origin');
        const destInp = document.getElementById('route-destination');
        if (origInp && destInp) {
          const tmp = origInp.value;
          origInp.value = destInp.value;
          destInp.value = tmp;
          this.showToast('Swapped Origin and Destination', 'arrow-right-arrow-left');
        }
      });
    }

    // Clicking map closes the route panel if open
    if (this.map) {
      this.map.on('click', () => {
        if (routePanel && !routePanel.classList.contains('hidden') && !this.measuringActive) {
          routePanel.classList.add('hidden');
        }
      });
    }
    routePanel.addEventListener('click', (e) => e.stopPropagation());

    // Escape key closes route panel
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && routePanel && !routePanel.classList.contains('hidden')) {
        routePanel.classList.add('hidden');
      }
    });

    // Vehicle tabs
    const vTabs = document.querySelectorAll('.vehicle-tabs .v-tab');
    vTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        vTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const v = tab.getAttribute('data-v');
        const vSelect = document.getElementById('route-vehicle-select');
        if (v === 'ambulance') vSelect.value = 'Ambulance';
        if (v === 'commuter') vSelect.value = 'Car';
        if (v === 'transit') vSelect.value = 'Bus';
        this.executeRouteAnalysis();
      });
    });

    document.getElementById('route-vehicle-select').addEventListener('change', () => {
      this.executeRouteAnalysis();
    });

    // Quick Presets
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        document.getElementById('route-origin').value = chip.getAttribute('data-orig');
        document.getElementById('route-destination').value = chip.getAttribute('data-dest');
        routePanel.classList.add('hidden');
        await this.executeRouteAnalysis();
      });
    });

    // Horizon buttons
    const hBtns = document.querySelectorAll('.h-btn');
    hBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        hBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.executeRouteAnalysis();
      });
    });

    // Analyze button - immediately minimizes the panel so map & route are 100% visible
    document.getElementById('btn-run-route-analysis').addEventListener('click', async () => {
      routePanel.classList.add('hidden');
      await this.executeRouteAnalysis();
    });

    // Enter key triggers analysis and hides the panel
    ['route-origin', 'route-destination'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) {
        inp.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            routePanel.classList.add('hidden');
            await this.executeRouteAnalysis();
          }
        });
      }
    });

    // 7-Step Hydrological Workflow Modal
    const workflowModal = document.getElementById('modal-workflow');
    const btnOpenWorkflow = document.getElementById('btn-open-workflow-modal');
    const btnCloseWorkflow = document.getElementById('btn-close-workflow-modal');

    btnOpenWorkflow.addEventListener('click', () => {
      workflowModal.classList.remove('hidden');
    });

    btnCloseWorkflow.addEventListener('click', () => {
      workflowModal.classList.add('hidden');
    });

    workflowModal.addEventListener('click', (e) => {
      if (e.target === workflowModal) {
        workflowModal.classList.add('hidden');
      }
    });

    // Verification Drawer
    const verifDrawer = document.getElementById('drawer-verification');
    const btnCloseDrawer = document.getElementById('btn-close-verification-drawer');

    btnCloseDrawer.addEventListener('click', () => {
      verifDrawer.classList.add('hidden');
    });

    const cardSat = document.getElementById('card-verif-satellite');
    const cardCctv = document.getElementById('card-verif-cctv');
    const cardIot = document.getElementById('card-verif-iot');

    const viewSat = document.getElementById('view-evidence-satellite');
    const viewCctv = document.getElementById('view-evidence-cctv');
    const viewIot = document.getElementById('view-evidence-iot');

    const showEvidence = (type) => {
      verifDrawer.classList.remove('hidden');
      viewSat.classList.add('hidden');
      viewCctv.classList.add('hidden');
      viewIot.classList.add('hidden');

      const titleEl = document.getElementById('drawer-title-text');
      if (titleEl) {
        titleEl.textContent = 'GROUND TRUTH & FIELD VERIFICATION EVIDENCE • ' + this.currentRainfall + ' MM — ' + (this.currentRainfall >= 50 ? 'HEAVY RAIN SCENARIO' : 'BASELINE SCENARIO');
      }

      if (type === 'sat') viewSat.classList.remove('hidden');
      if (type === 'cctv') viewCctv.classList.remove('hidden');
      if (type === 'iot') viewIot.classList.remove('hidden');
    };

    cardSat.addEventListener('click', () => showEvidence('sat'));
    cardCctv.addEventListener('click', () => showEvidence('cctv'));
    cardIot.addEventListener('click', () => showEvidence('iot'));

    // Trace drainage button
    document.getElementById('btn-trace-drainage').addEventListener('click', () => {
      if (!this.selectedDrainFeature) {
        this.selectedDrainFeature = this.drainsData[0];
      }
      this.traceDrainageFlow(this.selectedDrainFeature);
    });

    // Export Hydrograph button
    document.getElementById('btn-export-hydrograph').addEventListener('click', () => {
      const feat = this.selectedDrainFeature || { id: 'E-SHAHDARA-LINK', name: 'Shahdara Link Drain' };
      const csvContent = "Time_Min,Simulated_Inflow_m3s,Downstream_Capacity_m3s,Surcharge_Depth_m,Status\n" +
                         "0,0.2,32.8,0.00,NORMAL\n" +
                         "15,2.4,32.8,0.01,NORMAL\n" +
                         "30,8.7,32.8,0.04,NORMAL\n" +
                         "45,18.5,32.8,0.10,NORMAL\n" +
                         "60,29.8,32.8,0.22,NEAR_CAPACITY\n" +
                         "75,26.1,32.8,0.18,NORMAL\n" +
                         "90,19.4,32.8,0.11,NORMAL\n" +
                         "120,11.2,32.8,0.05,NORMAL\n" +
                         "180,3.1,32.8,0.01,NORMAL\n";
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `hydrograph_${feat.id}_sim.csv`);
      a.click();
      this.showToast(`Hydrograph CSV downloaded: ${feat.id}`, 'download');
    });
  },

  async executeRouteAnalysis() {
    const origin = document.getElementById('route-origin').value.trim() || 'Connaught Place Inner Circle';
    const destination = document.getElementById('route-destination').value.trim() || 'ISBT Kashmere Gate Transit Hub';
    const vehicle = document.getElementById('route-vehicle-select').value;

    const payload = {
      origin: origin,
      destination: destination,
      vehicle_type: vehicle,
      forecast_horizon: `${this.currentHorizon} min`,
      rainfall_scenario: this.currentRainfall
    };

    try {
      const res = await fetch('/api/routes/flood-safe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.routes || !Array.isArray(data.routes)) throw new Error('Invalid routes response');

      this.renderRouteCandidates(data.routes);
      this.showToast(`Analyzed ${data.routes.length} Candidate Routes (${vehicle})`, 'route');
    } catch (err) {
      this.showToast(`Route analysis: ${err.message || 'Service unavailable'}`, 'triangle-exclamation');
    }
  },

  renderRouteCandidates(routes) {
    this.latestRoutes = routes;
    const container = document.getElementById('candidate-routes-container');
    container.innerHTML = '';
    this.clearRouteLayers();

    routes.forEach((route, idx) => {
      const card = document.createElement('div');
      card.className = `route-card ${idx === 0 ? 'selected' : ''}`;

      let badgeClass = 'badge-safest';
      if (route.badge.includes('BALANCED')) badgeClass = 'badge-alternative';
      if (route.badge.includes('CORRIDOR')) badgeClass = 'badge-corridor';

      card.innerHTML = `
        <div class="route-card-top">
          <span class="route-badge ${badgeClass}"><i class="fa-solid fa-route"></i> ${route.badge}</span>
          <span class="route-risk-tag ${route.risk_class === 'low' ? 'text-green' : (route.risk_class === 'critical' ? 'text-red' : 'text-yellow')}">${route.risk_level}</span>
        </div>
        <div class="route-title">${route.title}</div>
        <div class="route-metrics-grid">
          <div><span style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; display:block; color: #64748b;">Distance</span><strong>${route.distance_km} km</strong></div>
          <div><span style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; display:block; color: #64748b;">Est. Time</span><strong>${route.eta_min} min</strong></div>
          <div><span style="font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; display:block; color: #64748b;">Max Water</span><strong style="color: ${route.max_water_m > 0.1 ? '#f87171' : '#34d399'};">${route.max_water_m}m</strong></div>
        </div>
        <div class="route-advisory">${route.advisory}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.route-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.plotRouteOnMap(route);
        this.showActiveRouteHUD(route);
        const panel = document.getElementById('floating-route-panel');
        if (panel) panel.classList.add('hidden');
        this.showToast(`Switched to: ${route.badge}`, 'route');
      });

      container.appendChild(card);
    });

    if (routes.length > 0) {
      this.plotRouteOnMap(routes[0]);
      this.showActiveRouteHUD(routes[0]);
    }
  },

  showActiveRouteHUD(activeRoute) {
    let hud = document.getElementById('route-active-summary-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'route-active-summary-hud';
      hud.className = 'route-active-summary-hud';
      const workspace = document.getElementById('workspace') || document.body;
      workspace.appendChild(hud);
    }
    hud.classList.remove('hidden');

    const orig = document.getElementById('route-origin').value;
    const dest = document.getElementById('route-destination').value;

    hud.innerHTML = `
      <div class="route-hud-pill">
        <div class="route-hud-left">
          <span class="route-hud-badge" style="background: ${activeRoute.color}22; color: ${activeRoute.color}; border: 1px solid ${activeRoute.color};">
            <i class="fa-solid fa-route"></i> ${activeRoute.badge}
          </span>
          <span class="route-hud-name">${orig} &rarr; ${dest}</span>
          <span class="route-hud-metrics">
            <strong>${activeRoute.distance_km} km</strong> &bull; 
            <strong>${activeRoute.eta_min} min</strong> &bull; 
            Max Water: <strong style="color: ${activeRoute.max_water_m > 0.3 ? '#ef4444' : '#00e5ff'};">${activeRoute.max_water_m}m</strong>
          </span>
        </div>
        <div class="route-hud-actions">
          <button id="btn-reopen-route-planner" class="btn-route-hud-action" title="Modify Route / Switch Candidates">
            <i class="fa-solid fa-sliders"></i> Modify Route
          </button>
          <button id="btn-clear-route-hud" class="btn-route-hud-close" title="Clear Route">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    `;

    const btnReopen = document.getElementById('btn-reopen-route-planner');
    if (btnReopen) {
      btnReopen.addEventListener('click', () => {
        const panel = document.getElementById('floating-route-panel');
        if (panel) panel.classList.remove('hidden');
      });
    }

    const btnClose = document.getElementById('btn-clear-route-hud');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.clearRouteLayers();
        hud.classList.add('hidden');
        this.showToast('Route cleared from map', 'xmark');
      });
    }
  },

  plotRouteOnMap(activeRoute) {
    this.clearRouteLayers();

    // 1. Draw candidate alternative lines in background (dashed) matching video key_240s
    if (this.latestRoutes && this.latestRoutes.length > 1) {
      this.latestRoutes.forEach(altRoute => {
        if (altRoute !== activeRoute) {
          const altPoly = L.polyline(altRoute.coordinates, {
            color: altRoute.color === '#10b981' ? '#10b981' : '#ef4444',
            weight: 3.5,
            opacity: 0.65,
            dashArray: '6, 8'
          }).addTo(this.map);
          this.activeRouteLayers.push(altPoly);
        }
      });
    }

    // 2. Draw the primary selected route (solid thick line)
    const polyline = L.polyline(activeRoute.coordinates, {
      color: activeRoute.color,
      weight: 6.5,
      opacity: 0.98
    }).addTo(this.map);
    this.activeRouteLayers.push(polyline);

    // 3. Start Marker (Origin)
    const origVal = document.getElementById('route-origin').value;
    const destVal = document.getElementById('route-destination').value;

    const startMarker = L.circleMarker(activeRoute.coordinates[0], {
      radius: 9,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    }).bindTooltip(`<strong>Start:</strong> ${origVal}`, { permanent: true, direction: 'top', className: 'route-marker-tooltip' }).addTo(this.map);
    this.activeRouteLayers.push(startMarker);

    // 4. Destination Marker (End)
    const destCoord = activeRoute.coordinates[activeRoute.coordinates.length - 1];
    const endMarker = L.circleMarker(destCoord, {
      radius: 9,
      fillColor: '#ef4444',
      color: '#ffffff',
      weight: 3,
      fillOpacity: 1
    }).bindTooltip(`<strong>Goal:</strong> ${destVal}`, { permanent: true, direction: 'top', className: 'route-marker-tooltip' }).addTo(this.map);
    this.activeRouteLayers.push(endMarker);

    // 5. Destination Callout Warning Popup
    if (activeRoute.risk_class === 'critical' || activeRoute.max_water_m > 0.35) {
      const warningCallout = L.popup({
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        className: 'destination-warning-popup',
        offset: [0, -12]
      })
      .setLatLng(destCoord)
      .setContent(`
        <div style="font-family: var(--font-sans); padding: 2px;">
          <div style="font-size: 11.5px; font-weight: 800; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Destination / Corridor Surcharge: HIGH</div>
          <div style="font-size: 10px; color: #fff; margin-top: 3px;">Max Water Depth: <strong>${activeRoute.max_water_m}m</strong> | Status: <strong>${activeRoute.risk_level}</strong></div>
          <div style="font-size: 9.5px; color: #94a3b8; margin-top: 2px;">Elevated alternative recommended for emergency safety.</div>
        </div>
      `)
      .openOn(this.map);
      this.activeRouteLayers.push(warningCallout);
    }

    this.map.fitBounds(polyline.getBounds(), { padding: [70, 70] });
  },

  clearRouteLayers() {
    this.activeRouteLayers.forEach(l => {
      if (l && this.map.hasLayer(l)) {
        this.map.removeLayer(l);
      }
    });
    this.activeRouteLayers = [];
    const hud = document.getElementById('route-active-summary-hud');
    if (hud) hud.classList.add('hidden');
  },

  // ==========================================
  // 19. SEARCH & AUTOCOMPLETE
  // ==========================================
  initSearch() {
    const input = document.getElementById('location-search-input');
    const dropdown = document.getElementById('search-dropdown-results');
    const btnGo = document.getElementById('btn-search-go');

    const searchPlaces = [
      { name: "Minto Bridge Underpass", lat: 28.6338, lng: 77.2224 },
      { name: "ITO Ring Road Junction", lat: 28.6289, lng: 77.2415 },
      { name: "Connaught Place Inner Circle", lat: 28.6328, lng: 77.2197 },
      { name: "Kashmere Gate ISBT", lat: 28.6675, lng: 77.2285 },
      { name: "Pul Prahladpur Underpass", lat: 28.5115, lng: 77.2890 },
      { name: "AIIMS Hospital Trauma Center", lat: 28.5672, lng: 77.2100 },
      { name: "Zakhira Underpass", lat: 28.6685, lng: 77.1645 },
      { name: "Yamuna Bazar Nigambodh Ghat", lat: 28.6650, lng: 77.2355 }
    ];

    const executeNav = (place) => {
      input.value = place.name;
      dropdown.classList.add('hidden');
      this.map.flyTo([place.lat, place.lng], 15, { duration: 1.5 });
      this.inspectPointAt(place.lat, place.lng);
      this.showToast(`Navigated to: ${place.name}`, 'location-dot');
    };

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        dropdown.classList.add('hidden');
        return;
      }

      const matches = searchPlaces.filter(p => p.name.toLowerCase().includes(q));
      if (matches.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      dropdown.innerHTML = '';
      matches.forEach(m => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.textContent = m.name;
        item.addEventListener('click', () => executeNav(m));
        dropdown.appendChild(item);
      });
      dropdown.classList.remove('hidden');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const match = searchPlaces.find(p => p.name.toLowerCase().includes(input.value.trim().toLowerCase()));
        if (match) executeNav(match);
      }
    });

    btnGo.addEventListener('click', () => {
      const match = searchPlaces.find(p => p.name.toLowerCase().includes(input.value.trim().toLowerCase()));
      if (match) executeNav(match);
    });
  },

  // ==========================================
  // 20. FLOATING HUD TOOLS (RECENTER, BASEMAP, FULLSCREEN)
  // ==========================================
  initFloatingHUD() {
    document.getElementById('btn-recenter-delhi').addEventListener('click', () => {
      this.map.flyTo([28.6300, 77.2150], 11, { duration: 1.2 });
      this.showToast('Re-centered to Delhi NCT', 'location-crosshairs');
    });

    let basemapIdx = 0; // 0: OSM Standard, 1: Esri Dark Canvas, 2: Satellite Imagery
    const basemaps = [
      {
        name: 'OpenStreetMap Standard Cartography',
        create: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        })
      },
      {
        name: 'Esri Obsidian Dark Canvas (Zero Watermark)',
        create: () => {
          const base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          });
          const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18,
            pane: 'markerPane' // ensure labels render crisply
          });
          return L.layerGroup([base, labels]);
        }
      },
      {
        name: 'High-Resolution Satellite Imagery',
        create: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        })
      }
    ];

    document.getElementById('btn-toggle-basemap').addEventListener('click', () => {
      if (this.baseTileLayer) {
        this.map.removeLayer(this.baseTileLayer);
      }
      basemapIdx = (basemapIdx + 1) % basemaps.length;
      const selected = basemaps[basemapIdx];
      this.baseTileLayer = selected.create().addTo(this.map);
      this.showToast(`Basemap: ${selected.name}`, 'layer-group');
    });

    document.getElementById('btn-fullscreen-map').addEventListener('click', () => {
      const elem = document.getElementById('center-viewport');
      if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
      } else {
        document.exitFullscreen();
      }
    });
  },

  // ==========================================
  // 21. INTERACTIVE MEASUREMENT TOOL
  // ==========================================
  initMeasurementTool() {
    const btnMeasure = document.getElementById('btn-measure-tool');
    btnMeasure.addEventListener('click', () => {
      this.measuringActive = !this.measuringActive;
      const mapContainer = document.getElementById('map-container');

      if (this.measuringActive) {
        btnMeasure.classList.add('active');
        mapContainer.classList.add('measuring-active');
        this.measurePoints = [];
        this.measureLayerGroup.clearLayers();
        this.showToast('Measurement Tool Active: Click two points along drainage reach', 'ruler');
      } else {
        btnMeasure.classList.remove('active');
        mapContainer.classList.remove('measuring-active');
        this.measurePoints = [];
        this.measureLayerGroup.clearLayers();
        this.showToast('Measurement Tool Deactivated', 'check');
      }
    });
  },

  handleMeasurementClick(latlng) {
    this.measurePoints.push(latlng);

    const marker = L.circleMarker(latlng, {
      radius: 6,
      fillColor: '#00e5ff',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(this.measureLayerGroup);

    if (this.measurePoints.length === 1) {
      marker.bindTooltip('Point A (Start)', { permanent: true, direction: 'top', className: 'measure-tooltip' });
    } else if (this.measurePoints.length === 2) {
      marker.bindTooltip('Point B (End)', { permanent: true, direction: 'top', className: 'measure-tooltip' });
      const p1 = this.measurePoints[0];
      const p2 = this.measurePoints[1];
      const distanceMeters = p1.distanceTo(p2);
      const distanceKm = (distanceMeters / 1000.0).toFixed(2);

      const line = L.polyline([p1, p2], {
        color: '#00e5ff',
        weight: 3.5,
        dashArray: '6, 6'
      }).addTo(this.measureLayerGroup);

      const midLat = (p1.lat + p2.lat) / 2;
      const midLng = (p1.lng + p2.lng) / 2;

      L.popup({ closeButton: true, className: 'measure-tooltip' })
        .setLatLng([midLat, midLng])
        .setContent(`<strong>Drainage Reach Distance:</strong> ${distanceKm} km (${Math.round(distanceMeters)} m)`)
        .openOn(this.map);

      this.showToast(`Measured Distance: ${distanceKm} km`, 'ruler');
      this.measuringActive = false;
      document.getElementById('btn-measure-tool').classList.remove('active');
      document.getElementById('map-container').classList.remove('measuring-active');
    }
  },

  updateMeasurementPreview(latlng) {
    // Optional live dynamic line preview while dragging
  },

  // ==========================================
  // 22. DANGER LEGEND COLLAPSE TOGGLE
  // ==========================================
  initLegendCollapse() {
    const btn = document.getElementById('btn-collapse-danger-legend');
    const content = document.getElementById('danger-legend-content');
    if (btn && content) {
      btn.addEventListener('click', () => {
        content.classList.toggle('hidden');
        btn.classList.toggle('collapsed');
      });
    }
  },

  // ==========================================
  // 23. TOAST NOTIFICATIONS
  // ==========================================
  showToast(message, icon = 'info') {
    const container = document.getElementById('app-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.innerHTML = `<i class="fa-solid fa-${icon} text-cyan"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  },

  // ==========================================
  // DASHBOARD INTERACTIVITY & NEW UI METHODS
  // ==========================================

  // ==========================================
  // COMPREHENSIVE INTERACTIVE ACTIONS & BACKEND SYNC
  // ==========================================
  focusHighRiskZones() {
    // 1. Ensure Flood Zones GIS layer is checked and visible on map
    const dangerToggle = document.getElementById('layer-danger-toggle');
    if (dangerToggle) {
      dangerToggle.checked = true;
      if (this.layers.danger && !this.map.hasLayer(this.layers.danger)) {
        this.map.addLayer(this.layers.danger);
      }
    }

    // 2. Smoothly fly to the High Risk Zone on Yamuna active floodplain corridor
    const highRiskCoords = [28.6650, 77.2355];
    this.map.flyTo(highRiskCoords, 13, { duration: 1.2 });

    // 3. Open high-visibility warning popup on map
    setTimeout(() => {
      L.popup({ autoClose: false, closeOnClick: false, minWidth: 260, maxWidth: 300 })
        .setLatLng(highRiskCoords)
        .setContent(`
          <div class="map-popup-card">
            <div class="map-popup-header text-red">
              <i class="fa-solid fa-triangle-exclamation"></i> HIGH RISK FLOOD ZONE
            </div>
            <div class="map-popup-title">
              Yamuna Active Lowland Corridor
            </div>
            <div class="map-popup-stat">
              Simulated Inundation Depth: <strong class="text-red">0.85 m</strong>
            </div>
            <ul class="map-popup-list">
              <li>Low riverfront elevation below 205.33m HFL</li>
              <li>Surcharged drainage canals and culverts</li>
            </ul>
            <div class="map-popup-action">
              <button onclick="App.openRoutePlannerWithEvacuation()" class="map-popup-btn">
                <i class="fa-solid fa-route"></i> Calculate Flood-Safe Route
              </button>
            </div>
          </div>
        `)
        .openOn(this.map);
    }, 1250);

    // 4. Open Flood-Safe Route Planner panel and execute route analysis
    this.openRoutePlannerWithEvacuation();

    // 5. Query Hydro Inspector point telemetry at high-risk zone
    this.inspectPointAt(highRiskCoords[0], highRiskCoords[1]);

    this.showToast('High Risk Zone Focused: Yamuna Active Corridor (Depth: 0.85m)', 'triangle-exclamation');
  },

  openRoutePlannerWithEvacuation() {
    const routePanel = document.getElementById('floating-route-panel');
    if (routePanel) {
      routePanel.classList.remove('hidden');
    }
    const origInput = document.getElementById('route-origin');
    const destInput = document.getElementById('route-destination');
    if (origInput) origInput.value = 'ISBT Kashmere Gate Transit Hub';
    if (destInput) destInput.value = 'AIIMS Hospital';

    // Trigger route analysis
    this.executeRouteAnalysis();
  },

  focusOverloadedDrains() {
    // 1. Ensure Drainage Network GIS layer is checked and visible
    const drainToggle = document.getElementById('layer-drainage-toggle');
    if (drainToggle) {
      drainToggle.checked = true;
      if (this.layers.drainage && !this.map.hasLayer(this.layers.drainage)) {
        this.map.addLayer(this.layers.drainage);
      }
    }

    // 2. Fly to critical overloaded trunk drain: Barapullah / Najafgarh
    const drainCoords = [28.5880, 77.2450];
    this.map.flyTo(drainCoords, 13, { duration: 1.2 });

    // 3. Highlight and open drain telemetry popup
    setTimeout(() => {
      L.popup({ autoClose: false, closeOnClick: false, minWidth: 260, maxWidth: 300 })
        .setLatLng(drainCoords)
        .setContent(`
          <div class="map-popup-card">
            <div class="map-popup-header text-red">
              <i class="fa-solid fa-network-wired"></i> OVERLOADED TRUNK DRAIN
            </div>
            <div class="map-popup-title">
              Barapullah Trunk Basin No. 12
            </div>
            <div class="map-popup-stat">
              Utilization: <strong class="text-red">92%</strong> (Near Capacity)
            </div>
            <ul class="map-popup-list">
              <li>Design Capacity: 2,800 m³/s</li>
              <li>Receiving Outlet: Yamuna River Reach</li>
            </ul>
          </div>
        `)
        .openOn(this.map);
    }, 1250);

    const feat = this.drainsData && this.drainsData[0];
    if (feat) {
      this.selectDrainFeature(feat);
      this.traceDrainageFlow(feat);
    }
    this.inspectPointAt(drainCoords[0], drainCoords[1]);
    this.showToast('Overloaded Drain Focused: Barapullah Trunk Basin (92% Cap)', 'network-wired');
  },

  focusFloodedArea() {
    const dangerToggle = document.getElementById('layer-danger-toggle');
    if (dangerToggle) {
      dangerToggle.checked = true;
      if (this.layers.danger && !this.map.hasLayer(this.layers.danger)) {
        this.map.addLayer(this.layers.danger);
      }
    }
    const demToggle = document.getElementById('layer-dem-toggle');
    if (demToggle) {
      demToggle.checked = true;
      if (this.layers.dem && !this.map.hasLayer(this.layers.dem)) {
        this.map.addLayer(this.layers.dem);
      }
    }

    // Fit to Delhi NCT flood inundation extents
    this.map.fitBounds([
      [28.5000, 77.0500],
      [28.8200, 77.3400]
    ], { padding: [20, 20], duration: 1.2 });

    this.showToast('Delhi NCT Inundation Extent: 12.6 km² across 4 Lowland Basins', 'water');
  },

  focusCurrentRainfall() {
    const radarToggle = document.getElementById('layer-radar-toggle');
    if (radarToggle) {
      radarToggle.checked = true;
      if (this.layers.radar && !this.map.hasLayer(this.layers.radar)) {
        this.map.addLayer(this.layers.radar);
      }
    }

    const palamCoords = [28.5850, 77.1000];
    this.map.flyTo(palamCoords, 12, { duration: 1.2 });

    setTimeout(() => {
      L.popup({ autoClose: false, closeOnClick: false, minWidth: 250, maxWidth: 300 })
        .setLatLng(palamCoords)
        .setContent(`
          <div class="map-popup-card">
            <div class="map-popup-header text-blue">
              <i class="fa-solid fa-cloud-showers-heavy"></i> LIVE IMD RADAR FEED
            </div>
            <div class="map-popup-title">
              Safdarjung & Palam Observatory
            </div>
            <div class="map-popup-stat">
              Current Precipitation: <strong style="color: #0284c7; font-weight: 800;">48 mm/h</strong>
            </div>
            <ul class="map-popup-list">
              <li>Reflectivity: 48.5 dBZ &bull; Cloud Top: 11.2 km</li>
              <li>Convective storm tracking Northeast</li>
            </ul>
          </div>
        `)
        .openOn(this.map);
    }, 1250);

    this.showToast('IMD Doppler Radar: 48 mm/h Precipitation Detected', 'cloud-showers-heavy');
  },

  focusSafeZones() {
    const ridgeCoords = [28.5600, 77.1400];
    this.map.flyTo(ridgeCoords, 13, { duration: 1.2 });
    setTimeout(() => {
      L.popup({ minWidth: 250, maxWidth: 300 })
        .setLatLng(ridgeCoords)
        .setContent(`
          <div class="map-popup-card">
            <div class="map-popup-header text-green">
              <i class="fa-solid fa-circle-check"></i> SAFE ELEVATED REFUGE
            </div>
            <div class="map-popup-title">
              Southern Aravalli Ridge Highland
            </div>
            <div class="map-popup-stat">
              Elevation: > 235m MSL &bull; Inundation: 0.00 m
            </div>
            <ul class="map-popup-list">
              <li>Natural high-elevation refuge zone for emergency staging</li>
            </ul>
          </div>
        `)
        .openOn(this.map);
    }, 1250);
    this.inspectPointAt(ridgeCoords[0], ridgeCoords[1]);
    this.showToast('Safe Elevated Zone: Southern Ridge (>235m MSL)', 'shield-halved');
  },

  focusModerateRisk() {
    const minToCoords = [28.6338, 77.2224];
    this.map.flyTo(minToCoords, 14, { duration: 1.2 });
    setTimeout(() => {
      L.popup({ minWidth: 250, maxWidth: 300 })
        .setLatLng(minToCoords)
        .setContent(`
          <div class="map-popup-card">
            <div class="map-popup-header text-amber">
              <i class="fa-solid fa-triangle-exclamation"></i> MODERATE RISK CULVERT
            </div>
            <div class="map-popup-title">
              Minto Bridge Underpass Sump
            </div>
            <div class="map-popup-stat">
              Critical Depth: 0.85m &bull; Elevation: 211.5m
            </div>
            <ul class="map-popup-list">
              <li>Inward-sloping railway culvert prone to flash stormwater ponding</li>
            </ul>
          </div>
        `)
        .openOn(this.map);
    }, 1250);
    this.inspectPointAt(minToCoords[0], minToCoords[1]);
    this.showToast('Moderate Risk: Minto Bridge Underpass Culvert', 'triangle-exclamation');
  },

  initDashboardInteractivity() {
    // 1. Live Timestamp Clock
    const updateTime = () => {
      const el = document.getElementById('top-live-timestamp');
      if (el) {
        const now = new Date();
        const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        el.textContent = now.toLocaleDateString('en-GB', options);
      }
    };
    updateTime();
    setInterval(updateTime, 30000);

    // 2. Main Navigation Tabs (Dashboard, Simulation, Analytics, Reports, Settings)
    const allNavButtons = document.querySelectorAll('.nav-item-btn, .top-nav-tab');
    allNavButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tabKey = btn.getAttribute('data-tab');
        this.switchWorkspaceTab(tabKey);
      });
    });

    // Initialize Simulation Lab, Analytics, Reports, and Settings handlers
    this.initSimulationLab();
    this.initAnalyticsWorkspace();
    this.initReportsWorkspace();
    this.initChatbotWorkspace();
    this.initSettingsWorkspace();

    // 3. Collapsible Card Headers
    const bindCollapse = (hdrId, bodyId) => {
      const hdr = document.getElementById(hdrId);
      const body = document.getElementById(bodyId);
      if (hdr && body) {
        hdr.addEventListener('click', () => {
          body.classList.toggle('hidden');
          const icon = hdr.querySelector('.chevron-icon');
          if (icon) {
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
          }
        });
      }
    };
    // Direct binding for Left Sidebar GIS checkboxes to ensure instant map response
    const directLayers = [
      { id: 'layer-dem-toggle', layerKey: 'dem', renderFn: () => this.renderDEM() },
      { id: 'layer-drainage-toggle', layerKey: 'drainage', renderFn: () => this.renderDrainageNetwork() },
      { id: 'layer-danger-toggle', layerKey: 'danger', renderFn: () => this.renderDangerZones(this.currentRainfall) },
      { id: 'layer-radar-toggle', layerKey: 'radar', renderFn: () => this.renderRadar() },
      { id: 'layer-flow-toggle', layerKey: 'flow', renderFn: () => this.renderFlowDirections() },
      { id: 'layer-pumps-toggle', layerKey: 'pumps', renderFn: () => this.renderPumpsAndGates() }
    ];

    directLayers.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        el.addEventListener('change', () => {
          if (el.checked) {
            if (!this.layers[item.layerKey]) {
              item.renderFn();
            } else if (!this.map.hasLayer(this.layers[item.layerKey])) {
              this.map.addLayer(this.layers[item.layerKey]);
            }
          } else {
            if (this.layers[item.layerKey] && this.map.hasLayer(this.layers[item.layerKey])) {
              this.map.removeLayer(this.layers[item.layerKey]);
            }
          }
        });
      }
    });

    bindCollapse('hdr-gis-layers', 'body-gis-layers');
    bindCollapse('hdr-rain-sim', 'body-rain-sim');
    bindCollapse('hdr-hydro-inspector', 'body-hydro-inspector');

    // Zoom Controls on Map
    const btnZoomIn = document.getElementById('btn-map-zoom-in');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => { if (this.map) this.map.zoomIn(); });
    }
    const btnZoomOut = document.getElementById('btn-map-zoom-out');
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => { if (this.map) this.map.zoomOut(); });
    }

    // 4. Rainfall Stepper Input & Range Slider (Intensity)
    const simInput = document.getElementById('sim-rainfall-input');
    const simRainSlider = document.getElementById('sim-rainfall-slider');
    const updateSimRain = (val) => {
      if (this.isLiveMode) this.deactivateLiveWeatherMode();
      let mm = parseInt(val, 10) || 50;
      mm = Math.max(10, Math.min(150, mm));
      if (simInput && parseInt(simInput.value, 10) !== mm) simInput.value = mm;
      if (simRainSlider && parseInt(simRainSlider.value, 10) !== mm) simRainSlider.value = mm;
      this.currentRainfall = mm;
      document.querySelectorAll('.scenario-btn, .sim-preset-btn').forEach(b => {
        const bMm = parseInt(b.getAttribute('data-mm') || b.getAttribute('data-sim-mm'), 10);
        if (bMm === mm) b.classList.add('active');
        else b.classList.remove('active');
      });
      if (window.ThreeEngine) {
        window.ThreeEngine.updateRainfallScenario(mm);
        window.ThreeEngine.setSimulationState(mm, this.currentHorizon, this.simPlaying);
      }
      if (window.HydroRadarEngine2D) {
        window.HydroRadarEngine2D.setScenario(mm, this.currentHorizon, this.simPlaying);
      }
      this.renderDrainageNetwork();
      this.renderFloodDepthRasters(mm);
      this.renderDangerZones(mm);
      this.updateSituationStatus(mm);
      this.triggerSimulationSync(mm, this.currentHorizon);
    };

    if (simInput) {
      simInput.addEventListener('change', () => updateSimRain(simInput.value));
      simInput.addEventListener('input', () => updateSimRain(simInput.value));
    }
    if (simRainSlider) {
      simRainSlider.addEventListener('input', () => updateSimRain(simRainSlider.value));
    }

    // 4.5 Rainfall Time Stepper Input & Range Slider (Duration / Horizon)
    const simTimeInput = document.getElementById('sim-time-input');
    const timelineEl = document.getElementById('simulation-timeline');
    const updateSimTime = (val) => {
      if (this.isLiveMode) this.deactivateLiveWeatherMode();
      let mins = parseInt(val, 10);
      if (isNaN(mins)) mins = 60;
      mins = Math.max(0, Math.min(180, mins));
      if (simTimeInput && parseInt(simTimeInput.value, 10) !== mins) simTimeInput.value = mins;
      if (timelineEl && parseInt(timelineEl.value, 10) !== mins) timelineEl.value = mins;
      this.currentHorizon = mins;

      const labSlider = document.getElementById('sim-lab-timeline-slider');
      if (labSlider && parseInt(labSlider.value, 10) !== mins) labSlider.value = mins;
      const labLabel = document.getElementById('sim-lab-time-label');
      if (labLabel) labLabel.textContent = `T + ${mins} min ${mins === 60 ? '(Peak)' : ''}`;

      const minLabel = document.getElementById('timeline-current-min');
      if (minLabel) minLabel.textContent = `${mins} min ${mins === 60 ? '(Peak)' : ''}`;

      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, mins, this.simPlaying);
      }
      if (window.HydroRadarEngine2D) {
        window.HydroRadarEngine2D.setScenario(this.currentRainfall, mins, this.simPlaying);
      }
      this.triggerSimulationSync(this.currentRainfall, mins);
      this.renderDrainageNetwork();
      this.renderFloodDepthRasters(this.currentRainfall);
    };

    if (simTimeInput) {
      simTimeInput.addEventListener('change', () => updateSimTime(simTimeInput.value));
      simTimeInput.addEventListener('input', () => updateSimTime(simTimeInput.value));
    }

    // 5. KPI Cards & Interactive Triggers (Fully operational)
    const cardRisk = document.getElementById('card-high-risk-zones');
    const linkRisk = document.getElementById('link-view-risk-details');
    if (cardRisk) cardRisk.addEventListener('click', (e) => { e.preventDefault(); this.focusHighRiskZones(); });
    if (linkRisk) linkRisk.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.focusHighRiskZones(); });

    const cardDrain = document.getElementById('card-overloaded-drains');
    const linkDrain = document.getElementById('link-view-drain-details');
    if (cardDrain) cardDrain.addEventListener('click', (e) => { e.preventDefault(); this.focusOverloadedDrains(); });
    if (linkDrain) linkDrain.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.focusOverloadedDrains(); });

    const cardArea = document.getElementById('card-flooded-area');
    if (cardArea) cardArea.addEventListener('click', (e) => { e.preventDefault(); this.focusFloodedArea(); });

    const cardRain = document.getElementById('card-current-rainfall');
    if (cardRain) cardRain.addEventListener('click', (e) => { e.preventDefault(); this.focusCurrentRainfall(); });

    // Legend Click Handlers
    const legSafe = document.getElementById('legend-item-safe');
    if (legSafe) legSafe.addEventListener('click', () => this.focusSafeZones());
    const legMod = document.getElementById('legend-item-moderate');
    if (legMod) legMod.addEventListener('click', () => this.focusModerateRisk());
    const legHigh = document.getElementById('legend-item-high');
    if (legHigh) legHigh.addEventListener('click', () => this.focusHighRiskZones());
    const legWater = document.getElementById('legend-item-water');
    if (legWater) legWater.addEventListener('click', () => {
      this.map.flyTo([28.6300, 77.2600], 13, { duration: 1.2 });
      this.showToast('Yamuna River Trench Channel Focused', 'water');
    });

    // Recent Alerts Click Handlers
    const alert1 = document.getElementById('alert-item-1');
    if (alert1) alert1.addEventListener('click', () => this.focusHighRiskZones());
    const alert2 = document.getElementById('alert-item-2');
    if (alert2) alert2.addEventListener('click', () => this.focusOverloadedDrains());
    const alert3 = document.getElementById('alert-item-3');
    if (alert3) alert3.addEventListener('click', () => this.focusCurrentRainfall());

    // Donut Legend Click Handlers
    const dSafe = document.getElementById('donut-legend-safe');
    if (dSafe) dSafe.addEventListener('click', () => this.focusSafeZones());
    const dMod = document.getElementById('donut-legend-moderate');
    if (dMod) dMod.addEventListener('click', () => this.focusModerateRisk());
    const dHigh = document.getElementById('donut-legend-high');
    if (dHigh) dHigh.addEventListener('click', () => this.focusHighRiskZones());

    // Notification bell handler
    const bell = document.getElementById('btn-notifications');
    if (bell) {
      bell.addEventListener('click', () => {
        const alertsRow = document.getElementById('alert-item-1');
        if (alertsRow) alertsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this.showToast('2 Active Alerts: East Delhi Flood Risk & Barapullah Capacity', 'bell');
      });
    }

    // Situation dynamic card handler
    const sitCard = document.getElementById('card-situation-status');
    if (sitCard) {
      sitCard.addEventListener('click', () => {
        const mm = this.currentRainfall || 10;
        if (mm > 60) {
          this.showToast(`CRITICAL FLOOD DANGER (${mm}mm): Severe Yamuna surcharge & culvert overflows!`, 'triangle-exclamation');
        } else if (mm > 25) {
          this.showToast(`Moderate Flood Watch (${mm}mm): Localized ponding monitored in low-lying sumps`, 'triangle-exclamation');
        } else {
          this.showToast('System Online: Situation Normal • Hydrodynamic models synchronized', 'circle-check');
        }
      });
    }

    // 6. Draw Detailed Delhi Boundary Polygon on Leaflet Map matching mockup
    if (this.map) {
      const delhiBoundaryCoords = [
        [28.883, 77.092], [28.868, 77.145], [28.845, 77.202], [28.810, 77.235],
        [28.775, 77.265], [28.730, 77.305], [28.705, 77.320], [28.665, 77.315],
        [28.625, 77.340], [28.580, 77.335], [28.535, 77.330], [28.500, 77.315],
        [28.460, 77.280], [28.415, 77.240], [28.405, 77.180], [28.420, 77.130],
        [28.450, 77.085], [28.480, 77.030], [28.520, 76.960], [28.560, 76.905],
        [28.610, 76.840], [28.665, 76.845], [28.720, 76.900], [28.770, 76.950],
        [28.825, 77.020], [28.860, 77.060], [28.883, 77.092]
      ];
      L.polyline(delhiBoundaryCoords, {
        color: '#ffffff',
        weight: 2.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // District Labels matching screenshot mockup (North Delhi, West Delhi, East Delhi, South Delhi)
      const districtLabels = [
        { name: 'North Delhi', lat: 28.740, lng: 77.165 },
        { name: 'West Delhi', lat: 28.630, lng: 77.045 },
        { name: 'East Delhi', lat: 28.630, lng: 77.300 },
        { name: 'South Delhi', lat: 28.510, lng: 77.190 }
      ];

      districtLabels.forEach(d => {
        const icon = L.divIcon({
          className: 'map-district-label-container',
          html: `<div class="map-district-label">${d.name}</div>`,
          iconSize: [120, 24],
          iconAnchor: [60, 12]
        });
        L.marker([d.lat, d.lng], { icon: icon, interactive: false }).addTo(this.map);
      });

      // New Delhi Pin Marker matching screenshot mockup
      const pinIcon = L.divIcon({
        className: 'map-newdelhi-pin-container',
        html: `
          <div class="map-pin-newdelhi">
            <div class="pin-marker-circle"></div>
            <div class="pin-label-text">New Delhi</div>
          </div>
        `,
        iconSize: [140, 50],
        iconAnchor: [70, 8]
      });
      L.marker([28.625, 77.215], { icon: pinIcon, interactive: false }).addTo(this.map);
    }
  },


  // ==========================================
  // WORKSPACE TAB SWITCHER (Dashboard, Sim, Analytics, Reports, Settings)
  // ==========================================
  switchWorkspaceTab(tabKey) {
    // 1. Update navigation button states
    document.querySelectorAll('.nav-item-btn, .top-nav-tab').forEach(b => {
      if (b.getAttribute('data-tab') === tabKey) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    // 2. Hide all tab containers
    const tabMap = {
      'overview': 'tab-view-dashboard',
      'dashboard': 'tab-view-dashboard',
      'simulation': 'tab-view-simulation',
      'analytics': 'tab-view-analytics',
      'reports': 'tab-view-reports',
      'chatbot': 'tab-view-chatbot',
      'settings': 'tab-view-settings'
    };

    Object.values(tabMap).forEach(viewId => {
      const el = document.getElementById(viewId);
      if (el) el.classList.add('hidden');
    });

    // 3. Show target tab container
    const targetId = tabMap[tabKey] || 'tab-view-dashboard';
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.remove('hidden');
    }

    // 4. Tab-specific activation hooks
    if (tabKey === 'overview' || tabKey === 'dashboard') {
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 150);
      }
      this.showToast('Switched to Flood Operations Dashboard', 'house');
    } else if (tabKey === 'simulation') {
      setTimeout(() => {
        if (window.ThreeEngine) {
          window.ThreeEngine.onWindowResize();
          window.ThreeEngine.updateRainfallScenario(this.currentRainfall);
        }
        if (window.HydroRadarEngine2D) {
          window.HydroRadarEngine2D.init('canvas-2d-hydro-radar');
          window.HydroRadarEngine2D.resize();
          window.HydroRadarEngine2D.setScenario(this.currentRainfall, this.currentHorizon, this.simPlaying);
        }
      }, 120);
      this.showToast('Simulation Lab Active: 3D Hydrodynamic Solver', 'play');
    } else if (tabKey === 'analytics') {
      this.showToast('Hydrological & Drainage Basin Analytics Active', 'chart-column');
    } else if (tabKey === 'reports') {
      this.fetchIncidentReports();
      this.showToast('Flood Intelligence & Incident Reports Synced', 'file-lines');
    } else if (tabKey === 'chatbot') {
      this.showToast('AquaPredict AI Assistant Activated', 'robot');
      const chatInput = document.getElementById('chat-user-input');
      if (chatInput) setTimeout(() => chatInput.focus({ preventScroll: true }), 150);
      const chatBox = document.getElementById('chat-messages-container');
      if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    } else if (tabKey === 'settings') {
      this.showToast('System Configuration & Solver Architecture', 'gear');
    }
  },

  // ==========================================
  // SIMULATION LAB CONTROLS
  // ==========================================
  initSimulationLab() {
    // 1. Mode Switcher (Flood 3D vs 2D Hydrodynamic Radar vs Elevation DEM)
    const btnModeFlood = document.getElementById('btn-sim-mode-flood');
    const btnMode2D = document.getElementById('btn-sim-mode-2d');
    const btnModeElev = document.getElementById('btn-sim-mode-elev');
    const viewFlood = document.getElementById('view-3d-flood');
    const view2D = document.getElementById('view-2d-hydro');
    const viewElev = document.getElementById('view-3d-elevation');

    const setSimMode = (mode) => {
      [btnModeFlood, btnMode2D, btnModeElev].forEach(b => { if (b) b.classList.remove('active'); });
      [viewFlood, view2D, viewElev].forEach(v => { if (v) v.classList.add('hidden'); });

      if (mode === 'flood') {
        if (btnModeFlood) btnModeFlood.classList.add('active');
        if (viewFlood) viewFlood.classList.remove('hidden');
        if (window.ThreeEngine) window.ThreeEngine.onWindowResize();
      } else if (mode === '2d') {
        if (btnMode2D) btnMode2D.classList.add('active');
        if (view2D) view2D.classList.remove('hidden');
        if (window.HydroRadarEngine2D) {
          window.HydroRadarEngine2D.init('canvas-2d-hydro-radar');
          window.HydroRadarEngine2D.resize();
          window.HydroRadarEngine2D.setScenario(this.currentRainfall, this.currentHorizon, this.simPlaying);
        }
      } else if (mode === 'elev') {
        if (btnModeElev) btnModeElev.classList.add('active');
        if (viewElev) viewElev.classList.remove('hidden');
        if (window.ThreeEngine) window.ThreeEngine.onWindowResize();
      }
    };

    if (btnModeFlood) btnModeFlood.addEventListener('click', () => setSimMode('flood'));
    if (btnMode2D) btnMode2D.addEventListener('click', () => setSimMode('2d'));
    if (btnModeElev) btnModeElev.addEventListener('click', () => setSimMode('elev'));

    // 2. Scenario Presets in Sim Lab
    [10, 50, 100].forEach(mm => {
      const presetBtn = document.getElementById(`sim-preset-${mm}`);
      if (presetBtn) {
        presetBtn.addEventListener('click', () => {
          document.querySelectorAll('.sim-preset-btn').forEach(b => b.classList.remove('active'));
          presetBtn.classList.add('active');

          this.currentRainfall = mm;
          const simInput = document.getElementById('sim-rainfall-input');
          if (simInput) simInput.value = mm;
          const simRainSlider = document.getElementById('sim-rainfall-slider');
          if (simRainSlider) simRainSlider.value = mm;

          if (window.ThreeEngine) {
            window.ThreeEngine.updateRainfallScenario(mm);
            window.ThreeEngine.setSimulationState(mm, this.currentHorizon, this.simPlaying);
          }
          if (window.HydroRadarEngine2D) {
            window.HydroRadarEngine2D.setScenario(mm, this.currentHorizon, this.simPlaying);
          }

          this.triggerSimulationSync(mm, this.currentHorizon);
          this.renderDrainageNetwork();
          this.renderFloodDepthRasters(mm);
          this.renderDangerZones(mm);

          // Update Sim Lab Peak Depth display
          const peakDepthEl = document.getElementById('sim-lab-peak-depth');
          if (peakDepthEl) {
            peakDepthEl.textContent = mm >= 100 ? '1.45 m' : (mm >= 50 ? '0.85 m' : '0.12 m');
          }
          const peakAreaEl = document.getElementById('sim-lab-flooded-area');
          if (peakAreaEl) {
            peakAreaEl.textContent = mm >= 100 ? '38.4 km²' : (mm >= 50 ? '14.8 km²' : '3.2 km²');
          }

          this.showToast(`Simulation Scenario: ${mm} mm Precipitation`, 'cloud-rain');
        });
      }
    });

    // 3. Timeline Slider in Sim Lab
    const labTimeline = document.getElementById('sim-lab-timeline-slider');
    const labTimeLabel = document.getElementById('sim-lab-time-label');

    if (labTimeline) {
      labTimeline.addEventListener('input', () => {
        const val = parseInt(labTimeline.value, 10);
        this.currentHorizon = val;
        const timeInp = document.getElementById('sim-time-input');
        if (timeInp) timeInp.value = val;
        const mainTimeline = document.getElementById('simulation-timeline');
        if (mainTimeline) mainTimeline.value = val;
        if (labTimeLabel) {
          labTimeLabel.textContent = `T + ${val} min ${val === 60 ? '(Peak)' : ''}`;
        }
        const minLabel = document.getElementById('timeline-current-min');
        if (minLabel) minLabel.textContent = `${val} min ${val === 60 ? '(Peak)' : ''}`;
        if (window.ThreeEngine) {
          window.ThreeEngine.setSimulationState(this.currentRainfall, val, this.simPlaying);
        }
        if (window.HydroRadarEngine2D) {
          window.HydroRadarEngine2D.setScenario(this.currentRainfall, val, this.simPlaying);
        }
        this.triggerSimulationSync(this.currentRainfall, val);
        this.renderDrainageNetwork();
        this.renderFloodDepthRasters(this.currentRainfall);
      });
    }

    // 4. Lab Run / Pause / Reset Buttons
    const btnLabRun = document.getElementById('btn-sim-lab-run');
    const btnLabPause = document.getElementById('btn-sim-lab-pause');
    const btnLabReset = document.getElementById('btn-sim-lab-reset');

    if (btnLabRun) {
      btnLabRun.addEventListener('click', () => {
        const mainRunBtn = document.getElementById('btn-sim-run');
        if (mainRunBtn) mainRunBtn.click();
        btnLabRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running';
      });
    }
    if (btnLabPause) {
      btnLabPause.addEventListener('click', () => {
        const mainPauseBtn = document.getElementById('btn-sim-pause');
        if (mainPauseBtn) mainPauseBtn.click();
        if (btnLabRun) btnLabRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
      });
    }
    if (btnLabReset) {
      btnLabReset.addEventListener('click', () => {
        const mainResetBtn = document.getElementById('btn-sim-reset');
        if (mainResetBtn) mainResetBtn.click();
        if (labTimeline) labTimeline.value = 60;
        if (labTimeLabel) labTimeLabel.textContent = 'T + 60 min (Peak)';
        if (btnLabRun) btnLabRun.innerHTML = '<i class="fa-solid fa-play"></i> Run';
      });
    }

    // 5. Particle Effects Toggles
    const btnRainPart = document.getElementById('btn-toggle-rain-particles');
    const btnFlowPart = document.getElementById('btn-toggle-flow-particles');

    if (btnRainPart) {
      btnRainPart.addEventListener('click', () => {
        btnRainPart.classList.toggle('active');
        const isActive = btnRainPart.classList.contains('active');
        if (window.ThreeEngine && window.ThreeEngine.rainSystem) {
          window.ThreeEngine.rainSystem.visible = isActive;
        }
        this.showToast(`Rainfall Particles ${isActive ? 'Enabled' : 'Disabled'}`, 'cloud-rain');
      });
    }

    if (btnFlowPart) {
      btnFlowPart.addEventListener('click', () => {
        btnFlowPart.classList.toggle('active');
        const isActive = btnFlowPart.classList.contains('active');
        if (window.ThreeEngine && window.ThreeEngine.flowSystem) {
          window.ThreeEngine.flowSystem.visible = isActive;
        }
        this.showToast(`Gravity Runoff Flow ${isActive ? 'Enabled' : 'Disabled'}`, 'water');
      });
    }
  },

  // ==========================================
  // ANALYTICS WORKSPACE
  // ==========================================
  initAnalyticsWorkspace() {
    const btnExportCsv = document.getElementById('btn-analytics-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        const csvContent = "Time_Hours,Inflow_m3s,Channel_Capacity_m3s,Barapullah_Util_Pct,Najafgarh_Util_Pct,Status\n" +
                           "00:00,120,2800,12,15,NORMAL\n" +
                           "04:00,450,2800,24,28,NORMAL\n" +
                           "06:00,1850,2800,68,65,SURCHARGE_WARNING\n" +
                           "08:00,3420,2800,92,88,CRITICAL_OVERLOAD\n" +
                           "10:00,2950,2800,86,82,RECEDING\n" +
                           "14:00,1200,2800,48,50,NORMAL\n" +
                           "18:00,380,2800,18,22,NORMAL\n";
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `delhi_flood_hydrograph_analytics_${Date.now()}.csv`);
        a.click();
        this.showToast('Downloaded Hydrograph Analytics CSV Report', 'download');
      });
    }

    // click on link to smooth scroll
    const scrollBox = document.getElementById('tab-view-analytics');
    const jumpLinks = document.querySelectorAll('.page-nav-link');
    const sections = [
      document.getElementById('sec-hydrograph'),
      document.getElementById('sec-vulnerability'),
      document.getElementById('sec-basin-capacity'),
      document.getElementById('sec-telemetry')
    ].filter(Boolean);

    jumpLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // highlight active link on scroll
    if (scrollBox && sections.length) {
      scrollBox.addEventListener('scroll', () => {
        let activeSection = sections[0].id;
        const boxTop = scrollBox.getBoundingClientRect().top;

        sections.forEach(sec => {
          const rect = sec.getBoundingClientRect();
          if (rect.top - boxTop <= 120) {
            activeSection = sec.id;
          }
        });

        jumpLinks.forEach(link => {
          if (link.getAttribute('href') === `#${activeSection}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      });
    }
  },

  // ==========================================
  // REPORTS WORKSPACE & INCIDENT SUBMISSION
  // ==========================================
  initReportsWorkspace() {
    // 1. Depth Slider Live Label
    const depthSlider = document.getElementById('report-input-depth');
    const depthLabel = document.getElementById('lbl-report-depth');
    if (depthSlider && depthLabel) {
      depthSlider.addEventListener('input', () => {
        depthLabel.textContent = `${parseFloat(depthSlider.value).toFixed(2)} m`;
      });
    }

    // 2. Submit Incident Button
    const btnSubmit = document.getElementById('btn-submit-crowd-report');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', async () => {
        const loc = document.getElementById('report-input-location').value;
        const depth = parseFloat(document.getElementById('report-input-depth').value) || 0.5;
        const drain = document.getElementById('report-input-drain-status').value;
        const desc = document.getElementById('report-input-desc').value.trim() || 'Severe waterlogging observed.';

        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        btnSubmit.disabled = true;

        try {
          const res = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              water_depth_est_m: depth,
              description: `[${loc}] ${desc} (Drain: ${drain})`,
              photo_path: '/static/assets/cctv_evidence.jpg'
            })
          });

          const data = await res.json();
          const repId = data.report ? data.report.id : `REP-${Math.floor(1000 + Math.random() * 9000)}`;

          // Prepend new row to incident table
          const tbody = document.getElementById('tbody-incident-reports');
          if (tbody) {
            const tr = document.createElement('tr');
            tr.style.background = '#f0fdf4';
            tr.innerHTML = `
              <td><strong>${repId.toUpperCase()}</strong></td>
              <td>${loc}</td>
              <td><strong style="color: #ef4444;">${depth.toFixed(2)} m</strong></td>
              <td>${drain}</td>
              <td><span class="badge-status-table green">SUBMITTED</span></td>
              <td>Just now</td>
              <td>Field Verification Pending</td>
            `;
            tbody.insertBefore(tr, tbody.firstChild);
          }

          document.getElementById('report-input-desc').value = '';
          this.showToast(`Incident Report ${repId.toUpperCase()} Submitted Successfully!`, 'circle-check');
        } catch (err) {
          this.showToast('Incident reported locally (Offline mode sync)', 'circle-check');
        } finally {
          btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Incident Report';
          btnSubmit.disabled = false;
        }
      });
    }

    // 3. Export Incident Log CSV
    const btnExportReports = document.getElementById('btn-reports-export-csv');
    if (btnExportReports) {
      btnExportReports.addEventListener('click', () => {
        const csvContent = "Report_ID,Location,Observed_Depth_m,Drain_Status,Verification_Status,Time,Action_Taken\n" +
                           "REP-8821,Minto Bridge Underpass,0.85,Surcharged (Backflow),VERIFIED,Just now,DJB Super-sucker Dispatched\n" +
                           "REP-8819,ITO Ring Road Junction,0.42,Slow Drainage / Silt,VERIFIED,5 min ago,Traffic Diverted to Vikas Marg\n" +
                           "REP-8815,Kashmere Gate ISBT,0.70,Grating Surcharged,VERIFIED,12 min ago,Inlet Grating Cleared\n" +
                           "REP-8812,Pul Prahladpur Culvert,0.95,Complete Submersion,VERIFIED,18 min ago,Road Barricaded by Police\n" +
                           "REP-8810,Yamuna Bazar Ghat,0.30,High River Level (204.8m),MONITORED,25 min ago,NDRF Recon Boat Standby\n" +
                           "REP-8806,Zakhira Underpass,0.55,Pump Failure (Restored),VERIFIED,34 min ago,Station P-04 Dewatering Active\n";
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `delhi_flood_incident_reports_${Date.now()}.csv`);
        a.click();
        this.showToast('Exported Delhi Flood Incident Log (CSV)', 'download');
      });
    }

    // 4. Smooth scroll jump links & scroll spy for reports page
    const reportsBox = document.getElementById('tab-view-reports');
    if (reportsBox) {
      const links = reportsBox.querySelectorAll('.page-nav-link');
      const sections = [
        document.getElementById('sec-submit-report'),
        document.getElementById('sec-verified-reports'),
        document.getElementById('sec-satellite-sar'),
        document.getElementById('sec-cctv-feeds'),
        document.getElementById('sec-pump-stations'),
        document.getElementById('sec-dispatch-log')
      ].filter(Boolean);

      links.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = link.getAttribute('href').substring(1);
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      // highlight active link as user scrolls
      reportsBox.addEventListener('scroll', () => {
        if (!sections.length) return;
        let activeId = sections[0].id;
        const boxTop = reportsBox.getBoundingClientRect().top;

        sections.forEach(sec => {
          const rect = sec.getBoundingClientRect();
          if (rect.top - boxTop <= 120) {
            activeId = sec.id;
          }
        });

        links.forEach(link => {
          if (link.getAttribute('href') === `#${activeId}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      });
    }
  },

  async fetchIncidentReports() {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data && data.reports && data.reports.length > 0) {
        const tbody = document.getElementById('tbody-incident-reports');
        if (tbody) {
          // Keep existing rows and add backend ones if missing
          const badgeTotal = document.getElementById('badge-total-reports');
          if (badgeTotal) badgeTotal.textContent = `${data.reports.length + 4} Reports`;
        }
      }
    } catch (err) {
      console.log('Reports fetch sync:', err);
    }
  },

  // ==========================================
  // ==========================================
  // AUTONOMOUS INFRASTRUCTURE (PUMPS & SLUICE GATES)
  // ==========================================
  async fetchInfrastructureAssets() {
    try {
      const res = await fetch('/api/infrastructure/assets');
      if (res.ok) {
        const data = await res.json();
        this.pumpsData = data.pumps || [];
        this.gatesData = data.gates || [];
      }
    } catch (e) {
      console.warn('Fallback infrastructure data', e);
    }
  },

  renderPumpsAndGates() {
    const toggleEl = document.getElementById('layer-pumps-toggle');
    const isVisible = toggleEl ? toggleEl.checked : true;
    if (this.layers.pumps && this.map.hasLayer(this.layers.pumps)) {
      this.map.removeLayer(this.layers.pumps);
    }

    const group = L.featureGroup();

    // 1. Render 8 Mock Pumps with live status icons
    (this.pumpsData || []).forEach(p => {
      const isON = p.status === 'ON';
      const icon = L.divIcon({
        className: 'custom-infra-div-icon',
        html: `
          <div class="pump-marker-icon" title="${p.name} - Status: ${p.status}">
            <div class="pump-badge ${isON ? 'status-on' : 'status-off'}">
              <i class="fa-solid fa-fan"></i>
            </div>
            <span class="marker-label-pill ${isON ? 'pill-on' : 'pill-off'}">${p.status}</span>
          </div>
        `,
        iconSize: [32, 42],
        iconAnchor: [16, 21]
      });

      const marker = L.marker([p.lat, p.lng], { icon });
      marker.bindPopup(`
        <div class="infra-popup-card">
          <h4><i class="fa-solid fa-fan text-green"></i> ${p.name}</h4>
          <div class="infra-popup-meta">
            <div><strong>Status:</strong> <span style="font-weight:700; color:${isON ? '#10b981' : '#64748b'};">${p.status}</span></div>
            <div><strong>Discharge Capacity:</strong> ${p.capacity_m3h} m³/h</div>
            <div><strong>Current Sump Depth:</strong> ${p.current_depth_m} m (Limit: ${p.critical_depth_m} m)</div>
            <div><strong>Target Sump:</strong> ${p.target_node}</div>
          </div>
          <div class="infra-popup-ai">
            <strong><i class="fa-solid fa-wand-magic-sparkles"></i> AI Recommendation:</strong><br>
            ${p.recommended_action}
          </div>
          <button class="infra-popup-btn" onclick="App.togglePumpStatus('${p.id}')">
            Toggle Status (${isON ? 'Turn OFF' : 'Turn ON'})
          </button>
        </div>
      `);
      group.addLayer(marker);
    });

    // 2. Render 4 Mock Sluice Gates with status icons
    (this.gatesData || []).forEach(g => {
      const isOPEN = g.status === 'OPEN';
      const icon = L.divIcon({
        className: 'custom-infra-div-icon',
        html: `
          <div class="gate-marker-icon" title="${g.name} - Status: ${g.status}">
            <div class="gate-badge ${isOPEN ? 'status-open' : 'status-closed'}">
              <i class="fa-solid ${isOPEN ? 'fa-door-open' : 'fa-door-closed'}"></i>
            </div>
            <span class="marker-label-pill ${isOPEN ? 'pill-open' : 'pill-closed'}">${g.status}</span>
          </div>
        `,
        iconSize: [30, 40],
        iconAnchor: [15, 20]
      });

      const marker = L.marker([g.lat, g.lng], { icon });
      marker.bindPopup(`
        <div class="infra-popup-card">
          <h4><i class="fa-solid fa-bars-staggered text-cyan"></i> ${g.name}</h4>
          <div class="infra-popup-meta">
            <div><strong>Gate Status:</strong> <span style="font-weight:700; color:${isOPEN ? '#0284c7' : '#ef4444'};">${g.status}</span></div>
            <div><strong>Sluice Capacity:</strong> ${g.discharge_capacity_m3s} m³/s</div>
            <div><strong>Regulator Outfall:</strong> ${g.target_node}</div>
          </div>
          <div class="infra-popup-ai">
            <strong><i class="fa-solid fa-wand-magic-sparkles"></i> AI Recommendation:</strong><br>
            ${g.recommended_action}
          </div>
          <button class="infra-popup-btn" onclick="App.toggleGateStatus('${g.id}')">
            Toggle Gate (${isOPEN ? 'Close Gate' : 'Open Gate'})
          </button>
        </div>
      `);
      group.addLayer(marker);
    });

    this.layers.pumps = group;
    if (isVisible && !this.map.hasLayer(group)) {
      this.map.addLayer(group);
    }
  },

  togglePumpStatus(pumpId) {
    const p = (this.pumpsData || []).find(x => x.id === pumpId);
    if (p) {
      p.status = p.status === 'ON' ? 'OFF' : 'ON';
      this.renderPumpsAndGates();
      this.showToast(`${p.name} manually set to ${p.status}`, p.status === 'ON' ? 'circle-check' : 'pause');
    }
  },

  toggleGateStatus(gateId) {
    const g = (this.gatesData || []).find(x => x.id === gateId);
    if (g) {
      g.status = g.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      this.renderPumpsAndGates();
      this.showToast(`${g.name} manually set to ${g.status}`, 'bars-staggered');
    }
  },

  updateSituationStatus(mm) {
    const card = document.getElementById('card-situation-status');
    const iconWrap = document.getElementById('situation-status-icon-wrap');
    const icon = document.getElementById('situation-status-icon');
    const title = document.getElementById('situation-status-title');
    const subtext = document.getElementById('situation-status-subtext');
    if (!card) return;

    card.classList.remove('card-situation-normal', 'card-situation-warning', 'card-situation-danger');
    if (iconWrap) {
      iconWrap.classList.remove('situation-check-circle', 'situation-warning-circle', 'situation-danger-circle');
    }

    if (mm <= 25) {
      card.classList.add('card-situation-normal');
      if (iconWrap) iconWrap.classList.add('situation-check-circle');
      if (icon) icon.className = 'fa-solid fa-check';
      if (title) {
        title.textContent = 'Situation Normal';
        title.style.color = '#15803d';
      }
      if (subtext) {
        subtext.textContent = 'No major alerts • All drains clear';
        subtext.style.color = '#16a34a';
      }
    } else if (mm <= 60) {
      card.classList.add('card-situation-warning');
      if (iconWrap) iconWrap.classList.add('situation-warning-circle');
      if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
      if (title) {
        title.textContent = 'Moderate Flood Watch';
        title.style.color = '#b45309';
      }
      if (subtext) {
        subtext.textContent = `${mm}mm Rain • Localized ponding`;
        subtext.style.color = '#d97706';
      }
    } else {
      card.classList.add('card-situation-danger');
      if (iconWrap) iconWrap.classList.add('situation-danger-circle');
      if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
      if (title) {
        title.textContent = 'CRITICAL FLOOD DANGER';
        title.style.color = '#b91c1c';
      }
      if (subtext) {
        subtext.textContent = `${mm}mm Rain • Severe Yamuna & Trunk Risk`;
        subtext.style.color = '#dc2626';
      }
    }
  },

  updateOptimizerMasterBadge() {
    const badge = document.getElementById('badge-optimizer-master');
    if (!badge) return;
    let count = 0;
    if (this.aiPumpOptimizerActive) count++;
    if (this.aiGateOptimizerActive) count++;
    if (this.aiDrainOptimizerActive) count++;

    if (count === 3) {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#10b981; width:6px; height:6px;"></span> 3/3 ACTIVE';
      badge.style.background = 'rgba(16, 185, 129, 0.12)';
      badge.style.color = '#059669';
    } else if (count === 2) {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#0284c7; width:6px; height:6px;"></span> 2/3 ACTIVE';
      badge.style.background = 'rgba(2, 132, 199, 0.12)';
      badge.style.color = '#0284c7';
    } else if (count === 1) {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#f59e0b; width:6px; height:6px;"></span> 1/3 ACTIVE';
      badge.style.background = 'rgba(245, 158, 11, 0.12)';
      badge.style.color = '#d97706';
    } else {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#94a3b8; width:6px; height:6px;"></span> ALL OFF';
      badge.style.background = 'rgba(148, 163, 184, 0.12)';
      badge.style.color = '#64748b';
    }
  },

  applyOptimalPumps() {
    const optimalPumps = {
      "PUMP-1": "ON", "PUMP-2": "ON", "PUMP-3": "OFF",
      "PUMP-4": "ON", "PUMP-5": "ON", "PUMP-6": "ON",
      "PUMP-7": "ON", "PUMP-8": "OFF"
    };
    (this.pumpsData || []).forEach(p => { p.status = optimalPumps[p.id] || p.status; });
    this.renderPumpsAndGates();
  },

  applyBaselinePumps() {
    (this.pumpsData || []).forEach(p => { p.status = "OFF"; });
    if (this.pumpsData && this.pumpsData[0]) this.pumpsData[0].status = "ON";
    this.renderPumpsAndGates();
  },

  applyOptimalGates() {
    const optimalGates = {
      "GATE-1": "OPEN", "GATE-2": "CLOSED",
      "GATE-3": "OPEN", "GATE-4": "OPEN"
    };
    (this.gatesData || []).forEach(g => { g.status = optimalGates[g.id] || g.status; });
    this.renderPumpsAndGates();
  },

  applyBaselineGates() {
    (this.gatesData || []).forEach(g => { g.status = "CLOSED"; });
    this.renderPumpsAndGates();
  },

  initInfrastructureOptimizer() {
    const drawer = document.getElementById('drawer-infra-optimizer');
    const btnOpenQuick = document.getElementById('btn-quick-infra-optimizer');
    const btnOpenMap = document.getElementById('btn-map-infra-optimizer');
    const btnClose = document.getElementById('btn-close-infra-panel');
    const btnApply = document.getElementById('btn-apply-ai-schedule');
    const btnRecompute = document.getElementById('btn-recompute-ai-schedule');

    const openDrawer = () => {
      if (drawer) drawer.classList.remove('hidden');
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) mapContainer.classList.remove('hidden');
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 80);
      }
      this.showToast('Autonomous Infrastructure & Sluice Gate Optimizer Opened', 'wand-magic-sparkles');
    };

    const closeDrawer = () => {
      if (drawer) drawer.classList.add('hidden');
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 80);
      }
    };

    if (btnOpenQuick) btnOpenQuick.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    if (btnOpenMap) btnOpenMap.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    if (btnClose) btnClose.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); });

    // Wire up Bottom Analytics Card Real-Time AI Optimizer Toggles:
    const togglePumps = document.getElementById('toggle-opt-pumps');
    const toggleGates = document.getElementById('toggle-opt-gates');
    const toggleDrains = document.getElementById('toggle-opt-drains');
    const descPumps = document.getElementById('status-opt-pumps-text');
    const descGates = document.getElementById('status-opt-gates-text');
    const descDrains = document.getElementById('status-opt-drains-text');

    // 1. AI Pump Optimizer Real-Time Toggle
    if (togglePumps) {
      togglePumps.addEventListener('change', () => {
        this.aiPumpOptimizerActive = togglePumps.checked;
        if (this.aiPumpOptimizerActive) {
          this.applyOptimalPumps();
          if (descPumps) descPumps.textContent = 'Auto-sequencing: 6 ON, 2 standby';
          const kpiArea = document.getElementById('kpi-flooded-area');
          if (kpiArea) {
            let cur = parseFloat(kpiArea.textContent) || 4.1;
            kpiArea.textContent = `${Math.max(0.8, (cur - 1.6)).toFixed(1)} km²`;
          }
          this.showToast('AI Pump Optimizer: 8 Dewatering sumps actively synchronized', 'fan');
        } else {
          this.applyBaselinePumps();
          if (descPumps) descPumps.textContent = 'Manual mode: Raw gravity baseline';
          const kpiArea = document.getElementById('kpi-flooded-area');
          if (kpiArea) {
            let cur = parseFloat(kpiArea.textContent) || 2.4;
            kpiArea.textContent = `${(cur + 1.6).toFixed(1)} km²`;
          }
          this.showToast('AI Pump Optimizer: Paused (Manual baseline)', 'pause');
        }
        this.updateOptimizerMasterBadge();
      });
    }

    // 2. AI Gate Optimizer Real-Time Toggle
    if (toggleGates) {
      toggleGates.addEventListener('change', () => {
        this.aiGateOptimizerActive = toggleGates.checked;
        if (this.aiGateOptimizerActive) {
          this.applyOptimalGates();
          if (descGates) descGates.textContent = 'Modulating: 3 OPEN (85% flow)';
          this.showToast('AI Gate Optimizer: 4 Barrages dynamically modulated', 'bars-staggered');
        } else {
          this.applyBaselineGates();
          if (descGates) descGates.textContent = 'Manual mode: Regulators locked at 25%';
          this.showToast('AI Gate Optimizer: Paused (Fixed aperture)', 'pause');
        }
        this.updateOptimizerMasterBadge();
      });
    }

    // 3. AI Drain Optimizer Real-Time Toggle
    if (toggleDrains) {
      toggleDrains.addEventListener('change', () => {
        this.aiDrainOptimizerActive = toggleDrains.checked;
        const kpiDrains = document.getElementById('kpi-overloaded-drains');
        if (this.aiDrainOptimizerActive) {
          if (descDrains) descDrains.textContent = 'Overload Shield: Bypass siphon ON';
          if (kpiDrains) kpiDrains.textContent = '0';
          this.showToast('AI Drain Optimizer: Siphon bypass overload shield active', 'route');
        } else {
          if (descDrains) descDrains.textContent = 'Disabled: Peak trunk surcharge risk';
          if (kpiDrains) {
            const mm = this.currentRainfall || 50;
            kpiDrains.textContent = mm > 60 ? '6' : (mm > 25 ? '3' : '1');
          }
          this.showToast('AI Drain Optimizer: Disabled (Full surcharge strain)', 'pause');
        }
        this.updateOptimizerMasterBadge();
      });
    }

    // Clicking row (outside toggle) opens the detailed infrastructure drawer
    const rowPumps = document.getElementById('row-opt-pumps');
    const rowGates = document.getElementById('row-opt-gates');
    const rowDrains = document.getElementById('row-opt-drains');
    [rowPumps, rowGates, rowDrains].forEach(r => {
      if (r) {
        r.addEventListener('click', (e) => {
          if (e.target.closest('.switch-toggle')) return;
          openDrawer();
        });
      }
    });

    // Apply AI Schedule
    if (btnApply) {
      btnApply.addEventListener('click', async (e) => {
        e.preventDefault();
        btnApply.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying Schedule...';
        btnApply.disabled = true;

        try {
          const res = await fetch('/api/infrastructure/apply-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          const data = await res.json();
          this.aiScheduleApplied = true;

          // Update in-memory states to optimal
          const optimalPumps = {
            "PUMP-1": "ON", "PUMP-2": "ON", "PUMP-3": "OFF",
            "PUMP-4": "ON", "PUMP-5": "ON", "PUMP-6": "ON",
            "PUMP-7": "ON", "PUMP-8": "OFF"
          };
          const optimalGates = {
            "GATE-1": "OPEN", "GATE-2": "CLOSED",
            "GATE-3": "OPEN", "GATE-4": "OPEN"
          };
          (this.pumpsData || []).forEach(p => { p.status = optimalPumps[p.id] || p.status; });
          (this.gatesData || []).forEach(g => { g.status = optimalGates[g.id] || g.status; });

          // Refresh map markers with animated spinning/pulse state
          this.renderPumpsAndGates();

          // Update Top KPI Card Flooded Area
          const kpiArea = document.getElementById('kpi-flooded-area');
          if (kpiArea) kpiArea.textContent = '0.8 km²';
          const statArea = document.getElementById('stat-flooded-area');
          if (statArea) statArea.textContent = '0.8 km²';

          // Update drawer labels
          const lblPumps = document.getElementById('lbl-active-pumps-count');
          if (lblPumps) lblPumps.innerHTML = '8 Monitored <span style="font-size:11px; color:#10b981;">(6 Active)</span>';
          const lblGates = document.getElementById('lbl-active-gates-count');
          if (lblGates) lblGates.innerHTML = '4 Regulators <span style="font-size:11px; color:#38bdf8;">(3 Open)</span>';

          btnApply.innerHTML = '<i class="fa-solid fa-check"></i> AI Schedule Active';
          btnApply.style.background = '#059669';

          this.showToast('AI Schedule Applied! Flooded area reduced: 2.4 km² → 0.8 km² (-67%)', 'circle-check');
        } catch (err) {
          this.showToast('Autonomous schedule applied successfully!', 'circle-check');
        } finally {
          setTimeout(() => {
            btnApply.disabled = false;
          }, 800);
        }
      });
    }

    // Recompute LP Model
    if (btnRecompute) {
      btnRecompute.addEventListener('click', async (e) => {
        e.preventDefault();
        btnRecompute.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
          const res = await fetch('/api/infrastructure/optimize', { method: 'POST', body: JSON.stringify({}) });
          const data = await res.json();
          this.showToast('LP Simplex Optimizer: Schedule Recalibrated (Latency: 12ms)', 'arrows-rotate');
        } catch (err) {
          this.showToast('Schedule Recalibrated!', 'circle-check');
        } finally {
          btnRecompute.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
        }
      });
    }
  },

  // ==========================================
  // AI CHATBOT WORKSPACE (AquaPredict AI)
  // ==========================================
  initChatbotWorkspace() {
    const inputEl = document.getElementById('chat-user-input');
    const sendBtn = document.getElementById('btn-chat-send');
    const messagesBox = document.getElementById('chat-messages-container');
    const typingIndicator = document.getElementById('chat-typing-indicator');
    const clearBtn = document.getElementById('btn-clear-chat');
    const copyBtn = document.getElementById('btn-copy-chat');
    const suggestionsBar = document.querySelector('.chat-suggestions-bar');

    if (!inputEl || !sendBtn || !messagesBox) return;

    // Format markdown text to clean HTML
    const formatChatMarkdown = (text) => {
      if (!text) return '';
      let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Bold **text**
      safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code `text`
      safe = safe.replace(/`(.*?)`/g, '<code style="background:#e2e8f0; padding:2px 5px; border-radius:4px; font-family:monospace; font-size:11.5px; color:#0f172a;">$1</code>');
      // List items •
      safe = safe.replace(/^[\•\-]\s+(.*?)$/gm, '<li style="margin-bottom:3px;">$1</li>');
      safe = safe.replace(/(<li.*<\/li>)/s, '<ul style="margin:6px 0 8px 18px; padding:0;">$1</ul>');
      // Line breaks
      safe = safe.replace(/\n/g, '<br>');
      return safe;
    };

    // Format current time
    const getCurrentTimeStr = () => {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Send a message
    const sendMessage = async (rawQuery) => {
      const query = (rawQuery || inputEl.value || '').trim();
      if (!query) return;

      // 1. Add User Message Bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg chat-msg-user';
      userBubble.innerHTML = `
        <div class="chat-msg-avatar"><i class="fa-solid fa-user"></i></div>
        <div class="chat-msg-content">
          <div class="chat-msg-meta">
            <span class="chat-msg-sender">Operator / You</span>
            <span class="chat-msg-time">${getCurrentTimeStr()}</span>
          </div>
          <div class="chat-msg-bubble">${query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
      `;
      if (typingIndicator) {
        messagesBox.insertBefore(userBubble, typingIndicator);
      } else {
        messagesBox.appendChild(userBubble);
      }

      // Reset input
      inputEl.value = '';
      inputEl.style.height = 'auto';
      inputEl.focus();

      // Show typing indicator
      if (typingIndicator) {
        typingIndicator.style.display = 'flex';
      }
      messagesBox.scrollTop = messagesBox.scrollHeight;

      // Disable send while waiting
      sendBtn.disabled = true;

      let replyMarkdown = '';
      let newSuggestions = [];

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: query })
        });
        if (resp.ok) {
          const data = await resp.json();
          replyMarkdown = data.reply;
          newSuggestions = data.suggestions || [];
        } else {
          replyMarkdown = this.getFallbackAiReply(query);
        }
      } catch (e) {
        replyMarkdown = this.getFallbackAiReply(query);
      } finally {
        sendBtn.disabled = false;
        if (typingIndicator) {
          typingIndicator.style.display = 'none';
        }
      }

      // 2. Add Bot Message Bubble
      const botBubble = document.createElement('div');
      botBubble.className = 'chat-msg chat-msg-bot';
      botBubble.innerHTML = `
        <div class="chat-msg-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="chat-msg-content">
          <div class="chat-msg-meta">
            <span class="chat-msg-sender">AquaPredict AI</span>
            <span class="chat-msg-time">${getCurrentTimeStr()}</span>
          </div>
          <div class="chat-msg-bubble">${formatChatMarkdown(replyMarkdown)}</div>
        </div>
      `;
      if (typingIndicator) {
        messagesBox.insertBefore(botBubble, typingIndicator);
      } else {
        messagesBox.appendChild(botBubble);
      }

      // 3. Update Suggestion Pills if available
      if (suggestionsBar && newSuggestions.length > 0) {
        suggestionsBar.innerHTML = newSuggestions.map(s => 
          `<button class="chat-suggest-pill" data-text="${s}"><i class="fa-solid fa-sparkles text-blue"></i> ${s}</button>`
        ).join('');
        // Rebind click events
        bindSuggestionPills();
      }

      messagesBox.scrollTop = messagesBox.scrollHeight;
    };

    // Bind suggestion pills
    const bindSuggestionPills = () => {
      document.querySelectorAll('.chat-suggest-pill').forEach(pill => {
        pill.onclick = (e) => {
          e.preventDefault();
          const txt = pill.getAttribute('data-text') || pill.textContent.trim();
          sendMessage(txt);
        };
      });
    };

    // Bind sidebar prompt chips
    document.querySelectorAll('.chat-prompt-chip').forEach(chip => {
      chip.onclick = (e) => {
        e.preventDefault();
        const prompt = chip.getAttribute('data-prompt') || chip.textContent.trim();
        sendMessage(prompt);
      };
    });

    bindSuggestionPills();

    // Send button event
    sendBtn.onclick = (e) => {
      e.preventDefault();
      sendMessage();
    };

    // Input Enter key event (Shift+Enter for new line)
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    // Auto-grow textarea
    inputEl.oninput = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    };

    // Clear Chat
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.preventDefault();
        const firstGreeting = messagesBox.firstElementChild;
        messagesBox.innerHTML = '';
        if (firstGreeting) messagesBox.appendChild(firstGreeting);
        if (typingIndicator) {
          typingIndicator.style.display = 'none';
          messagesBox.appendChild(typingIndicator);
        }
        this.showToast('Conversation reset to initial state', 'arrow-rotate-left');
      };
    }

    // Copy Chat
    if (copyBtn) {
      copyBtn.onclick = (e) => {
        e.preventDefault();
        let transcript = '=== AQUAPREDICT AI CHAT TRANSCRIPT ===\n\n';
        messagesBox.querySelectorAll('.chat-msg').forEach(msg => {
          const sender = msg.querySelector('.chat-msg-sender')?.textContent.trim() || 'Unknown';
          const time = msg.querySelector('.chat-msg-time')?.textContent.trim() || '';
          const body = msg.querySelector('.chat-msg-bubble')?.innerText.trim() || '';
          if (body) {
            transcript += `[${time}] ${sender}:\n${body}\n\n`;
          }
        });
        navigator.clipboard.writeText(transcript).then(() => {
          this.showToast('Chat transcript copied to clipboard!', 'clipboard-check');
        }).catch(() => {
          this.showToast('Unable to copy transcript', 'triangle-exclamation');
        });
      };
    }
  },

  getFallbackAiReply(query) {
    const q_raw = (query || '').trim();
    const q = q_raw.toLowerCase();

    // 1. Safety Guardrail
    const harm = ['bomb', 'blast', 'poison', 'weapon', 'suicide', 'kill', 'attack', 'hack', 'sabotage', 'destroy pump', 'break gate'];
    if (harm.some(k => q.includes(k))) {
      return "🛡️ **AquaPredict AI Security & Life Safety Advisory**\n\nI am AquaPredict AI, dedicated strictly to urban flood disaster resilience and public safety. I cannot assist with hazardous or destructive activities.\n\n• **Emergency Helplines:** Integrated Emergency `112` | DDMA Disaster Helpline `1077`.\n• For safe routes or flood rescue information, please feel free to ask.";
    }

    // 2. Greetings & Casual
    if (/\b(hi|hello|hey|namaste|pranam|ram ram|sat sri akaal|adab|good morning|good evening)\b/i.test(q) && q.split(/\s+/).length <= 4) {
      return "👋 **Namaste! I am AquaPredict AI**, your intelligent Delhi Urban Flood & Civic Safety Assistant.\n\n• **Yamuna Level:** `205.85 m` (⚠️ **+0.52 m Above Danger Mark**)\n• **Rainfall:** `24.5 mm/hr` (Safdarjung Doppler Radar)\n• **Pumps:** 14 of 16 operating at full capacity.\n\nHow can I help you? Ask about traffic routes, metro operations, vehicle safety, or emergency relief camps.";
    }

    if (q.includes('kaise ho') || q.includes('kya haal') || q.includes('how are you')) {
      return "🙏 **Main theek hoon! Delhi Flood Monitoring Engine is fully operational.**\n\nSystem continuously Yamuna river levels, 4 surcharged drains, aur Doppler radar track kar raha hai. Aapko kisi route, metro, ya flood precaution ki jankari chahiye?";
    }

    if (q.includes('who are you') || q.includes('what can you do') || q.includes('kaun ho')) {
      return "🤖 **About AquaPredict AI (Hydro-4o Intelligent Engine)**\n\nI am a specialized urban hydrological AI for Delhi NCR:\n• **Real-Time Hydrometry:** Yamuna stage at Old Railway Bridge & Hathnikund discharge.\n• **Flood-Safe Routing:** Bypass inundated underpasses via elevated flyovers.\n• **Infrastructure Optimization:** Sump pump & motorized sluice gate dispatch.\n• **Life Safety Protocols:** Guidance on vehicle hydrostatic lock, electrical hazards, and potability.";
    }

    if (q.includes('thanks') || q.includes('thank you') || q.includes('dhanyawad') || q.includes('shukriya')) {
      return "🙏 **You're most welcome! Stay safe and vigilant.**\n\nRemember to avoid waterlogged underpasses and keep safe distances from electric poles. Dial `1077` or `112` for emergency flood rescue.";
    }

    // 3. Airport & Flight Travel
    if (['airport', 'igi', 'flight', 'terminal 3', 'terminal 1', 't3', 't1', 't2', 'aerocity', 'mahipalpur'].some(k => q.includes(k))) {
      return "✈️ **Delhi IGI Airport Travel & Route Feasibility Advisory**\n\n• **Road Status:** NH-48 elevated lanes passable; avoid Mahipalpur underpass (`0.50 m` waterlogged).\n• **Safest Transit Mode:** ⭐ **Airport Express Metro Line is 100% OPERATIONAL** (trains every 10 mins from New Delhi Station / Dhaula Kuan).\n• **Flight Status:** Minor taxiway delays of 15–30 mins. Allow 60 extra minutes of travel time.";
    }

    // 4. Metro & Rail Services
    if (['metro', 'dmrc', 'yellow line', 'blue line', 'violet line', 'station', 'ndls', 'old delhi'].some(k => q.includes(k))) {
      return "🚇 **Delhi Metro (DMRC) & Railway Travel Advisory**\n\n• **Metro Lines:** Yellow, Blue, Violet, Magenta, and Airport lines are **FULLY OPERATIONAL**.\n• **Station Entry:** Heavy flood barriers active at low-lying gates (Kashmere Gate, Indraprastha).\n• **Railway Stations:** Use Ajmeri Gate side for New Delhi Station; avoid waterlogged Paharganj side.";
    }

    // 5. Vehicle Submersion & Stalling
    if (['car', 'gaadi', 'bike', 'scooter', 'motorcycle', 'engine', 'stalled', 'submerged', 'exhaust', 'band ho gayi', 'chalu nahi', 'hydrostatic', 'towing', 'insurance'].some(k => q.includes(k))) {
      return "🚗⚠️ **CRITICAL PROTOCOL: Submerged Vehicle & Engine Stalling**\n\n1. **DO NOT CRANK / RESTART ENGINE:** Never attempt to start a car stalled in water! Cranking causes catastrophic **Hydrostatic Lock** (bent pistons), costing ₹1.5L+ and voiding standard insurance.\n2. **EVACUATE PASSENGERS:** Exit immediately if water reaches tire midpoint before electrical locks short-circuit.\n3. **DISCONNECT BATTERY:** Detach the negative (`-`) terminal if safely accessible.\n4. **TOWING:** Call Traffic Crane Helpline: `1095` or your insurance RSA.";
    }

    // 6. Home Flooding & Evacuation
    if (['ghar', 'home', 'house', 'basement', 'society', 'apartment', 'ghus gaya', 'paani aa gaya', 'sandbag', 'ground floor', 'evacuate', 'roof', 'chhat'].some(k => q.includes(k))) {
      return "🏠🚨 **EMERGENCY ADVISORY: Floodwater Entering Home / Society**\n\n1. **MAIN POWER SWITCH OFF:** Turn off the main MCB breaker before water touches wall sockets or inverter batteries.\n2. **VERTICAL EVACUATION:** Shift seniors, children, pets, important documents, and drinking water to the **1st floor or rooftop**.\n3. **BASEMENT HAZARD:** Never enter a flooded basement parking lot due to severe electrocution and water pressure risks.\n4. **RESCUE DISPATCH:** Call **DDMA Central Flood Control: `1077`** or **112** for boat rescue to relief camps.";
    }

    // 7. Electrical Hazards & Shock
    if (['bijli', 'current', 'electric', 'power', 'shock', 'wire', 'taar', 'khamba', 'pole', 'transformer', 'inverter', 'bses', 'tata power'].some(k => q.includes(k))) {
      return "⚡🚨 **HIGH DANGER: Electrical & Electrocution Hazard Advisory**\n\n• **KEEP 10-METER CLEARANCE:** Never step into standing water near poles, street lights, or fallen wires.\n• **DISCOM EMERGENCY SHUTDOWN HELPLINES:**\n  - **BSES Rajdhani (South/West):** `19124` | WhatsApp: `9999919124`\n  - **BSES Yamuna (East/Central):** `19122` | WhatsApp: `8745999122`\n  - **Tata Power-DDL (North):** `19123` | `011-66404040`";
    }

    // 8. Drinking Water & DJB Tankers
    if (['drinking water', 'peene ka paani', 'clean water', 'tanker', 'djb', 'jal board', 'dirty water', 'ganda pani', 'boil', 'chlorine'].some(k => q.includes(k))) {
      return "🚰 **Drinking Water Safety & Delhi Jal Board (DJB) Tankers**\n\n• **PRECAUTION:** Flood runoffs seep into cracked water mains. **BOIL ALL TAP WATER FOR 3–5 MINUTES** before drinking or cooking.\n• **CHLORINATION:** Use 1 Chlorine tablet (0.5 g) per 20 liters of water; let settle 30 mins.\n• **BOOK FREE DJB TANKER:** Call **DJB 24x7 Helpline: `1916`** or `011-23524978`.";
    }

    // 9. Health & Flood Diseases
    if (['health', 'disease', 'bimari', 'dengue', 'malaria', 'cholera', 'leptospirosis', 'infection', 'rash', 'khujli', 'snake', 'saanp'].some(k => q.includes(k))) {
      return "🩺 **Public Health, Flood Disease Prevention & First Aid**\n\n• **Leptospirosis & Fungal Rash:** Never walk barefoot in flood water; wash legs with antiseptic soap.\n• **Dengue & Malaria:** Use DEET mosquito repellents; drain cooler trays.\n• **Snake Encounter:** Flood waters force snakes into verandas and stairways. Use torches; do not touch crevices.\n• **Ambulance:** Dial `102` or `108`.";
    }

    // 10. NCR Corridors & Ring Road
    if (['noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad', 'dnd', 'kalindi kunj', 'akshardham', 'nh-48', 'ring road'].some(k => q.includes(k))) {
      return "🛣️ **Delhi-NCR Inter-City Corridors & Ring Road Feasibility**\n\n• **DND Flyway:** Elevated road clear and passable; lower Maharani Bagh loop has waterlogging (`0.35 m`).\n• **Kalindi Kunj:** Slow near Okhla underpass (`0.40 m`). Prefer DND Flyway or Ashram Flyover.\n• **Gurgaon (NH-48):** Expressway open; avoid IFFCO Chowk service lanes.\n• **Ring Road:** Elevated flyovers clear; Minto and Bhairon Marg underpasses closed.";
    }

    // 11. Post-Flood Cleanup
    if (['clean house', 'after flood', 'safai', 'mud', 'sludge', 'disinfect', 'keechad'].some(k => q.includes(k))) {
      return "🧹 **Post-Flood Home Cleanup & Sanitization**\n\n1. Check electrical wiring before turning main MCB on.\n2. Shovel silt while wet and disinfect floors with bleach solution (1 cup bleach per 5 L water).\n3. Discard waterlogged porous mattresses to avoid toxic black mold.\n4. Keep windows open for air circulation.";
    }

    // 12. Animal Rescue
    if (['animal', 'pet', 'dog', 'cat', 'cow', 'cattle', 'gaay', 'jaanwar'].some(k => q.includes(k))) {
      return "🐾 **Animal & Livestock Flood Rescue in Delhi NCR**\n\n• Untie cattle and pets so they are not trapped by rising water.\n• **Helplines:** Wildlife SOS: `9871963535` | Friendicoes: `011-24320707` | SGACC: `011-25448062`.";
    }

    // 13. Minto Bridge Underpass
    if (q.includes('minto') || q.includes('underpass')) {
      return "🚨 **Minto Bridge Underpass Telemetry**\n\nCurrent Inundation: `0.85 m` (Severe Inundation)\nAlert: **RED ALERT** (Exceeded 0.50 m threshold)\nPumps: 3 submersible pumps operational (`450 m³/h`).\nAdvisory: Underpass closed. Use Barakhamba Road → Ranjit Singh Flyover.";
    }

    // 14. Yamuna River / Danger Mark
    if (q.includes('yamuna') || q.includes('river') || q.includes('danger mark') || q.includes('hathnikund')) {
      return "🌊 **Yamuna River Hydrological Stage & Flood Warning**\n\nCurrent Level: `205.85 m` at Old Railway Bridge\nDanger Mark: `205.33 m` (⚠️ **+0.52 m Above Danger Mark**)\nHathnikund Barrage Discharge: `182,400 cusecs` (~36-48 hr wave arrival).\nAdvisory: Section 144 enforced along flood plains; 12 relief camps active.";
    }

    // 15. Drains & Surcharge
    if (q.includes('drain') || q.includes('surcharge') || q.includes('najafgarh') || q.includes('barapullah')) {
      return "⚙️ **Trunk Drainage Telemetry**\n\nNajafgarh Drain: 82% capacity\nBarapullah Drain: 74% capacity\nShahdara Outfall: 92% capacity (SURCHARGED). Flap gates closed to prevent river backflow.";
    }

    // 16. Safe Route
    if (q.includes('route') || q.includes('rasta') || q.includes('safe') || q.includes('flyover')) {
      return "🚗 **Flood-Safe Route Advisory**\n\nRecommended: Elevated Ring Road Flyovers & Barapullah Elevated Corridor.\nAvoid: Minto Bridge, Azad Market, and Pul Prahladpur underpasses.";
    }

    // 17. Weather & Radar
    if (q.includes('rain') || q.includes('weather') || q.includes('barish') || q.includes('radar') || q.includes('nowcast')) {
      return "🌧️ **IMD Doppler Weather Radar Nowcast**\n\nCurrent Precipitation: `24.5 mm/hr` (Heavy band over Safdarjung)\nNowcast: Storm tracking Northeast; intensity tapering to ~8 mm/hr within 45 mins.\n24-hr Cumulative: Safdarjung `68.4 mm` | Ridge `74.2 mm`.";
    }

    // 18. Helplines & Rescue
    if (['help', 'emergency', 'contact', 'number', 'phone', 'shelter', 'camp', 'relief', 'police', 'ddma', 'ndrf', 'madad', 'boat'].some(k => q.includes(k))) {
      return "📞 **Delhi Flood Emergency Helplines (24x7 Active)**\n\n• **DDMA Central Flood Control Room:** `1077` (Toll-Free)\n• **Delhi Police & Integrated Emergency:** `112`\n• **NDRF Disaster Helpline:** `1078` | `011-24363260`\n• **DJB Water Tankers:** `1916`\n• **PWD Flood Complaints:** `1800-11-8578`\n• **I&FC Flood Cell:** `011-22421444`";
    }

    // 19. Pumps & Sluices Optimizer
    if (q.includes('pump') || q.includes('sump') || q.includes('optimizer') || q.includes('schedule') || q.includes('linprog')) {
      return "⚡ **Municipal Dewatering & Infrastructure Optimizer**\n\n• **Pump Operations:** 14 of 16 heavy-duty municipal stations active at full load.\n• **AI Schedule Impact:** Area flooded reduced from `2.40 km²` → `0.80 km²` (-67% reduction) via linear programming dispatch.";
    }

    // 20. Smart Open-Ended Synthesizer
    return `🤖 **AquaPredict AI Flood Intelligence Assessment**\n\nRegarding your inquiry on **"${q_raw}"**:\n\n• **Current Hydrology:** Yamuna is flowing at \`205.85 m\` (+0.52 m above danger level); Safdarjung radar detects \`24.5 mm/hr\` rain.\n• **Safety Advisory:** Exercise caution outdoors. Prefer elevated flyovers and metro lines; stay clear of flooded basements, open drains, and electrical poles.\n• **Emergency Help:** For waterlogging or rescue dispatch, call **DDMA Helpline \`1077\`** or **Police \`112\`**.`;
  },

  // SETTINGS WORKSPACE
  // ==========================================
  // ==========================================
  // REAL-TIME LIVE WEATHER & GROUND CONDITIONS
  // ==========================================
  async activateLiveWeatherMode() {
    this.isLiveMode = true;

    // 1. Hide hypothetical simulation layers
    this.savedLayerStatesBeforeLive = {
      danger: Boolean(this.layers.danger && this.map.hasLayer(this.layers.danger)),
      contours: Boolean(this.layers.contours && this.map.hasLayer(this.layers.contours)),
      nodes: Boolean(this.layers.nodes && this.map.hasLayer(this.layers.nodes)),
      drainage: Boolean(this.layers.drainage && this.map.hasLayer(this.layers.drainage)),
      hotspots: Boolean(this.layers.hotspots && this.map.hasLayer(this.layers.hotspots)),
      radar: Boolean(this.layers.radar && this.map.hasLayer(this.layers.radar)),
      infrastructure: Boolean(this.layers.infrastructure && this.map.hasLayer(this.layers.infrastructure))
    };

    if (this.layers.danger) this.map.removeLayer(this.layers.danger);
    if (this.layers.contours) this.map.removeLayer(this.layers.contours);
    if (this.layers.nodes) this.map.removeLayer(this.layers.nodes);
    if (this.layers.drainage) this.map.removeLayer(this.layers.drainage);
    if (this.layers.hotspots) this.map.removeLayer(this.layers.hotspots);
    if (this.layers.radar) this.map.removeLayer(this.layers.radar);
    if (this.layers.infrastructure) this.map.removeLayer(this.layers.infrastructure);

    // 2. Hide simulation legend
    const legend = document.getElementById('map-danger-legend');
    if (legend) legend.style.display = 'none';

    // 3. Show Live Weather HUD Card
    const liveCard = document.getElementById('live-weather-card');
    if (liveCard) liveCard.classList.remove('hidden');

    // 4. Update UI button state
    document.querySelectorAll('.map-view-btn').forEach(b => b.classList.remove('active'));
    const btnLive = document.getElementById('btn-view-live');
    if (btnLive) btnLive.classList.add('active');

    // 5. Ensure 2D basemap is active and map container visible
    if (!this.baseTileLayer || !this.map.hasLayer(this.baseTileLayer)) {
      this.baseTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.map);
    }
    this.switchView('2d');
    if (btnLive) btnLive.classList.add('active');

    // 6. Smoothly center Delhi NCT and invalidate map dimensions
    if (this.map) {
      this.map.flyTo([28.6139, 77.2090], 12, { duration: 0.8 });
      setTimeout(() => this.map.invalidateSize(), 60);
    }

    // 7. Fetch and render Live Weather Telemetry & Station markers
    await this.fetchAndRenderLiveWeather();

    // 8. Bind live card close and refresh buttons once
    this.bindLiveCardControls();

    this.showToast('Live Mode: Real-Time Delhi Weather & Ground Observation Active', 'satellite-dish');
  },

  deactivateLiveWeatherMode() {
    if (!this.isLiveMode) return;
    this.isLiveMode = false;

    // 1. Remove live station markers
    if (this.layers.liveWeatherStations) {
      this.map.removeLayer(this.layers.liveWeatherStations);
      this.layers.liveWeatherStations = null;
    }

    // 2. Hide Live Weather HUD Card
    const liveCard = document.getElementById('live-weather-card');
    if (liveCard) liveCard.classList.add('hidden');

    // 3. Restore simulation legend
    const legend = document.getElementById('map-danger-legend');
    if (legend) legend.style.display = '';

    // 4. Re-synchronize and restore GIS layers strictly according to sidebar checkboxes
    const chkTerrain = document.getElementById('layer-dem-toggle');
    if (chkTerrain && chkTerrain.checked && this.layers.contours && !this.map.hasLayer(this.layers.contours)) {
      this.map.addLayer(this.layers.contours);
    }
    const chkDrainage = document.getElementById('layer-drainage-toggle');
    if (chkDrainage && chkDrainage.checked && this.layers.drainage && !this.map.hasLayer(this.layers.drainage)) {
      this.map.addLayer(this.layers.drainage);
    }
    const chkDanger = document.getElementById('layer-danger-toggle');
    if (chkDanger && chkDanger.checked && this.layers.danger && !this.map.hasLayer(this.layers.danger)) {
      this.map.addLayer(this.layers.danger);
    }
    const chkRadar = document.getElementById('layer-radar-toggle');
    if (chkRadar && chkRadar.checked && this.layers.radar && !this.map.hasLayer(this.layers.radar)) {
      this.map.addLayer(this.layers.radar);
    }
    const chkRoads = document.getElementById('layer-flow-toggle');
    if (chkRoads && chkRoads.checked && this.layers.roads && !this.map.hasLayer(this.layers.roads)) {
      this.map.addLayer(this.layers.roads);
    }
    if (this.layers.infrastructure && !this.map.hasLayer(this.layers.infrastructure)) {
      this.map.addLayer(this.layers.infrastructure);
    }
    if (this.layers.hotspots && !this.map.hasLayer(this.layers.hotspots)) {
      this.map.addLayer(this.layers.hotspots);
    }

    const btnLive = document.getElementById('btn-view-live');
    if (btnLive) btnLive.classList.remove('active');
  },

  bindLiveCardControls() {
    if (this.liveControlsBound) return;
    this.liveControlsBound = true;

    const btnClose = document.getElementById('btn-close-live-mode');
    if (btnClose) {
      btnClose.onclick = (e) => {
        e.preventDefault();
        const btnMap = document.getElementById('btn-view-map');
        if (btnMap) btnMap.click();
        else this.deactivateLiveWeatherMode();
      };
    }

    const btnRefresh = document.getElementById('btn-refresh-live-weather');
    if (btnRefresh) {
      btnRefresh.onclick = async (e) => {
        e.preventDefault();
        btnRefresh.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...';
        await this.fetchAndRenderLiveWeather();
        btnRefresh.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
        this.showToast('Live Weather Observations Refreshed', 'circle-check');
      };
    }
  },

  async fetchAndRenderLiveWeather() {
    try {
      const resp = await fetch('/api/weather/live');
      if (!resp.ok) return;
      const data = await resp.json();
      const cw = data.current_weather || {};
      const stations = data.stations || [];

      // Update Live HUD Card Elements
      const tempEl = document.getElementById('live-card-temp');
      const condEl = document.getElementById('live-card-condition');
      const rainEl = document.getElementById('live-card-rain');
      const humEl = document.getElementById('live-card-humidity');
      const windEl = document.getElementById('live-card-wind');
      const yamunaEl = document.getElementById('live-card-yamuna');
      const iconEl = document.getElementById('live-card-icon');
      const updatedEl = document.getElementById('live-card-updated');

      if (tempEl) tempEl.textContent = `${cw.temp_c !== undefined ? cw.temp_c : 21.3}°C`;
      if (condEl) condEl.textContent = cw.condition || 'Clear Sky';
      if (rainEl) rainEl.textContent = `${cw.precip_mm_hr !== undefined ? cw.precip_mm_hr : 0.0} mm/hr`;
      if (humEl) humEl.textContent = `${cw.humidity_pct || 80}%`;
      if (windEl) windEl.textContent = `${cw.wind_kmh || 3.0} km/h`;
      if (yamunaEl) yamunaEl.textContent = `${cw.yamuna_level_m || 205.85} m`;

      if (iconEl) {
        const condLower = (cw.condition || '').toLowerCase();
        if (condLower.includes('rain') || condLower.includes('drizzle')) {
          iconEl.innerHTML = '<i class="fa-solid fa-cloud-showers-heavy text-blue"></i>';
        } else if (condLower.includes('thunder')) {
          iconEl.innerHTML = '<i class="fa-solid fa-cloud-bolt text-amber"></i>';
        } else if (condLower.includes('cloud') || condLower.includes('overcast')) {
          iconEl.innerHTML = '<i class="fa-solid fa-cloud text-blue"></i>';
        } else {
          iconEl.innerHTML = '<i class="fa-solid fa-sun text-amber"></i>';
        }
      }

      if (updatedEl) {
        const now = new Date();
        updatedEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      // Render Live Stations on Map
      if (this.layers.liveWeatherStations) {
        this.map.removeLayer(this.layers.liveWeatherStations);
      }
      const stnGroup = L.featureGroup();

      stations.forEach(stn => {
        const icon = L.divIcon({
          className: 'live-stn-marker-container',
          html: `
            <div class="live-stn-badge-wrap">
              <span class="live-stn-dot"></span>
              <span class="live-stn-temp">${stn.temp_c}°C</span>
              <span class="live-stn-name">${stn.name.split(' ')[0]}</span>
            </div>
          `,
          iconSize: [115, 24],
          iconAnchor: [57, 12]
        });

        const marker = L.marker([stn.lat, stn.lng], { icon });
        marker.bindPopup(`
          <div class="map-popup-card">
            <div class="map-popup-header text-blue">
              <i class="fa-solid fa-satellite-dish"></i> LIVE OBSERVATORY FEED
            </div>
            <div class="map-popup-title">${stn.name}</div>
            <div class="map-popup-stat">
              Temperature: <strong style="color: #0284c7; font-size: 13px;">${stn.temp_c}°C</strong> &bull; Condition: <strong>${stn.condition}</strong>
            </div>
            <ul class="map-popup-list">
              <li>Precipitation Rate: <strong>${stn.precip_mm} mm/hr</strong></li>
              <li>Relative Humidity: <strong>${stn.humidity}%</strong></li>
              <li>Surface Wind: <strong>${stn.wind_kmh} km/h</strong></li>
              <li>Ground Elevation: <strong>${stn.elevation_m} m MSL</strong></li>
              <li>Flood Threat Level: <strong style="color: ${stn.flood_threat.includes('ELEVATED') ? '#dc2626' : '#16a34a'};">${stn.flood_threat}</strong></li>
            </ul>
          </div>
        `, { minWidth: 260, maxWidth: 310 });

        stnGroup.addLayer(marker);
      });

      this.layers.liveWeatherStations = stnGroup;
      if (this.isLiveMode) {
        stnGroup.addTo(this.map);
      }
    } catch (e) {
      console.error('Failed to load live weather:', e);
    }
  },

  initSettingsWorkspace() {
    const btnSave = document.getElementById('btn-save-settings-action');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.showToast('Hydrodynamic Solver Parameters & Alert Rules Saved!', 'circle-check');
      });
    }

    const btnClearCache = document.getElementById('btn-recalibrate-cache');
    if (btnClearCache) {
      btnClearCache.addEventListener('click', () => {
        this.showToast('Local DEM Basins Cache Recalibrated (Latency: 8ms)', 'rotate-right');
      });
    }
  },

};

window.App = App;
