import { expect, test } from './fixtures';
import { SAMPLE_TODOS, serveTodos } from './serveTodos';

[
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`reference to-dos at ${viewport.width}px match approved screens`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await serveTodos(page, []);
    await page.goto('/');
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`todos-${viewport.width}-empty.png`, { fullPage: true });

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(page).toHaveScreenshot(`todos-${viewport.width}-validation.png`, {
      fullPage: true,
    });

    await page.unrouteAll();
    await serveTodos(page, SAMPLE_TODOS);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Book the room' })).toBeChecked();
    await expect(page).toHaveScreenshot(`todos-${viewport.width}-list.png`, { fullPage: true });
  });
});
