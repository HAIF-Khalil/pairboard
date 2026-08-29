export type Column = 'Now' | 'Next' | 'Blocked' | 'Done';

export interface Card {
  id: string;
  title: string;
  description: string;
  column: Column;
  assignee: string | null;
}

export interface PendingDraft {
  id: string;
  type: 'add_card' | 'move_card' | 'assign_card' | 'propose_plan';
  timestamp: number;
  data: {
    cardId?: string;
    card?: Omit<Card, 'id'>;
    toColumn?: Column;
    assignee?: string;
    cards?: Card[];
    moves?: Array<{ cardId: string; toColumn: Column }>;
  };
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  details: string;
}

export interface BoardState {
  cards: Card[];
  pendingDrafts: PendingDraft[];
  activityLog: ActivityEntry[];
  selectedCardId: string | null;
  currentOperator: string;
}

declare global {
  interface Window {
    modelContext?: {
      registerTool: (config: ToolConfig) => void;
    };
  }
  
  interface Document {
    modelContext?: {
      registerTool: (config: ToolConfig) => void;
    };
  }
}

export interface ToolConfig {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
  };
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  signal?: AbortSignal;
}
