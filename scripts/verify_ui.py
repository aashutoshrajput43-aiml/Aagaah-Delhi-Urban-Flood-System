from playwright.sync_api import sync_playwright
import time

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto("http://127.0.0.1:8000")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # 1. Take initial screenshot (Situation Normal)
        page.screenshot(path="brain_test_normal.png")
        print("Captured brain_test_normal.png")

        # 2. Check elements
        opt_card = page.locator("#card-ai-infra-optimizer")
        print("AI Optimizer Card exists:", opt_card.count() > 0)

        toggle_pumps = page.locator("#toggle-opt-pumps")
        print("Toggle pumps exists and checked:", toggle_pumps.is_checked())

        # Test toggling pump
        toggle_pumps.click()
        time.sleep(0.5)
        print("Toggle pumps after click:", toggle_pumps.is_checked())

        # 3. Slide rainfall to 90mm (High Danger)
        slider = page.locator("#slider-sim-rain")
        slider.fill("90")
        slider.dispatch_event("input")
        time.sleep(1.5)

        # 4. Check situation card text and class
        sit_title = page.locator("#situation-status-title").inner_text()
        sit_sub = page.locator("#situation-status-subtext").inner_text()
        print("Situation at 90mm -> Title:", sit_title, "| Subtext:", sit_sub)

        # Take danger screenshot
        page.screenshot(path="brain_test_danger.png")
        print("Captured brain_test_danger.png")

        browser.close()

if __name__ == "__main__":
    verify_ui()

