import re

def update_html(path):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Update Flood Risk Overview Donut Chart with IDs
    old_donut = '''<!-- 2. Flood Risk Overview Donut -->
          <div class="analytics-card-white">
            <div class="analytics-head-row">
              <h4>Flood Risk Overview</h4>
            </div>
            <div class="donut-chart-flex">
              <div class="donut-ring-wrap">
                <svg viewBox="0 0 100 100" class="donut-svg">
                  <circle cx="50" cy="50" r="38" class="donut-track" stroke-width="12"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-safe" stroke-width="12" stroke-dasharray="162 239" stroke-dashoffset="0"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-mod" stroke-width="12" stroke-dasharray="52 239" stroke-dashoffset="-162"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-high" stroke-width="12" stroke-dasharray="24 239" stroke-dashoffset="-214"/>
                </svg>
                <div class="donut-center-pct">
                  <span>68%</span>
                </div>
              </div>
              <div class="donut-legend-list">
                <div class="legend-entry" id="donut-legend-safe" style="cursor: pointer;" title="Click to focus Safe Elevated Highland Zones">
                  <span class="dot-chip bg-green"></span>
                  <span class="entry-label">Safe</span>
                  <span class="entry-val">68%</span>
                </div>
                <div class="legend-entry" id="donut-legend-moderate" style="cursor: pointer;" title="Click to focus Moderate Risk Culverts">
                  <span class="dot-chip bg-yellow"></span>
                  <span class="entry-label">Moderate</span>
                  <span class="entry-val">22%</span>
                </div>
                <div class="legend-entry" id="donut-legend-high" style="cursor: pointer;" title="Click to focus High Risk Flood Zones">
                  <span class="dot-chip bg-red"></span>
                  <span class="entry-label">High</span>
                  <span class="entry-val">10%</span>
                </div>
              </div>
            </div>
          </div>'''

    new_donut = '''<!-- 2. Flood Risk Overview Donut (Dynamic Hydrodynamic Model) -->
          <div class="analytics-card-white" id="card-flood-risk-overview">
            <div class="analytics-head-row">
              <h4>Flood Risk Overview</h4>
            </div>
            <div class="donut-chart-flex">
              <div class="donut-ring-wrap">
                <svg viewBox="0 0 100 100" class="donut-svg">
                  <circle cx="50" cy="50" r="38" class="donut-track" stroke-width="12"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-safe" id="donut-seg-safe" stroke-width="12" stroke-dasharray="162 239" stroke-dashoffset="0"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-mod" id="donut-seg-mod" stroke-width="12" stroke-dasharray="52 239" stroke-dashoffset="-162"/>
                  <circle cx="50" cy="50" r="38" class="donut-seg-high" id="donut-seg-high" stroke-width="12" stroke-dasharray="24 239" stroke-dashoffset="-214"/>
                </svg>
                <div class="donut-center-pct">
                  <span id="donut-center-pct-val">68%</span>
                </div>
              </div>
              <div class="donut-legend-list">
                <div class="legend-entry" id="donut-legend-safe" style="cursor: pointer;" title="Click to focus Safe Elevated Highland Zones">
                  <span class="dot-chip bg-green"></span>
                  <span class="entry-label">Safe</span>
                  <span class="entry-val" id="donut-val-safe">68%</span>
                </div>
                <div class="legend-entry" id="donut-legend-moderate" style="cursor: pointer;" title="Click to focus Moderate Risk Culverts">
                  <span class="dot-chip bg-yellow"></span>
                  <span class="entry-label">Moderate</span>
                  <span class="entry-val" id="donut-val-mod">22%</span>
                </div>
                <div class="legend-entry" id="donut-legend-high" style="cursor: pointer;" title="Click to focus High Risk Flood Zones">
                  <span class="dot-chip bg-red"></span>
                  <span class="entry-label">High</span>
                  <span class="entry-val" id="donut-val-high">10%</span>
                </div>
              </div>
            </div>
          </div>'''

    # 2. Update Recent Alerts with dynamic IDs
    old_alerts = '''<!-- 3. Recent Alerts (Highlighted) -->
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
          </div>'''

    new_alerts = '''<!-- 3. Recent Alerts (Highlighted & Dynamic) -->
          <div class="analytics-card-white alerts-card-highlighted" id="card-recent-alerts">
            <div class="analytics-head-row" style="margin-bottom: 6px;">
              <div class="alert-head-left">
                <i class="fa-solid fa-bell text-red alert-bell-pulse"></i>
                <h4 style="font-weight: 800; color: #0f172a;">Recent Alerts</h4>
                <span class="alerts-count-chip" id="alerts-count-chip"><span class="alert-pulse-ping" id="alerts-pulse-ping"></span> <span id="alerts-count-text">3 ACTIVE</span></span>
              </div>
              <a href="#" class="view-all-link" id="btn-open-workflow-modal">View All &rarr;</a>
            </div>
            <div class="alerts-stream-list" id="alerts-stream-container">
              <div class="alert-stream-item alert-stream-danger alert-clickable" id="alert-item-1" title="Click to focus East Delhi High Flood Risk">
                <span class="alert-dot red" id="alert-dot-1"></span>
                <span class="alert-msg" id="alert-msg-1">High Flood Risk in East Delhi</span>
                <span class="alert-ago" id="alert-ago-1">1 min ago</span>
              </div>
              <div class="alert-stream-item alert-stream-warning alert-clickable" id="alert-item-2" title="Click to trace Barapullah Overloaded Drain">
                <span class="alert-dot orange" id="alert-dot-2"></span>
                <span class="alert-msg" id="alert-msg-2">Drainage Capacity Reached 90%</span>
                <span class="alert-ago" id="alert-ago-2">3 min ago</span>
              </div>
              <div class="alert-stream-item alert-stream-info alert-clickable" id="alert-item-3" title="Click to view IMD Radar Precipitation">
                <span class="alert-dot blue" id="alert-dot-3"></span>
                <span class="alert-msg" id="alert-msg-3">Rainfall Intensity Increasing</span>
                <span class="alert-ago" id="alert-ago-3">5 min ago</span>
              </div>
            </div>
          </div>'''

    html_norm = html.replace('\r\n', '\n')
    old_donut_norm = old_donut.replace('\r\n', '\n')
    new_donut_norm = new_donut.replace('\r\n', '\n')
    old_alerts_norm = old_alerts.replace('\r\n', '\n')
    new_alerts_norm = new_alerts.replace('\r\n', '\n')

    if old_donut_norm in html_norm:
        html_norm = html_norm.replace(old_donut_norm, new_donut_norm, 1)
        print(f"Updated Donut Chart in {path}")
    else:
        print(f"Warning: old_donut not matched in {path}")

    if old_alerts_norm in html_norm:
        html_norm = html_norm.replace(old_alerts_norm, new_alerts_norm, 1)
        print(f"Updated Recent Alerts in {path}")
    else:
        print(f"Warning: old_alerts not matched in {path}")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html_norm)

if __name__ == '__main__':
    update_html('static/index.html')
    update_html('index.html')
