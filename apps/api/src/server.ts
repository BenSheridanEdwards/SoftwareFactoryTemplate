import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { Schema } from 'effect';
import { appRouter } from './router.ts';

const Port = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 65_535 }),
);

const port = Schema.decodeUnknownSync(Port)(process.env.PORT ?? '3001');

const server = createHTTPServer({ router: appRouter, basePath: '/trpc/' });

server.once('listening', () => {
  console.log(`api listening on http://127.0.0.1:${port}/trpc`);
});
server.listen(port, '127.0.0.1');
