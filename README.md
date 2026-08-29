# Pairboard

**Pairboard** is a shared card board where people and AI agents collaborate on the same live surface using WebMCP (Web Model Context Protocol).

Built for the OpenAI WebMCP Challenge.

## What is Pairboard?

Pairboard is a kanban-style task board with four columns:
- **Now** - Tasks in active progress
- **Next** - Upcoming tasks
- **Blocked** - Tasks waiting on dependencies
- **Done** - Completed tasks

The board is designed for seamless human-agent collaboration. Both people and AI agents can:
- View the board and individual cards
- Create new cards
- Move cards between columns
- Assign cards to team members
- Propose multi-step plans

All agent actions are proposed as **pending drafts** that require human confirmation before being applied, ensuring humans stay in control.

## The 7 WebMCP Tools

Pairboard registers exactly 7 tools via the WebMCP API:

### Board-Level Tools (Always Available)
1. **`get_board`** (read-only) - Read the current board state, all cards, pending drafts, and blocked items
2. **`add_card`** - Propose adding a new card (creates a pending draft)
3. **`propose_plan`** - Propose a plan with multiple cards and/or moves (creates a pending draft)
4. **`confirm_or_reject`** - Apply or discard a pending draft (the only tool that mutates the board)

### Selected-Card Tools (Available Only When a Card is Selected)
5. **`get_card`** (read-only) - Read details of the currently selected card
6. **`move_card`** - Propose moving the selected card to a different column (creates a pending draft)
7. **`assign_card`** - Propose assigning the selected card to someone (creates a pending draft)

The selected-card tools are dynamically registered using an `AbortSignal` when a card is selected, and automatically unregistered when the card is deselected.

## How WebMCP is Used

Pairboard uses the WebMCP API to enable AI agents to interact with the board:

1. **Feature Detection** - The app checks for `document.modelContext` at startup
2. **Tool Registration** - Tools are registered on the top-level `document` using `document.modelContext.registerTool()`
3. **Dynamic Registration** - Selected-card tools use `AbortSignal` to register/unregister based on card selection state
4. **Read-Only Hints** - Read-only tools (`get_board`, `get_card`) include `annotations: { readOnlyHint: true }`
5. **Pending Drafts** - All write operations create pending drafts that are visible in the UI
6. **Human Control** - Only `confirm_or_reject` actually mutates the board state

The app remains fully functional for human users even when WebMCP is unavailable.

## How to Run

### Prerequisites
- Node.js 18+ and npm

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Production Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The build outputs to the `dist/` directory and is ready for static HTTPS deployment.

## How to Enable WebMCP

WebMCP is currently available in:
- **ChatGPT's in-app browser** (recommended for testing)
- **Chrome 149+** with WebMCP enabled via experimental flags

When WebMCP is unavailable, the app displays a banner but remains fully functional for human operators.

## Technology Stack

- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** (strict mode) - Type safety
- **WebMCP** - AI agent integration
- **localStorage** - Client-side state persistence

## Demo Scenario

The board comes pre-seeded with a realistic scenario:
- Maya has a 10am stakeholder review
- The Atlas API ships Friday
- The staging deploy must be completed before the review
- Some cards are blocked waiting on dependencies

This scenario demonstrates the <3 minute demo flow including:
- Viewing blocked cards
- Selecting the "Staging deploy" card
- Proposing an afternoon plan
- Confirming or rejecting agent actions

## License

MIT License - see [LICENSE](LICENSE) file for details.
