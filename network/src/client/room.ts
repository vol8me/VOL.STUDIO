import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION, type PlayerInput } from '../protocol/input';

export interface NetworkRoom {
  readonly sessionId: string;
  sendInput(input: PlayerInput): void;
  onState(listener: () => void): () => void;
  getState(): unknown;
  dispose(): Promise<void>;
}

/** Phaser'dan bağımsız ve opt-in ağ oturumu; yaşam döngüsü sahneye aittir. */
export async function connectRoom(endpoint: string, roomName: string): Promise<NetworkRoom> {
  const room = await new Client(endpoint).joinOrCreate(roomName, { protocol: PROTOCOL_VERSION });
  return {
    sessionId: room.sessionId,
    sendInput: (input) => room.send('input', input),
    onState: (listener) => {
      room.onStateChange(listener);
      return () => room.onStateChange.remove(listener);
    },
    getState: () => room.state as unknown,
    dispose: async () => {
      await room.leave();
    },
  };
}
