export interface Deferrable<T> {
  promise: Promise<T>;
  reject: (reason?: any) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

export function deferrable<T>(): Deferrable<T> {
  let reject: (reason?: any) => void, resolve: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    resolve = res;
  });
  return {
    promise,
    reject: reject!,
    resolve: resolve!
  }
}

export function asyncIterator2ReadableStream<T>(iterator: Iterator<T> | AsyncIterator<T>): ReadableStream<T>;
export function asyncIterator2ReadableStream<T, U>(iterator: Iterator<T> | AsyncIterator<T>, map: (i: T) => U): ReadableStream<U>;
export function asyncIterator2ReadableStream<T, U = T>(iterator: Iterator<T> | AsyncIterator<T>, map = (i: T): U => i as never) {
  return new ReadableStream<U>({
    async pull(controller) {
      try {
        while (controller.desiredSize !== null && controller.desiredSize > 0) {
          const result = await iterator.next();
          if (result.done)
            return controller.close();
          controller.enqueue(map(result.value));
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(err) {
      iterator.return?.(err);
    }
  });
}

export async function* readableStream2AsyncIterator<T>(
  stream: ReadableStream<T>,
  {
    onclose = r => r.cancel(),
    onabort = (r, err) => r.cancel(err)
  }: {
    onclose?: (reader: ReadableStreamReader<T>) => Promise<void>,
    onabort?: (reader: ReadableStreamReader<T>, err: any) => Promise<void>
  } = {}
) {
  const reader = stream.getReader();
  try {
    let read;
    while (!(read = await reader.read()).done)
      yield read.value;
    await onclose(reader);
  } catch (err) {
    await onabort(reader, err);
  }
}
