import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { expect, type Page, present, test } from './fixtures';

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

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}
const calls = (url: URL | string, procedure: string) =>
  new URL(url).pathname.replace('/trpc/', '').split(',').includes(procedure);

async function listThroughApi(request: APIRequestContext): Promise<Todo[]> {
  const response = await request.get('/trpc/todos.list');
  expect(response.status()).toBe(200);
  return (await response.json()).result.data;
}

async function addThroughApi(request: APIRequestContext, title: string): Promise<Todo> {
  const response = await request.post('/trpc/todos.add', { data: { title } });
  expect(response.status()).toBe(200);
  return (await response.json()).result.data;
}

async function addAllThroughApi(request: APIRequestContext, titles: readonly string[]) {
  return titles.reduce<Promise<Todo[]>>(
    async (added, title) => [...(await added), await addThroughApi(request, title)],
    Promise.resolve([]),
  );
}

async function setDoneThroughApi(request: APIRequestContext, id: string) {
  const response = await request.post('/trpc/todos.setDone', { data: { id, done: true } });
  expect(response.status()).toBe(200);
}

async function openPage(page: Page) {
  await page.goto('/todos');
  await expect(page.getByRole('group', { name: 'Filter' })).toBeVisible();
}
const filterButton = (page: Page, name: 'All' | 'Active' | 'Done') =>
  page.getByRole('group', { name: 'Filter' }).getByRole('button', { name, exact: true });
const clearDone = (page: Page) => page.getByRole('button', { name: 'Clear done', exact: true });
async function failCalls(page: Page, procedure: string) {
  await page.route(
    (url) => calls(url, procedure),
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
}

test.describe('Filtering', () => {
  test('filters to active or done to-dos and back to all', async ({ page, request }, testInfo) => {
    const [, second] = await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await setDoneThroughApi(request, present(second).id);
    await openPage(page);

    await filterButton(page, 'Active').click();
    await expectTitles(page, ['First', 'Third']);
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'false');

    await filterButton(page, 'Done').click();
    await expectTitles(page, ['Second']);
    await page.screenshot({ path: testInfo.outputPath('todos-filter.png'), fullPage: true });
    await expect(filterButton(page, 'Done')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'false');

    await filterButton(page, 'All').click();
    await expectTitles(page, ['First', 'Second', 'Third']);
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'Done')).toHaveAttribute('aria-pressed', 'false');
  });

  test('hides a to-do from the Active filter once it is marked done', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Second']);
    await openPage(page);
    await filterButton(page, 'Active').click();

    await checkbox(page, 'First').click();

    await expectTitles(page, ['Second']);
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows the empty message when a filter matches nothing', async ({ page, request }) => {
    await addThroughApi(request, 'First');
    await openPage(page);

    await filterButton(page, 'Done').click();

    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);
  });
});

test.describe('Clearing done to-dos', () => {
  test('clears every done to-do whatever the filter', async ({ page, request }) => {
    const [first, , third] = await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await setDoneThroughApi(request, present(first).id);
    await setDoneThroughApi(request, present(third).id);
    await openPage(page);
    await filterButton(page, 'Active').click();

    await clearDone(page).click();

    await expect(clearDone(page)).toBeDisabled();
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'true');
    await expectTitles(page, ['Second']);
    await filterButton(page, 'All').click();
    await expectTitles(page, ['Second']);
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual(['Second']);
  });

  test('enables Clear done only while a to-do is done', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Second']);
    await openPage(page);

    await expect(clearDone(page)).toBeDisabled();
    await clearDone(page).click({ force: true });
    await checkbox(page, 'First').click();

    await expect(clearDone(page)).toBeEnabled();
    await expectTitles(page, ['First', 'Second']);
  });

  test('keeps the done to-dos and says so when clearing fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    const [first] = await addAllThroughApi(request, ['First', 'Second']);
    await setDoneThroughApi(request, present(first).id);
    await openPage(page);
    await failCalls(page, 'todos.clearDone');

    await clearDone(page).click();

    await expect(page.getByRole('alert')).toHaveText('Could not clear the done to-dos');
    await expectTitles(page, ['First', 'Second']);
    await expect(checkbox(page, 'First')).toBeChecked();
    await expect(clearDone(page)).toBeEnabled();
  });
});
