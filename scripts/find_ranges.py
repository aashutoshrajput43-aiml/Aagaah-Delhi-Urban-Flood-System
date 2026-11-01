with open('static/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'range' in line.lower() and '<input' in line.lower():
        print(f"{i+1}: {line.strip()}")

