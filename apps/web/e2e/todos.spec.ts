import type { APIRequestContext, Request, Route } from '@playwright/test';
import { expect, type Page, test } from './fixtures';

/**
 * The to-do behaviour, end to end: the page in Chromium, the Vite server's
 * `/trpc` proxy, and the real api process. The list lives in that one api
 * process, so this is the only spec that changes it: its tests run in order in
 * one worker, and each starts from an empty list.
 */
test.describe.configure({ mode: 'default' });

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

const TOO_LONG = 'a'.repeat(101);

/** True when a tRPC request URL calls `procedure`, alone or in a batch. */
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

/** Opens the page and waits until the list has loaded. */
async function openPage(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Filter' })).toBeVisible();
}

const titleField = (page: Page) => page.getByRole('textbox', { name: 'Title', exact: true });
const addButton = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });
const todoList = (page: Page) => page.getByRole('list', { name: 'To-dos' });
const checkbox = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: title, exact: true });
const filterButton = (page: Page, name: 'All' | 'Active' | 'Done') =>
  page.getByRole('group', { name: 'Filter' }).getByRole('button', { name, exact: true });
const clearDone = (page: Page) => page.getByRole('button', { name: 'Clear done', exact: true });
const newTitleField = (page: Page) => page.getByRole('textbox', { name: 'New title' });

async function addOnPage(page: Page, title: string) {
  await titleField(page).fill(title);
  await addButton(page).click();
}

/** The titles the list shows, in order, by each checkbox's accessible name. */
async function expectTitles(page: Page, titles: readonly string[]) {
  const boxes = todoList(page).getByRole('checkbox');
  await expect(boxes).toHaveCount(titles.length);
  await Promise.all(
    titles.map((title, index) => expect(boxes.nth(index)).toHaveAccessibleName(title)),
  );
}

/** Answers every call to `procedure` with a 500, as a failed api would. */
async function failCalls(page: Page, procedure: string) {
  await page.route(
    (url) => calls(url, procedure),
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  );
}

/** Holds every call to `procedure` until the returned function releases them. */
async function holdCalls(page: Page, procedure: string) {
  const gate = { open: (): void => undefined };
  const opened = new Promise<void>((resolve) => {
    gate.open = resolve;
  });
  await page.route(
    (url) => calls(url, procedure),
    async (route: Route) => {
      await opened;
      await route.continue();
    },
  );
  return () => gate.open();
}

/** Records every request the page sends to `procedure`. */
function recordCalls(page: Page, procedure: string) {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (calls(request.url(), procedure)) {
      requests.push(request);
    }
  });
  return requests;
}

test.beforeEach(async ({ request }) => {
  const todos = await listThroughApi(request);
  await Promise.all(
    todos.map(async ({ id }) => {
      const response = await request.post('/trpc/todos.delete', { data: { id } });
      expect(response.status()).toBe(200);
    }),
  );
});

test.describe('Loading and empty states', () => {
  test('shows a loading message until the list arrives', async ({ page }) => {
    const release = await holdCalls(page, 'todos.list');

    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText('Loading to-dos…');
    await expect(page.getByRole('group', { name: 'Filter' })).toHaveCount(0);
    release();
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    await expect(page.getByText('Loading to-dos…')).toHaveCount(0);
  });

  test('starts on the All filter with an empty message when there are no to-dos', async ({
    page,
  }) => {
    await openPage(page);

    await expect(page.getByRole('heading', { level: 1, name: 'To-dos' })).toBeVisible();
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'false');
    await expect(filterButton(page, 'Done')).toHaveAttribute('aria-pressed', 'false');
    await expect(clearDone(page)).toBeDisabled();
  });

  test('says so when the list fails to load', async ({ page, expectConsole }) => {
    expectConsole(/Failed to load resource: .*500/);
    await failCalls(page, 'todos.list');

    await page.goto('/');

    await expect(page.getByRole('alert')).toHaveText('Could not load the to-dos');
    await expect(titleField(page)).toBeVisible();
    await expect(addButton(page)).toBeEnabled();
    await expect(page.getByRole('group', { name: 'Filter' })).toHaveCount(0);
    await expect(clearDone(page)).toHaveCount(0);
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(page.getByText('No to-dos to show')).toHaveCount(0);
  });
});

