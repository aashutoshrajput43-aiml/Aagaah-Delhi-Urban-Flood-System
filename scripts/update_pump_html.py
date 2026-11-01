import re

def update_html(path):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    old_card_pattern = re.compile(
        r'<!-- 1\. AI Infrastructure Optimizer Card -->\s*<div class="analytics-card-white ai-optimizer-card" id="card-ai-infra-optimizer">.*?<!-- 2\. Flood Risk Overview Donut -->',
        re.DOTALL
    )

    new_card = '''<!-- 1. AI Pump Optimizer Card -->
          <div class="analytics-card-white ai-optimizer-card" id="card-ai-infra-optimizer">
            <div class="analytics-head-row" style="margin-bottom: 6px;">
              <div class="opt-head-title">
                <i class="fa-solid fa-wand-magic-sparkles text-cyan" style="font-size: 13px;"></i>
                <h4 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0;">AI Pump Optimizer</h4>
              </div>
              <span class="optimizer-badge-live" id="badge-optimizer-master"><span class="live-pulse-dot" style="background:#10b981; width:6px; height:6px;"></span> ACTIVE</span>
            </div>

            <div class="pump-optimizer-main-box">
              <div class="pump-optimizer-hero-row" id="pump-hero-card-box" title="Click to view Pump Telemetry Drawer • Toggle to Show/Hide on Map">
                <div class="opt-item-left">
                  <div class="opt-icon-circle-lg bg-blue-subtle">
                    <i class="fa-solid fa-fan text-blue pump-spin-animated" id="icon-pump-animated"></i>
                  </div>
                  <div class="opt-info" style="margin-left: 8px;">
                    <div class="opt-title-line">
                      <span class="opt-name" style="font-size: 12.5px; font-weight: 800;">Smart Sump Pumps</span>
                      <span class="opt-tag" id="tag-opt-pumps">8 Pumps</span>
                    </div>
                    <span class="opt-status-desc" id="status-opt-pumps-text" style="font-size: 10.5px; color: #059669; font-weight: 700;">
                      ● All 8 Pumps Live on Map
                    </span>
                  </div>
                </div>
                <div class="opt-item-right">
                  <label class="switch-toggle" style="width: 40px; height: 21px;" title="Toggle AI Pumps On/Off Map">
                    <input type="checkbox" id="toggle-opt-pumps" checked>
                    <span class="slider-toggle round"></span>
                  </label>
                </div>
              </div>

              <div class="pump-telemetry-metrics-grid">
                <div class="pump-metric-chip">
                  <span class="metric-chip-label">Active Capacity</span>
                  <span class="metric-chip-val" id="val-pump-discharge" style="color: #2563eb;">12,400 m³/h</span>
                </div>
                <div class="pump-metric-chip">
                  <span class="metric-chip-label">Map Visibility</span>
                  <span class="metric-chip-val" id="val-pump-map-status" style="color: #059669;">8 Visible</span>
                </div>
                <div class="pump-metric-chip">
                  <span class="metric-chip-label">Relief Impact</span>
                  <span class="metric-chip-val" style="color: #10b981;">-67% Flooding</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Flood Risk Overview Donut -->'''

    if not old_card_pattern.search(html):
        print(f"Warning: pattern not matched in {path}")
    else:
        html = old_card_pattern.sub(new_card, html)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"Successfully updated {path}")

if __name__ == '__main__':
    update_html('static/index.html')
    update_html('index.html')

