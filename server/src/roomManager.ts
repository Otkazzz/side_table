import {
  GAME_DEFINITIONS,
  isGameId,
  ROOM_CONSTRAINTS,
  type GameId,
  type Player,
  type PublicRoom,
  type RoomError,
  type RoomStatus,
} from '@shared/types/room.js';

/**
 * Représentation interne d'une room côté serveur.
 *
 * On garde les types internes proches du `PublicRoom` mais on conserve la
 * possibilité d'y ajouter plus tard des données privées (deck, hands, pot…)
 * sans casser le contrat exposé au client.
 */
interface InternalRoom {
  code: string;
  hostId: string;
  players: Player[];
  status: RoomStatus;
  maxPlayers: number;
  createdAt: number;
}

/**
 * Erreur typée levée par le `RoomManager`.
 *
 * On la propage via `throw` à l'intérieur du domaine puis on la convertit
 * en réponse Socket.io dans la couche handler. Cela permet d'écrire la
 * logique métier de façon naturelle (return early en cas de succès,
 * throw en cas d'invariant violé) sans polluer la signature des méthodes.
 */
export class RoomManagerError extends Error {
  public readonly error: RoomError;

  constructor(error: RoomError) {
    super(error.message);
    this.name = 'RoomManagerError';
    this.error = error;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1 pour éviter les confusions

function generateCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function sanitizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function assertValidUsername(username: string): void {
  if (
    username.length < ROOM_CONSTRAINTS.USERNAME_MIN_LENGTH ||
    username.length > ROOM_CONSTRAINTS.USERNAME_MAX_LENGTH
  ) {
    throw new RoomManagerError({
      code: 'INVALID_INPUT',
      message: `Le pseudo doit faire entre ${ROOM_CONSTRAINTS.USERNAME_MIN_LENGTH} et ${ROOM_CONSTRAINTS.USERNAME_MAX_LENGTH} caractères.`,
    });
  }
}

/**
 * Gestionnaire des rooms en mémoire.
 *
 * Stockage : `Map<code, InternalRoom>`. Mono-instance pour l'instant.
 * Pour scale-out ultérieur on remplacera par Redis (le contrat public ne
 * change pas).
 */
export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();

  /** Index inverse `socketId -> code` pour retrouver vite la room d'un joueur. */
  private readonly playerRoomIndex = new Map<string, string>();

  /* ------------------------------ Lectures ------------------------------ */

  public getRoom(code: string): InternalRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public getRoomBySocketId(socketId: string): InternalRoom | undefined {
    const code = this.playerRoomIndex.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  public toPublic(room: InternalRoom): PublicRoom {
    return {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map((p) => ({ ...p })),
      status: room.status,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
    };
  }

  /* ------------------------------ Écritures ----------------------------- */

  public createRoom(params: {
    socketId: string;
    username: string;
    maxPlayers?: number;
  }): InternalRoom {
    const username = sanitizeUsername(params.username);
    assertValidUsername(username);

    const requestedMax = params.maxPlayers ?? ROOM_CONSTRAINTS.DEFAULT_MAX_PLAYERS;
    const maxPlayers = Math.min(
      Math.max(requestedMax, ROOM_CONSTRAINTS.MIN_PLAYERS_TO_START),
      ROOM_CONSTRAINTS.MAX_PLAYERS_HARD_CAP,
    );

    if (this.playerRoomIndex.has(params.socketId)) {
      throw new RoomManagerError({
        code: 'INVALID_INPUT',
        message: 'Vous êtes déjà dans une room. Quittez-la avant d\'en créer une nouvelle.',
      });
    }

    const code = this.generateUniqueCode();
    const now = Date.now();

    const host: Player = {
      id: params.socketId,
      username,
      isHost: true,
      joinedAt: now,
    };

    const room: InternalRoom = {
      code,
      hostId: params.socketId,
      players: [host],
      status: 'waiting',
      maxPlayers,
      createdAt: now,
    };

    this.rooms.set(code, room);
    this.playerRoomIndex.set(params.socketId, code);
    return room;
  }

  public joinRoom(params: {
    socketId: string;
    code: string;
    username: string;
  }): InternalRoom {
    const username = sanitizeUsername(params.username);
    assertValidUsername(username);

    const code = params.code.trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      throw new RoomManagerError({
        code: 'ROOM_NOT_FOUND',
        message: `Aucune room ne correspond au code ${code}.`,
      });
    }

    if (room.status !== 'waiting') {
      throw new RoomManagerError({
        code: 'ROOM_ALREADY_STARTED',
        message: 'La partie a déjà commencé dans cette room.',
      });
    }

    if (room.players.length >= room.maxPlayers) {
      throw new RoomManagerError({
        code: 'ROOM_FULL',
        message: `La room est pleine (${room.maxPlayers}/${room.maxPlayers}).`,
      });
    }

    const usernameTaken = room.players.some(
      (p) => p.username.toLowerCase() === username.toLowerCase(),
    );
    if (usernameTaken) {
      throw new RoomManagerError({
        code: 'USERNAME_TAKEN',
        message: `Le pseudo « ${username} » est déjà utilisé dans cette room.`,
      });
    }

    if (this.playerRoomIndex.has(params.socketId)) {
      throw new RoomManagerError({
        code: 'INVALID_INPUT',
        message: 'Vous êtes déjà dans une room.',
      });
    }

    const player: Player = {
      id: params.socketId,
      username,
      isHost: false,
      joinedAt: Date.now(),
    };
    room.players.push(player);
    this.playerRoomIndex.set(params.socketId, code);
    return room;
  }

  /**
   * Retire un joueur de sa room.
   *
   * Règles :
   * - Si la room devient vide → suppression.
   * - Si l'host part et qu'il reste des joueurs → promotion du plus ancien.
   *
   * @returns La room mise à jour, ou `null` si elle a été supprimée.
   */
  public leaveRoom(socketId: string): {
    room: InternalRoom | null;
    /** Code de la room d'origine — utile pour notifier les autres joueurs. */
    code: string | null;
  } {
    const code = this.playerRoomIndex.get(socketId);
    if (!code) {
      return { room: null, code: null };
    }

    const room = this.rooms.get(code);
    this.playerRoomIndex.delete(socketId);

    if (!room) {
      return { room: null, code };
    }

    room.players = room.players.filter((p) => p.id !== socketId);

    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { room: null, code };
    }

    if (room.hostId === socketId) {
      // Le plus ancien restant devient host.
      const sorted = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt);
      const newHost = sorted[0];
      if (newHost) {
        room.hostId = newHost.id;
        room.players = room.players.map((p) => ({
          ...p,
          isHost: p.id === newHost.id,
        }));
      }
    }

