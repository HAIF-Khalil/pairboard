import type { BoardState, Card, Column, PendingDraft } from './types';
import { getCard, getBlockedCards, addActivity, saveState, generateCardId } from './state';

let getState: () => BoardState;
let setState: (state: BoardState) => void;
let selectedCardAbortController: AbortController | null = null;

export function initializeWebMCP(
  getStateFn: () => BoardState,
  setStateFn: (state: BoardState) => void
): void {
  getState = getStateFn;
  setState = setStateFn;

  if (!('modelContext' in document) || !document.modelContext) {
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
    execute: async () => {
      const state = getState();
      const newState = { ...state };
      addActivity(newState, 'Agent', 'read board', 'viewed board state');
      setState(newState);
      saveState(newState);
      
      const blockedCards = getBlockedCards(newState);
      return {
        columns: ['Now', 'Next', 'Blocked', 'Done'],
        cards: newState.cards,
        pendingDrafts: newState.pendingDrafts,
        blockedCards: blockedCards,
        selectedCardId: newState.selectedCardId
      };
    }
  });

  document.modelContext.registerTool({
    name: 'add_card',
    description: 'Propose adding a new card to the board (creates a pending draft until confirmed)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Card description' },
        column: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'], description: 'Target column' },
        assignee: { type: 'string', description: 'Person assigned (Maya, Sam, Jules, or other name)' }
      },
      required: ['title', 'description', 'column']
    },
    execute: async (args: Record<string, unknown>) => {
      const state = getState();
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
      const newState = {
        ...state,
        pendingDrafts: [...state.pendingDrafts, draft],
        activityLog: state.activityLog.slice()
      };
      addActivity(newState, 'Agent', 'proposed add_card', String(args.title));
      setState(newState);
      saveState(newState);
      return { status: 'pending', draftId: draft.id, message: 'Card proposed, awaiting confirmation' };
    }
  });

  document.modelContext.registerTool({
    name: 'propose_plan',
    description: 'Propose a plan with multiple new cards and/or moves (creates pending drafts until confirmed)',
    inputSchema: {
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
    execute: async (args: Record<string, unknown>) => {
      const state = getState();
      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'propose_plan',
        timestamp: Date.now(),
        data: {
          cards: (args.cards as Card[]) || [],
          moves: (args.moves as Array<{ cardId: string; toColumn: Column }>) || []
        }
      };
      const newState = {
        ...state,
        pendingDrafts: [...state.pendingDrafts, draft],
        activityLog: state.activityLog.slice()
      };
      const cardsCount = draft.data.cards?.length || 0;
      const movesCount = draft.data.moves?.length || 0;
      addActivity(newState, 'Agent', 'proposed plan', `${cardsCount} cards, ${movesCount} moves`);
      setState(newState);
      saveState(newState);
      return { status: 'pending', draftId: draft.id, message: 'Plan proposed, awaiting confirmation' };
    }
  });

  document.modelContext.registerTool({
    name: 'confirm_or_reject',
    description: 'Confirm (apply) or reject (discard) a pending draft. This is the ONLY tool that mutates the board.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'ID of the pending draft' },
        action: { type: 'string', enum: ['confirm', 'reject'], description: 'Whether to apply or discard the draft' }
      },
      required: ['draftId', 'action']
    },
    execute: async (args: Record<string, unknown>) => {
      const state = getState();
      const draftId = String(args.draftId);
      const action = String(args.action);

      const draftIndex = state.pendingDrafts.findIndex(d => d.id === draftId);
      if (draftIndex === -1) {
        return { status: 'error', message: 'Draft not found' };
      }

      const draft = state.pendingDrafts[draftIndex];
      let newState = { ...state };

      if (action === 'confirm') {
        newState = applyDraftToState(newState, draft);
        newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
        setState(newState);
        saveState(newState);
        return { status: 'confirmed', message: 'Draft applied to board' };
      } else {
        let details = '';
        switch (draft.type) {
          case 'add_card':
            details = draft.data.card?.title || 'card';
            break;
          case 'move_card':
            const card = getCard(newState, draft.data.cardId || '');
            details = card?.title || 'card';
            break;
          case 'assign_card':
            const assignCard = getCard(newState, draft.data.cardId || '');
            details = assignCard?.title || 'card';
            break;
          case 'propose_plan':
            details = 'plan';
            break;
        }
        addActivity(newState, state.currentOperator, 'rejected', details);
        newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
        setState(newState);
        saveState(newState);
        return { status: 'rejected', message: 'Draft discarded' };
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
    execute: async () => {
      const state = getState();
      if (!state.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(state, state.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }
      const newState = { ...state, activityLog: state.activityLog.slice() };
      addActivity(newState, 'Agent', 'read card', card.title);
      setState(newState);
      saveState(newState);
      return card;
    }
  }, { signal });

  document.modelContext.registerTool({
    name: 'move_card',
    description: 'Propose moving the currently selected card to a different column (creates a pending draft until confirmed)',
    inputSchema: {
      type: 'object',
      properties: {
        toColumn: { type: 'string', enum: ['Now', 'Next', 'Blocked', 'Done'], description: 'Target column' }
      },
      required: ['toColumn']
    },
    execute: async (args: Record<string, unknown>) => {
      const state = getState();
      if (!state.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(state, state.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }

      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'move_card',
        timestamp: Date.now(),
        data: {
          cardId: state.selectedCardId,
          toColumn: args.toColumn as Column
        }
      };
      const newState = {
        ...state,
        pendingDrafts: [...state.pendingDrafts, draft],
        activityLog: state.activityLog.slice()
      };
      addActivity(newState, 'Agent', 'proposed move_card', `"${card.title}" to ${args.toColumn}`);
      setState(newState);
      saveState(newState);
      return { status: 'pending', draftId: draft.id, message: 'Move proposed, awaiting confirmation' };
    }
  }, { signal });

  document.modelContext.registerTool({
    name: 'assign_card',
    description: 'Propose assigning the currently selected card to someone (creates a pending draft until confirmed)',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Person to assign (Maya, Sam, Jules, or other name)' }
      },
      required: ['assignee']
    },
    execute: async (args: Record<string, unknown>) => {
      const state = getState();
      if (!state.selectedCardId) {
        return { error: 'No card selected' };
      }
      const card = getCard(state, state.selectedCardId);
      if (!card) {
        return { error: 'Selected card not found' };
      }

      const draft: PendingDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'assign_card',
        timestamp: Date.now(),
        data: {
          cardId: state.selectedCardId,
          assignee: String(args.assignee)
        }
      };
      const newState = {
        ...state,
        pendingDrafts: [...state.pendingDrafts, draft],
        activityLog: state.activityLog.slice()
      };
      addActivity(newState, 'Agent', 'proposed assign_card', `"${card.title}" to ${args.assignee}`);
      setState(newState);
      saveState(newState);
      return { status: 'pending', draftId: draft.id, message: 'Assignment proposed, awaiting confirmation' };
    }
  }, { signal });
}

