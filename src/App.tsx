import { useState, useEffect, useCallback } from 'react';
import type { BoardState, Card, Column, PendingDraft } from './types';
import { loadState, saveState } from './state';
import { initializeWebMCP, updateSelectedCard, applyDraft, rejectDraft, isWebMCPAvailable } from './webmcp';
import './App.css';

function App() {
  const [state, setState] = useState<BoardState>(loadState);
  const [webmcpAvailable] = useState(isWebMCPAvailable());

  const getState = useCallback(() => state, [state]);

  const setStateAndSave = useCallback((newState: BoardState) => {
    setState(newState);
    saveState(newState);
  }, []);

  useEffect(() => {
    initializeWebMCP(getState, setStateAndSave);
  }, [getState, setStateAndSave]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const handleSelectCard = (cardId: string | null) => {
    setState(prev => ({ ...prev, selectedCardId: cardId }));
    updateSelectedCard(cardId);
  };

  const handleConfirmDraft = (draftId: string) => {
    const newState = applyDraft(state, draftId);
    setState(newState);
    saveState(newState);
  };

  const handleRejectDraft = (draftId: string) => {
    const newState = rejectDraft(state, draftId);
    setState(newState);
    saveState(newState);
  };

  const columns: Column[] = ['Now', 'Next', 'Blocked', 'Done'];

  // Get pending drafts for a specific card or column
  const getPendingDraftsForCard = (cardId: string): PendingDraft[] => {
    return state.pendingDrafts.filter(d => 
      (d.type === 'move_card' || d.type === 'assign_card') && d.data.cardId === cardId
    );
  };

  const getPendingAddDraftsForColumn = (column: Column): PendingDraft[] => {
    return state.pendingDrafts.filter(d => 
      d.type === 'add_card' && d.data.card?.column === column
    );
  };

  const getPlanDraftsAffectingColumn = (column: Column): PendingDraft[] => {
    return state.pendingDrafts.filter(d => {
      if (d.type === 'propose_plan') {
        const hasCardsInColumn = d.data.cards?.some(c => c.column === column);
        const hasMovesToColumn = d.data.moves?.some(m => m.toColumn === column);
        return hasCardsInColumn || hasMovesToColumn;
      }
      return false;
    });
  };

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
              const pendingAdds = getPendingAddDraftsForColumn(column);
              const planDrafts = getPlanDraftsAffectingColumn(column);
              
              return (
                <div key={column} className="column">
                  <div className="column-header">
                    {column}
                    <span className="column-count">{columnCards.length}</span>
                  </div>
                  
                  {columnCards.map(card => {
                    const cardPendingDrafts = getPendingDraftsForCard(card.id);
                    const hasPendingDrafts = cardPendingDrafts.length > 0;
                    
                    return (
                      <div
                        key={card.id}
                        className={`card ${state.selectedCardId === card.id ? 'selected' : ''} ${hasPendingDrafts ? 'pending' : ''}`}
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
                        {hasPendingDrafts && (
                          <div className="pending-indicator">⏳ Pending changes</div>
                        )}
                      </div>
                    );
                  })}

                  {pendingAdds.map(draft => (
                    <div key={draft.id} className="card pending pending-add">
                      <div className="card-title">{draft.data.card?.title}</div>
                      <div className="card-description">{draft.data.card?.description}</div>
                      {draft.data.card?.assignee && (
                        <div className="card-assignee">{draft.data.card.assignee}</div>
                      )}
                      <div className="pending-indicator">⏳ Pending add</div>
                    </div>
                  ))}

                  {planDrafts.map(draft => {
                    const cardsForColumn = draft.data.cards?.filter(c => c.column === column) || [];
                    return cardsForColumn.map((card, idx) => (
                      <div key={`${draft.id}-${idx}`} className="card pending pending-add">
                        <div className="card-title">{card.title}</div>
                        <div className="card-description">{card.description}</div>
                        {card.assignee && (
                          <div className="card-assignee">{card.assignee}</div>
                        )}
                        <div className="pending-indicator">⏳ Pending (plan)</div>
                      </div>
                    ));
                  })}
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
