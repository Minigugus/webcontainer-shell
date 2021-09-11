import { Deferrable, deferrable } from './utils';

export interface IService {
  call(req: unknown): Promise<unknown>;
}

export type ServiceRequest<T extends IService> =
  T extends { call(req: infer R): any }
  ? R
  : unknown;

export type ServiceResponse<T extends IService> =
  T extends { call(req: any): Promise<infer R> }
  ? R
  : unknown;

export interface IIdentityService<T extends IService> {
  call(req: ServiceRequest<T>): Promise<ServiceResponse<T>>;
}

export type ServiceInterface<T extends ServiceInterface<T>> = {
  [fn in keyof T]: T[fn] extends (...args: any) => Promise<any> ? (...args: any) => Promise<unknown> : never;
}

type Interface2ServiceRequest<T extends ServiceInterface<T>> = {
  [name in keyof T]: { name: name, args: Parameters<T[name]> }
}[keyof T];

type Interface2ServiceResponse<T extends ServiceInterface<T>> = {
  [name in keyof T]: T[name] extends (...args: any) => Promise<infer R> ? R : never;
};

export interface IServicified<T extends ServiceInterface<T>> extends IService {
  call<U extends Interface2ServiceRequest<T>>(req: U): Promise<Interface2ServiceResponse<T>[U['name']]>;
}

class Servicified<T extends ServiceInterface<T>> implements IServicified<T> {
  #interface: T;

  constructor(iface: T) {
    this.#interface = iface;
  }

  async call<U extends Interface2ServiceRequest<T>>(req: U) {
    return this.#interface[req.name].apply(this.#interface, req.args) as Interface2ServiceResponse<T>[U['name']]
  }
}

export function servicify<T extends ServiceInterface<T>>(iface: T): IServicified<T> {
  return new Servicified(iface);
}

export function interfacify<T extends IServicified<any>>(service: T) {
  return new Proxy<T extends IServicified<infer R> ? R : never>(Object.create(null), {
    get(target, p, receiver) {
      if (typeof p !== 'string')
        return Reflect.get(target, p, receiver);
      return (...args: any) => service.call({
        name: p,
        args
      });
    }
  });
}

type SerizalizedRequest = { id: number, req: any };

type SerizalizedResponse =
  | { id: number, err: any }
  | { id: number, ok: any };

class RemoteService<T extends IService> implements IRemote<T> {
  #channel: Channel;
  #encoding: ServiceEncoding<T>;
  #pending = new Map<number, Deferrable<ServiceResponse<T>>>();
  #count = 0;

  constructor(
    channel: Channel,
    encoding: ServiceEncoding<T>
  ) {
    this.#encoding = encoding;
    this.#channel = channel;
    this.#channel.addEventListener('message', e => {
      e.preventDefault();
      this.complete(e.data);
    }, { capture: true, once: false, passive: false });
  }

  private complete(response: SerizalizedResponse) {
    if (typeof response !== 'object' || !response || typeof response.id !== 'number') {
      console.warn('[RemoteService] Invalid serialized response:', response);
      return;
    }
    const { id } = response;
    const pending = this.#pending.get(id);
    if (!pending)
      console.warn('[RemoteService] No pending request id: %s', id);
    else if ('err' in response)
      pending.reject(response.err);
    else if ('ok' in response) {
      Promise.resolve(this.#encoding.decodeResponse(response.ok))
        .then(
          res => pending.resolve(res),
          err => pending.reject(err)
        )
    } else
      console.warn('[RemoteService] Malformed serialized response:', response);
  }

  async call(op: ServiceRequest<T>): Promise<ServiceResponse<T>> {
    const prepared = this.#encoding.encodeRequest(op);
    const defer = deferrable<ServiceResponse<T>>();
    const id = this.#count++;
    this.#pending.set(id, defer);
    this.#channel.postMessage({ id, req: prepared[0] } as SerizalizedRequest, prepared[1]);
    return defer.promise;
  }
}

class ExposedService<T extends IService> {
  #channel: Channel;
  #service: T;
  #encoding: ServiceEncoding<T>;

