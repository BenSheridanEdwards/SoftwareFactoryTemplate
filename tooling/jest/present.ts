interface Success<Value> {
  readonly ok: true;
  readonly value: Value;
}

interface Failure {
  readonly ok: false;
}

const isOutcome = <Value>(
  value: Success<Value> | Failure | Value,
): value is Success<Value> | Failure => value instanceof Object && 'ok' in value;

/**
 * The value a test expects to be there: a defined value, or the value of an ok
 * outcome. A missing value throws, so the test fails on the line that needed it.
 */
export function present<Value>(outcome: Success<Value> | Failure): Value;
export function present<Value>(value: Value | null | undefined): Value;
export function present<Value>(value: Success<Value> | Failure | Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error(`Expected a value, received ${value}`);
  }
  if (!isOutcome(value)) {
    return value;
  }
  if (!value.ok) {
    throw new Error(`Expected an ok outcome, received ${JSON.stringify(value)}`);
  }
  return value.value;
}
