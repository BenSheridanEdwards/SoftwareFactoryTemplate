/**
 * The journeys `verify.mjs drive <id>` runs. Each one follows the matching
 * feature file in `../features/`. A journey receives `{ page, step, expect }`;
 * every `step` captures a screenshot and an ARIA snapshot after its body passes.
 */
import AxeBuilder from '@axe-core/playwright';

/** Records the requests the page sends to one procedure, so a step can prove none left. */
function watchCalls(page, procedure) {
  const calls = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.replace('/trpc/', '').split(',').includes(procedure)) {
      calls.push(request.url());
    }
  });
  return calls;
}

async function openTodos(page, expect) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'To-dos' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filter' })).toBeVisible();
}

async function addTitle(page, title) {
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

const todos = {
  id: 'todos',
  feature: 'todos',
  async run({ page, step, expect }) {
    const adds = watchCalls(page, 'todos.add');
    const title = `Buy milk ${Date.now()}`;

    await step('open the to-do page', async () => {
      await openTodos(page, expect);
      await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    await step('a blank title asks for a title and sends nothing', async () => {
      await addTitle(page, '');
      await expect(page.getByRole('alert')).toHaveText('Enter a title');
      expect(adds).toEqual([]);
    });
    await step('a title is added through the api', async () => {
      const answered = page.waitForResponse((response) =>
        response.url().includes('/trpc/todos.add'),
      );
      await addTitle(page, `  ${title.replace(' ', '   ')} `);
      expect((await answered).status()).toBe(200);
      await expect(page.getByRole('checkbox', { name: title, exact: true })).not.toBeChecked();
      await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
      expect(adds).toHaveLength(1);
    });
    await step('the to-do is marked done', async () => {
      await page.getByRole('checkbox', { name: title, exact: true }).click();
      await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeChecked();
    });
    await step('the to-do is deleted', async () => {
      await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
      await expect(page.getByRole('checkbox', { name: title, exact: true })).toHaveCount(0);
    });
  },
};

const todosValidation = {
  id: 'todos-validation',
  feature: 'todos',
  async run({ page, step, expect }) {
    const adds = watchCalls(page, 'todos.add');

    await step('a whitespace title asks for a title and sends nothing', async () => {
      await openTodos(page, expect);
      await addTitle(page, '   ');
      await expect(page.getByRole('alert')).toHaveText('Enter a title');
      await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(adds).toEqual([]);
    });
    await step('a 101-character title is too long and sends nothing', async () => {
      await addTitle(page, 'a'.repeat(101));
      await expect(page.getByRole('alert')).toHaveText('Use 100 characters or fewer');
      expect(adds).toEqual([]);
    });
  },
};

const todosError = {
  id: 'todos-error',
  feature: 'todos',
  async run({ page, step, expect }) {
    await page.route('**/trpc/todos.add**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await step('a failing add shows the error and keeps the typed title', async () => {
      await openTodos(page, expect);
      await addTitle(page, 'Call Ada');
      await expect(page.getByRole('alert')).toHaveText('Could not add the to-do');
      await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
        'Call Ada',
      );
    });
  },
};

const accessibility = {
  id: 'accessibility',
  feature: 'accessibility',
  async run({ page, step, expect }) {
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
    };

    await step('the to-do page has no WCAG A or AA violations', async () => {
      await openTodos(page, expect);
      await scan();
    });
    await step('the validation error has no WCAG A or AA violations', async () => {
      await addTitle(page, '');
      await expect(page.getByRole('alert')).toHaveText('Enter a title');
      await scan();
    });
    await step('keyboard tab order reaches the field, then the button', async () => {
      await openTodos(page, expect);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeFocused();
    });
  },
};

export const JOURNEYS = Object.fromEntries(
  [todos, todosValidation, todosError, accessibility].map((journey) => [journey.id, journey]),
);
