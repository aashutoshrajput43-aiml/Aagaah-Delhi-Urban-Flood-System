import re

# 1. Patch static/three-view.js
with open('static/three-view.js', 'r', encoding='utf-8') as f:
    three_content = f.read()

# Replace animate() in ThreeEngine
three_animate_pattern = r'  animate\(\) \{\s+// Only animate when 3D container is actually visible on screen.*?this\.floodRenderer\.render\(this\.floodScene, this\.floodCamera\);\s+\}\s+\},'

new_three_animate = """  animate() {
    // Only animate when simulation workspace tab is open
    const simTab = document.getElementById('tab-view-simulation');
    if (!simTab || simTab.classList.contains('hidden') || simTab.style.display === 'none') {
      this.animId = null;
      return;
    }

    const viewFlood = document.getElementById('view-3d-flood');
    const viewElev = document.getElementById('view-3d-elevation');
    const isFloodVisible = viewFlood && !viewFlood.classList.contains('hidden') && viewFlood.style.display !== 'none';
    const isElevVisible = viewElev && !viewElev.classList.contains('hidden') && viewElev.style.display !== 'none';

    if (!isFloodVisible && !isElevVisible) {
      this.animId = null;
      return;
    }

    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock ? this.clock.getDelta() : 0.016;
    const time = this.clock ? this.clock.getElapsedTime() : (Date.now() * 0.001);

    if (isElevVisible && this.elevControls) this.elevControls.update();
    if (isFloodVisible && this.floodControls) this.floodControls.update();

    // 1. Smooth Lerp of Water Elevation
    this.currentWaterY += (this.baseTargetWaterY - this.currentWaterY) * 0.06;

    // 2. Water Surface Wave Ripples
    if (isFloodVisible && this.floodWaterMesh && this.floodWaterGeom && this.floodWaterPositionsOrig) {
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
    if (isFloodVisible && this.rainSystem && this.rainPositions && this.rainVelocities) {
      const pos = this.rainPositions;
      const vel = this.rainVelocities;
      const count = this.rainCount;
      const speedMult = this.isSimPlaying ? 1.4 : 1.0;

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= vel[i] * speedMult;
        if (pos[i * 3 + 1] < this.currentWaterY) {
          pos[i * 3 + 1] = 65 + Math.random() * 25;
          pos[i * 3 + 0] = (Math.random() - 0.5) * 200;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
      }
      this.rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    // 4. In-Terrain Gravity Flow Runoff Particles
    if (isFloodVisible && this.flowSystem && this.flowPositions && this.flowVelocities) {
      const pos = this.flowPositions;
      const vel = this.flowVelocities;
      const count = this.flowCount;
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
    if (isFloodVisible && this.hotspotRings.length > 0) {
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
    if (isFloodVisible && this.currentRainfall >= 50) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 5.0);
      this.floodTubes.forEach(tube => {
        if (tube.material.color.getHex() === 0xef4444) {
          tube.material.opacity = pulse;
        }
      });
    }

    // 7. Render Active Views
    if (isElevVisible && this.elevRenderer && this.elevScene && this.elevCamera) {
      this.elevRenderer.render(this.elevScene, this.elevCamera);
    }
    if (isFloodVisible && this.floodRenderer && this.floodScene && this.floodCamera) {
      this.floodRenderer.render(this.floodScene, this.floodCamera);
    }
  },"""

three_content_updated, count = re.subn(three_animate_pattern, new_three_animate, three_content, flags=re.DOTALL)
print(f"ThreeEngine.animate replaced: {count}")

# Replace HydroRadarEngine2D.animate
hydro_animate_pattern = r'  animate\(\) \{\s+// Only render when radar canvas is mounted and visible.*?this\.render\(\);\s+\},'
new_hydro_animate = """  animate() {
    // Only render when radar canvas and 2D view are active and visible
    const simTab = document.getElementById('tab-view-simulation');
    const view2D = document.getElementById('view-2d-hydro');
    const canvas = document.getElementById('canvas-2d-hydro-radar') || this.canvas;
    const isVisible = simTab && !simTab.classList.contains('hidden') && view2D && !view2D.classList.contains('hidden');

    if (!isVisible || !canvas) {
      this.animId = null;
      return;
    }
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    this.angle = (this.angle + 0.024) % (Math.PI * 2);
    this.render();
  },"""

three_content_updated, count2 = re.subn(hydro_animate_pattern, new_hydro_animate, three_content_updated, flags=re.DOTALL)
print(f"HydroRadarEngine2D.animate replaced: {count2}")

