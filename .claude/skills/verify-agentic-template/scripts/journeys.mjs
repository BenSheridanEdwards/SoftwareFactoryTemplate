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

    await step('open the to-do page', () => openTodos(page, expect));
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

async function submitName(page, name) {
  const field = page.getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await page.getByRole('button', { name: 'Greet', exact: true }).click();
}

const greeting = {
  id: 'greeting',
  feature: 'greeting',
  async run({ page, step, expect }) {
    const calls = watchCalls(page, 'greeting.greet');

    await step('open the greeting page', async () => {
      await page.goto('/greeting');
      await expect(page.getByRole('heading', { level: 1, name: 'Greeting' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('');
    });
    await step('a blank name asks for a name and sends nothing', async () => {
      await submitName(page, '');
      await expect(page.getByRole('alert')).toHaveText('Enter a name');
      expect(calls).toEqual([]);
    });
    await step('a name gets its greeting from the api', async () => {
      const answered = page.waitForResponse((response) =>
        response.url().includes('/trpc/greeting.greet'),
      );
      await submitName(page, 'Ada');
      expect((await answered).status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText('Hello, Ada!');
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(calls).toHaveLength(1);
    });
  },
};

const greetingValidation = {
  id: 'greeting-validation',
  feature: 'greeting',
  async run({ page, step, expect }) {
    const calls = watchCalls(page, 'greeting.greet');

    await step('a whitespace name asks for a name and sends nothing', async () => {
      await page.goto('/greeting');
      await submitName(page, '   ');
      await expect(page.getByRole('alert')).toHaveText('Enter a name');
      await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(calls).toEqual([]);
    });
  },
};

const greetingError = {
  id: 'greeting-error',
  feature: 'greeting',
  async run({ page, step, expect }) {
    await page.route('**/trpc/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await step('a failing api shows the error', async () => {
      await page.goto('/greeting');
      await submitName(page, 'Ada');
      await expect(page.getByRole('alert')).toHaveText('Could not load the greeting');
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
  [todos, greeting, greetingValidation, greetingError, accessibility].map((journey) => [
    journey.id,
    journey,
  ]),
);
