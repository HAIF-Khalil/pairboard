import type { BoardState, Card, Column, PendingDraft } from './types';
import { getCard, getBlockedCards, applyDraft, rejectDraft, addActivity } from './state';

let currentState: BoardState;
let updateCallback: () => void;
let selectedCardAbortController: AbortController | null = null;

export function initializeWebMCP(
  getState: () => BoardState,
  onUpdate: () => void
): void {
  currentState = getState();
  updateCallback = onUpdate;

  if (!document.modelContext) {
    console.log('WebMCP not available - document.modelContext not found');
    return;
  }

  registerBoardLevelTools();
}

export function updateSelectedCard(cardId: string | null): void {
  if (selectedCardAbortController) {
    selectedCardAbortController.abort();
    selectedCardAbortController = null;
  }

  if (cardId && document.modelContext) {
    selectedCardAbortController = new AbortController();
    registerSelectedCardTools(selectedCardAbortController.signal);
  }
}

function registerBoardLevelTools(): void {
  if (!document.modelContext) return;

  document.modelContext.registerTool({
    name: 'get_board',
    description: 'Read the current board state including all columns, cards, pending drafts, and who is blocked',
    annotations: { readOnlyHint: true },
    handler: async () => {
      currentState = getCurrentState();
      addActivity(currentState, 'Agent', 'read board', 'viewed board state');
      updateCallback();
      
      const blockedCards = getBlockedCards(currentState);
      return {
        columns: ['Now', 'Next', 'Blocked', 'Done'],
        cards: currentState.cards,
        pendingDrafts: currentState.pendingDrafts,
        blockedCards: blockedCards,
        selectedCardId: currentState.selectedCardId
      };
    }
  });

  document.modelContext.registerTool({
    name: 'add_card',
    description: 'Propose adding a new card to the board (creates a pending draft until confirmed)',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Card description' },
        column: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'], description: 'Target column' },
        assignee: { type: 'string', description: 'Person assigned (Maya, Sam, Jules, or other name)' }
      },
      required: ['title', 'description', 'column']
    },
    handler: async (args: Record<string, unknown>) => {
      currentState = getCurrentState();
      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'add_card',
        timestamp: Date.now(),
        data: {
          card: {
            title: String(args.title),
            description: String(args.description),
            column: args.column as Column,
            assignee: args.assignee ? String(args.assignee) : null
          }
        }
      };
      currentState.pendingDrafts.push(draft);
      addActivity(currentState, 'Agent', 'proposed add_card', String(args.title));
      updateCallback();
      return { status: 'pending', draftId: draft.id, message: 'Card proposed, awaiting confirmation' };
    }
  });

  document.modelContext.registerTool({
    name: 'propose_plan',
    description: 'Propose a plan with multiple new cards and/or moves (creates pending drafts until confirmed)',
    parameters: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          description: 'New cards to add',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              column: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'] },
              assignee: { type: 'string' }
            }
          }
        },
        moves: {
          type: 'array',
          description: 'Cards to move',
          items: {
            type: 'object',
            properties: {
              cardId: { type: 'string' },
              toColumn: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'] }
            }
          }
        }
      }
    },
    handler: async (args: Record<string, unknown>) => {
      currentState = getCurrentState();
      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'propose_plan',
        timestamp: Date.now(),
        data: {
          cards: (args.cards as Card[]) || [],
          moves: (args.moves as Array<{ cardId: string; toColumn: Column }>) || []
        }
      };
      currentState.pendingDrafts.push(draft);
      const cardsCount = draft.data.cards?.length || 0;
      const movesCount = draft.data.moves?.length || 0;
      addActivity(currentState, 'Agent', 'proposed plan', `${cardsCount} cards, ${movesCount} moves`);
      updateCallback();
      return { status: 'pending', draftId: draft.id, message: 'Plan proposed, awaiting confirmation' };
    }
  });

  document.modelContext.registerTool({
    name: 'confirm_or_reject',
    description: 'Confirm (apply) or reject (discard) a pending draft. This is the ONLY tool that mutates the board.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'ID of the pending draft' },
        action: { type: 'string', enum: ['confirm', 'reject'], description: 'Whether to apply or discard the draft' }
      },
      required: ['draftId', 'action']
    },
    handler: async (args: Record<string, unknown>) => {
      currentState = getCurrentState();
      const draftId = String(args.draftId);
      const action = String(args.action);

      if (action === 'confirm') {
        const success = applyDraft(currentState, draftId);
        updateCallback();
        return success
          ? { status: 'confirmed', message: 'Draft applied to board' }
          : { status: 'error', message: 'Draft not found' };
      } else {
        const success = rejectDraft(currentState, draftId);
        updateCallback();
        return success
          ? { status: 'rejected', message: 'Draft discarded' }
          : { status: 'error', message: 'Draft not found' };
      }
    }
  });
}

function registerSelectedCardTools(signal: AbortSignal): void {
  if (!document.modelContext) return;

  document.modelContext.registerTool({
    name: 'get_card',
    description: 'Read details of the currently selected card',
    annotations: { readOnlyHint: true },
    signal,
    handler: async () => {
      currentState = getCurrentState();
      if (!currentState.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(currentState, currentState.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }
      addActivity(currentState, 'Agent', 'read card', card.title);
      updateCallback();
      return card;
    }
  });

  document.modelContext.registerTool({
    name: 'move_card',
    description: 'Propose moving the currently selected card to a different column (creates a pending draft until confirmed)',
    parameters: {
      type: 'object',
      properties: {
        toColumn: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'], description: 'Target column' }
      },
      required: ['toColumn']
    },
    signal,
    handler: async (args: Record<string, unknown>) => {
      currentState = getCurrentState();
      if (!currentState.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(currentState, currentState.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }

      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'move_card',
        timestamp: Date.now(),
        data: {
          cardId: currentState.selectedCardId,
          toColumn: args.toColumn as Column
        }
      };
      currentState.pendingDrafts.push(draft);
      addActivity(currentState, 'Agent', 'proposed move_card', `"${card.title}" to ${args.toColumn}`);
      updateCallback();
      return { status: 'pending', draftId: draft.id, message: 'Move proposed, awaiting confirmation' };
    }
  });

  document.modelContext.registerTool({
    name: 'assign_card',
    description: 'Propose assigning the currently selected card to someone (creates a pending draft until confirmed)',
    parameters: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Person to assign (Maya, Sam, Jules, or other name)' }
      },
      required: ['assignee']
    },
    signal,
    handler: async (args: Record<string, unknown>) => {
      currentState = getCurrentState();
      if (!currentState.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(currentState, currentState.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }

      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'assign_card',
        timestamp: Date.now(),
        data: {
          cardId: currentState.selectedCardId,
          assignee: String(args.assignee)
        }
      };
      currentState.pendingDrafts.push(draft);
      addActivity(currentState, 'Agent', 'proposed assign_card', `"${card.title}" to ${args.assignee}`);
      updateCallback();
      return { status: 'pending', draftId: draft.id, message: 'Assignment proposed, awaiting confirmation' };
    }
  });
}

function getCurrentState(): BoardState {
  return currentState;
}

export function isWebMCPAvailable(): boolean {
  return typeof document !== 'undefined' && !!document.modelContext;
}