with open('static/three-view.js', 'w', encoding='utf-8') as f:
    f.write(three_content_updated)

# 2. Patch static/app.js
with open('static/app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

# Replace switchWorkspaceTab simulation hook
old_sim_hook = """    } else if (tabKey === 'simulation') {
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
      this.showToast('Simulation Lab Active: 3D Hydrodynamic Solver', 'play');"""

new_sim_hook = """    } else if (tabKey === 'simulation') {
      setTimeout(() => {
        const view2D = document.getElementById('view-2d-hydro');
        if (window.ThreeEngine) {
          window.ThreeEngine.onWindowResize();
          window.ThreeEngine.updateRainfallScenario(this.currentRainfall);
          if (!window.ThreeEngine.animId) {
            window.ThreeEngine.animate();
          }
        }
        if (window.HydroRadarEngine2D && view2D && !view2D.classList.contains('hidden')) {
          window.HydroRadarEngine2D.init('canvas-2d-hydro-radar');
          window.HydroRadarEngine2D.resize();
          window.HydroRadarEngine2D.setScenario(this.currentRainfall, this.currentHorizon, this.simPlaying);
          if (!window.HydroRadarEngine2D.animId) {
            window.HydroRadarEngine2D.animate();
          }
        }
      }, 60);
      this.showToast('Simulation Lab Active: 3D Hydrodynamic Solver', 'play');"""

app_content_updated = app_content.replace(old_sim_hook, new_sim_hook)
print(f"switchWorkspaceTab simulation hook replaced: {app_content_updated != app_content}")

# Replace setSimMode in app.js
old_set_sim_mode = """    const setSimMode = (mode) => {
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
    };"""

new_set_sim_mode = """    const setSimMode = (mode) => {
      [btnModeFlood, btnMode2D, btnModeElev].forEach(b => { if (b) b.classList.remove('active'); });
      [viewFlood, view2D, viewElev].forEach(v => { if (v) v.classList.add('hidden'); });

      if (mode === 'flood') {
        if (btnModeFlood) btnModeFlood.classList.add('active');
        if (viewFlood) viewFlood.classList.remove('hidden');
        if (window.ThreeEngine) {
          window.ThreeEngine.onWindowResize();
          if (!window.ThreeEngine.animId) window.ThreeEngine.animate();
        }
      } else if (mode === '2d') {
        if (btnMode2D) btnMode2D.classList.add('active');
        if (view2D) view2D.classList.remove('hidden');
        if (window.HydroRadarEngine2D) {
          window.HydroRadarEngine2D.init('canvas-2d-hydro-radar');
          window.HydroRadarEngine2D.resize();
          window.HydroRadarEngine2D.setScenario(this.currentRainfall, this.currentHorizon, this.simPlaying);
          if (!window.HydroRadarEngine2D.animId) window.HydroRadarEngine2D.animate();
        }
      } else if (mode === 'elev') {
        if (btnModeElev) btnModeElev.classList.add('active');
        if (viewElev) viewElev.classList.remove('hidden');
        if (window.ThreeEngine) {
          window.ThreeEngine.onWindowResize();
          if (!window.ThreeEngine.animId) window.ThreeEngine.animate();
        }
      }
    };"""

app_content_updated2 = app_content_updated.replace(old_set_sim_mode, new_set_sim_mode)
print(f"setSimMode replaced: {app_content_updated2 != app_content_updated}")

# Also update triggerSimulationSync to update sim-lab-* elements in real time
old_sync_kpi = """      // Update TOP KPI CARDS matching screenshot
      const kpiRain = document.getElementById('kpi-current-rainfall');"""

new_sync_kpi = """      // Update Simulation Lab Real-Time Telemetry
      const labDepth = document.getElementById('sim-lab-peak-depth');
      if (labDepth) labDepth.textContent = `${data.max_depth_m} m`;
      const labArea = document.getElementById('sim-lab-flooded-area');
      if (labArea) labArea.textContent = `${data.flooded_area_km2} km²`;
      const labDrains = document.getElementById('sim-lab-overloaded-drains');
      if (labDrains) labDrains.textContent = `${data.overloaded_drains} / 8`;

      // Update TOP KPI CARDS matching screenshot
      const kpiRain = document.getElementById('kpi-current-rainfall');"""

app_content_updated3 = app_content_updated2.replace(old_sync_kpi, new_sync_kpi)
print(f"triggerSimulationSync lab telemetry added: {app_content_updated3 != app_content_updated2}")

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(app_content_updated3)

print("Patch applied successfully.")
