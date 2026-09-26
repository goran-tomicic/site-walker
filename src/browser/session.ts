import { chromium, type Browser, type Locator, type Page } from "playwright";
import type { InteractiveElement } from "../types.js";

const INTERACTIVE_TAGS = ["a", "button", "input", "select", "textarea", "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]", "[onclick]"];
// :visible re-checks visibility at interaction time (not scan time), which matters on
// animated/client-rendered pages where elements can appear, move, or unmount between
// the initial scan and the moment the model decides to act on one.
const INTERACTIVE_SELECTOR = INTERACTIVE_TAGS.map((t) => `${t}:visible`).join(", ");

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private scanned: Locator | null = null;

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

  /**
   * Re-scans the page for interactive elements and returns a numbered legend for the model.
   * The returned indices are re-resolved against the live DOM at interaction time (via
   * Playwright Locators), so a click/fill still works even if the node re-rendered in the
   * meantime — it only fails if the element is genuinely gone.
   */
  async scanInteractiveElements(): Promise<InteractiveElement[]> {
    const page = this.requirePage();
    const locator = page.locator(INTERACTIVE_SELECTOR);
    this.scanned = locator;

    const count = await locator.count();
    const elements: InteractiveElement[] = [];

    for (let i = 0; i < count; i++) {
      const info = await locator
        .nth(i)
        .evaluate((el) => {
          const e = el as HTMLElement;
          const text = (e.innerText || e.getAttribute("value") || e.getAttribute("placeholder") || e.getAttribute("aria-label") || "").trim().slice(0, 80);
          return {
            tag: e.tagName.toLowerCase(),
            role: e.getAttribute("role"),
            inputType: e.tagName.toLowerCase() === "input" ? e.getAttribute("type") : null,
            name: e.getAttribute("name") || e.getAttribute("id"),
            text,
          };
        })
        .catch(() => null);

      if (!info) continue;
      elements.push({ index: i, tag: info.tag, role: info.role, text: info.text, inputType: info.inputType, name: info.name });
    }

    return elements;
  }

  async clickElement(index: number): Promise<void> {
    await this.locatorAt(index).click({ timeout: 8000 });
    await this.settle();
  }

  async fillElement(index: number, value: string): Promise<void> {
    await this.locatorAt(index).fill(value, { timeout: 8000 });
  }

  async fieldIdentity(index: number): Promise<string> {
    return this.locatorAt(index)
      .evaluate((el) => {
        const e = el as HTMLElement;
        return [e.getAttribute("name"), e.getAttribute("id"), e.getAttribute("autocomplete"), e.getAttribute("placeholder")]
          .filter(Boolean)
          .join(" ");
      })
      .catch(() => "");
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }

  private locatorAt(index: number): Locator {
    if (!this.scanned) throw new Error("No elements scanned yet");
    return this.scanned.nth(index);
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser session not launched yet");
    return this.page;
  }
}
