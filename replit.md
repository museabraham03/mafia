# Mafia Game Application

## Overview

This is a real-time multiplayer Mafia game built with a modern web stack. The application features a React frontend with TypeScript, an Express.js backend, WebSocket communication for real-time gameplay, and PostgreSQL database integration using Drizzle ORM. The game includes an AI narrator powered by Google's Gemini API to enhance the storytelling experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Real-time Communication**: WebSocket server for live game updates
- **Database**: PostgreSQL with Neon serverless connection
- **Database ORM**: Drizzle ORM with type-safe operations and relations
- **API Integration**: Google Gemini AI for narrative generation

### Database Schema (PostgreSQL)
The application uses a fully persistent PostgreSQL database with Drizzle ORM:
- **Games**: Store game sessions with room codes, phases, narrative, and configuration
- **Players**: Track player information, roles, voting status, and actions within games  
- **Chat Messages**: Handle in-game communication and system messages
- **Relations**: Properly modeled relationships between games, players, and messages
- **Type Safety**: Full TypeScript integration with insert/select schema validation

## Key Components

### Game Logic System
- **Role Assignment**: Automatic distribution of Villager, Doctor, Detective, and Mafia roles
- **Phase Management**: Handles game state transitions (Lobby → Day → Night → Voting → Ended)
- **Win Condition Checking**: Determines game outcomes based on remaining players
- **Night Actions**: Processes special role abilities during night phases

### Real-time Communication
- **WebSocket Integration**: Bidirectional communication for live updates
- **Game State Synchronization**: Automatic updates across all connected clients
- **Chat System**: Real-time messaging with system announcements

### AI Narrative Generation
- **Gemini Integration**: Contextual story generation based on game events
- **Custom Prompts**: Support for host-generated narrative content
- **Atmospheric Storytelling**: Enhanced immersion through AI-generated descriptions

### UI/UX Components
- **Role Reveal System**: Dramatic role assignment with visual effects
- **Game Board Interface**: Comprehensive game state display with player cards
- **Host Controls**: Administrative panel for game management
- **Responsive Design**: Mobile-first approach with Tailwind CSS

## Data Flow

1. **Game Creation**: Host sets up game with configuration and optional Gemini API key
2. **Player Joining**: Players join via room codes and are added to the lobby
3. **Game Start**: Roles are automatically assigned and revealed to players
4. **Phase Progression**: Game cycles through day/night phases with timed intervals
5. **Real-time Updates**: All game state changes broadcast via WebSocket to all clients
6. **AI Integration**: Narrative content generated based on game context and events

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **@google/genai**: Google Gemini AI integration
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI component primitives
- **drizzle-orm**: Type-safe database operations

### Development Tools
- **Vite**: Frontend build tool and development server
- **TypeScript**: Type safety across the entire stack
- **Tailwind CSS**: Utility-first styling framework
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Development Environment
- **Frontend**: Vite dev server with HMR support
- **Backend**: tsx for TypeScript execution with auto-reload
- **Database**: Neon serverless PostgreSQL (configured via DATABASE_URL)
- **Database Migrations**: Drizzle Kit for schema management and pushing changes
- **Build Process**: Separate build steps for client and server code

### Production Build
- **Frontend**: Static assets generated in `dist/public` directory
- **Backend**: Bundled server code using esbuild for Node.js
- **Database Migrations**: Drizzle Kit for schema management
- **Environment Variables**: DATABASE_URL and optional GEMINI_API_KEY

### File Structure
- **`client/`**: React frontend application
- **`server/`**: Express.js backend with WebSocket support
- **`shared/`**: Common TypeScript types and schema definitions
- **`migrations/`**: Database migration files
- **Configuration files**: Root-level config for various tools (Vite, Tailwind, TypeScript, etc.)

The application is designed to be easily deployable on platforms that support Node.js applications with PostgreSQL databases, with particular optimization for Replit's development environment.