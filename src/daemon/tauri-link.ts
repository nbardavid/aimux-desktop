import { Channel, invoke } from '@tauri-apps/api/core'

import type { DaemonLink } from './client'

/** A channel that holds what arrives before anyone listens: the socket starts reading as soon as
 * `daemon_connect` returns. */
function bufferedChannel() {
  const channel = new Channel<string>()
  const early: string[] = []
  channel.onmessage = (value) => early.push(value)
  const listen = (cb: (value: string) => void) => {
    channel.onmessage = cb
    for (const value of early.splice(0)) cb(value)
  }
  return { channel, listen }
}

/** One connection to the daemon socket, relayed by the Rust side. */
export async function createTauriLink(): Promise<DaemonLink> {
  const message = bufferedChannel()
  const close = bufferedChannel()
  await invoke('daemon_connect', { onClose: close.channel, onMessage: message.channel })
  return {
    onClose: close.listen,
    onMessage: message.listen,
    send: async (json) => invoke('daemon_send', { json }),
  }
}
