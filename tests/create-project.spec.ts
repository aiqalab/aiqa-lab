import { test, expect } from '../src/selfheal';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('creates a project', async ({ page }) => {
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.locator('[data-testid="create-project-btn"]').click();
  await expect(page.locator('[data-testid="success-msg"]')).toHaveText('Project created');
});
