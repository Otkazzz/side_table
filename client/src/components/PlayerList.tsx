import { AnimatePresence, motion } from 'framer-motion';

import type { Player } from '@shared/types/room';

import { cn } from '@/lib/cn';

interface PlayerListProps {
  players: readonly Player[];
  /** Socket id du joueur courant — pour le mettre en évidence. */
  selfId: string | null;
  maxPlayers: number;
}

/**
 * Liste animée des joueurs présents dans la room.
 *
 * - `AnimatePresence` + `layout` gèrent les arrivées / départs et les
 *   réorganisations (par ex. quand l'host part et qu'un autre est promu).
 * - Le rendu visuel met en évidence l'host (couronne dorée) et le joueur
 *   courant (bordure dorée + label « Vous »).
 *
 * Volontairement « bête » : aucune logique réseau ici. Les données arrivent
 * du store via le parent. Cela rend le composant facile à tester en isolation.
 */
export function PlayerList({
  players,
  selfId,
  maxPlayers,
}: PlayerListProps): JSX.Element {
  const slots = Array.from({ length: maxPlayers }, (_, i) => i);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AnimatePresence initial={false}>
        {slots.map((slotIndex) => {
          const player = players[slotIndex];
          if (!player) {
            return (
              <li
                key={`empty-${slotIndex}`}
                className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/30"
              >
                Place libre
              </li>
            );
          }

          const isSelf = player.id === selfId;
          return (
            <motion.li
              key={player.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={cn(
                'flex items-center justify-between rounded-xl border bg-white/5 px-4 py-3 backdrop-blur',
                isSelf
                  ? 'border-gold-400/70 ring-1 ring-gold-400/40'
                  : 'border-white/10',
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar name={player.username} />
                <div className="leading-tight">
                  <p className="font-semibold">
                    {player.username}
                    {isSelf && (
                      <span className="ml-2 text-xs font-medium text-gold-400">
                        (vous)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/50">
                    {player.isHost ? 'Hôte de la partie' : 'Joueur'}
                  </p>
                </div>
              </div>

              {player.isHost && (
                <motion.span
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                  aria-label="Hôte"
                  title="Hôte"
                  className="text-2xl"
                >
                  {/* couronne — remplace une icône SVG/lib */}
                  <span role="img" aria-hidden="true">♛</span>
                </motion.span>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/**
 * Avatar minimaliste à base d'initiales colorisées en fonction du pseudo.
 * Évite de dépendre d'une lib d'avatars externe pour ce portfolio.
 */
function Avatar({ name }: { name: string }): JSX.Element {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  // hash déterministe → teinte stable pour un même pseudo
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-felt-900"
      style={{ backgroundColor: `hsl(${hue}, 65%, 70%)` }}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}
