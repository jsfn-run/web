class Ref<RefValue> {
  private _value: RefValue | undefined;
  private _obs: any[] = [];

  detach: () => void;

  constructor(initial?: RefValue) {
    this._value = initial;
  }

  set value(v: RefValue | undefined) {
    this._value = v;
    this._obs.forEach((f) => f(v));
  }

  get value() {
    return this._value;
  }

  observe(fn: (value: RefValue) => void) {
    this._obs.push(fn);
  }

  toString() {
    return String(this._value);
  }
}

export function ref<T>(value?: T) {
  return new Ref<T>(value);
}

export function isRef(v): v is Ref<any> {
  return v && v instanceof Ref;
}

export function useState<
  T extends object,
  A extends string,
  F extends (...args: any) => any
>(initialState: T, actions: Record<A, F>) {
  const stateChangeEvent = "@@statechange";
  const events = new EventTarget();
  const onStateChange = (detail: any) =>
    events.dispatchEvent(new CustomEvent(stateChangeEvent, { detail }));

  let devTools;

  if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) {
    devTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__.connect();
    devTools.init(initialState);
  }

  const state = new Proxy(initialState, {
    get(target, p) {
      return target[p];
    },

    set(target, p, value) {
      target[p] = value;
      onStateChange({ ...target });
      return true;
    },
  });

  function set<K extends keyof T>(key: K, value: T[K]) {
    state[key] = value;
  }

  function get<K extends keyof T>(key: K): T[K] {
    return state[key];
  }

  function watch<V extends any>(
    input: Ref<V>,
    observer: (v: V, p: V | undefined) => void
  ) {
    let lastValue: V;
    lastValue = input.value!;
    observer(lastValue, undefined);

    input.observe((value) => {
      if (value !== lastValue) {
        observer(value, lastValue);
        lastValue = value;
      }
    });
  }

  function react(fn: (state: T) => any) {
    const handler = (e: any) => fn(e.detail);
    events.addEventListener(stateChangeEvent, handler);
    return () => events.removeEventListener(stateChangeEvent, handler);
  }

  async function dispatch(action: A, payload: any = null) {
    const result = await actions[action](payload);
    devTools?.send(action, state);
    onStateChange(state);
    return result as ReturnType<(typeof actions)[A]>;
  }

  async function commit() {
    devTools?.send("@@commit", state);
    onStateChange(state);
  }

  function select<V>(selector: (state: T) => V): Ref<V> {
    const ref = new Ref(selector(state));
    ref.detach = react((state: T) => (ref.value = selector(state)));
    return ref;
  }

  return { react, select, dispatch, set, get, watch, commit };
}
