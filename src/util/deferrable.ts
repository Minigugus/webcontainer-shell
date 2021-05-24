export function deferrable<T>() {
  let resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return ({
    resolve: resolve!,
    reject: reject!,
    promise
  });
}
