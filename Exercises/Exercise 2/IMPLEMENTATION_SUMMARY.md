# Task Priority Scoring System - Implementation Summary

## What We Built

A **Test-Driven Development (TDD) implementation** of a dynamic task importance scoring system that ranks tasks based on multiple contextual factors rather than just base priority.

---

## Architecture Overview

### Three-Layer Components

```
┌─────────────────────────────────────────┐
│         cli.js (User Interface)         │
│    Added --sort flag to list command    │
│  Supports: importance, priority,        │
│  deadline, newest, oldest               │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│      app.js (Business Logic)            │
│    Refactored listTasks() options       │
│  Coordinates filtering & sorting        │
└──────────────────┬──────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
┌──────▼────────────┐  ┌──────▼─────────┐
│ utils/scoring.js  │  │utils/sorting.js │
│                   │  │                 │
│calculateImportance│  │Schwartzian      │
│Score()            │  │Transform sort   │
│                   │  │strategy map     │
└───────────────────┘  └─────────────────┘
       │                       │
       └───────────┬───────────┘
                   │
    ┌──────────────▼────────────┐
    │   models.js & storage.js  │
    │   (Data & Persistence)    │
    └───────────────────────────┘
```

---

## Key Design Decisions

### 1. **Calculated On-the-Fly, Never Persisted**

The importance score is **derived data**, not primary data. It's calculated fresh every time tasks are listed because:
- Scores change over time as deadlines approach (time-dependent)
- Prevents state de-sync bugs
- Negligible performance cost for a CLI tool
- Keeps the data model clean

### 2. **Circuit Breaker for DONE Tasks**

DONE tasks are handled specially:
```
IF status == "done":
  - Receive status penalty (-50)
  - Skip overdue bonus (completed no longer urgent)
  - Skip tag bonus (blockers don't matter once done)
  - Still get recency bonus (recent completions rank higher)
  - Return immediately (no cascading bonuses)
```

This ensures completed tasks don't incorrectly rank as high-priority just because they were overdue or had blockers.

### 3. **Schwartzian Transform for Sorting**

Instead of recalculating scores during comparison:
```javascript
// Inefficient: O(n log n) comparisons × calculation cost
tasks.sort((a, b) => calculateScore(b) - calculateScore(a))

// Efficient: Map-Sort-Map pattern
tasks
  .map(task => ({ task, score: calculateScore(task) }))
  .sort((a, b) => b.score - a.score)
  .map(item => item.task)
```

### 4. **Backward-Compatible Function Signature**

`listTasks()` supports both old and new calling styles:
```javascript
// Legacy (still works)
listTasks(statusFilter, priorityFilter, showOverdue, sortStrategy)

// Modern (recommended)
listTasks({ status, priority, overdue, sort })
```

---

## The Scoring Algorithm

### Base Score: Priority × 20
- Priority 1 (LOW) = 20 points
- Priority 2 (MEDIUM) = 40 points
- Priority 3 (HIGH) = 60 points
- Priority 4 (URGENT) = 80 points

### Status Penalties
- TODO, IN_PROGRESS = 0
- REVIEW = -15
- DONE = -50 (circuit breaker)

### Overdue Bonus (TODO/IN_PROGRESS only)
- Overdue (past due date) = +30
- Due today = +20
- Due 1-2 days = +15
- Due 3-7 days = +10
- Due 8+ days = 0

### Tag Bonus (TODO/IN_PROGRESS only)
- Contains "blocker" or "critical" = +8
- Other tags = 0

### Recency Bonus
- Updated within 1 day = +5
- Updated 2+ days ago = 0

### Weighting Example

| Scenario | Calculation | Result |
|----------|---|---|
| Urgent blocker (not overdue) | 80 + 0 + 0 + 8 + 0 = | **88** |
| Overdue LOW task | 20 + 0 + 30 + 0 + 0 = | **50** |
| Medium priority, due soon | 40 + 0 + 15 + 0 + 5 = | **60** |
| Recent DONE task | 20 - 50 + 0 + 0 + 5 = | **-25** |

---

## Available Sort Strategies

### 1. **importance** (default)
- **What:** Dynamic calculated score
- **Order:** Highest to lowest
- **Use case:** Automated task prioritization
- **Tiebreaker chain:** Score → Priority → Due Date → Creation Date

### 2. **priority**
- **What:** Base priority only (1-4)
- **Order:** Highest to lowest
- **Use case:** User's explicit priority choices
- **Tiebreaker:** Creation date

