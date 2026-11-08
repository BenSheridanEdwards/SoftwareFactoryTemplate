// Web code imports the api by type only, so a page test cannot import the api
// router itself. Before each web test file, this setup hands the router factory
// of the result under test to that result's api client, for TestApiProvider.
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
