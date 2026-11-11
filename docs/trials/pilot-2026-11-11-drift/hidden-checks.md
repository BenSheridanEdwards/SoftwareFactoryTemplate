# Hidden checks of the drift pilot

These Playwright checks scored each step. The builders had no access to them. Each file ran alone against fresh servers, with one worker.

## `zz-hidden-tags.spec.ts`

```ts
// Hidden checks for the tags change. The builder never sees this file.
import { type APIResponse, expect, type Page, test } from '@playwright/test';

const region = (page: Page) => page.getByRole('region', { name: 'Tags', exact: true });
const items = (page: Page) =>
  region(page).getByRole('list', { name: 'Tags', exact: true }).getByRole('listitem');
const add = async (page: Page, name: string) => {
  await region(page).getByRole('textbox', { name: 'Tag name' }).fill(name);
  await region(page).getByRole('button', { name: 'Add tag', exact: true }).click();
};
const data = async (response: APIResponse) => (await response.json())[0];

test('H-tags-1 adds a tag and lists it with its delete button', async ({ page }) => {
  await page.goto('/');
  await add(page, 'urgent');
  await expect(items(page).filter({ hasText: 'urgent' })).toHaveCount(1);
  await expect(
    region(page).getByRole('button', { name: 'Delete tag urgent', exact: true }),
  ).toBeVisible();
});

test('H-tags-2 a blank name adds nothing and shows an alert', async ({ page }) => {
  await page.goto('/');
  await expect(items(page)).toHaveCount(1);
  await add(page, '   ');
  await expect(region(page).getByRole('alert').first()).toBeVisible();
  await expect(items(page)).toHaveCount(1);
});

test('H-tags-3 an existing name in another letter case adds nothing and says so', async ({
  page,
}) => {
  await page.goto('/');
  await expect(items(page)).toHaveCount(1);
  await add(page, 'URGENT');
  await expect(region(page).getByRole('alert').filter({ hasText: 'That tag exists' })).toBeVisible();
  await expect(items(page)).toHaveCount(1);
});

test('H-tags-4 a tag survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(items(page).filter({ hasText: 'urgent' })).toHaveCount(1);
  await page.reload();
  await expect(items(page).filter({ hasText: 'urgent' })).toHaveCount(1);
});

test('H-tags-5 the delete button removes the tag', async ({ page }) => {
  await page.goto('/');
  await region(page).getByRole('button', { name: 'Delete tag urgent', exact: true }).click();
  await expect(
    region(page).getByRole('button', { name: 'Delete tag urgent', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    region(page).getByRole('button', { name: 'Delete tag urgent', exact: true }),
  ).toHaveCount(0);
});

test('H-tags-6 the api creates a trimmed tag and lists it', async ({ request }) => {
  const created = await request.post('/trpc/tags.create?batch=1', { data: { 0: { name: '  home  ' } } });
  expect(created.status()).toBe(200);
  const tag = (await data(created)).result.data;
  expect(tag).toEqual({ id: expect.any(String), name: 'home' });
  const listed = await request.get('/trpc/tags.list?batch=1');
  expect(listed.status()).toBe(200);
  expect((await data(listed)).result.data).toContainEqual(tag);
});

test('H-tags-7 the api rejects a blank name as a bad request', async ({ request }) => {
  const response = await request.post('/trpc/tags.create?batch=1', { data: { 0: { name: '   ' } } });
  expect(response.status()).toBe(400);
  expect((await data(response)).error.data.code).toBe('BAD_REQUEST');
});

test('H-tags-8 the api rejects an existing name in another letter case as a conflict', async ({
  request,
}) => {
  const response = await request.post('/trpc/tags.create?batch=1', { data: { 0: { name: 'HOME' } } });
  expect(response.status()).toBe(409);
  expect((await data(response)).error.data.code).toBe('CONFLICT');
});

test('H-tags-9 the api deletes a tag by id and rejects an unknown id as not found', async ({
  request,
}) => {
  const listed = (await data(await request.get('/trpc/tags.list?batch=1'))).result.data;
  const home = listed.find((tag: { name: string }) => tag.name === 'home');
  const deleted = await request.post('/trpc/tags.delete?batch=1', { data: { 0: { id: home.id } } });
  expect(deleted.status()).toBe(200);
  expect((await data(deleted)).result.data).toEqual({ id: home.id });
  const again = await request.post('/trpc/tags.delete?batch=1', { data: { 0: { id: home.id } } });
  expect(again.status()).toBe(404);
  expect((await data(again)).error.data.code).toBe('NOT_FOUND');
});
```

