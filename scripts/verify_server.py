import urllib.request

html = urllib.request.urlopen('http://127.0.0.1:8000').read().decode('utf-8')
print("Server running and serving!")
print("Has card-ai-infra-optimizer:", 'id="card-ai-infra-optimizer"' in html)
print("Has toggle-opt-pumps:", 'id="toggle-opt-pumps"' in html)
print("Has toggle-opt-gates:", 'id="toggle-opt-gates"' in html)
print("Has toggle-opt-drains:", 'id="toggle-opt-drains"' in html)
print("Has alerts-card-highlighted:", 'alerts-card-highlighted' in html)
print("Has card-situation-status:", 'id="card-situation-status"' in html)
print("Has btn-quick-infra-optimizer (should be False):", 'btn-quick-infra-optimizer' in html)
