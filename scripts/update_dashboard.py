import re

def update_html(path):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Remove AI Gate Optimizer button from map view toggle bar
    old_btn_pattern = re.compile(
        r'\s*<button class="map-action-pill" id="btn-quick-infra-optimizer".*?</button>',
        re.DOTALL
    )
    if not old_btn_pattern.search(html):
        print(f"Warning: btn-quick-infra-optimizer not found in {path}")
    else:
        html = old_btn_pattern.sub('', html)
        print(f"Removed btn-quick-infra-optimizer from {path}")

    # 2. Replace Rainfall Trend card with AI Infrastructure Optimizer card
    old_rainfall_pattern = re.compile(
        r'<!-- 1\. Rainfall Trend \(7 Days\) -->\s*<div class="analytics-card-white">.*?<!-- 2\. Flood Risk Overview Donut -->',
        re.DOTALL
    )

    new_ai_optimizer_card = '''<!-- 1. AI Infrastructure Optimizer Card -->
          <div class="analytics-card-white ai-optimizer-card" id="card-ai-infra-optimizer">
            <div class="analytics-head-row" style="margin-bottom: 6px;">
              <div class="opt-head-title">
                <i class="fa-solid fa-wand-magic-sparkles text-cyan" style="font-size: 13px;"></i>
                <h4 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0;">AI Infrastructure Optimizer</h4>
              </div>
              <span class="optimizer-badge-live" id="badge-optimizer-master"><span class="live-pulse-dot" style="background:#10b981; width:6px; height:6px;"></span> 3/3 ACTIVE</span>
            </div>

            <div class="optimizer-controls-list">
              <!-- Sub-Optimizer 1: Pump Optimizer -->
              <div class="optimizer-row-item" id="row-opt-pumps" title="Autonomous Sump Dewatering Scheduling">
                <div class="opt-item-left">
                  <div class="opt-icon-circle bg-blue-subtle">
                    <i class="fa-solid fa-fan text-blue"></i>
                  </div>
                  <div class="opt-info">
                    <div class="opt-title-line">
                      <span class="opt-name">Pump Optimizer</span>
                      <span class="opt-tag" id="tag-opt-pumps">8 Pumps</span>
                    </div>
                    <span class="opt-status-desc" id="status-opt-pumps-text">Auto-sequencing: 6 ON, 2 standby</span>
                  </div>
                </div>
                <div class="opt-item-right">
                  <label class="switch-toggle" title="Toggle AI Autonomous Pump Scheduling">
                    <input type="checkbox" id="toggle-opt-pumps" checked>
                    <span class="slider-toggle round"></span>
                  </label>
                </div>
              </div>

              <!-- Sub-Optimizer 2: Gate Optimizer -->
              <div class="optimizer-row-item" id="row-opt-gates" title="Dynamic Barrage & Sluice Gate Modulator">
                <div class="opt-item-left">
                  <div class="opt-icon-circle bg-purple-subtle">
                    <i class="fa-solid fa-bars-staggered text-purple"></i>
                  </div>
                  <div class="opt-info">
                    <div class="opt-title-line">
                      <span class="opt-name">Gate Optimizer</span>
                      <span class="opt-tag" id="tag-opt-gates">4 Gates</span>
                    </div>
                    <span class="opt-status-desc" id="status-opt-gates-text">Modulating: 3 OPEN (85% flow)</span>
                  </div>
                </div>
                <div class="opt-item-right">
                  <label class="switch-toggle" title="Toggle AI Sluice Gate Modulator">
                    <input type="checkbox" id="toggle-opt-gates" checked>
                    <span class="slider-toggle round"></span>
                  </label>
                </div>
              </div>

              <!-- Sub-Optimizer 3: Drain Optimizer -->
              <div class="optimizer-row-item" id="row-opt-drains" title="Trunk Drain Hydrodynamic Overload Shield">
                <div class="opt-item-left">
                  <div class="opt-icon-circle bg-emerald-subtle">
                    <i class="fa-solid fa-route text-emerald"></i>
                  </div>
                  <div class="opt-info">
                    <div class="opt-title-line">
                      <span class="opt-name">Drain Optimizer</span>
                      <span class="opt-tag" id="tag-opt-drains">68 Drains</span>
                    </div>
                    <span class="opt-status-desc" id="status-opt-drains-text">Overload Shield: Bypass siphon ON</span>
                  </div>
                </div>
                <div class="opt-item-right">
                  <label class="switch-toggle" title="Toggle AI Drain Overload Shield">
                    <input type="checkbox" id="toggle-opt-drains" checked>
                    <span class="slider-toggle round"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Flood Risk Overview Donut -->'''

    if not old_rainfall_pattern.search(html):
        print(f"Warning: Rainfall Trend card pattern not matched in {path}")
    else:
        html = old_rainfall_pattern.sub(new_ai_optimizer_card, html)
        print(f"Replaced Rainfall Trend with AI Infrastructure Optimizer in {path}")

    # 3. Upgrade Recent Alerts with highlighted container and badges
    old_alerts_pattern = re.compile(
        r'<!-- 3\. Recent Alerts -->\s*<div class="analytics-card-white">\s*<div class="analytics-head-row">.*?<!-- 4\. Situation Normal Card -->',
        re.DOTALL
    )

    new_alerts_card = '''<!-- 3. Recent Alerts (Highlighted) -->
          <div class="analytics-card-white alerts-card-highlighted" id="card-recent-alerts">
            <div class="analytics-head-row" style="margin-bottom: 6px;">
              <div class="alert-head-left">
                <i class="fa-solid fa-bell text-red alert-bell-pulse"></i>
                <h4 style="font-weight: 800; color: #0f172a;">Recent Alerts</h4>
                <span class="alerts-count-chip"><span class="alert-pulse-ping"></span> 3 ACTIVE</span>
              </div>
              <a href="#" class="view-all-link" id="btn-open-workflow-modal">View All &rarr;</a>
            </div>
            <div class="alerts-stream-list">
              <div class="alert-stream-item alert-stream-danger alert-clickable" id="alert-item-1" title="Click to focus East Delhi High Flood Risk">
                <span class="alert-dot red"></span>
                <span class="alert-msg">High Flood Risk in East Delhi</span>
                <span class="alert-ago">1 min ago</span>
              </div>
              <div class="alert-stream-item alert-stream-warning alert-clickable" id="alert-item-2" title="Click to trace Barapullah Overloaded Drain">
                <span class="alert-dot orange"></span>
                <span class="alert-msg">Drainage Capacity Reached 90%</span>
                <span class="alert-ago">3 min ago</span>
              </div>
              <div class="alert-stream-item alert-stream-info alert-clickable" id="alert-item-3" title="Click to view IMD Radar Precipitation">
                <span class="alert-dot blue"></span>
                <span class="alert-msg">Rainfall Intensity Increasing</span>
                <span class="alert-ago">5 min ago</span>
              </div>
            </div>
          </div>

          <!-- 4. Situation Normal Card -->'''

    if not old_alerts_pattern.search(html):
        print(f"Warning: Recent alerts pattern not matched in {path}")
    else:
        html = old_alerts_pattern.sub(new_alerts_card, html)
        print(f"Highlighted Recent Alerts in {path}")

    # 4. Ensure Situation Card has clear IDs for dynamic javascript updates
    old_situation_pattern = re.compile(
        r'<div class="analytics-card-white card-situation-normal" id="card-situation-status".*?</div>\s*<!-- Compatibility telemetry elements -->',
        re.DOTALL
    )

    new_situation_card = '''<div class="analytics-card-white card-situation-normal" id="card-situation-status" style="cursor: pointer;" title="Dynamic System Status (Updates automatically with rainfall)">
            <div class="situation-check-circle" id="situation-status-icon-wrap">
              <i class="fa-solid fa-check" id="situation-status-icon"></i>
            </div>
            <h3 class="situation-header" id="situation-status-title">Situation Normal</h3>
            <p class="situation-subtext" id="situation-status-subtext">No major alerts • All drains clear</p>
          </div>
          <!-- Compatibility telemetry elements -->'''

    if not old_situation_pattern.search(html):
        print(f"Warning: Situation status pattern not matched in {path}")
    else:
        html = old_situation_pattern.sub(new_situation_card, html)
        print(f"Updated Situation status structure in {path}")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Successfully wrote {path}")

if __name__ == '__main__':
    update_html('static/index.html')
    update_html('index.html')
