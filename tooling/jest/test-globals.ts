interface Success<Value> {
  readonly ok: true;
  readonly value: Value;
}

interface Failure {
  readonly ok: false;
}

/** The value a test expects to be there. `null` or `undefined` throws, so the test fails on the line that needed it. */
function present<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error(`Expected a value, received ${value}`);
  }
  return value;
}

/** The value of a success. A failure throws with the failure, so the test fails on the line that needed the value. */
function unwrap<Value>(outcome: Success<Value> | Failure): Value {
  if (!outcome.ok) {
    throw new Error(`Expected a success, received ${JSON.stringify(outcome)}`);
  }
  return outcome.value;
}

/** The helpers the Jest setup makes globals, one object so no export shares a name with an E2E fixture. */
export const testGlobals = { present, unwrap };
