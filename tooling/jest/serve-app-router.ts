import { join, sep } from 'node:path';
import { listResults } from '../results.mjs';

type ApiClientTestRouter = typeof import('../../apps/web/src/api-client/testAppRouter.ts');
type ApiRouter = typeof import('../../apps/api/src/router.ts');

const root = join(__dirname, '..', '..');
const testPath = expect.getState().testPath ?? '';
const result = listResults(root).find(({ web }) => testPath.startsWith(join(root, web, sep)));

if (result) {
  const apiClient: ApiClientTestRouter = require(
    join(root, result.web, 'src/api-client/testAppRouter.ts'),
  );
  apiClient.serveAppRouterInTests(() => {
    const api: ApiRouter = require(join(root, result.api, 'src/router.ts'));
    return api.createAppRouter();
  });
}
