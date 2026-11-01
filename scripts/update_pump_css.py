import re

with open('static/app.css', 'r', encoding='utf-8') as f:
    css = f.read()

target = '''/* 1. AI Infrastructure Optimizer Card & Switches */
.ai-optimizer-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}'''

replacement = '''/* 1. AI Pump Optimizer Card Layout */
.ai-optimizer-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.pump-optimizer-main-box {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  gap: 8px;
}

.pump-optimizer-hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.pump-optimizer-hero-row:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.opt-icon-circle-lg {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.pump-spin-animated {
  animation: pumpSpin 3s linear infinite;
}

@keyframes pumpSpin {
  100% { transform: rotate(360deg); }
}

.pump-telemetry-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 2px;
}

.pump-metric-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 6px;
  display: flex;
  flex-direction: column;
  text-align: center;
  transition: all 0.2s ease;
}

.pump-metric-chip:hover {
  background: #f1f5f9;
}

.metric-chip-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.metric-chip-val {
  font-size: 11px;
  font-weight: 800;
  margin-top: 1px;
  white-space: nowrap;
}'''

css_norm = css.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in css_norm:
    css_updated = css_norm.replace(target_norm, replacement_norm, 1)
    with open('static/app.css', 'w', encoding='utf-8') as f:
        f.write(css_updated)
    print("Successfully updated static/app.css with dedicated pump layout")
else:
    print("Error: target not found in static/app.css")

