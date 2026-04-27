/**
 * Types partagés entre le client et le serveur.
 *
 * Ce fichier est la **source de vérité** du contrat Socket.io.
 * Toute évolution (ex: ajout d'événements pour le moteur Blackjack) doit
 * passer par ici afin que client et serveur restent typés de bout en bout.
 */

export type RoomStatus = 'waiting' | 'playing';

export interface Player {
  /** Socket id côté serveur — identifiant unique pour la session. */
  id: string;
  username: string;
  isHost: boolean;
  /** Timestamp UNIX (ms) — utile pour ordonner / animer la liste. */
  joinedAt: number;
}

/**
 * Représentation publique d'une room renvoyée au client.
 * On évite d'exposer des données sensibles ou internes au serveur.
 */
export interface PublicRoom {
  code: string;
  hostId: string;
  players: Player[];
  status: RoomStatus;
  maxPlayers: number;
  createdAt: number;
}

/* --------------------------------- Erreurs -------------------------------- */

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'USERNAME_TAKEN'
  | 'ROOM_ALREADY_STARTED'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_IN_ROOM'
  | 'INVALID_INPUT';

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}

/* --------------------------- Payloads & réponses -------------------------- */

export interface CreateRoomPayload {
  username: string;
  /** Optionnel — défaut côté serveur (6). */
  maxPlayers?: number;
}

export interface JoinRoomPayload {
  code: string;
  username: string;
}

export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: RoomError };

export type CreateRoomAck = Ack<PublicRoom>;
export type JoinRoomAck = Ack<PublicRoom>;
export type LeaveRoomAck = Ack<null>;
export type StartGameAck = Ack<PublicRoom>;

/* ----------------------------- Events Socket.io --------------------------- */

/**
 * Événements émis par le **serveur** vers le client.
 *
 * Convention : les payloads sont des objets `PublicRoom` complets pour
 * simplifier la réconciliation côté store (pas de patch granulaire).
 */
export interface ServerToClientEvents {
  'room:update': (room: PublicRoom) => void;
  'room:error': (error: RoomError) => void;
  'game:started': (room: PublicRoom) => void;
}

/**
 * Événements émis par le **client** vers le serveur.
 *
 * Tous les events qui modifient l'état utilisent un *ack callback* afin
 * d'avoir une réponse synchrone (succès / erreur) côté UI.
 */
export interface ClientToServerEvents {
  'room:create': (
    payload: CreateRoomPayload,
    ack: (response: CreateRoomAck) => void,
  ) => void;
  'room:join': (
    payload: JoinRoomPayload,
    ack: (response: JoinRoomAck) => void,
  ) => void;
  'room:leave': (ack: (response: LeaveRoomAck) => void) => void;
  'room:start': (ack: (response: StartGameAck) => void) => void;
}

/** Aucun event inter-serveur pour l'instant (mono-instance). */
export type InterServerEvents = Record<string, never>;

/**
 * Données attachées à chaque socket côté serveur.
 * Permet de récupérer rapidement la room d'un joueur déconnecté.
 */
export interface SocketData {
  username?: string;
  roomCode?: string;
}

/* ----------------------------- Constantes ------------------------------- */

export const ROOM_CONSTRAINTS = {
  MIN_PLAYERS_TO_START: 2,
  DEFAULT_MAX_PLAYERS: 6,
  MAX_PLAYERS_HARD_CAP: 6,
  USERNAME_MIN_LENGTH: 2,
  USERNAME_MAX_LENGTH: 16,
  ROOM_CODE_LENGTH: 6,
} as const;
