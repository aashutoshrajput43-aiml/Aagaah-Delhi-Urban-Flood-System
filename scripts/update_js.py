import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add properties to App object
prop_target = "  aiScheduleApplied: false,"
prop_replacement = """  aiScheduleApplied: false,

  // AI Infrastructure Real-Time Optimizers
  aiPumpOptimizerActive: true,
  aiGateOptimizerActive: true,
  aiDrainOptimizerActive: true,"""

if prop_target in code:
    code = code.replace(prop_target, prop_replacement, 1)
    print("Added optimizer state properties to App")
else:
    print("Warning: prop_target not found")

# 2. Add updateSituationStatus in triggerSimulationSync
sync_target = "      const elWarn = document.getElementById('stat-active-warnings');\n      if (elWarn) elWarn.textContent = data.active_warnings.join(' • ');"
sync_replacement = """      const elWarn = document.getElementById('stat-active-warnings');
      if (elWarn) elWarn.textContent = data.active_warnings.join(' • ');

      // Dynamically update Situation Status Card (Normal, Warning, Danger)
      this.updateSituationStatus(mm);"""

if sync_target in code:
    code = code.replace(sync_target, sync_replacement, 1)
    print("Added updateSituationStatus in triggerSimulationSync")
else:
    # Try with \r\n normalized
    code_norm = code.replace('\r\n', '\n')
    if sync_target in code_norm:
        code_norm = code_norm.replace(sync_target, sync_replacement, 1)
        code = code_norm
        print("Added updateSituationStatus in triggerSimulationSync (normalized)")
    else:
        print("Warning: sync_target not found")

# 3. Add updateSituationStatus call directly in updateSimRain
rain_target = "      this.renderDangerZones(mm);\n      this.triggerSimulationSync(mm, this.currentHorizon);"
rain_replacement = """      this.renderDangerZones(mm);
      this.updateSituationStatus(mm);
      this.triggerSimulationSync(mm, this.currentHorizon);"""

code_norm = code.replace('\r\n', '\n')
if rain_target in code_norm:
    code_norm = code_norm.replace(rain_target, rain_replacement, 1)
    code = code_norm
    print("Added updateSituationStatus call in updateSimRain")
else:
    print("Warning: rain_target not found")

# 4. Update Situation Card click listener
sit_card_target = """    // Situation card handler
    const sitCard = document.getElementById('card-situation-status');
    if (sitCard) {
      sitCard.addEventListener('click', () => {
        this.showToast('System Online: Hydrodynamic Models & GIS Nodes Synchronized', 'circle-check');
      });
    }"""

sit_card_replacement = """    // Situation dynamic card handler
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
    }"""

code_norm = code.replace('\r\n', '\n')
if sit_card_target in code_norm:
    code_norm = code_norm.replace(sit_card_target, sit_card_replacement, 1)
    code = code_norm
    print("Updated sitCard click listener")
else:
    print("Warning: sit_card_target not found")

# 5. Insert updateSituationStatus & optimizer helper methods in App object
methods_target = "  initInfrastructureOptimizer() {"
methods_replacement = """  updateSituationStatus(mm) {
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

  initInfrastructureOptimizer() {"""

code_norm = code.replace('\r\n', '\n')
if methods_target in code_norm:
    code_norm = code_norm.replace(methods_target, methods_replacement, 1)
    code = code_norm
    print("Added helper methods before initInfrastructureOptimizer")
else:
    print("Warning: methods_target not found")

# 6. Wire real-time toggle switches in initInfrastructureOptimizer
opt_wire_target = "    if (btnClose) btnClose.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); });"
opt_wire_replacement = """    if (btnClose) btnClose.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); });

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
    });"""

code_norm = code.replace('\r\n', '\n')
if opt_wire_target in code_norm:
    code_norm = code_norm.replace(opt_wire_target, opt_wire_replacement, 1)
    code = code_norm
    print("Wired up real-time optimizer toggle switches in initInfrastructureOptimizer")
else:
    print("Warning: opt_wire_target not found")

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("Successfully saved updated static/app.js")

