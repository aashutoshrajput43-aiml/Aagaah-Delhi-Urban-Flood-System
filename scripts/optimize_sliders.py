import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Add scheduler properties at the top of App
app_props_target = "  aiScheduleApplied: false,"
app_props_replacement = """  aiScheduleApplied: false,

  // Smooth Simulation Debounce & Throttling
  _simDebounceTimer: null,
  _simAbortCtrl: null,
  _simRafId: null,"""

js_norm = js.replace('\r\n', '\n')
if app_props_target in js_norm:
    js_norm = js_norm.replace(app_props_target, app_props_replacement, 1)
    print("Added scheduler properties to App")
else:
    print("Warning: app_props_target not found")

# 2. Add setSimulationRainfall and setSimulationTime methods before triggerSimulationSync
target_before_sync = "  async triggerSimulationSync(mm, horizon) {"
replacement_before_sync = """  setSimulationRainfall(val, isCommit = false) {
    if (this.isLiveMode) this.deactivateLiveWeatherMode();
    let mm = parseInt(val, 10) || 50;
    mm = Math.max(10, Math.min(150, mm));
    this.currentRainfall = mm;

    // 1. INSTANT ZERO-LATENCY UI UPDATES (Runs immediately in 0ms)
    const simInput = document.getElementById('sim-rainfall-input');
    const simRainSlider = document.getElementById('sim-rainfall-slider');
    if (simInput && parseInt(simInput.value, 10) !== mm) simInput.value = mm;
    if (simRainSlider && parseInt(simRainSlider.value, 10) !== mm) simRainSlider.value = mm;

    // Update scenario button active states
    document.querySelectorAll('.scenario-btn, .sim-preset-btn').forEach(b => {
      const bMm = parseInt(b.getAttribute('data-mm') || b.getAttribute('data-sim-mm'), 10);
      if (bMm === mm) b.classList.add('active');
      else b.classList.remove('active');
    });

    // Update Situation Card & KPIs instantly
    this.updateSituationStatus(mm);

    const kpiRain = document.getElementById('kpi-current-rainfall');
    if (kpiRain) kpiRain.textContent = `${mm} mm`;
    const elRain = document.getElementById('stat-rainfall');
    if (elRain) elRain.textContent = `${mm} mm`;

    const kpiRisk = document.getElementById('kpi-high-risk-zones');
    if (kpiRisk) kpiRisk.textContent = mm >= 100 ? '5' : (mm >= 50 ? '3' : '1');

    const kpiArea = document.getElementById('kpi-flooded-area');
    if (kpiArea) {
      const baseArea = (0.5 + (mm / 100.0) * 16.8) * (this.aiPumpOptimizerActive ? 0.35 : 1.0);
      kpiArea.textContent = `${baseArea.toFixed(1)} km²`;
    }

    const rainPill = document.getElementById('rain-scenario-pill');
    if (rainPill) {
      rainPill.innerHTML = `<i class="fa-solid fa-cloud-showers-heavy"></i> RAIN: SYNTHETIC RAINFALL SCENARIO (${mm} mm)`;
    }

    // 2. THROTTLED & DEBOUNCED HEAVY COMPUTATIONS
    if (this._simDebounceTimer) clearTimeout(this._simDebounceTimer);

    const executeHeavyWork = () => {
      if (this._simAbortCtrl) {
        try { this._simAbortCtrl.abort(); } catch (_) {}
      }
      this._simAbortCtrl = new AbortController();

      if (window.ThreeEngine) {
        window.ThreeEngine.updateRainfallScenario(mm);
        window.ThreeEngine.setSimulationState(mm, this.currentHorizon, this.simPlaying);
      }
      if (window.HydroRadarEngine2D) {
        window.HydroRadarEngine2D.setScenario(mm, this.currentHorizon, this.simPlaying);
      }

      if (this._simRafId) cancelAnimationFrame(this._simRafId);
      this._simRafId = requestAnimationFrame(() => {
        this.renderFloodDepthRasters(mm);
        this.renderDangerZones(mm);
      });

      this.triggerSimulationSync(mm, this.currentHorizon, this._simAbortCtrl.signal);
    };

    if (isCommit) {
      executeHeavyWork();
    } else {
      this._simDebounceTimer = setTimeout(executeHeavyWork, 40);
    }
  },

  setSimulationTime(val, isCommit = false) {
    if (this.isLiveMode) this.deactivateLiveWeatherMode();
    let mins = parseInt(val, 10);
    if (isNaN(mins)) mins = 60;
    mins = Math.max(0, Math.min(180, mins));
    this.currentHorizon = mins;

    // 1. INSTANT ZERO-LATENCY UI UPDATES
    const simTimeInput = document.getElementById('sim-time-input');
    const timelineEl = document.getElementById('simulation-timeline');
    const labSlider = document.getElementById('sim-lab-timeline-slider');
    const labLabel = document.getElementById('sim-lab-time-label');
    const minLabel = document.getElementById('timeline-current-min');

    if (simTimeInput && parseInt(simTimeInput.value, 10) !== mins) simTimeInput.value = mins;
    if (timelineEl && parseInt(timelineEl.value, 10) !== mins) timelineEl.value = mins;
    if (labSlider && parseInt(labSlider.value, 10) !== mins) labSlider.value = mins;
    if (labLabel) labLabel.textContent = `T + ${mins} min ${mins === 60 ? '(Peak)' : ''}`;
    if (minLabel) minLabel.textContent = `${mins} min ${mins === 60 ? '(Peak)' : ''}`;

    // 2. THROTTLED & DEBOUNCED HEAVY COMPUTATIONS
    if (this._simDebounceTimer) clearTimeout(this._simDebounceTimer);

    const executeHeavyWork = () => {
      if (this._simAbortCtrl) {
        try { this._simAbortCtrl.abort(); } catch (_) {}
      }
      this._simAbortCtrl = new AbortController();

      if (window.ThreeEngine) {
        window.ThreeEngine.setSimulationState(this.currentRainfall, mins, this.simPlaying);
      }
      if (window.HydroRadarEngine2D) {
        window.HydroRadarEngine2D.setScenario(this.currentRainfall, mins, this.simPlaying);
      }

      if (this._simRafId) cancelAnimationFrame(this._simRafId);
      this._simRafId = requestAnimationFrame(() => {
        this.renderFloodDepthRasters(this.currentRainfall);
      });

      this.triggerSimulationSync(this.currentRainfall, mins, this._simAbortCtrl.signal);
    };

    if (isCommit) {
      executeHeavyWork();
    } else {
      this._simDebounceTimer = setTimeout(executeHeavyWork, 40);
    }
  },

  async triggerSimulationSync(mm, horizon, signal = null) {"""

