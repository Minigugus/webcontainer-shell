import type { KernelProcess } from './kernelspace';
import type { LocalProcessController } from './userspace';

import { InterfaceEndPoint } from './rpc';

export const KERNEL_PROCESS_ENDPOINT = new InterfaceEndPoint<KernelProcess>();
export const LOCAL_PROCESS_CONTROLLER_ENDPOINT = new InterfaceEndPoint<LocalProcessController>();
