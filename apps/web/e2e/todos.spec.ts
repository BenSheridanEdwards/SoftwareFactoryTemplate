import { expect, test } from './fixtures';

test.describe('To-dos: loading and adding', () => {
  test('loads an empty list then adds a normalised title', async ({ page }) => {
    await page.goto('/todos');
    await expect(page.getByText('No to-dos to show')).toBeVisible();
    await page.getByRole('textbox', { name: 'Title' }).fill(' Buy  milk ');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('list', { name: 'To-dos' })).toHaveText('Buy milk');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  });

  test('rejects blank and too-long titles', async ({ page }) => {
    await page.goto('/todos');
    await page.getByRole('textbox', { name: 'Title' }).fill('   ');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await page.getByRole('textbox', { name: 'Title' }).fill('a'.repeat(101));
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('alert')).toHaveText('Use 100 characters or fewer');
  });
});
