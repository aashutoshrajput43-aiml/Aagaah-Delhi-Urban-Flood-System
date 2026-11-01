with open('static/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "'input'" in line or '"input"' in line:
        print(f"{i+1}: {line.strip()[:100]}")

