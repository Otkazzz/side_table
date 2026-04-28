import { create } from 'zustand';

import type {
  CreateRoomAck,
  GameId,
  JoinRoomAck,
  LeaveRoomAck,
  PublicRoom,
  RoomError,
  StartGameAck,
} from '@shared/types/room';

import type { CasinoSocket } from '../hooks/useSocket';

export type RoomConnectionStatus =
  | 'idle' // pas dans une room
  | 'connecting' // en train de créer / rejoindre
  | 'in-room' // dans une room (waiting ou playing)
  | 'leaving';

interface RoomState {
  /** Room courante (mise à jour en temps réel par `room:update`). */
  currentRoom: PublicRoom | null;
  /** Socket id du joueur courant — utile pour savoir s'il est host. */
  selfId: string | null;
  /** Pseudo choisi par l'utilisateur — réutilisé entre les écrans. */
  username: string;
  status: RoomConnectionStatus;
  /** Dernière erreur reçue (push-based) — lue puis effacée par l'UI. */
  error: RoomError | null;

  /* ------------------------------ Actions ------------------------------ */

  setUsername: (username: string) => void;
  clearError: () => void;

  /**
   * Branche les listeners Socket.io. Doit être appelé **une fois** au
   * montage de l'application. Idempotent (no-op si déjà branché).
   */
  attachSocket: (socket: CasinoSocket) => void;

  createRoom: (
    socket: CasinoSocket,
    username: string,
  ) => Promise<CreateRoomAck>;

  joinRoom: (
    socket: CasinoSocket,
    code: string,
    username: string,
  ) => Promise<JoinRoomAck>;

  leaveRoom: (socket: CasinoSocket) => Promise<LeaveRoomAck>;

  startGame: (socket: CasinoSocket, gameId: GameId) => Promise<StartGameAck>;
}

/**
 * Garde-fou : on ne branche les listeners qu'une seule fois par socket,
 * peu importe combien de composants consomment le store.
 */
const attachedSockets = new WeakSet<CasinoSocket>();

export const useRoomStore = create<RoomState>((set, get) => ({
  currentRoom: null,
  selfId: null,
  username: '',
  status: 'idle',
  error: null,

  setUsername: (username) => set({ username }),
  clearError: () => set({ error: null }),

  attachSocket: (socket) => {
    if (attachedSockets.has(socket)) return;
    attachedSockets.add(socket);

    // selfId = socket.id — disponible dès `connect`. On le re-synchronise
    // à chaque reconnexion pour gérer les pertes réseau.
    const syncSelfId = (): void => {
      set({ selfId: socket.id ?? null });
    };
    syncSelfId();
    socket.on('connect', syncSelfId);

    socket.on('room:update', (room) => {
      // Un `room:update` peut arriver alors qu'on a quitté localement :
      // on l'ignore si on n'est plus censé être dans cette room.
      const { currentRoom, status } = get();
      if (status === 'idle' || status === 'leaving') return;
      if (currentRoom && currentRoom.code !== room.code) return;
      set({ currentRoom: room, status: 'in-room' });
    });

    socket.on('room:error', (error) => {
      set({ error });
    });

    socket.on('game:started', (room) => {
      set({ currentRoom: room });
      // L'aiguillage vers une page de jeu sera fait par le composant qui
      // s'abonne au store (RoomPage déclenchera la navigation quand le
      // status passera à 'playing').
    });

    socket.on('disconnect', () => {
      // On ne reset pas `currentRoom` immédiatement : on laisse le temps
      // à la reconnexion. Si elle réussit, le serveur nous remettra à jour.
      // S'il y a une déconnexion durable, c'est à l'UI de le signaler.
    });
  },

  createRoom: (socket, username) => {
    set({ status: 'connecting', error: null, username });
    return new Promise<CreateRoomAck>((resolve) => {
      socket.emit('room:create', { username }, (response) => {
        if (response.ok) {
          set({
            currentRoom: response.data,
            status: 'in-room',
            selfId: socket.id ?? null,
          });
        } else {
          set({ status: 'idle', error: response.error });
        }
        resolve(response);
      });
    });
  },

  joinRoom: (socket, code, username) => {
    set({ status: 'connecting', error: null, username });
    return new Promise<JoinRoomAck>((resolve) => {
      socket.emit('room:join', { code, username }, (response) => {
        if (response.ok) {
          set({
            currentRoom: response.data,
            status: 'in-room',
            selfId: socket.id ?? null,
          });
        } else {
          set({ status: 'idle', error: response.error });
        }
        resolve(response);
      });
    });
  },

  leaveRoom: (socket) => {
    set({ status: 'leaving' });
    return new Promise<LeaveRoomAck>((resolve) => {
      socket.emit('room:leave', (response) => {
        set({ currentRoom: null, status: 'idle' });
        resolve(response);
      });
    });
  },

  startGame: (socket, gameId) => {
    return new Promise<StartGameAck>((resolve) => {
      socket.emit('room:start', { gameId }, (response) => {
        if (!response.ok) {
          set({ error: response.error });
        }
        resolve(response);
      });
    });
  },
}));

/* --------------------------- Selectors utiles --------------------------- */

/**
 * Sélecteur dérivé : indique si le joueur courant est l'hôte de la room.
 * Utilisé par l'UI pour afficher le bouton « Lancer la partie ».
 */
export const selectIsHost = (state: RoomState): boolean => {
  if (!state.currentRoom || !state.selfId) return false;
  return state.currentRoom.hostId === state.selfId;
};
