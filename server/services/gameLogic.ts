import { type Player, type Role, ROLES } from "@shared/schema";

export interface RoleAssignment {
  playerId: string;
  role: Role;
}

export function assignRoles(players: Player[], roleDistribution: Record<Role, number>): RoleAssignment[] {
  const assignments: RoleAssignment[] = [];
  const availablePlayers = [...players];
  
  // Shuffle players array
  for (let i = availablePlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePlayers[i], availablePlayers[j]] = [availablePlayers[j], availablePlayers[i]];
  }

  let playerIndex = 0;

  // Assign each role according to distribution
  for (const [role, count] of Object.entries(roleDistribution) as [Role, number][]) {
    for (let i = 0; i < count; i++) {
      if (playerIndex < availablePlayers.length) {
        assignments.push({
          playerId: availablePlayers[playerIndex].id,
          role
        });
        playerIndex++;
      }
    }
  }

  return assignments;
}

export function calculateRoleDistribution(playerCount: number): Record<Role, number> {
  // Default distribution logic
  const mafiaCount = Math.floor(playerCount / 3);
  const doctorCount = 1;
  const detectiveCount = 1;
  const villagerCount = playerCount - mafiaCount - doctorCount - detectiveCount;

  return {
    [ROLES.VILLAGER]: Math.max(1, villagerCount),
    [ROLES.DOCTOR]: doctorCount,
    [ROLES.DETECTIVE]: detectiveCount,
    [ROLES.MAFIA]: Math.max(1, mafiaCount)
  };
}

export function checkWinCondition(players: Player[]): 'VILLAGERS' | 'MAFIA' | null {
  const alivePlayers = players.filter(p => p.status === 'ALIVE');
  const aliveMafia = alivePlayers.filter(p => p.role === ROLES.MAFIA);
  const aliveVillagers = alivePlayers.filter(p => p.role !== ROLES.MAFIA);

  if (aliveMafia.length === 0) {
    return 'VILLAGERS';
  }

  if (aliveMafia.length >= aliveVillagers.length) {
    return 'MAFIA';
  }

  return null;
}

export function processNightActions(players: Player[]): string[] {
  const events: string[] = [];
  const actions = players.filter(p => p.lastAction && p.actionTarget);

  // Process doctor saves first
  const saves = new Set<string>();
  actions
    .filter(p => p.role === ROLES.DOCTOR && p.lastAction === 'HEAL')
    .forEach(doctor => {
      if (doctor.actionTarget) {
        saves.add(doctor.actionTarget);
        events.push(`The doctor protected someone from harm.`);
      }
    });

  // Process mafia kills
  actions
    .filter(p => p.role === ROLES.MAFIA && p.lastAction === 'KILL')
    .forEach(mafia => {
      if (mafia.actionTarget && !saves.has(mafia.actionTarget)) {
        // Player is eliminated
        events.push(`A villager was found eliminated at dawn.`);
      } else if (mafia.actionTarget && saves.has(mafia.actionTarget)) {
        events.push(`Someone was attacked but miraculously survived.`);
      }
    });

  // Process detective investigations
  actions
    .filter(p => p.role === ROLES.DETECTIVE && p.lastAction === 'INVESTIGATE')
    .forEach(detective => {
      if (detective.actionTarget) {
        events.push(`The detective gathered crucial information.`);
      }
    });

  return events;
}

export function getValidTargets(player: Player, allPlayers: Player[], phase: string): Player[] {
  const alivePlayers = allPlayers.filter(p => p.status === 'ALIVE' && p.id !== player.id);

  switch (player.role) {
    case ROLES.DOCTOR:
      return phase === 'NIGHT' ? alivePlayers : [];
    case ROLES.DETECTIVE:
      return phase === 'NIGHT' ? alivePlayers : [];
    case ROLES.MAFIA:
      return phase === 'NIGHT' ? alivePlayers.filter(p => p.role !== ROLES.MAFIA) : [];
    default:
      return phase === 'VOTING' ? alivePlayers : [];
  }
}
