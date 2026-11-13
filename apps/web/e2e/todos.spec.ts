import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';

test.describe.configure({ mode: 'default' });

test.describe('To-dos: loading and adding', () => {
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
    await expect(checkbox(page, 'Buy milk')).toBeVisible();
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

test.beforeEach(async ({ request }) => {
  const response = await request.get('/trpc/todos.list');
  const todos: readonly { readonly id: string }[] = (await response.json()).result.data;
  await Promise.all(todos.map(({ id }) => request.post('/trpc/todos.delete', { data: { id } })));
});
const todoList = (page: Page) => page.getByRole('list', { name: 'To-dos' });
const checkbox = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: title, exact: true });
const newTitleField = (page: Page) => page.getByRole('textbox', { name: 'New title' });
async function expectTitles(page: Page, titles: readonly string[]) {
  await expect(todoList(page).getByRole('checkbox')).toHaveCount(titles.length);
  await Promise.all(
    titles.map((title, index) =>
      expect(todoList(page).getByRole('checkbox').nth(index)).toHaveAccessibleName(title),
    ),
  );
}
test.describe('Marking done', () => {
  test('marks a to-do done and active again in place', async ({ page }) => {
    await page.goto('/todos');
    await ['First', 'Second', 'Third'].reduce(async (previous, title) => {
      await previous;
      await page.getByRole('textbox', { name: 'Title' }).fill(title);
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(checkbox(page, title)).toBeVisible();
    }, Promise.resolve());

    await checkbox(page, 'Second').click();

    await expect(checkbox(page, 'Second')).toBeChecked();
    await expect(todoList(page).getByText('Second', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
    await expect(todoList(page).getByText('First', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
    await expectTitles(page, ['First', 'Second', 'Third']);

    await todoList(page).getByText('Second', { exact: true }).click();

    await expect(checkbox(page, 'Second')).not.toBeChecked();
    await expect(todoList(page).getByText('Second', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
    await expectTitles(page, ['First', 'Second', 'Third']);
  });
});

test.describe('Editing', () => {
  test('edits a title in place and normalises it', async ({ page }, testInfo) => {
    await page.goto('/todos');
    await ['First', 'Buy milk', 'Third'].reduce(async (previous, title) => {
      await previous;
      await page.getByRole('textbox', { name: 'Title' }).fill(title);
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(checkbox(page, title)).toBeVisible();
    }, Promise.resolve());

    await page.getByRole('button', { name: 'Edit Buy milk' }).click();

    await expect(newTitleField(page)).toHaveValue('Buy milk');
    await page.screenshot({ path: testInfo.outputPath('todos-edit.png'), fullPage: true });
    await expect(checkbox(page, 'Buy milk')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete Buy milk' })).toHaveCount(0);
    await newTitleField(page).fill('  Buy   oat milk ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expectTitles(page, ['First', 'Buy oat milk', 'Third']);
    await page.screenshot({ path: testInfo.outputPath('todos-saved.png'), fullPage: true });
    await expect(newTitleField(page)).toHaveCount(0);
    expect(await todoList(page).getByText('Buy oat milk', { exact: true }).textContent()).toBe(
      'Buy oat milk',
    );
  });
});

test.describe('Deleting', () => {
  test('deletes a to-do at once', async ({ page }) => {
    await page.goto('/todos');
    await ['First', 'Second', 'Third'].reduce(async (previous, title) => {
      await previous;
      await page.getByRole('textbox', { name: 'Title' }).fill(title);
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(checkbox(page, title)).toBeVisible();
    }, Promise.resolve());

    await page.getByRole('button', { name: 'Delete Second' }).click();

    await expectTitles(page, ['First', 'Third']);
    await expect(page.getByRole('button', { name: 'Delete First' })).toHaveText('Delete');
    await expect(page.getByRole('button', { name: 'Edit First' })).toHaveText('Edit');
  });
});
