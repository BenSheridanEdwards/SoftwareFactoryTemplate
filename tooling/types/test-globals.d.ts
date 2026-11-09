// The Jest setup makes these helpers from tooling/jest/test-globals.ts globals in
// every unit test. Only the test type programs (tsconfig.test.json,
// tsconfig.api.test.json and tsconfig.node.test.json) include this file, so
// production code and e2e specs cannot call them.
declare const present: typeof import('../jest/test-globals.ts').testGlobals.present;
declare const unwrap: typeof import('../jest/test-globals.ts').testGlobals.unwrap;
