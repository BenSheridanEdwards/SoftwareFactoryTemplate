// The Jest setup makes these helpers from tooling/jest/test-globals.ts globals in
// every unit test.
declare const present: typeof import('../jest/test-globals.ts').testGlobals.present;
declare const unwrap: typeof import('../jest/test-globals.ts').testGlobals.unwrap;