  constructor(
    channel: Channel,
    service: T,
    encoding: ServiceEncoding<T>
  ) {
    this.#encoding = encoding;
    this.#channel = channel;
    this.#service = service;
    this.#channel.addEventListener('message', e => {
      e.preventDefault();
      this.process(e.data);
    }, { capture: true, once: false, passive: false });
  }

  private process(request: SerizalizedRequest) {
    if (typeof request !== 'object' || !request || typeof request.id !== 'number' || !('req' in request)) {
      console.warn('[LocalService] Invalid serialized request:', request);
      return;
    }
    const { id } = request;
    Promise.resolve(this.#encoding.decodeRequest(request.req))
      .then(req => this.#service.call(req))
      .then(res => this.#encoding.encodeResponse(res as ServiceResponse<T>))
      .then(
        res => this.#channel.postMessage({ id, ok: res[0] } as SerizalizedResponse, res[1]),
        err => this.#channel.postMessage({ id, err: err } as SerizalizedResponse, [])
      );
  }
}

export interface Channel {
  addEventListener(type: 'message', handler: (e: MessageEvent) => void, options: AddEventListenerOptions): void;
  postMessage(message: any, transfer: Transferable[]): void;
}

export interface ServiceEncoding<T extends IService> {
  encodeRequest(request: ServiceRequest<T>): [any, Transferable[]];
  encodeResponse(response: ServiceResponse<T>): [any, Transferable[]];
  decodeRequest(request: any): ServiceRequest<T>;
  decodeResponse(response: any): ServiceResponse<T>;
}

export interface IRemote<T extends IService> extends IIdentityService<T> {
}

export function attach<T extends IService>(
  channel: Channel,
  encoding: ServiceEncoding<T>
): IRemote<T> {
  return new RemoteService<T>(channel, encoding);
}

export function expose<T extends IService>(
  channel: Channel,
  encoding: ServiceEncoding<T>,
  service: T
) {
  return new ExposedService<T>(channel, service, encoding);
}

export class ServiceEndPoint<T extends IService> {
  #encoding: ServiceEncoding<T>;

  constructor(
    encoding: ServiceEncoding<T>
  ) {
    this.#encoding = encoding;
  }

  attach(channel: Channel) {
    return attach<T>(channel, this.#encoding);
  }

  expose(channel: Channel, service: T) {
    return expose<T>(channel, this.#encoding, service);
  }
}

const ab = self.ArrayBuffer;
const rs = self.ReadableStream;
const ws = self.WritableStream;
const ts = self.TransformStream;
const mp = self.MessagePort;

export interface CustomTransferable {
  [TO_TRANSFORABLES](this: this): (Transferable | ReadableStream<any> | WritableStream<any>)[];
}

export const TO_TRANSFORABLES = Symbol();

const appendTransferable = (acc: Transferable[], a: any) => {
  if (typeof a === 'object' && a && (TO_TRANSFORABLES in a)) {
    const transferables = a[TO_TRANSFORABLES]();
    delete a[TO_TRANSFORABLES];
    return acc.concat(transferables);
  }
  if (
    (ab && a instanceof ab) ||
    (mp && a instanceof mp) ||
    (rs && a instanceof rs) ||
    (ws && a instanceof ws) ||
    (ts && a instanceof ts)
  )
    acc.push(a as Transferable);
  return acc;
};

function servicifiedEncoding<T extends IServicified<any>>(): ServiceEncoding<T> {
  return {
    encodeRequest: req => [req, req.args.reduce(appendTransferable, [])],
    encodeResponse: res => [res, appendTransferable([], res)],
    decodeRequest: req => req,
    decodeResponse: res => res,
  }
}

export class InterfaceEndPoint<T extends ServiceInterface<T>> {
  #endpoint = new ServiceEndPoint<IServicified<T>>(servicifiedEncoding());

  constructor() {
  }

  attach(channel: Channel) {
    return interfacify(this.#endpoint.attach(channel) as IServicified<T>);
  }

  expose(channel: Channel, iface: T) {
    return this.#endpoint.expose(channel, servicify(iface));
  }
}