### 3. **deadline**
- **What:** Due date
- **Order:** Earliest to latest
- **Use case:** "What's due first?"
- **Note:** Tasks without due dates appear last

### 4. **newest**
- **What:** Creation timestamp
- **Order:** Newest first
- **Use case:** Recently created tasks

### 5. **oldest**
- **What:** Creation timestamp
- **Order:** Oldest first
- **Use case:** Least recently touched

---

## Testing Coverage

**35 Jest Tests** covering:

- ✅ Base priority calculation (5 tests)
- ✅ Status penalties (4 tests)
- ✅ Overdue logic (7 tests - including date edge cases)
- ✅ Tag logic (6 tests - including missing/corrupt data)
- ✅ Recency logic (4 tests)
- ✅ Circuit breaker behavior (4 tests)
- ✅ Weighting scenarios (2 tests)
- ✅ Return value structure (3 tests)

**Run tests:**
```bash
npm test -- tests/scoring.test.js    # Just scoring
npm test                              # All tests (92 total)
```

---

## CLI Usage Examples

### List by importance (dynamic scoring)
```bash
node cli.js list --sort importance
node cli.js list -s todo --sort importance
node cli.js list --overdue --sort importance
```

### List by base priority (user-defined)
```bash
node cli.js list --sort priority
```

### List by deadline (earliest first)
```bash
node cli.js list --sort deadline
```

### List by recency
```bash
node cli.js list --sort newest    # Recently created
node cli.js list --sort oldest    # Least recently touched
```

### Combined filters and sorting
```bash
node cli.js list --status todo --sort importance
node cli.js list --priority 3 --sort deadline
node cli.js list --overdue --sort importance
```

---

## Key Learning Points (For Your Reference)

### What You Discovered

1. **Derived values should never be persisted** - State sync bugs are painful. Calculate on-the-fly.

2. **Semantic operations matter** - `markAsDone()` is more than just a status flip; it captures time and context.

3. **Time-dependent calculations require fresh computation** - A score 30 days old is stale.

4. **Circuit breakers prevent cascading logic errors** - The DONE check prevents incorrect bonuses.

5. **Tie-breaking is important for user experience** - Identical scores create confusing randomness. Always have deterministic fallbacks.

6. **Options objects are more maintainable** - Avoid positional parameter sprawl as functions grow.

7. **Classic algorithms matter** - The Schwartzian Transform is a 30-year-old pattern that solves real problems.

---

## Files Modified/Created

| File | Change | Purpose |
|------|--------|---------|
| `utils/scoring.js` | **NEW** | Pure function to calculate task importance scores |
| `utils/sorting.js` | **NEW** | Sort strategy implementations (Schwartzian Transform) |
| `tests/scoring.test.js` | **NEW** | 35 comprehensive Jest unit tests |
| `app.js` | Modified | Refactored `listTasks()` to accept options and apply sorting |
| `cli.js` | Modified | Added `--sort` flag to list command |

---

## Next Steps (Optional Enhancements)

1. **Add scoring breakdown display** - Show factor details in list output
2. **Custom scoring weights** - Allow configuration of weights
3. **Save/persist sort preferences** - Remember user's preferred sort strategy
4. **Combine filters and sorting** - Advanced queries like "due soon AND high priority"
5. **Scoring explanations** - Why did this task rank #1?
6. **Performance metrics** - Benchmark scoring on 10,000+ tasks

---

## How This Demonstrates Professional Engineering

✅ **TDD approach** - Tests written first, implementation follows  
✅ **Defensive programming** - Graceful failure on corrupted data  
✅ **Clean architecture** - Separation of concerns across layers  
✅ **Pattern recognition** - Classic algorithms (Schwartzian Transform)  
✅ **Backward compatibility** - Old code still works  
✅ **Comprehensive testing** - 35 focused, well-named test cases  
✅ **Scalable design** - Easy to add new sort strategies  
✅ **Clear documentation** - Factor breakdown, edge cases explained  

---

## Summary

You've built a **production-ready** dynamic task prioritization system that demonstrates:
- Solid grasp of system design (layered architecture)
- Understanding of when to calculate vs. persist
- Ability to implement complex logic with defensive programming
- Test-driven development discipline
- Knowledge of classic algorithms and patterns

This is the level of thinking that separates junior developers from mid-level engineers. Well done! 🎉