test.describe('Adding', () => {
  test('adds a to-do to the end of the list', async ({ page, request }) => {
    await addThroughApi(request, 'Read the review');
    await openPage(page);
    const added = page.waitForResponse((response) => calls(response.url(), 'todos.add'));

    await addOnPage(page, 'Write the talk');

    expect((await added).status()).toBe(200);
    await expectTitles(page, ['Read the review', 'Write the talk']);
    await expect(checkbox(page, 'Write the talk')).not.toBeChecked();
    await expect(titleField(page)).toHaveValue('');
  });

  test('stores and shows a title with its whitespace normalised', async ({ page, request }) => {
    await openPage(page);
    const sent = recordCalls(page, 'todos.add');

    await addOnPage(page, '  Buy \u00a0  milk  ');

    await expect(checkbox(page, 'Buy milk')).toBeVisible();
    expect(sent.map((call) => call.postDataJSON())).toEqual([{ 0: { title: 'Buy milk' } }]);
    expect(await todoList(page).getByText('Buy milk', { exact: true }).textContent()).toBe(
      'Buy milk',
    );
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual(['Buy milk']);
  });

  test('the api normalises a title from any client', async ({ request }) => {
    const added = await addThroughApi(request, '  Call \t Ada  ');

    expect(added).toEqual({ id: expect.any(String), title: 'Call Ada', done: false });
    expect(await listThroughApi(request)).toEqual([added]);
  });

  test('asks for a title and sends nothing when the title is blank', async ({ page }) => {
    await openPage(page);
    const sent = recordCalls(page, 'todos.add');

    await addOnPage(page, '   ');

    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(titleField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    expect(sent).toEqual([]);
  });

  test('clears the title message once the title is fixed', async ({ page }) => {
    await openPage(page);
    await addOnPage(page, TOO_LONG);
    await expect(page.getByRole('alert')).toHaveText('Use 100 characters or fewer');

    await titleField(page).fill('Buy milk');

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(titleField(page)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('accepts a title of exactly 100 characters after normalising', async ({ page }) => {
    const exact = 'b'.repeat(100);
    const spaced = `  ${'c'.repeat(50)}     ${'c'.repeat(49)}  `;
    await openPage(page);

    await addOnPage(page, exact);
    await expect(checkbox(page, exact)).toBeVisible();
    await addOnPage(page, spaced);

    await expectTitles(page, [exact, `${'c'.repeat(50)} ${'c'.repeat(49)}`]);
  });

  test('rejects a title over 100 characters and sends nothing', async ({ page }) => {
    await openPage(page);
    const sent = recordCalls(page, 'todos.add');

    await addOnPage(page, TOO_LONG);

    await expect(page.getByRole('alert')).toHaveText('Use 100 characters or fewer');
    await expect(titleField(page)).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);
  });

  test('the api rejects a blank or over-long title as a bad request', async ({ request }) => {
    const { id } = await addThroughApi(request, 'Keep me');
    const attempts = [
      ['todos.add', { title: '   ' }, 'Enter a title'],
      ['todos.add', { title: TOO_LONG }, 'Use 100 characters or fewer'],
      ['todos.rename', { id, title: ' \t ' }, 'Enter a title'],
      ['todos.rename', { id, title: TOO_LONG }, 'Use 100 characters or fewer'],
    ] as const;

    const responses = await Promise.all(
      attempts.map(async ([procedure, data, message]) => {
        const response = await request.post(`/trpc/${procedure}`, { data });
        return { status: response.status(), body: await response.json(), message };
      }),
    );

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400, 400]);
    expect(responses.map(({ body }) => body)).toMatchObject(
      responses.map(({ message }) => ({ error: { message, data: { code: 'BAD_REQUEST' } } })),
    );
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual(['Keep me']);
  });

  test('the api answers not found for an unknown to-do', async ({ request }) => {
    const attempts = [
      ['todos.setDone', { id: 'missing', done: true }],
      ['todos.rename', { id: 'missing', title: 'Anything' }],
      ['todos.delete', { id: 'missing' }],
    ] as const;

    const responses = await Promise.all(
      attempts.map(([procedure, data]) => request.post(`/trpc/${procedure}`, { data })),
    );

    expect(responses.map((response) => response.status())).toEqual([404, 404, 404]);
    await Promise.all(
      responses.map(async (response) =>
        expect(await response.json()).toMatchObject({
          error: { message: 'No to-do has that id', data: { code: 'NOT_FOUND' } },
        }),
      ),
    );
  });

  test('the api lists to-dos oldest first', async ({ request }) => {
    const added = await addAllThroughApi(request, ['First', 'Second', 'Third']);

    expect(await listThroughApi(request)).toEqual(added);
  });

  test('shows an add only once the api has answered and the list is re-read', async ({ page }) => {
    await openPage(page);
    const lists = recordCalls(page, 'todos.list');
    const releaseAdd = await holdCalls(page, 'todos.add');
    const releaseList = await holdCalls(page, 'todos.list');

    await addOnPage(page, 'Book the room');

    await expect(addButton(page)).toBeDisabled();
    await expect(titleField(page)).toHaveValue('Book the room');
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    const relisted = page.waitForRequest((request) => calls(request.url(), 'todos.list'));
    releaseAdd();
    await relisted;
    await expect(addButton(page)).toBeDisabled();
    await expect(titleField(page)).toHaveValue('Book the room');
    await expect(page.getByText('No to-dos to show', { exact: true })).toBeVisible();
    releaseList();
    await expectTitles(page, ['Book the room']);
    await expect(titleField(page)).toHaveValue('');
    await expect(addButton(page)).toBeEnabled();
    expect(lists).toHaveLength(1);
  });

  test('keeps the typed title and says so when adding fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'Read the review');
    await openPage(page);
    await failCalls(page, 'todos.add');

    await addOnPage(page, '  Call   Ada ');

    await expect(page.getByRole('alert')).toHaveText('Could not add the to-do');
    await expect(titleField(page)).toHaveValue('  Call   Ada ');
    await expect(addButton(page)).toBeEnabled();
    await expectTitles(page, ['Read the review']);
  });
});

