import { type Page, test } from '../../apps/web/e2e/fixtures';

const messages = [
  { method: 'warning', emit: () => console.warn('x') },
  { method: 'error', emit: () => console.error('x') },
];

messages.forEach(({ method, emit }) => {
  test(`console.${method}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(emit);
  });
});

test('pageerror', async ({ page }) => {
  await page.goto('/');
  const error = page.waitForEvent('pageerror');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('x');
    }, 0);
  });
  await error;
});

const workerSources = [
  { title: 'worker console.warning', source: "console.warn('x');" },
  { title: 'worker pageerror', source: "setTimeout(() => { throw new Error('x'); }, 0);" },
];

workerSources.forEach(({ title, source }) => {
  test(title, async ({ context, page }) => {
    await page.goto('/');
    const heard = title.endsWith('pageerror')
      ? context.waitForEvent('weberror')
      : context.waitForEvent('console', (message) => message.text() === 'x');
    await page.evaluate((body) => {
      const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
      return new Worker(url);
    }, source);
    await heard;
  });
});

/** The app opened again in a popup of the test's page. */
async function openPopup(page: Page) {
  await page.goto('/');
  const opened = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/'));
  return opened;
}

test('popup console.warning', async ({ page }) => {
  const popup = await openPopup(page);
  await popup.evaluate(() => console.warn('x'));
});

test('popup pageerror', async ({ page }) => {
  const popup = await openPopup(page);
  const error = popup.waitForEvent('pageerror');
  await popup.evaluate(() => {
    setTimeout(() => {
      throw new Error('x');
    }, 0);
  });
  await error;
});

test('runner console warn', () => {
  console.warn('x');
});

test('runner console error', () => {
  console.error('x');
});

test('runner warning', () => {
  process.emitWarning('x');
});

test.describe('expected console messages', () => {
  test.use({ expectedConsole: [/expected error/] });

  test('missing expected message', async ({ page }) => {
    await page.goto('/');
  });

  test('declared expected error', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => console.error('expected error'));
  });
});
