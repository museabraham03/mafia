import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertGameSchema, insertPlayerSchema, insertChatMessageSchema, type WebSocketMessage, type GameState, ROLES, PHASES } from "@shared/schema";
import { generateNarrative, analyzeGameState, generateGameSummary } from "./services/gemini";
import { assignRoles, calculateRoleDistribution, checkWinCondition, processNightActions } from "./services/gameLogic";
import { z } from "zod";

// Store WebSocket connections by game
const gameConnections = new Map<string, Set<WebSocket>>();
const playerConnections = new Map<string, WebSocket>();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcastToGame(gameId: string, message: WebSocketMessage) {
  const connections = gameConnections.get(gameId);
  if (connections) {
    const messageStr = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}

async function getGameState(gameId: string): Promise<GameState | null> {
  const game = await storage.getGame(gameId);
  if (!game) return null;

  const players = await storage.getPlayersByGame(gameId);
  const chatMessages = await storage.getChatMessagesByGame(gameId);

  return { game, players, chatMessages };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'GAME_UPDATE':
            // Client requesting game state
            if (message.gameId) {
              const gameState = await getGameState(message.gameId);
              if (gameState) {
                ws.send(JSON.stringify({
                  type: 'GAME_UPDATE',
                  payload: gameState,
                  gameId: message.gameId
                }));
              }
            }
            break;

          case 'PLAYER_JOINED':
            if (message.gameId && message.playerId) {
              // Add connection to game
              if (!gameConnections.has(message.gameId)) {
                gameConnections.set(message.gameId, new Set());
              }
              gameConnections.get(message.gameId)!.add(ws);
              playerConnections.set(message.playerId, ws);

              // Broadcast to other players
              broadcastToGame(message.gameId, {
                type: 'PLAYER_JOINED',
                payload: { playerId: message.playerId },
                gameId: message.gameId
              });
            }
            break;

          case 'CHAT_MESSAGE':
            if (message.gameId && message.playerId) {
              // Store chat message
              const chatMessage = await storage.createChatMessage({
                gameId: message.gameId,
                playerId: message.playerId,
                message: message.payload.message,
                isSystemMessage: message.payload.isSystemMessage || false
              });

              // Broadcast to all players in game
              broadcastToGame(message.gameId, {
                type: 'CHAT_MESSAGE',
                payload: chatMessage,
                gameId: message.gameId
              });
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      // Clean up connections
      Array.from(gameConnections.entries()).forEach(([gameId, connections]) => {
        connections.delete(ws);
        if (connections.size === 0) {
          gameConnections.delete(gameId);
        }
      });
      
      Array.from(playerConnections.entries()).forEach(([playerId, connection]) => {
        if (connection === ws) {
          playerConnections.delete(playerId);
        }
      });
    });
  });

  // API Routes
  
  // Create game
  app.post("/api/games", async (req, res) => {
    try {
      const gameData = req.body; // Skip validation since we're adding roomCode server-side
      const roomCode = generateRoomCode();
      
      const game = await storage.createGame({
        ...gameData,
        roomCode,
        geminiApiKey: process.env.GEMINI_API_KEY || null
      } as any);

      res.json(game);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create game" });
    }
  });

  // Get game by room code
  app.get("/api/games/room/:roomCode", async (req, res) => {
    try {
      const { roomCode } = req.params;
      const game = await storage.getGameByRoomCode(roomCode);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      res.json(game);
    } catch (error) {
      res.status(500).json({ message: "Failed to get game" });
    }
  });

  // Update game
  app.put("/api/games/:gameId", async (req, res) => {
    try {
      const { gameId } = req.params;
      const updates = req.body;
      
      const game = await storage.updateGame(gameId, updates);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      res.json(game);
    } catch (error) {
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  // Get game state
  app.get("/api/games/:gameId/state", async (req, res) => {
    try {
      const { gameId } = req.params;
      const gameState = await getGameState(gameId);
      
      if (!gameState) {
        return res.status(404).json({ message: "Game not found" });
      }

      res.json(gameState);
    } catch (error) {
      res.status(500).json({ message: "Failed to get game state" });
    }
  });

  // Join game
  app.post("/api/games/:gameId/join", async (req, res) => {
    try {
      const { gameId } = req.params;
      const playerData = insertPlayerSchema.parse(req.body);

      const game = await storage.getGame(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      if (!game.isActive || game.currentPhase !== PHASES.LOBBY) {
        return res.status(400).json({ message: "Cannot join game at this time" });
      }

      const existingPlayers = await storage.getPlayersByGame(gameId);
      if (existingPlayers.length >= game.maxPlayers) {
        return res.status(400).json({ message: "Game is full" });
      }

      // Set first player as host if no host exists
      const isHost = existingPlayers.length === 0 || !existingPlayers.some(p => p.isHost);

      const player = await storage.createPlayer({
        ...playerData,
        gameId,
        isHost
      });

      // Update game host if this is the first player
      if (isHost) {
        await storage.updateGame(gameId, { hostId: player.id });
      }

      // Broadcast player joined
      broadcastToGame(gameId, {
        type: 'PLAYER_JOINED',
        payload: player,
        gameId
      });

      res.json(player);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to join game" });
    }
  });

  // Update player (ready status, etc.)
  app.put("/api/players/:playerId", async (req, res) => {
    try {
      const { playerId } = req.params;
      const updates = req.body;

      const player = await storage.updatePlayer(playerId, updates);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      // Broadcast player update
      broadcastToGame(player.gameId, {
        type: 'GAME_UPDATE',
        payload: await getGameState(player.gameId),
        gameId: player.gameId
      });

      res.json(player);
    } catch (error) {
      res.status(500).json({ message: "Failed to update player" });
    }
  });

  // Start game
  app.post("/api/games/:gameId/start", async (req, res) => {
    try {
      const { gameId } = req.params;
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const players = await storage.getPlayersByGame(gameId);
      if (players.length < 4) {
        return res.status(400).json({ message: "Need at least 4 players to start" });
      }

      const allReady = players.every(p => p.isReady);
      if (!allReady) {
        return res.status(400).json({ message: "All players must be ready" });
      }

      // Assign roles
      const rolesAssigned = assignRoles(players, game.roleDistribution || calculateRoleDistribution(players.length));
      
      // Update players with roles
      for (const assignment of rolesAssigned) {
        await storage.updatePlayer(assignment.playerId, { role: assignment.role });
      }

      // Generate initial narrative
      let narrative = "The game begins in the mysterious village of Shadowbrook. As night falls, an ominous feeling settles over the residents...";
      if (game.geminiApiKey) {
        try {
          narrative = await generateNarrative({
            phase: PHASES.DAY,
            dayNumber: 1,
            players: players.length,
            previousEvents: []
          }, game.geminiApiKey);
        } catch (error) {
          console.error('Failed to generate narrative:', error);
        }
      }

      // Update game state
      const updatedGame = await storage.updateGame(gameId, {
        currentPhase: PHASES.DAY,
        narrative,
        timeRemaining: 300, // 5 minutes
        gameLog: [`Game started with ${players.length} players`, narrative]
      });

      // Broadcast game start and role reveals
      const gameState = await getGameState(gameId);
      broadcastToGame(gameId, {
        type: 'PHASE_CHANGE',
        payload: gameState,
        gameId
      });

      // Send individual role reveals
      for (const assignment of rolesAssigned) {
        const playerWs = playerConnections.get(assignment.playerId);
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          playerWs.send(JSON.stringify({
            type: 'ROLE_REVEAL',
            payload: { role: assignment.role },
            gameId,
            playerId: assignment.playerId
          }));
        }
      }

      res.json(updatedGame);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to start game" });
    }
  });

  // Next phase
  app.post("/api/games/:gameId/next-phase", async (req, res) => {
    try {
      const { gameId } = req.params;
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const players = await storage.getPlayersByGame(gameId);
      let newPhase = game.currentPhase;
      let newDayNumber = game.dayNumber;
      let newLog = [...(game.gameLog || [])];
      let narrative = game.narrative;

      // Process current phase and determine next phase
      switch (game.currentPhase) {
        case PHASES.DAY:
          newPhase = PHASES.VOTING;
          newLog.push(`Day ${game.dayNumber} voting phase begins`);
          break;
          
        case PHASES.VOTING:
          // Process votes and eliminate player
          const alivePlayers = players.filter(p => p.status === 'ALIVE');
          const voteCounts = new Map<string, number>();
          
          alivePlayers.forEach(player => {
            if (player.votedFor) {
              voteCounts.set(player.votedFor, (voteCounts.get(player.votedFor) || 0) + 1);
            }
          });

          // Find player with most votes
          let eliminatedPlayer: any = null;
          let maxVotes = 0;
          Array.from(voteCounts.entries()).forEach(([playerId, votes]) => {
            if (votes > maxVotes) {
              maxVotes = votes;
              eliminatedPlayer = players.find(p => p.id === playerId);
            }
          });

          if (eliminatedPlayer) {
            await storage.updatePlayer(eliminatedPlayer.id, { status: 'ELIMINATED' });
            newLog.push(`${eliminatedPlayer.name} was eliminated by vote`);
          } else {
            newLog.push("No one was eliminated (tie vote)");
          }

          // Reset votes
          for (const player of alivePlayers) {
            await storage.updatePlayer(player.id, { votes: 0, votedFor: null });
          }

          // Check win condition
          const updatedPlayers = await storage.getPlayersByGame(gameId);
          const winner = checkWinCondition(updatedPlayers);
          if (winner) {
            newPhase = PHASES.ENDED;
            newLog.push(`Game ended - ${winner} wins!`);
            
            if (game.geminiApiKey) {
              try {
                const summary = await generateGameSummary(winner, updatedPlayers, newLog, game.geminiApiKey);
                narrative = summary.summary;
              } catch (error) {
                console.error('Failed to generate game summary:', error);
              }
            }
          } else {
            newPhase = PHASES.NIGHT;
          }
          break;
          
        case PHASES.NIGHT:
          // Process night actions
          const nightEvents = processNightActions(players);
          newLog.push(...nightEvents);
          
          // Apply night action effects
          const mafiaActions = players.filter(p => p.role === ROLES.MAFIA && p.lastAction === 'KILL');
          const doctorSaves = new Set(
            players
              .filter(p => p.role === ROLES.DOCTOR && p.lastAction === 'HEAL')
              .map(p => p.actionTarget)
              .filter(Boolean)
          );

          for (const mafia of mafiaActions) {
            if (mafia.actionTarget && !doctorSaves.has(mafia.actionTarget)) {
              await storage.updatePlayer(mafia.actionTarget, { status: 'ELIMINATED' });
              const target = players.find(p => p.id === mafia.actionTarget);
              if (target) {
                newLog.push(`${target.name} was eliminated during the night`);
              }
            }
          }

          // Clear night actions
          for (const player of players) {
            await storage.updatePlayer(player.id, { 
              lastAction: null, 
              actionTarget: null 
            });
          }

          // Check win condition after night
          const playersAfterNight = await storage.getPlayersByGame(gameId);
          const nightWinner = checkWinCondition(playersAfterNight);
          if (nightWinner) {
            newPhase = PHASES.ENDED;
            newLog.push(`Game ended - ${nightWinner} wins!`);
          } else {
            newPhase = PHASES.DAY;
            newDayNumber += 1;
          }
          break;
      }

      // Generate new narrative if API key available
      if (game.geminiApiKey && newPhase !== PHASES.ENDED) {
        try {
          narrative = await generateNarrative({
            phase: newPhase,
            dayNumber: newDayNumber,
            players: players.filter(p => p.status === 'ALIVE').length,
            previousEvents: newLog.slice(-3)
          }, game.geminiApiKey);
        } catch (error) {
          console.error('Failed to generate narrative:', error);
        }
      }

      // Update game
      const updatedGame = await storage.updateGame(gameId, {
        currentPhase: newPhase,
        dayNumber: newDayNumber,
        gameLog: newLog,
        narrative,
        timeRemaining: newPhase === PHASES.ENDED ? 0 : 300
      });

      // Broadcast phase change
      const gameState = await getGameState(gameId);
      broadcastToGame(gameId, {
        type: 'PHASE_CHANGE',
        payload: gameState,
        gameId
      });

      res.json(updatedGame);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to advance phase" });
    }
  });

  // Cast vote
  app.post("/api/games/:gameId/vote", async (req, res) => {
    try {
      const { gameId } = req.params;
      const { playerId, targetId } = req.body;

      const game = await storage.getGame(gameId);
      if (!game || game.currentPhase !== PHASES.VOTING) {
        return res.status(400).json({ message: "Voting not allowed at this time" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player || player.status !== 'ALIVE') {
        return res.status(400).json({ message: "Player cannot vote" });
      }

      // Remove previous vote
      if (player.votedFor) {
        const previousTarget = await storage.getPlayer(player.votedFor);
        if (previousTarget) {
          await storage.updatePlayer(player.votedFor, { 
            votes: Math.max(0, previousTarget.votes - 1) 
          });
        }
      }

      // Update player's vote
      await storage.updatePlayer(playerId, { votedFor: targetId });

      // Increment target's vote count
      if (targetId) {
        const target = await storage.getPlayer(targetId);
        if (target) {
          await storage.updatePlayer(targetId, { votes: target.votes + 1 });
        }
      }

      // Broadcast vote cast
      const gameState = await getGameState(gameId);
      broadcastToGame(gameId, {
        type: 'VOTE_CAST',
        payload: gameState,
        gameId
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // Take role action (night phase)
  app.post("/api/games/:gameId/action", async (req, res) => {
    try {
      const { gameId } = req.params;
      const { playerId, action, targetId } = req.body;

      const game = await storage.getGame(gameId);
      if (!game || game.currentPhase !== PHASES.NIGHT) {
        return res.status(400).json({ message: "Actions not allowed at this time" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player || player.status !== 'ALIVE') {
        return res.status(400).json({ message: "Player cannot take action" });
      }

      // Validate action for role
      const validActions: Record<string, string[]> = {
        [ROLES.DOCTOR]: ['HEAL'],
        [ROLES.DETECTIVE]: ['INVESTIGATE'],
        [ROLES.MAFIA]: ['KILL']
      };

      if (!validActions[player.role!]?.includes(action)) {
        return res.status(400).json({ message: "Invalid action for your role" });
      }

      // Update player's action
      await storage.updatePlayer(playerId, { 
        lastAction: action,
        actionTarget: targetId 
      });

      // Broadcast action taken (without revealing details)
      broadcastToGame(gameId, {
        type: 'ACTION_TAKEN',
        payload: { playerId, action: 'ACTION_TAKEN' }, // Hide actual action
        gameId
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to take action" });
    }
  });

  // Generate narrative (host only)
  app.post("/api/games/:gameId/narrative", async (req, res) => {
    try {
      const { gameId } = req.params;
      const { prompt } = req.body;

      const game = await storage.getGame(gameId);
      if (!game || !game.geminiApiKey) {
        return res.status(400).json({ message: "Game not found or AI not configured" });
      }

      const players = await storage.getPlayersByGame(gameId);
      const narrative = await generateNarrative({
        phase: game.currentPhase,
        dayNumber: game.dayNumber,
        players: players.filter(p => p.status === 'ALIVE').length,
        previousEvents: (game.gameLog || []).slice(-3),
        customPrompt: prompt
      }, game.geminiApiKey);

      // Update game narrative
      await storage.updateGame(gameId, { narrative });

      // Broadcast narrative update
      const gameState = await getGameState(gameId);
      broadcastToGame(gameId, {
        type: 'GAME_UPDATE',
        payload: gameState,
        gameId
      });

      res.json({ narrative });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to generate narrative" });
    }
  });

  // End game
  app.post("/api/games/:gameId/end", async (req, res) => {
    try {
      const { gameId } = req.params;
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Update game state
      const updatedGame = await storage.updateGame(gameId, {
        currentPhase: PHASES.ENDED,
        isActive: false,
        timeRemaining: 0
      });

      // Broadcast game end
      const gameState = await getGameState(gameId);
      broadcastToGame(gameId, {
        type: 'PHASE_CHANGE',
        payload: gameState,
        gameId
      });

      res.json(updatedGame);
    } catch (error) {
      res.status(500).json({ message: "Failed to end game" });
    }
  });

  // Send chat message
  app.post("/api/games/:gameId/chat", async (req, res) => {
    try {
      const { gameId } = req.params;
      const messageData = insertChatMessageSchema.parse(req.body);

      const message = await storage.createChatMessage({
        ...messageData,
        gameId
      });

      // Broadcast chat message
      broadcastToGame(gameId, {
        type: 'CHAT_MESSAGE',
        payload: message,
        gameId
      });

      res.json(message);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to send message" });
    }
  });

  return httpServer;
}
