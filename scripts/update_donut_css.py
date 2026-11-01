with open('static/app.css', 'r', encoding='utf-8') as f:
    css = f.read()

target = """.donut-seg-safe {
  fill: none;
  stroke: #10b981;
}

.donut-seg-mod {
  fill: none;
  stroke: #f59e0b;
}

.donut-seg-high {
  fill: none;
  stroke: #ef4444;
}"""

replacement = """.donut-seg-safe {
  fill: none;
  stroke: #10b981;
  transition: stroke-dasharray 0.35s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.donut-seg-mod {
  fill: none;
  stroke: #f59e0b;
  transition: stroke-dasharray 0.35s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.donut-seg-high {
  fill: none;
  stroke: #ef4444;
  transition: stroke-dasharray 0.35s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}"""

css_norm = css.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in css_norm:
    css_norm = css_norm.replace(target_norm, replacement_norm, 1)
    with open('static/app.css', 'w', encoding='utf-8') as f:
        f.write(css_norm)
    print("Added smooth transitions to donut segments in static/app.css")
else:
    print("Warning: target not matched in static/app.css")
