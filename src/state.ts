import type { BoardState, Card, ActivityEntry } from './types';

const STORAGE_KEY = 'pairboard_state';

export function getSeedData(): BoardState {
  return {
    cards: [
      {
        id: 'card-1',
        title: 'Atlas API ships Friday',
        description: 'Complete Atlas API implementation and deploy by end of week',
        column: 'Now',
        assignee: 'Maya'
      },
      {
        id: 'card-2',
        title: 'Staging deploy',
        description: 'Deploy to staging environment - must be live before stakeholder review',
        column: 'Next',
        assignee: 'Sam'
      },
      {
        id: 'card-3',
        title: '10am stakeholder review',
        description: 'Maya presents to stakeholders at 10am - staging must be ready',
        column: 'Next',
        assignee: 'Maya'
      },
      {
        id: 'card-4',
        title: 'Database migration script',
        description: 'Blocked on infra team approval for production credentials',
        column: 'Blocked',
        assignee: 'Jules'
      },
      {
        id: 'card-5',
        title: 'Setup monitoring',
        description: 'Configure alerts and dashboards',
        column: 'Done',
        assignee: 'Sam'
      }
    ],
    pendingDrafts: [],
    activityLog: [],
    selectedCardId: null,
    currentOperator: 'Maya'
  };
}

export function loadState(): BoardState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
  }
  return getSeedData();
}

export function saveState(state: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}

export function addActivity(
  state: BoardState,
  actor: string,
  action: string,
  details: string
): void {
  const entry: ActivityEntry = {
    id: `activity-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    actor,
    action,
    details
  };
  state.activityLog.unshift(entry);
  if (state.activityLog.length > 50) {
    state.activityLog = state.activityLog.slice(0, 50);
  }
}

export function getCard(state: BoardState, cardId: string): Card | undefined {
  return state.cards.find(c => c.id === cardId);
}

export function getBlockedCards(state: BoardState): Card[] {
  return state.cards.filter(c => c.column === 'Blocked');
}

export function generateCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function applyDraft(state: BoardState, draftId: string): boolean {
  const draftIndex = state.pendingDrafts.findIndex(d => d.id === draftId);
  if (draftIndex === -1) return false;

  const draft = state.pendingDrafts[draftIndex];
  
  switch (draft.type) {
    case 'add_card':
      if (draft.data.card) {
        const newCard: Card = {
          id: generateCardId(),
          ...draft.data.card
        };
        state.cards.push(newCard);
        addActivity(state, state.currentOperator, 'added card', newCard.title);
      }
      break;

    case 'move_card':
      if (draft.data.cardId && draft.data.toColumn) {
        const card = getCard(state, draft.data.cardId);
        if (card) {
          const oldColumn = card.column;
          card.column = draft.data.toColumn;
          addActivity(state, state.currentOperator, 'moved card', `"${card.title}" from ${oldColumn} to ${draft.data.toColumn}`);
        }
      }
      break;

    case 'assign_card':
      if (draft.data.cardId && draft.data.assignee !== undefined) {
        const card = getCard(state, draft.data.cardId);
        if (card) {
          card.assignee = draft.data.assignee;
          addActivity(state, state.currentOperator, 'assigned card', `"${card.title}" to ${draft.data.assignee || 'unassigned'}`);
        }
      }
      break;

    case 'propose_plan':
      if (draft.data.cards) {
        draft.data.cards.forEach(cardData => {
          const { id: _oldId, ...cardRest } = cardData as Card;
          const newCard: Card = {
            id: generateCardId(),
            ...cardRest
          };
          state.cards.push(newCard);
        });
      }
      if (draft.data.moves) {
        draft.data.moves.forEach(move => {
          const card = getCard(state, move.cardId);
          if (card) {
            card.column = move.toColumn;
          }
        });
      }
      addActivity(state, state.currentOperator, 'applied plan', `${draft.data.cards?.length || 0} cards, ${draft.data.moves?.length || 0} moves`);
      break;
  }

  state.pendingDrafts.splice(draftIndex, 1);
  return true;
}

export function rejectDraft(state: BoardState, draftId: string): boolean {
  const draftIndex = state.pendingDrafts.findIndex(d => d.id === draftId);
  if (draftIndex === -1) return false;

  const draft = state.pendingDrafts[draftIndex];
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

  addActivity(state, state.currentOperator, 'rejected', details);
  state.pendingDrafts.splice(draftIndex, 1);
  return true;
}
