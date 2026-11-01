import re

with open('static/app.css', 'r', encoding='utf-8') as f:
    css = f.read()

target = '''/* 3. Recent Alerts */
.alert-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-all-link {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
}
.view-all-link:hover { color: var(--primary-blue); }

.alerts-stream-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
  justify-content: center;
}

.alert-stream-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.alert-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.alert-dot.red { background: #ef4444; }
.alert-dot.orange { background: #f59e0b; }
.alert-dot.blue { background: #38bdf8; }

.alert-msg {
  color: #1e293b;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-ago {
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

/* 4. Situation Normal Card */
.card-situation-normal {
  justify-content: center;
  align-items: center;
  text-align: center;
}

.situation-check-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #10b981;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
  margin-bottom: 6px;
}

.situation-header {
  font-size: 14px;
  font-weight: 800;
  color: #15803d;
}

.situation-subtext {
  font-size: 11px;
  color: #16a34a;
  margin-top: 2px;
}'''

replacement = '''/* 1. AI Infrastructure Optimizer Card & Switches */
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

.opt-head-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.optimizer-badge-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  letter-spacing: 0.3px;
}

.optimizer-controls-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  justify-content: center;
}

.optimizer-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  transition: all 0.2s ease;
  cursor: pointer;
}

.optimizer-row-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.opt-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.opt-icon-circle {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.bg-blue-subtle { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.bg-purple-subtle { background: rgba(147, 51, 234, 0.12); color: #9333ea; }
.bg-emerald-subtle { background: rgba(16, 185, 129, 0.12); color: #059669; }

.opt-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.opt-title-line {
  display: flex;
  align-items: center;
  gap: 5px;
}

.opt-name {
  font-size: 11.5px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}

.opt-tag {
  font-size: 9px;
  font-weight: 700;
  color: #475569;
  background: #e2e8f0;
  padding: 1px 4px;
  border-radius: 4px;
}

.opt-status-desc {
  font-size: 9.5px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* Custom Modern Toggle Switch */
.switch-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 19px;
  flex-shrink: 0;
  margin-left: 6px;
}

.switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider-toggle {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 20px;
}

.slider-toggle:before {
  position: absolute;
  content: "";
  height: 13px;
  width: 13px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}

.switch-toggle input:checked + .slider-toggle {
  background-color: #2563eb;
}

.switch-toggle input:checked + .slider-toggle:before {
  transform: translateX(17px);
}

/* 3. Recent Alerts (Highlighted) */
.alerts-card-highlighted {
  border: 1.5px solid rgba(239, 68, 68, 0.35) !important;
  box-shadow: 0 4px 18px rgba(239, 68, 68, 0.08) !important;
  position: relative;
  overflow: hidden;
}

.alerts-card-highlighted::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #3b82f6 100%);
}

.alert-bell-pulse {
  animation: bellRing 2.5s infinite ease-in-out;
}

@keyframes bellRing {
  0%, 100% { transform: rotate(0); }
  10%, 30% { transform: rotate(14deg); }
  20%, 40% { transform: rotate(-14deg); }
  50% { transform: rotate(0); }
}

.alerts-count-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  letter-spacing: 0.3px;
  margin-left: 4px;
}

.alert-pulse-ping {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pingPulse 1.8s infinite;
}

@keyframes pingPulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.alert-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-all-link {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
}
.view-all-link:hover { color: var(--primary-blue); }

.alerts-stream-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  justify-content: center;
}

.alert-stream-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  border-radius: 6px;
  padding: 4px 7px;
  transition: all 0.2s ease;
}

.alert-stream-item.alert-stream-danger {
  background: rgba(254, 242, 242, 0.7);
  border: 1px solid rgba(254, 202, 202, 0.7);
  border-left: 3.5px solid #ef4444;
}

.alert-stream-item.alert-stream-warning {
  background: rgba(255, 251, 235, 0.7);
  border: 1px solid rgba(254, 240, 138, 0.7);
  border-left: 3.5px solid #f59e0b;
}

.alert-stream-item.alert-stream-info {
  background: rgba(240, 249, 255, 0.7);
  border: 1px solid rgba(186, 230, 253, 0.7);
  border-left: 3.5px solid #0284c7;
}

.alert-stream-item:hover {
  transform: translateX(3px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.alert-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.alert-dot.red { background: #ef4444; }
.alert-dot.orange { background: #f59e0b; }
.alert-dot.blue { background: #38bdf8; }

.alert-msg {
  color: #1e293b;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-ago {
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

/* 4. Situation Dynamic Status Card (Normal, Warning, Danger) */
.card-situation-normal {
  justify-content: center;
  align-items: center;
  text-align: center;
  border: 1.5px solid rgba(16, 185, 129, 0.3) !important;
  background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%) !important;
  transition: all 0.3s ease;
}

.card-situation-warning {
  justify-content: center;
  align-items: center;
  text-align: center;
  border: 1.5px solid rgba(245, 158, 11, 0.5) !important;
  background: linear-gradient(180deg, #ffffff 0%, #fffbeb 100%) !important;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.15) !important;
  transition: all 0.3s ease;
}

.card-situation-danger {
  justify-content: center;
  align-items: center;
  text-align: center;
  border: 1.5px solid rgba(239, 68, 68, 0.6) !important;
  background: linear-gradient(180deg, #ffffff 0%, #fef2f2 100%) !important;
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.22) !important;
  animation: dangerCardGlow 2s infinite alternate;
  transition: all 0.3s ease;
}

@keyframes dangerCardGlow {
  0% { box-shadow: 0 4px 14px rgba(239, 68, 68, 0.18); }
  100% { box-shadow: 0 6px 24px rgba(239, 68, 68, 0.38); }
}

.situation-check-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #10b981;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
  margin-bottom: 6px;
  transition: all 0.3s ease;
}

.situation-warning-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f59e0b;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
  margin-bottom: 6px;
  transition: all 0.3s ease;
}

.situation-danger-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.45);
  margin-bottom: 6px;
  animation: dangerIconPulse 1.2s infinite alternate;
  transition: all 0.3s ease;
}

@keyframes dangerIconPulse {
  0% { transform: scale(1); }
  100% { transform: scale(1.12); }
}

.situation-header {
  font-size: 13.5px;
  font-weight: 800;
  color: #15803d;
  transition: color 0.3s ease;
}

.situation-subtext {
  font-size: 10.5px;
  color: #16a34a;
  margin-top: 2px;
  transition: color 0.3s ease;
}'''

# Normalize newlines
css_norm = css.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in css_norm:
    css_updated = css_norm.replace(target_norm, replacement_norm, 1)
    with open('static/app.css', 'w', encoding='utf-8') as f:
        f.write(css_updated)
    print("Successfully updated static/app.css")
else:
    print("Error: target not found in static/app.css")