test.describe('Marking done', () => {
  test('marks a to-do done and active again in place', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await openPage(page);

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
    expect((await listThroughApi(request)).map(({ done }) => done)).toEqual([false, true, false]);

    await todoList(page).getByText('Second', { exact: true }).click();

    await expect(checkbox(page, 'Second')).not.toBeChecked();
    await expect(todoList(page).getByText('Second', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
    await expectTitles(page, ['First', 'Second', 'Third']);
    expect((await listThroughApi(request)).map(({ done }) => done)).toEqual([false, false, false]);
  });

  test('disables every change control while a change waits', async ({ page, request }) => {
    const [, second] = await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await setDoneThroughApi(request, second?.id ?? '');
    await openPage(page);
    await page.getByRole('button', { name: 'Edit Third' }).click();
    const release = await holdCalls(page, 'todos.setDone');

    await checkbox(page, 'First').click();

    await expect(checkbox(page, 'First')).not.toBeChecked();
    await expect(checkbox(page, 'First')).toBeDisabled();
    await expect(checkbox(page, 'Second')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit First' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Second' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(addButton(page)).toBeDisabled();
    await expect(clearDone(page)).toBeDisabled();
    await expect(filterButton(page, 'Active')).toBeEnabled();
    await expect(titleField(page)).toBeEditable();
    await expect(newTitleField(page)).toBeEditable();
    release();
    await expect(checkbox(page, 'First')).toBeChecked();
    await expect(checkbox(page, 'First')).toBeEnabled();
    await expect(addButton(page)).toBeEnabled();
    await expect(clearDone(page)).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  });

  test('leaves the to-do unchanged and says so when marking it fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'First');
    await openPage(page);
    await failCalls(page, 'todos.setDone');

    await checkbox(page, 'First').click();

    await expect(page.getByRole('alert')).toHaveText('Could not update the to-do');
    await expect(checkbox(page, 'First')).not.toBeChecked();
    await expect(checkbox(page, 'First')).toBeEnabled();
    await expect(todoList(page).getByText('First', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
  });
});

test.describe('Editing', () => {
  test('edits a title in place and normalises it', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Buy milk', 'Third']);
    await openPage(page);

    await page.getByRole('button', { name: 'Edit Buy milk' }).click();

    await expect(newTitleField(page)).toHaveValue('Buy milk');
    await expect(checkbox(page, 'Buy milk')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete Buy milk' })).toHaveCount(0);
    await newTitleField(page).fill('  Buy   oat milk ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expectTitles(page, ['First', 'Buy oat milk', 'Third']);
    await expect(newTitleField(page)).toHaveCount(0);
    expect(await todoList(page).getByText('Buy oat milk', { exact: true }).textContent()).toBe(
      'Buy oat milk',
    );
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual([
      'First',
      'Buy oat milk',
      'Third',
    ]);
  });

  test('cancels an edit without saving', async ({ page, request }) => {
    await addThroughApi(request, 'Buy milk');
    await openPage(page);
    const sent = recordCalls(page, 'todos.rename');

    await page.getByRole('button', { name: 'Edit Buy milk' }).click();
    await newTitleField(page).fill('Buy bread');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(newTitleField(page)).toHaveCount(0);
    await expectTitles(page, ['Buy milk']);
    expect(sent).toEqual([]);
  });

  test('checks an edited title like a new one', async ({ page, request }) => {
    await addThroughApi(request, 'Buy milk');
    await openPage(page);
    const sent = recordCalls(page, 'todos.rename');
    await page.getByRole('button', { name: 'Edit Buy milk' }).click();

    await newTitleField(page).fill('  ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a title');
    await expect(newTitleField(page)).toHaveAttribute('aria-invalid', 'true');
    await newTitleField(page).fill(TOO_LONG);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Use 100 characters or fewer');
    await expect(newTitleField(page)).toBeVisible();
    expect(sent).toEqual([]);
  });

  test('edits one to-do at a time', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Second']);
    await openPage(page);

    await page.getByRole('button', { name: 'Edit First' }).click();
    await newTitleField(page).fill('Changed');
    await page.getByRole('button', { name: 'Edit Second' }).click();

    await expect(newTitleField(page)).toHaveCount(1);
    await expect(newTitleField(page)).toHaveValue('Second');
    await expect(checkbox(page, 'First')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expectTitles(page, ['First', 'Second']);
  });

  test('keeps the edit open with the typed title and says so when saving fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'Buy milk');
    await openPage(page);
    await failCalls(page, 'todos.rename');
    await page.getByRole('button', { name: 'Edit Buy milk' }).click();

    await newTitleField(page).fill('  Buy   bread ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Could not save the to-do');
    await expect(newTitleField(page)).toHaveValue('  Buy   bread ');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual(['Buy milk']);
  });
});

test.describe('Deleting', () => {
  test('deletes a to-do at once', async ({ page, request }) => {
    await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await openPage(page);

    await page.getByRole('button', { name: 'Delete Second' }).click();

    await expectTitles(page, ['First', 'Third']);
    await expect(page.getByRole('button', { name: 'Delete First' })).toHaveText('Delete');
    await expect(page.getByRole('button', { name: 'Edit First' })).toHaveText('Edit');
    expect((await listThroughApi(request)).map(({ title }) => title)).toEqual(['First', 'Third']);
  });

  test('keeps the to-do and says so when deleting fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'First');
    await openPage(page);
    await failCalls(page, 'todos.delete');

    await page.getByRole('button', { name: 'Delete First' }).click();

    await expect(page.getByRole('alert')).toHaveText('Could not delete the to-do');
    await expectTitles(page, ['First']);
    await expect(page.getByRole('button', { name: 'Delete First' })).toBeEnabled();
  });
});

test.describe('Filtering', () => {
  test('filters to active or done to-dos and back to all', async ({ page, request }) => {
    const [, second] = await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await setDoneThroughApi(request, second?.id ?? '');
    await openPage(page);

    await filterButton(page, 'Active').click();
    await expectTitles(page, ['First', 'Third']);
    await expect(filterButton(page, 'Active')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'false');

    await filterButton(page, 'Done').click();
    await expectTitles(page, ['Second']);
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

  test('returns to the All filter when the page reloads', async ({ page, request }) => {
    await addThroughApi(request, 'First');
    await openPage(page);
    await filterButton(page, 'Done').click();

    await page.reload();

    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expectTitles(page, ['First']);
  });
});

test.describe('Clearing done to-dos', () => {
  test('clears every done to-do whatever the filter', async ({ page, request }) => {
    const [first, , third] = await addAllThroughApi(request, ['First', 'Second', 'Third']);
    await setDoneThroughApi(request, first?.id ?? '');
    await setDoneThroughApi(request, third?.id ?? '');
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
    const sent = recordCalls(page, 'todos.clearDone');

    await expect(clearDone(page)).toBeDisabled();
    await clearDone(page).click({ force: true });
    await checkbox(page, 'First').click();

    await expect(clearDone(page)).toBeEnabled();
    expect(sent).toEqual([]);
    await expectTitles(page, ['First', 'Second']);
  });

  test('keeps the done to-dos and says so when clearing fails', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    const [first] = await addAllThroughApi(request, ['First', 'Second']);
    await setDoneThroughApi(request, first?.id ?? '');
    await openPage(page);
    await failCalls(page, 'todos.clearDone');

    await clearDone(page).click();

    await expect(page.getByRole('alert')).toHaveText('Could not clear the done to-dos');
    await expectTitles(page, ['First', 'Second']);
    await expect(checkbox(page, 'First')).toBeChecked();
    await expect(clearDone(page)).toBeEnabled();
  });
});

test.describe('Failures and refreshing', () => {
  test('shows only the latest failure and clears it when the next change starts', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'First');
    await openPage(page);
    await failCalls(page, 'todos.setDone');
    await failCalls(page, 'todos.delete');

    await checkbox(page, 'First').click();
    await expect(page.getByRole('alert')).toHaveText('Could not update the to-do');
    await page.getByRole('button', { name: 'Delete First' }).click();
    await expect(page.getByRole('alert')).toHaveText('Could not delete the to-do');
    const release = await holdCalls(page, 'todos.add');
    await addOnPage(page, 'Second');

    await expect(page.getByRole('alert')).toHaveCount(0);
    release();
    await expectTitles(page, ['First', 'Second']);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('reads the list only when the page opens and after a successful change', async ({
    page,
    request,
    expectConsole,
  }) => {
    expectConsole(/Failed to load resource: .*500/);
    await addThroughApi(request, 'First');
    const lists = recordCalls(page, 'todos.list');
    await openPage(page);
    expect(lists).toHaveLength(1);

    await page.evaluate(() => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    // A read the events start would go out at once; a second is ample time to see one.
    await page.waitForTimeout(1_000);
    expect(lists).toHaveLength(1);
    await failCalls(page, 'todos.delete');
    await page.getByRole('button', { name: 'Delete First' }).click();
    await expect(page.getByRole('alert')).toHaveText('Could not delete the to-do');
    await addOnPage(page, 'Second');
    await expectTitles(page, ['First', 'Second']);

    expect(lists).toHaveLength(2);
  });
});