if target_before_sync in js_norm:
    js_norm = js_norm.replace(target_before_sync, replacement_before_sync, 1)
    print("Added setSimulationRainfall and setSimulationTime methods")
else:
    print("Warning: target_before_sync not found")

# 3. Update fetch call in triggerSimulationSync to use signal cleanly
old_fetch = "      const res = await fetch(`/api/simulation/current?scenario=${mm}&horizon=${horizon}`);\n      const data = await res.json();"
new_fetch = """      const fetchOpts = signal ? { signal } : {};
      const res = await fetch(`/api/simulation/current?scenario=${mm}&horizon=${horizon}`, fetchOpts);
      if (!res.ok) return;
      const data = await res.json();"""

if old_fetch in js_norm:
    js_norm = js_norm.replace(old_fetch, new_fetch, 1)
    print("Updated fetch in triggerSimulationSync with signal")
else:
    print("Warning: old_fetch not matched")

# Update catch block in triggerSimulationSync to ignore abort errors
old_catch = """    } catch (err) {
      console.error("Simulation sync error", err);
    }"""
new_catch = """    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn("Simulation sync error", err);
    }"""

if old_catch in js_norm:
    js_norm = js_norm.replace(old_catch, new_catch, 1)
    print("Updated catch block in triggerSimulationSync")

# 4. Refactor updateSimRain and updateSimTime in initDashboardInteractivity
old_sim_inputs = """    // 4. Rainfall Stepper Input & Range Slider (Intensity)
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
    }"""

