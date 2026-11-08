import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';
import { SAMPLE_TODOS, serveTodos } from './serveTodos';

/**
 * Real-browser accessibility scan. Unlike the jsdom unit check, this runs in
 * Chromium so axe can evaluate computed styles: colour contrast, focus
 * visibility, real roles. A violation fails the push (pre-push) and the merge
 * (CI), so accessibility regressions cannot ship silently. Each scan serves
 * its own list, so it reads and writes nothing in the shared api.
 */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

async function openWith(page: Page, todos: Parameters<typeof serveTodos>[1]) {
  await serveTodos(page, todos);
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Filter' })).toBeVisible();
}

test.describe('Accessibility', () => {
  test('the empty to-do page has no detectable WCAG A/AA violations', async ({ page }) => {
    await openWith(page, []);
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the to-do list has no detectable WCAG A/AA violations', async ({ page }) => {
    await openWith(page, SAMPLE_TODOS);
    await expect(page.getByRole('checkbox', { name: 'Book the room' })).toBeChecked();

    expect((await scan(page)).violations).toEqual([]);
  });

  test('the validation error state has no detectable WCAG A/AA violations', async ({ page }) => {
    await openWith(page, SAMPLE_TODOS);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');

    expect((await scan(page)).violations).toEqual([]);
  });

  test('an open edit has no detectable WCAG A/AA violations', async ({ page }) => {
    await openWith(page, SAMPLE_TODOS);
    await page.getByRole('button', { name: 'Edit Write the talk' }).click();
    await expect(page.getByRole('textbox', { name: 'New title' })).toHaveValue('Write the talk');

    expect((await scan(page)).violations).toEqual([]);
  });
});
