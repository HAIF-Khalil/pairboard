import { useState, useEffect, useCallback } from 'react';
import type { BoardState, Card, Column, PendingDraft } from './types';
import { loadState, saveState, addActivity, generateCardId } from './state';
import { initializeWebMCP, updateSelectedCard, applyDraft, rejectDraft, isWebMCPAvailable } from './webmcp';
import './App.css';

function App() {
  const [state, setState] = useState<BoardState>(loadState);
  const [webmcpAvailable] = useState(isWebMCPAvailable());
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showMoveCardModal, setShowMoveCardModal] = useState(false);
  const [showAssignCardModal, setShowAssignCardModal] = useState(false);

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

  // Maya's actions (immediate apply)
  const handleMayaAddCard = (title: string, description: string, column: Column, assignee: string) => {
    const newCard: Card = {
      id: generateCardId(),
      title,
      description,
      column,
      assignee: assignee || null
    };
    const newState = {
      ...state,
      cards: [...state.cards, newCard],
      activityLog: state.activityLog.slice()
    };
    addActivity(newState, state.currentOperator, 'added', title);
    setState(newState);
    saveState(newState);
    setShowAddCardModal(false);
  };

  const handleMayaMoveCard = (toColumn: Column) => {
    if (!state.selectedCardId) return;
    
    const cardIndex = state.cards.findIndex(c => c.id === state.selectedCardId);
    if (cardIndex === -1) return;

    const card = state.cards[cardIndex];
    const newCards = [...state.cards];
    newCards[cardIndex] = { ...card, column: toColumn };

    const newState = {
      ...state,
      cards: newCards,
      activityLog: state.activityLog.slice()
    };
    addActivity(newState, state.currentOperator, 'moved', `"${card.title}" to ${toColumn}`);
    setState(newState);
    saveState(newState);
    setShowMoveCardModal(false);
  };

  const handleMayaAssignCard = (assignee: string) => {
    if (!state.selectedCardId) return;
    
    const cardIndex = state.cards.findIndex(c => c.id === state.selectedCardId);
    if (cardIndex === -1) return;

    const card = state.cards[cardIndex];
    const newCards = [...state.cards];
    newCards[cardIndex] = { ...card, assignee: assignee || null };

    const newState = {
      ...state,
      cards: newCards,
      activityLog: state.activityLog.slice()
    };
    addActivity(newState, state.currentOperator, 'assigned', `"${card.title}" to ${assignee || 'unassigned'}`);
    setState(newState);
    saveState(newState);
    setShowAssignCardModal(false);
  };

  const columns: Column[] = ['Now', 'Next', 'Blocked', 'Done'];

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

  const selectedCard = state.selectedCardId 
    ? state.cards.find(c => c.id === state.selectedCardId)
    : null;

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

      {/* Tool Strip */}
      <div className="tool-strip">
        <div className="tool-strip-label">Available Tools:</div>
        <div className="tool-list">
          <span className="tool-badge">get_board</span>
          <span className="tool-badge">add_card</span>
          <span className="tool-badge">propose_plan</span>
          <span className="tool-badge">confirm_or_reject</span>
          {selectedCard && (
            <>
              <span className="tool-badge tool-badge-selected">get_card</span>
              <span className="tool-badge tool-badge-selected">move_card</span>
              <span className="tool-badge tool-badge-selected">assign_card</span>
            </>
          )}
        </div>
      </div>

      {/* Maya's Action Bar */}
      <div className="action-bar">
        <button
          className="action-btn"
          onClick={() => setShowAddCardModal(true)}
          aria-label="Add card"
        >
          ➕ Add Card
        </button>
        {selectedCard && (
          <>
            <button
              className="action-btn"
              onClick={() => setShowMoveCardModal(true)}
              aria-label="Move card"
            >
              ↔️ Move Card
            </button>
            <button
              className="action-btn"
              onClick={() => setShowAssignCardModal(true)}
              aria-label="Assign card"
            >
              👤 Assign Card
            </button>
          </>
        )}
      </div>

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

      {/* Add Card Modal */}
      {showAddCardModal && (
        <Modal title="Add Card" onClose={() => setShowAddCardModal(false)}>
          <AddCardForm onSubmit={handleMayaAddCard} onCancel={() => setShowAddCardModal(false)} />
        </Modal>
      )}

      {/* Move Card Modal */}
      {showMoveCardModal && selectedCard && (
        <Modal title={`Move "${selectedCard.title}"`} onClose={() => setShowMoveCardModal(false)}>
          <MoveCardForm 
            currentColumn={selectedCard.column}
            onSubmit={handleMayaMoveCard} 
            onCancel={() => setShowMoveCardModal(false)} 
          />
        </Modal>
      )}

      {/* Assign Card Modal */}
      {showAssignCardModal && selectedCard && (
        <Modal title={`Assign "${selectedCard.title}"`} onClose={() => setShowAssignCardModal(false)}>
          <AssignCardForm 
            currentAssignee={selectedCard.assignee || ''}
            onSubmit={handleMayaAssignCard} 
            onCancel={() => setShowAssignCardModal(false)} 
          />
        </Modal>
      )}
    </div>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

interface AddCardFormProps {
  onSubmit: (title: string, description: string, column: Column, assignee: string) => void;
  onCancel: () => void;
}

function AddCardForm({ onSubmit, onCancel }: AddCardFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [column, setColumn] = useState<Column>('Now');
  const [assignee, setAssignee] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && description) {
      onSubmit(title, description, column, assignee);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="form-field">
        <label htmlFor="title">Title *</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="form-field">
        <label htmlFor="description">Description *</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={3}
        />
      </div>
      <div className="form-field">
        <label htmlFor="column">Column *</label>
        <select
          id="column"
          value={column}
          onChange={(e) => setColumn(e.target.value as Column)}
        >
          <option value="Now">Now</option>
          <option value="Next">Next</option>
          <option value="Blocked">Blocked</option>
          <option value="Done">Done</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="assignee">Assignee</label>
        <input
          id="assignee"
          type="text"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Maya, Sam, Jules..."
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-confirm">Add Card</button>
        <button type="button" className="btn btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

interface MoveCardFormProps {
  currentColumn: Column;
  onSubmit: (toColumn: Column) => void;
  onCancel: () => void;
}

function MoveCardForm({ currentColumn, onSubmit, onCancel }: MoveCardFormProps) {
  const [toColumn, setToColumn] = useState<Column>(currentColumn);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(toColumn);
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="form-field">
        <label htmlFor="toColumn">Move to Column *</label>
        <select
          id="toColumn"
          value={toColumn}
          onChange={(e) => setToColumn(e.target.value as Column)}
          autoFocus
        >
          <option value="Now">Now</option>
          <option value="Next">Next</option>
          <option value="Blocked">Blocked</option>
          <option value="Done">Done</option>
        </select>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-confirm">Move Card</button>
        <button type="button" className="btn btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

interface AssignCardFormProps {
  currentAssignee: string;
  onSubmit: (assignee: string) => void;
  onCancel: () => void;
}

function AssignCardForm({ currentAssignee, onSubmit, onCancel }: AssignCardFormProps) {
  const [assignee, setAssignee] = useState(currentAssignee);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(assignee);
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="form-field">
        <label htmlFor="assignee">Assign to</label>
        <input
          id="assignee"
          type="text"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Maya, Sam, Jules..."
          autoFocus
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-confirm">Assign Card</button>
        <button type="button" className="btn btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
