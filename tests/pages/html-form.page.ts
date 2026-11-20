import type { Page } from "@playwright/test";

/**
 * Page object for https://testpages.eviltester.com/pages/forms/html-form/
 *
 * The selectors below are intentionally OUTDATED, as if the app's markup
 * changed after the test was written. None of them exist on the real page.
 * The self-healing fixture finds the intended elements at runtime.
 *
 * For reference, the real elements are:
 *   username -> input[name="username"]
 *   password -> input[name="password"]
 *   comments -> textarea[name="comments"]
 *   submit   -> input[name="submitbutton"][type="submit"]
 */
export class HtmlFormPage {
  constructor(private readonly page: Page) {}

  // Stale selectors (hover over them in your editor and compare to the real DOM)
  private username = () => this.page.locator("#username-input");
  private password = () => this.page.locator('[data-testid="password-field"]');
  private comments = () => this.page.locator("textarea.comment-box");
  private submit = () => this.page.locator("button#submit-btn");

  async open() {
    await this.page.goto("/pages/forms/html-form/");
  }

  async fillAndSubmit(user: string, pass: string, comment: string) {
    await this.username().fill(user);
    await this.password().fill(pass);
    await this.comments().fill(comment);
    await this.submit().click();
  }
}