    return { room, code };
  }

  public startGame(socketId: string, gameId: GameId): InternalRoom {
    if (!isGameId(gameId)) {
      throw new RoomManagerError({
        code: 'INVALID_INPUT',
        message: 'Jeu inconnu ou non supporté.',
      });
    }

    const room = this.getRoomBySocketId(socketId);
    if (!room) {
      throw new RoomManagerError({
        code: 'NOT_IN_ROOM',
        message: 'Vous n\'êtes dans aucune room.',
      });
    }
    if (room.hostId !== socketId) {
      throw new RoomManagerError({
        code: 'NOT_HOST',
        message: 'Seul l\'hôte peut lancer la partie.',
      });
    }
    if (room.status !== 'waiting') {
      throw new RoomManagerError({
        code: 'ROOM_ALREADY_STARTED',
        message: 'La partie est déjà en cours.',
      });
    }

    const definition = GAME_DEFINITIONS[gameId];
    if (room.players.length < definition.minPlayers) {
      const plural = definition.minPlayers > 1 ? 'joueurs' : 'joueur';
      throw new RoomManagerError({
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Il faut au moins ${definition.minPlayers} ${plural} pour lancer ${definition.label}.`,
      });
    }

    room.status = 'playing';
    return room;
  }

  /* ------------------------------- Internes ----------------------------- */

  private generateUniqueCode(): string {
    // En théorie : 32^6 ≈ 1 milliard de combinaisons. Risque de collision négligeable,
    // mais on boucle pour rester strict.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateCode(ROOM_CONSTRAINTS.ROOM_CODE_LENGTH);
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomManagerError({
      code: 'INVALID_INPUT',
      message: 'Impossible de générer un code de room unique. Réessayez.',
    });
  }
}
