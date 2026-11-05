import {
  type ClientRequest,
  IPC_PROTOCOL_MIN_VERSION,
  IPC_PROTOCOL_VERSION,
  parseServerMessage,
  type ProtocolHelloResult,
  type ServerEvent,
  type ServerResponse,
} from '@aimux/ipc'

export interface DaemonLink {
  send(json: string): Promise<void>
  onMessage(cb: (json: string) => void): void
  onClose(cb: (reason: string) => void): void
}

type RequestType = ClientRequest['type']
type PayloadOf<T extends RequestType> = Extract<ClientRequest, { type: T }>['payload']

export interface DaemonClient {
  request<T extends RequestType>(type: T, payload: PayloadOf<T>): Promise<ServerResponse>
  onEvent(cb: (e: ServerEvent) => void): () => void
  onClose(cb: (reason: string) => void): () => void
  hello(): Promise<ProtocolHelloResult>
}

interface Pending {
  resolve: (response: ServerResponse) => void
  reject: (error: Error) => void
}

function parse(json: string): ServerResponse | ServerEvent | null {
  try {
    return parseServerMessage(JSON.parse(json))
  } catch {
    return null
  }
}

function defaultIds(): () => string {
  let n = 0
  return () => `gui-${++n}`
}

export function createDaemonClient(
  link: DaemonLink,
  nextId: () => string = defaultIds()
): DaemonClient {
  const pending = new Map<string, Pending>()
  const eventListeners = new Set<(e: ServerEvent) => void>()
  const closeListeners = new Set<(reason: string) => void>()

  link.onMessage((json) => {
    const message = parse(json)
    if (message === null) return
    if (!('id' in message)) {
      for (const cb of eventListeners) cb(message)
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.type === 'error') entry.reject(new Error(message.payload.message))
    else entry.resolve(message)
  })

  link.onClose((reason) => {
    for (const entry of pending.values()) entry.reject(new Error('daemon disconnected'))
    pending.clear()
    for (const cb of closeListeners) cb(reason)
  })

  const request: DaemonClient['request'] = async (type, payload) => {
    const id = nextId()
    const response = new Promise<ServerResponse>((resolve, reject) => {
      pending.set(id, { reject, resolve })
    })
    try {
      await link.send(JSON.stringify({ id, payload, type }))
    } catch (error) {
      pending.delete(id)
      throw error
    }
    return response
  }

  return {
    hello: async () => {
      const response = await request('hello', {
        maxVersion: IPC_PROTOCOL_VERSION,
        minVersion: IPC_PROTOCOL_MIN_VERSION,
      })
      if (response.type !== 'helloResult') throw new Error(`unexpected ${response.type} to hello`)
      return response.payload
    },
    onClose: (cb) => {
      closeListeners.add(cb)
      return () => closeListeners.delete(cb)
    },
    onEvent: (cb) => {
      eventListeners.add(cb)
      return () => eventListeners.delete(cb)
    },
    request,
  }
}
