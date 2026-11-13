import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test.describe('To-dos: loading and adding', () => {
  test.describe.configure({ mode: 'default' });
  test.beforeEach(async ({ request }) => {
    const response = await request.get('/trpc/todos.list');
    const todos: readonly { readonly id: string }[] = (await response.json()).result.data;
    await Promise.all(todos.map(({ id }) => request.post('/trpc/todos.delete', { data: { id } })));
  });
  test('shows loading until the list arrives', async ({ page }) => {
    const gate = { release: (): void => undefined };
    const waiting = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    await page.route('**/trpc/todos.list**', async (route) => {
      await waiting;
      await route.continue();
    });
    await page.goto('/todos');
    await expect(page.getByRole('status')).toHaveText('Loading to-dos…');
    gate.release();
    await expect(page.getByText('No to-dos to show')).toBeVisible();
  });

  test('loads an empty list then adds a normalised title', async ({ page }, testInfo) => {
    await page.goto('/todos');
    await expect(page.getByText('No to-dos to show')).toBeVisible();
    await page.getByRole('textbox', { name: 'Title' }).fill(' Buy  milk ');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('list', { name: 'To-dos' })).toHaveText('Buy milk');
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('todos-list.png'), fullPage: true });
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
