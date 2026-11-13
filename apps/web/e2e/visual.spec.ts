import { expect, test } from './fixtures';

[
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  test(`reference greeting at ${viewport.width}px matches approved screens`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-initial.png`, {
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Greet', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a name');
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-validation.png`, {
      fullPage: true,
    });

    await page.getByRole('textbox', { name: 'Name' }).fill('Ada');
    await page.getByRole('button', { name: 'Greet', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Hello, Ada!');
    await expect(page).toHaveScreenshot(`greeting-${viewport.width}-success.png`, {
      fullPage: true,
    });
  });
});

[
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
].forEach((viewport) => {
  ['empty', 'validation', 'list'].forEach((state) => {
    test(`reference to-dos at ${viewport.width}px: ${state}`, async ({ page }) => {
      const todos =
        state === 'list'
          ? [
              { id: 'sample-1', title: 'Write the talk', done: false },
              { id: 'sample-2', title: 'Book the room', done: true },
            ]
          : [];
      await page.route('**/trpc/todos.list**', (route) =>
        route.fulfill({ json: { result: { data: todos } } }),
      );
      await page.setViewportSize(viewport);
      await page.goto('/todos');
      if (state === 'list') {
        await expect(page.getByRole('checkbox', { name: 'Write the talk' })).not.toBeChecked();
        await expect(page.getByRole('checkbox', { name: 'Book the room' })).toBeChecked();
      } else {
        await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
      }
      if (state === 'validation') {
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Enter a title');
      }
      await expect(page).toHaveScreenshot(`todos-${viewport.width}-${state}.png`, {
        fullPage: true,
      });
    });
  });
});