## `zz-hidden-clear.spec.ts`

```ts
// Hidden checks for the clear-completed change. The builder never sees this file.
import { type APIResponse, expect, type Page, test } from '@playwright/test';

const clear = (page: Page) => page.getByRole('button', { name: 'Clear completed', exact: true });
const box = (page: Page, title: string) => page.getByRole('checkbox', { name: title, exact: true });
const add = async (page: Page, title: string) => {
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(box(page, title)).toBeVisible();
};
const data = async (response: APIResponse) => (await response.json())[0];

test('H-clear-1 the button is disabled while no todo is completed', async ({ page }) => {
  await page.goto('/');
  await add(page, 'keep me');
  await expect(clear(page)).toBeDisabled();
});

test('H-clear-2 the button is enabled when a todo is completed', async ({ page }) => {
  await page.goto('/');
  await add(page, 'clear me');
  await box(page, 'clear me').click();
  await expect(box(page, 'clear me')).toBeChecked();
  await expect(clear(page)).toBeEnabled();
});

test('H-clear-3 it removes the completed todos and keeps the others', async ({ page }) => {
  await page.goto('/');
  await expect(box(page, 'clear me')).toBeChecked();
  await clear(page).click();
  await expect(box(page, 'clear me')).toHaveCount(0);
  await expect(box(page, 'keep me')).toBeVisible();
  await expect(clear(page)).toBeDisabled();
  await page.reload();
  await expect(box(page, 'clear me')).toHaveCount(0);
  await expect(box(page, 'keep me')).toBeVisible();
});

test('H-clear-4 the api returns the ids it removed', async ({ request }) => {
  const post = (name: string, value?: unknown) =>
    request.post(`/trpc/todos.${name}?batch=1`, { data: value === undefined ? {} : { 0: value } });
  const todo = (await data(await post('create', { title: 'api clear' }))).result.data;
  await post('toggle', { id: todo.id });
  const cleared = await post('clearCompleted');
  expect(cleared.status()).toBe(200);
  expect((await data(cleared)).result.data).toEqual({ ids: [todo.id] });
});

test('H-clear-5 the api returns an empty list when no todo is completed', async ({ request }) => {
  const cleared = await request.post('/trpc/todos.clearCompleted?batch=1', { data: {} });
  expect(cleared.status()).toBe(200);
  expect((await data(cleared)).result.data).toEqual({ ids: [] });
});
```

## `zz-hidden-summary.spec.ts`

```ts
// Hidden checks for the summary change. The builder never sees this file.
import { expect, type Page, test } from '@playwright/test';

const summary = (page: Page) => page.getByRole('status').filter({ hasText: /\d+ of \d+ done/ });
const box = (page: Page, title: string) => page.getByRole('checkbox', { name: title, exact: true });
const add = async (page: Page, title: string) => {
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(box(page, title)).toBeVisible();
};

test('H-sum-1 an empty list reads 0 of 0 done', async ({ page }) => {
  await page.goto('/');
  await expect(summary(page)).toHaveText('0 of 0 done');
});

test('H-sum-2 it counts after creates and a toggle', async ({ page }) => {
  await page.goto('/');
  await add(page, 'first');
  await add(page, 'second');
  await expect(summary(page)).toHaveText('0 of 2 done');
  await box(page, 'first').click();
  await expect(box(page, 'first')).toBeChecked();
  await expect(summary(page)).toHaveText('1 of 2 done');
});

test('H-sum-3 it counts after a delete', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete second', exact: true }).click();
  await expect(summary(page)).toHaveText('1 of 1 done');
});

test('H-sum-4 it counts after a clear of completed todos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Clear completed', exact: true }).click();
  await expect(summary(page)).toHaveText('0 of 0 done');
});
```
