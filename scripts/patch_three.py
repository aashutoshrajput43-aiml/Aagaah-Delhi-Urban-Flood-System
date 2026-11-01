with open('static/three-view.js', 'r', encoding='utf-8') as f:
    code = f.read()

target = "  animate() {\n    this.animId = requestAnimationFrame(() => this.animate());\n\n    const delta = this.clock ? this.clock.getDelta() : 0.016;"
replacement = """  animate() {
    // Only animate when 3D container is actually visible on screen
    const container = document.getElementById('three-container') || this.container;
    if (!container || container.offsetParent === null || container.classList.contains('hidden') || container.style.display === 'none') {
      this.animId = null;
      return;
    }
    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock ? this.clock.getDelta() : 0.016;"""

code_norm = code.replace('\r\n', '\n')
if target in code_norm:
    code_norm = code_norm.replace(target, replacement, 1)
    with open('static/three-view.js', 'w', encoding='utf-8') as f:
        f.write(code_norm)
    print("Successfully updated three-view.js with visibility guard!")
else:
    print("Warning: target not matched in three-view.js")

