// The ONLY change needed to enable self-healing in an existing suite:
//   import { test, expect } from "@playwright/test";      // before
import { expect, test } from "../src/self-healing"; //      after

import { HtmlFormPage } from "./pages/html-form.page";

test.describe("HTML form (self-healing demo)", () => {
  test("submits the form even though the selectors are outdated", async ({ page }) => {
    const form = new HtmlFormPage(page);

    await form.open();
    await form.fillAndSubmit("demo_user", "not-a-real-password", "Hello from a self-healing test");

    // Assertions use stable selectors on the results page.
    await expect(page.locator("#_valueusername")).toHaveText("demo_user");
    await expect(page.locator("#_valuecomments")).toHaveText("Hello from a self-healing test");
  });
});
