import { chromium, type Browser, type ElementHandle, type Page } from "playwright";
import type { InteractiveElement } from "../types.js";

const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [onclick]";

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private handles: ElementHandle[] = [];

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage({ viewport: { width: 1280, height: 900 } });
  }

  async goto(url: string): Promise<void> {
    await this.requirePage().goto(url, { waitUntil: "domcontentloaded" });
    await this.settle();
  }

  async settle(): Promise<void> {
    await this.requirePage()
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => undefined);
  }

  url(): string {
    return this.requirePage().url();
  }

  async screenshot(path: string): Promise<void> {
    await this.requirePage().screenshot({ path, fullPage: false });
  }

  /** Re-scans the page for interactive elements and returns a numbered legend for the model. */
  async scanInteractiveElements(): Promise<InteractiveElement[]> {
    const page = this.requirePage();
    const handles = await page.$$(INTERACTIVE_SELECTOR);
    const visibleHandles: ElementHandle[] = [];
    const elements: InteractiveElement[] = [];

    for (const handle of handles) {
      const isVisible = await handle.isVisible().catch(() => false);
      if (!isVisible) continue;

      const info = await handle.evaluate((el) => {
        const e = el as HTMLElement;
        const text = (e.innerText || e.getAttribute("value") || e.getAttribute("placeholder") || e.getAttribute("aria-label") || "").trim().slice(0, 80);
        return {
          tag: e.tagName.toLowerCase(),
          role: e.getAttribute("role"),
          inputType: e.tagName.toLowerCase() === "input" ? e.getAttribute("type") : null,
          name: e.getAttribute("name") || e.getAttribute("id"),
          text,
        };
      });

      visibleHandles.push(handle);
      elements.push({
        index: visibleHandles.length - 1,
        tag: info.tag,
        role: info.role,
        text: info.text,
        inputType: info.inputType,
        name: info.name,
      });
    }

    this.handles = visibleHandles;
    return elements;
  }

  async clickElement(index: number): Promise<void> {
    const handle = this.handles[index];
    if (!handle) throw new Error(`No scanned element at index ${index}`);
    await handle.click({ timeout: 5000 });
    await this.settle();
  }

  async fillElement(index: number, value: string): Promise<void> {
    const handle = this.handles[index];
    if (!handle) throw new Error(`No scanned element at index ${index}`);
    await handle.fill(value, { timeout: 5000 });
  }

  async fieldIdentity(index: number): Promise<string> {
    const handle = this.handles[index];
    if (!handle) return "";
    return handle.evaluate((el) => {
      const e = el as HTMLElement;
      return [e.getAttribute("name"), e.getAttribute("id"), e.getAttribute("autocomplete"), e.getAttribute("placeholder")]
        .filter(Boolean)
        .join(" ");
    });
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser session not launched yet");
    return this.page;
  }
}