function applyDraftToState(state: BoardState, draft: PendingDraft): BoardState {
  const newState = { ...state, cards: state.cards.slice(), activityLog: state.activityLog.slice() };

  switch (draft.type) {
    case 'add_card':
      if (draft.data.card) {
        const newCard: Card = {
          id: generateCardId(),
          ...draft.data.card
        };
        newState.cards.push(newCard);
        addActivity(newState, state.currentOperator, 'confirmed add', newCard.title);
      }
      break;

    case 'move_card':
      if (draft.data.cardId && draft.data.toColumn) {
        const cardIndex = newState.cards.findIndex(c => c.id === draft.data.cardId);
        if (cardIndex !== -1) {
          const oldColumn = newState.cards[cardIndex].column;
          newState.cards[cardIndex] = {
            ...newState.cards[cardIndex],
            column: draft.data.toColumn
          };
          addActivity(newState, state.currentOperator, 'confirmed move', `from ${oldColumn} to ${draft.data.toColumn}`);
        }
      }
      break;

    case 'assign_card':
      if (draft.data.cardId) {
        const cardIndex = newState.cards.findIndex(c => c.id === draft.data.cardId);
        if (cardIndex !== -1) {
          newState.cards[cardIndex] = {
            ...newState.cards[cardIndex],
            assignee: draft.data.assignee || null
          };
          addActivity(newState, state.currentOperator, 'confirmed assign', draft.data.assignee || 'unassigned');
        }
      }
      break;

    case 'propose_plan':
      if (draft.data.cards) {
        const newCards = draft.data.cards.map(cardData => {
          const { id: _id, ...rest } = cardData as Card;
          return {
            id: generateCardId(),
            ...rest
          };
        });
        newState.cards.push(...newCards);
      }
      if (draft.data.moves) {
        newState.cards = newState.cards.map(card => {
          const move = draft.data.moves?.find(m => m.cardId === card.id);
          if (move) {
            return { ...card, column: move.toColumn };
          }
          return card;
        });
      }
      addActivity(newState, state.currentOperator, 'confirmed plan', `${draft.data.cards?.length || 0} cards, ${draft.data.moves?.length || 0} moves`);
      break;
  }

  return newState;
}

export function applyDraft(state: BoardState, draftId: string): BoardState {
  const draftIndex = state.pendingDrafts.findIndex(d => d.id === draftId);
  if (draftIndex === -1) return state;

  const draft = state.pendingDrafts[draftIndex];
  let newState = applyDraftToState(state, draft);
  newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
  return newState;
}

export function rejectDraft(state: BoardState, draftId: string): BoardState {
  const draftIndex = state.pendingDrafts.findIndex(d => d.id === draftId);
  if (draftIndex === -1) return state;

  const draft = state.pendingDrafts[draftIndex];
  const newState = { ...state, activityLog: state.activityLog.slice() };
  
  let details = '';
  switch (draft.type) {
    case 'add_card':
      details = draft.data.card?.title || 'card';
      break;
    case 'move_card':
      const card = getCard(state, draft.data.cardId || '');
      details = card?.title || 'card';
      break;
    case 'assign_card':
      const assignCard = getCard(state, draft.data.cardId || '');
      details = assignCard?.title || 'card';
      break;
    case 'propose_plan':
      details = 'plan';
      break;
  }

  addActivity(newState, state.currentOperator, 'rejected', details);
  newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
  return newState;
}

export function isWebMCPAvailable(): boolean {
  return typeof document !== 'undefined' && 'modelContext' in document && !!document.modelContext;
}
