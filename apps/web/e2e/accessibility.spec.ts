import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';

/**
 * Real-browser accessibility scan. Unlike the jsdom unit check, this runs in
 * Chromium so axe can evaluate computed styles — colour contrast, focus
 * visibility, real roles. A violation fails the push (pre-push) and the merge
 * (CI), so accessibility regressions cannot ship silently.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('empty and populated to-dos have no detectable WCAG violations', async ({ page }) => {
  const todos: { id: string; title: string; done: boolean }[] = [];
  await page.route('**/trpc/todos.list**', (route) =>
    route.fulfill({ json: { result: { data: todos } } }),
  );
  await page.goto('/');
  await expect(page.getByText('No to-dos to show')).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
  todos.push({ id: 'accessible-task', title: 'Accessible task', done: false });
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Accessible task' })).toBeVisible();
  expect((await scan(page)).violations).toEqual([]);
});