new_sim_inputs = """    // 4. Smooth, Non-blocking Rainfall Stepper & Slider
    const simInput = document.getElementById('sim-rainfall-input');
    const simRainSlider = document.getElementById('sim-rainfall-slider');

    if (simInput) {
      simInput.addEventListener('input', (e) => this.setSimulationRainfall(e.target.value, false));
      simInput.addEventListener('change', (e) => this.setSimulationRainfall(e.target.value, true));
    }
    if (simRainSlider) {
      simRainSlider.addEventListener('input', (e) => this.setSimulationRainfall(e.target.value, false));
      simRainSlider.addEventListener('change', (e) => this.setSimulationRainfall(e.target.value, true));
    }

    // 4.5 Smooth, Non-blocking Time Stepper & Timeline Slider
    const simTimeInput = document.getElementById('sim-time-input');
    const timelineEl = document.getElementById('simulation-timeline');

    if (simTimeInput) {
      simTimeInput.addEventListener('input', (e) => this.setSimulationTime(e.target.value, false));
      simTimeInput.addEventListener('change', (e) => this.setSimulationTime(e.target.value, true));
    }
    if (timelineEl) {
      timelineEl.addEventListener('input', (e) => this.setSimulationTime(e.target.value, false));
      timelineEl.addEventListener('change', (e) => this.setSimulationTime(e.target.value, true));
    }"""

if old_sim_inputs in js_norm:
    js_norm = js_norm.replace(old_sim_inputs, new_sim_inputs, 1)
    print("Replaced old_sim_inputs with butter-smooth handlers")
else:
    print("Warning: old_sim_inputs not matched")

# 5. Replace scenario preset click listeners in initSimulationControls
old_scn_btns = """    scnBtns.forEach(btn => {
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
    });"""

new_scn_btns = """    scnBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mm = parseInt(btn.getAttribute('data-mm'), 10);
        this.setSimulationRainfall(mm, true);
        this.showToast(`Rainfall scenario set to ${mm} mm`, 'cloud-rain');
      });
    });"""

if old_scn_btns in js_norm:
    js_norm = js_norm.replace(old_scn_btns, new_scn_btns, 1)
    print("Replaced old_scn_btns with setSimulationRainfall")
else:
    print("Warning: old_scn_btns not matched")

# 6. Replace duplicate timeline input listener in initSimulationControls
old_timeline_listener = """    timeline.addEventListener('input', () => {
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
    });"""

new_timeline_listener = """    // Handled smoothly via setSimulationTime in initDashboardInteractivity"""

if old_timeline_listener in js_norm:
    js_norm = js_norm.replace(old_timeline_listener, new_timeline_listener, 1)
    print("Removed redundant duplicate timeline listener")
else:
    print("Warning: old_timeline_listener not matched")

# 7. Replace Sim Lab timeline slider duplicate listener
old_lab_timeline = """    if (labTimeline) {
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
    }"""

new_lab_timeline = """    if (labTimeline) {
      labTimeline.addEventListener('input', (e) => this.setSimulationTime(e.target.value, false));
      labTimeline.addEventListener('change', (e) => this.setSimulationTime(e.target.value, true));
    }"""

if old_lab_timeline in js_norm:
    js_norm = js_norm.replace(old_lab_timeline, new_lab_timeline, 1)
    print("Replaced old_lab_timeline with setSimulationTime")
else:
    print("Warning: old_lab_timeline not matched")

# 8. Optimize opacity sliders with RAF
old_opacity_slider = """      if (slider && valLabel) {
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
      }"""

new_opacity_slider = """      if (slider && valLabel) {
        let opacRaf = null;
        slider.addEventListener('input', () => {
          valLabel.textContent = `${slider.value}%`;
          if (opacRaf) cancelAnimationFrame(opacRaf);
          opacRaf = requestAnimationFrame(() => {
            const l = this.layers[cfg.layer];
            if (!l) return;
            const opVal = slider.value / 100.0;
            if (l.setStyle) {
              l.setStyle({ opacity: opVal, fillOpacity: opVal * 0.7 });
            } else if (l.setOpacity) {
              l.setOpacity(opVal);
            }
          });
        });
      }"""

if old_opacity_slider in js_norm:
    js_norm = js_norm.replace(old_opacity_slider, new_opacity_slider, 1)
    print("Optimized opacity sliders with requestAnimationFrame")
else:
    print("Warning: old_opacity_slider not matched")

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(js_norm)
print("Saved optimized static/app.js")
