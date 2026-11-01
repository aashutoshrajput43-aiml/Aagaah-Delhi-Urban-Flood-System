import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update renderPumpsAndGates
old_render_pumps = """  renderPumpsAndGates() {
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
  },"""

new_render_pumps = """  renderPumpsAndGates() {
    const toggleEl = document.getElementById('layer-pumps-toggle');
    const isVisible = (toggleEl ? toggleEl.checked : true) && (this.aiPumpOptimizerActive !== false);
    if (this.layers.pumps && this.map.hasLayer(this.layers.pumps)) {
      this.map.removeLayer(this.layers.pumps);
    }

    const group = L.featureGroup();

    // 1. Render 8 Mock Pumps with live status icons & spinning animation when active
    (this.pumpsData || []).forEach(p => {
      const isON = p.status === 'ON';
      const icon = L.divIcon({
        className: 'custom-infra-div-icon',
        html: `
          <div class="pump-marker-icon" title="${p.name} - Status: ${p.status}">
            <div class="pump-badge ${isON ? 'status-on' : 'status-off'}">
              <i class="fa-solid fa-fan ${isON ? 'fa-spin' : ''}"></i>
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

    this.layers.pumps = group;
    // Show on map ONLY if visible and optimizer is ON
    if (isVisible) {
      this.map.addLayer(group);
    }
  },"""

# Normalize
js_norm = js.replace('\r\n', '\n')
old_render_pumps_norm = old_render_pumps.replace('\r\n', '\n')
new_render_pumps_norm = new_render_pumps.replace('\r\n', '\n')

if old_render_pumps_norm in js_norm:
    js_norm = js_norm.replace(old_render_pumps_norm, new_render_pumps_norm, 1)
    print("Updated renderPumpsAndGates to strictly follow aiPumpOptimizerActive")
else:
    print("Warning: old_render_pumps not matched directly")

# 2. Update updateOptimizerMasterBadge
old_badge = """  updateOptimizerMasterBadge() {
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
  },"""

new_badge = """  updateOptimizerMasterBadge() {
    const badge = document.getElementById('badge-optimizer-master');
    if (!badge) return;
    if (this.aiPumpOptimizerActive !== false) {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#10b981; width:6px; height:6px;"></span> ACTIVE';
      badge.style.background = 'rgba(16, 185, 129, 0.12)';
      badge.style.color = '#059669';
    } else {
      badge.innerHTML = '<span class="live-pulse-dot" style="background:#94a3b8; width:6px; height:6px;"></span> INACTIVE';
      badge.style.background = 'rgba(148, 163, 184, 0.12)';
      badge.style.color = '#64748b';
    }
  },"""

old_badge_norm = old_badge.replace('\r\n', '\n')
new_badge_norm = new_badge.replace('\r\n', '\n')

if old_badge_norm in js_norm:
    js_norm = js_norm.replace(old_badge_norm, new_badge_norm, 1)
    print("Updated updateOptimizerMasterBadge")
else:
    print("Warning: old_badge not matched directly")

# 3. Update the toggle wiring in initInfrastructureOptimizer
old_wiring = """    // Wire up Bottom Analytics Card Real-Time AI Optimizer Toggles:
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
    });"""

new_wiring = """    // Wire up Bottom Analytics Card Real-Time AI Pump Optimizer Toggle:
    const togglePumps = document.getElementById('toggle-opt-pumps');
    const descPumps = document.getElementById('status-opt-pumps-text');
    const valMapStatus = document.getElementById('val-pump-map-status');
    const valDischarge = document.getElementById('val-pump-discharge');
    const iconAnim = document.getElementById('icon-pump-animated');

    // AI Pump Optimizer Toggle: ON = Show all pumps on map; OFF = Remove all pumps from map!
    if (togglePumps) {
      togglePumps.addEventListener('change', () => {
        this.aiPumpOptimizerActive = togglePumps.checked;
        if (this.aiPumpOptimizerActive) {
          // 1. RE-RENDER AND SHOW ALL PUMPS ON MAP
          this.applyOptimalPumps();
          if (this.layers.pumps && !this.map.hasLayer(this.layers.pumps)) {
            this.map.addLayer(this.layers.pumps);
          }
          // 2. UPDATE UI LABELS & ANIMATION
          if (descPumps) descPumps.innerHTML = '<span style="color:#059669; font-weight:700;">● All 8 Pumps Live on Map</span>';
          if (valMapStatus) { valMapStatus.textContent = '8 Visible'; valMapStatus.style.color = '#059669'; }
          if (valDischarge) { valDischarge.textContent = '12,400 m³/h'; valDischarge.style.color = '#2563eb'; }
          if (iconAnim) iconAnim.classList.add('pump-spin-animated');

          // Sync sidebar checkbox if present
          const sideToggle = document.getElementById('layer-pumps-toggle');
          if (sideToggle) sideToggle.checked = true;

          const kpiArea = document.getElementById('kpi-flooded-area');
          if (kpiArea) {
            let cur = parseFloat(kpiArea.textContent) || 4.1;
            kpiArea.textContent = `${Math.max(0.8, (cur - 1.6)).toFixed(1)} km²`;
          }
          this.showToast('AI Pump Optimizer ON: All 8 pumps visible on map', 'fan');
        } else {
          // 1. COMPLETELY REMOVE ALL PUMPS FROM MAP
          if (this.layers.pumps && this.map.hasLayer(this.layers.pumps)) {
            this.map.removeLayer(this.layers.pumps);
          }
          // 2. UPDATE UI LABELS & ANIMATION
          if (descPumps) descPumps.innerHTML = '<span style="color:#64748b; font-weight:600;">○ Pumps Hidden from Map</span>';
          if (valMapStatus) { valMapStatus.textContent = 'Hidden (OFF)'; valMapStatus.style.color = '#64748b'; }
          if (valDischarge) { valDischarge.textContent = '0 m³/h (Paused)'; valDischarge.style.color = '#64748b'; }
          if (iconAnim) iconAnim.classList.remove('pump-spin-animated');

          // Sync sidebar checkbox if present
          const sideToggle = document.getElementById('layer-pumps-toggle');
          if (sideToggle) sideToggle.checked = false;

          const kpiArea = document.getElementById('kpi-flooded-area');
          if (kpiArea) {
            let cur = parseFloat(kpiArea.textContent) || 2.4;
            kpiArea.textContent = `${(cur + 1.6).toFixed(1)} km²`;
          }
          this.showToast('AI Pump Optimizer OFF: All pumps removed from map', 'pause');
        }
        this.updateOptimizerMasterBadge();
      });
    }

    // Clicking hero box opens the detailed infrastructure drawer
    const heroBox = document.getElementById('pump-hero-card-box');
    if (heroBox) {
      heroBox.addEventListener('click', (e) => {
        if (e.target.closest('.switch-toggle')) return;
        openDrawer();
      });
    }"""

old_wiring_norm = old_wiring.replace('\r\n', '\n')
new_wiring_norm = new_wiring.replace('\r\n', '\n')

if old_wiring_norm in js_norm:
    js_norm = js_norm.replace(old_wiring_norm, new_wiring_norm, 1)
    print("Updated wiring in initInfrastructureOptimizer")
else:
    print("Warning: old_wiring not matched directly")

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(js_norm)
print("Saved updated static/app.js")

