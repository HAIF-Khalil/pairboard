import { useState, useEffect } from 'react';
import type { BoardState, Card, Column, PendingDraft } from './types';
import { loadState, saveState, addActivity } from './state';
import { initializeWebMCP, updateSelectedCard, isWebMCPAvailable } from './webmcp';
import './App.css';

function App() {
  const [state, setState] = useState<BoardState>(loadState);
  const [webmcpAvailable] = useState(isWebMCPAvailable());

  useEffect(() => {
    initializeWebMCP(() => state, () => {
      const newState = loadState();
      setState(newState);
      saveState(newState);
    });
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const handleSelectCard = (cardId: string | null) => {
    setState(prev => ({ ...prev, selectedCardId: cardId }));
    updateSelectedCard(cardId);
  };

  const handleConfirmDraft = (draftId: string) => {
    setState(prev => {
      const draftIndex = prev.pendingDrafts.findIndex(d => d.id === draftId);
      if (draftIndex === -1) return prev;

      const draft = prev.pendingDrafts[draftIndex];
      const newState = { ...prev };

      switch (draft.type) {
        case 'add_card':
          if (draft.data.card) {
            const newCard: Card = {
              id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ...draft.data.card
            };
            newState.cards = [...newState.cards, newCard];
            addActivity(newState, newState.currentOperator, 'confirmed add', newCard.title);
          }
          break;

        case 'move_card':
          if (draft.data.cardId && draft.data.toColumn) {
            const cardIndex = newState.cards.findIndex(c => c.id === draft.data.cardId);
            if (cardIndex !== -1) {
              const oldColumn = newState.cards[cardIndex].column;
              newState.cards = [...newState.cards];
              newState.cards[cardIndex] = {
                ...newState.cards[cardIndex],
                column: draft.data.toColumn
              };
              addActivity(newState, newState.currentOperator, 'confirmed move', `from ${oldColumn} to ${draft.data.toColumn}`);
            }
          }
          break;

        case 'assign_card':
          if (draft.data.cardId) {
            const cardIndex = newState.cards.findIndex(c => c.id === draft.data.cardId);
            if (cardIndex !== -1) {
              newState.cards = [...newState.cards];
              newState.cards[cardIndex] = {
                ...newState.cards[cardIndex],
                assignee: draft.data.assignee || null
              };
              addActivity(newState, newState.currentOperator, 'confirmed assign', draft.data.assignee || 'unassigned');
            }
          }
          break;

        case 'propose_plan':
          if (draft.data.cards) {
            const newCards = draft.data.cards.map(cardData => {
              const { id: _id, ...rest } = cardData as Card;
              return {
                id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                ...rest
              };
            });
            newState.cards = [...newState.cards, ...newCards];
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
          addActivity(newState, newState.currentOperator, 'confirmed plan', `${draft.data.cards?.length || 0} cards, ${draft.data.moves?.length || 0} moves`);
          break;
      }

      newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
      return newState;
    });
  };

  const handleRejectDraft = (draftId: string) => {
    setState(prev => {
      const draft = prev.pendingDrafts.find(d => d.id === draftId);
      if (!draft) return prev;

      const newState = { ...prev };
      let details = '';

      switch (draft.type) {
        case 'add_card':
          details = draft.data.card?.title || 'card';
          break;
        case 'move_card':
          const card = newState.cards.find(c => c.id === draft.data.cardId);
          details = card?.title || 'card';
          break;
        case 'assign_card':
          const assignCard = newState.cards.find(c => c.id === draft.data.cardId);
          details = assignCard?.title || 'card';
          break;
        case 'propose_plan':
          details = 'plan';
          break;
      }

      addActivity(newState, newState.currentOperator, 'rejected', details);
      newState.pendingDrafts = newState.pendingDrafts.filter(d => d.id !== draftId);
      return newState;
    });
  };

  const columns: Column[] = ['Now', 'Next', 'Blocked', 'Done'];

  return (
    <div className="app">
      <header className="header">
        <h1>Pairboard</h1>
        <div className="header-info">
          <span className="operator-badge">
            👤 {state.currentOperator}
          </span>
          <span className={`webmcp-status ${webmcpAvailable ? 'available' : 'unavailable'}`}>
            {webmcpAvailable ? '✓ WebMCP Active' : '⚠ WebMCP Unavailable'}
          </span>
        </div>
      </header>

      {!webmcpAvailable && (
        <div className="webmcp-banner">
          <strong>WebMCP Not Available</strong>
          This app works best in ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled.
          The board still works for humans, but AI agents won't be able to interact with it.
        </div>
      )}

      <div className="main-content">
        <div className="board-container">
          <div className="board">
            {columns.map(column => {
              const columnCards = state.cards.filter(c => c.column === column);
              return (
                <div key={column} className="column">
                  <div className="column-header">
                    {column}
                    <span className="column-count">{columnCards.length}</span>
                  </div>
                  {columnCards.map(card => (
                    <div
                      key={card.id}
                      className={`card ${state.selectedCardId === card.id ? 'selected' : ''}`}
                      onClick={() => handleSelectCard(state.selectedCardId === card.id ? null : card.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectCard(state.selectedCardId === card.id ? null : card.id);
                        }
                      }}
                      aria-pressed={state.selectedCardId === card.id}
                    >
                      <div className="card-title">{card.title}</div>
                      <div className="card-description">{card.description}</div>
                      {card.assignee && (
                        <div className="card-assignee">{card.assignee}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar">
          <div className="pending-drafts">
            <h2>Pending Drafts</h2>
            {state.pendingDrafts.length === 0 ? (
              <div className="empty-state">No pending drafts</div>
            ) : (
              state.pendingDrafts.map(draft => (
                <PendingDraftCard
                  key={draft.id}
                  draft={draft}
                  cards={state.cards}
                  onConfirm={handleConfirmDraft}
                  onReject={handleRejectDraft}
                />
              ))
            )}
          </div>

          <div className="activity-feed">
            <h2>Activity Feed</h2>
            <div className="activity-list">
              {state.activityLog.length === 0 ? (
                <div className="empty-state">No activity yet</div>
              ) : (
                state.activityLog.map(entry => (
                  <div key={entry.id} className="activity-entry">
                    <div>
                      <span className="activity-actor">{entry.actor}</span>
                      {' '}
                      <span className="activity-action">{entry.action}</span>
                    </div>
                    <div className="activity-details">{entry.details}</div>
                    <div className="activity-time">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PendingDraftCardProps {
  draft: PendingDraft;
  cards: Card[];
  onConfirm: (draftId: string) => void;
  onReject: (draftId: string) => void;
}

function PendingDraftCard({ draft, cards, onConfirm, onReject }: PendingDraftCardProps) {
  let content = '';

  switch (draft.type) {
    case 'add_card':
      content = `Add "${draft.data.card?.title}" to ${draft.data.card?.column}`;
      break;
    case 'move_card':
      const moveCard = cards.find(c => c.id === draft.data.cardId);
      content = `Move "${moveCard?.title || 'card'}" to ${draft.data.toColumn}`;
      break;
    case 'assign_card':
      const assignCard = cards.find(c => c.id === draft.data.cardId);
      content = `Assign "${assignCard?.title || 'card'}" to ${draft.data.assignee}`;
      break;
    case 'propose_plan':
      content = `Plan: ${draft.data.cards?.length || 0} new cards, ${draft.data.moves?.length || 0} moves`;
      break;
  }

  return (
    <div className="draft">
      <div className="draft-header">{draft.type.replace('_', ' ')}</div>
      <div className="draft-content">{content}</div>
      <div className="draft-actions">
        <button
          className="btn btn-confirm"
          onClick={() => onConfirm(draft.id)}
          aria-label={`Confirm ${draft.type}`}
        >
          ✓ Confirm
        </button>
        <button
          className="btn btn-reject"
          onClick={() => onReject(draft.id)}
          aria-label={`Reject ${draft.type}`}
        >
          ✗ Reject
        </button>
      </div>
    </div>
  );
}

export default App;
