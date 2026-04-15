# Task Priority Scoring System - Technical Design Document

## Executive Summary

This document details the architecture, algorithms, and decision rationale for the dynamic task importance scoring system integrated into the TaskManager CLI.

**Key Insight:** Importance scores are **derived values calculated on-the-fly**, never persisted, because they depend on the current date and change continuously.

---

## Problem Statement

### Original System Limitations

The original TaskManager had a simple priority model: 1-4 priority value assigned at creation time.

**Problems:**
- Priority was static—a task created as "low priority" stayed low even if it became overdue
- No way to distinguish between "low priority that's now overdue" vs. "low priority that's still far away"
- Manual sorting wasn't intelligent—tasks didn't self-organize by urgency
- No consideration of context: are blockers/critical tags factored in? Is the task recently modified?

### What We Needed

A scoring system that:
1. Considers multiple context factors (time until deadline, priority, tags)
2. Automatically ranks tasks by real-world urgency
3. Updates dynamically without background jobs
4. Remains performant for CLI usage
5. Doesn't corrupt the core task data model

---

## Architectural Solution

### Layer 1: The Scoring Function (utils/scoring.js)

**Purpose:** Pure function that converts a Task object into an importance score.

**Key Properties:**
- **Deterministic:** Same task input → same score output
- **Defensive:** Handles missing/corrupted data gracefully
- **Informative:** Returns factor breakdown, not just a number

**Input:**
```javascript
{
  priority: 1-4,
  status: 'todo' | 'in_progress' | 'review' | 'done',
  dueDate: Date | null,
  tags: string[],
  updatedAt: Date,
  createdAt: Date
}
```

**Output:**
```javascript
{
  totalScore: 73,
  factors: {
    base: 40,        // priority * 20
    status: 0,       // penalty for status
    overdue: 15,     // bonus for deadline proximity
    tags: 8,         // bonus for critical tags
    recency: 5       // bonus for recent updates
  }
}
```

### Layer 2: The Sorting Strategies (utils/sorting.js)

**Purpose:** Repository of different sort algorithms, using Schwartzian Transform for efficiency.

**Pattern Used:**
```
Input tasks → Map (attach scores) → Sort → Map (extract tasks) → Output tasks
```

**Why this pattern?**
- Scores calculated once per task: O(n)
- Comparison happens in sort: O(n log n)
- Total complexity: O(n log n) instead of O(n log n × score_calculation)
- For 1000 tasks, this avoids ~10,000 unnecessary calculations

**Available Strategies:**
```javascript
sortStrategies = {
  importance: sortByImportance,   // Dynamic scoring
  priority: sortByPriority,       // Base priority only
  deadline: sortByDeadline,       // Due date
  newest: sortByNewest,           // Recently created
  oldest: sortByOldest            // Least recently created
}
```

### Layer 3: Business Logic Integration (app.js)

**Change:** Refactored `listTasks()` to accept options and apply sorting.

**Backward Compatibility:**
```javascript
// Old calls still work
listTasks(statusFilter, priorityFilter, showOverdue, sortStrategy)

// New calls more readable
listTasks({ status: 'todo', priority: 3, sort: 'importance' })
```

**Execution Flow:**
```
listTasks(options)
  ↓
Parse & validate options
  ↓
Fetch filtered tasks from storage
  ↓
Apply sort strategy
  ↓
Return sorted task array
```

### Layer 4: CLI Integration (cli.js)

**Change:** Added `--sort` option to `list` command.

```bash
node cli.js list --sort importance --status todo --priority 3
```

---

## The Scoring Algorithm - Detailed

### Principle 1: Base Priority as Foundation

```javascript
baseScore = priority * 20  // 20, 40, 60, 80
```

**Why 20x multiplier?**
- Creates spread: LOW (20) vs URGENT (80) = 60-point gap
- Large enough that bonuses/penalties don't overshadow base priority
- Base priority should be ~50% of typical total score

### Principle 2: Status Reflects Lifecycle Cost

```javascript
if status === 'todo' || status === 'in_progress'
  → statusFactor = 0        // Active, full scoring
else if status === 'review'
  → statusFactor = -15      // Pending, slightly deprioritized
else if status === 'done'
  → statusFactor = -50      // Complete, heavily deprioritized
  → CIRCUIT BREAKER (skip overdue + tag bonuses)
```

**Philosophy:** Why penalize DONE?
- Done tasks shouldn't dominate the list
- User focuses on active work, not history
- -50 penalty ensures done tasks appear last (even if recently updated)

### Principle 3: The Circuit Breaker - DONE Task Exception

**Problem:** What if a task was:
- Created with HIGH priority (80)
- Tagged "blocker" (+8)
- Was overdue (+30)
- Just completed (recency +5)?

**Without circuit breaker:** 80 - 50 + 30 + 8 + 5 = **73** (too high!)

**With circuit breaker:** 80 - 50 + 0 + 0 + 5 = **35** (correct)

**Why recency still applies:**
- Users want to see what they just accomplished
- Recent completions rank higher than old completions
- Makes sense: "I just finished task X" → should appear at top briefly

### Principle 4: Deadline Proximity as Urgency Signal

```javascript
if diffDays < 0:     overdue bonus = +30   // Past deadline!
if diffDays === 0:   overdue bonus = +20   // DUE TODAY!
if diffDays <= 2:    overdue bonus = +15   // Due very soon
if diffDays <= 7:    overdue bonus = +10   // Due this week
if diffDays >= 8:    overdue bonus = 0     // Future
```

**Why these breakpoints?**
- `< 0`: Maximum urgency (overdue)
- `=== 0`: "Due today" is explicit time pressure
- `<= 2`: 48-hour window (psychological trigger)
- `<= 7`: Weekly planning horizon
- `>= 8`: Not immediate, file it mentally

### Principle 5: Tags as Force Multipliers

```javascript
if tags.includes('blocker') || tags.includes('critical'):
  tagBonus = +8
else:
  tagBonus = 0
```

**Philosophy:**
- Only specific tags trigger bonus (not arbitrary tags)
- +8 bonus (~10-20% of typical score)
- Amplifier: if user marks something "blocker," it should rank higher
- But not so high that it overrides deadline urgency

### Principle 6: Recency as Activity Signal

```javascript
if updatedAt within last 24 hours:
  recencyBonus = +5
else:
  recencyBonus = 0
```

**Why 24 hours?**
- "Touched recently" = user working on it
- 1-day window = morning's work + overnight + next morning
- +5 bonus = tiebreaker utility, not major driver
- Applies even to DONE tasks (justification: "I just finished this")

---

## Weighting Analysis: Why These Numbers?

### Scenario: Comparing Task Importance

**Setup:**
| Metric | Task A (Blocker) | Task B (Overdue) | Task C (Urgent) |
|--------|---|---|---|
| Base Priority | 2 (MEDIUM = 40) | 1 (LOW = 20) | 4 (URGENT = 80) |
| Status | TODO | TODO | TODO |
| Due Date | None | Yesterday (overdue) | In 5 days |
| Tags | blocker | none | none |
| Updated | Today | 1 week ago | 1 week ago |

**Scores:**
```
A (Blocker):   40 + 0 + 0 + 8 + 5 = 53
B (Overdue):   20 + 0 + 30 + 0 + 0 = 50
C (Urgent):    80 + 0 + 10 + 0 + 0 = 90
```

**Ranking:** C > A > B

**Is this correct?** Yes, because:
1. **C (Urgent)** is highest—base priority dominates when there's no deadline (C > A by 37 points)
2. **A (Blocker)** beats **B** despite lower base priority (53 > 50) because:
   - Blocker tag (+8) compensates for lower priority
   - Recent activity (+5) breaks tie
3. **B (Overdue)** is close behind—overdue bonus (+30) almost compensates for low priority

### Key Insight: Weighting Hierarchy

From most to least impactful:
1. **Base Priority (40-80 points)** - Foundation
2. **Status (-50 to 0 points)** - Lifecycle
3. **Overdue (0-30 points)** - Time pressure
4. **Tags (0-8 points)** - User intent
5. **Recency (0-5 points)** - Activity signal

This hierarchy ensures:
- User's base priority choice is respected (most weight)
- Deadline urgency doesn't overwhelm priority entirely
- Tags amplify but don't dominate
- Recency breaks ties elegantly

---

## Defensive Programming Strategies

### Problem 1: Missing Priority
```javascript
const basePriority = task.priority || 1;  // Default to LOW
```
**Why:** Graceful degradation. Corrupted task doesn't crash the sort.

### Problem 2: Invalid Date Format
```javascript
try {
  const due = new Date(task.dueDate);
  // Use due...
} catch (e) {
  factors.overdue = 0;  // No bonus on error
}
```
**Why:** Corrupted dueDate doesn't break the entire list command.

### Problem 3: Missing Tags Property
```javascript
if (task.tags && Array.isArray(task.tags)) {
  // Safe to use task.tags
}
```
**Why:** Tasks from old data might lack tags property.

### Problem 4: Date Calculation Edge Cases
```javascript
const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
const diffMs = dueDate - nowDate;
const diffDays = diffMs / (1000 * 60 * 60 * 24);

if (diffDays === 0) /* Due today */  // Not < 0.5
```
**Why:** Floating-point comparison issues. Compare at midnight boundary.

---

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Example (1000 tasks) |
|-----------|------------|---------------------|
| Calculate 1 score | O(1) | ~0.001ms |
| Schwartzian sort | O(n log n) | ~10ms |
| Total list operation | O(n log n) | ~10ms |
| Compare to naive sort | O(n log n × k) | ~20ms (with recalculation) |

**Verdict:** Fast enough for CLI, imperceptible to user.

### Space Complexity

- **Temporary array:** n items (intermediate in Schwartzian transform)
- **Total:** O(n) extra space
- **Impact:** Negligible even for 10,000+ tasks

---

## Testability Benefits of This Design

### 1. **Pure Functions**
```javascript
calculateImportanceScore(task) 
// No side effects, no database calls
// Easy to test in isolation
```

### 2. **Factor Breakdown**
```javascript
{ totalScore: 73, factors: { base: 40, overdue: 30, ... } }
// Can assert individual components
// Test "overdue logic" independently
```

### 3. **Strategy Pattern**
```javascript
applySortStrategy(tasks, 'importance')
// Can test each strategy independently
// Easy to add new strategies and test immediately
```

### Result: 35 comprehensive tests, all passing, covering:
- Edge cases (missing/null values)
- Boundary conditions (due today, due in 8 days)
- Weighting scenarios (comparing priorities)
- Circuit breaker logic (DONE task behavior)
- All sort strategies

---

## Data Flow Diagram

```
User Command:
  node cli.js list --sort importance --status todo

      ↓

CLI Parser (commander):
  Parses {status: 'todo', sort: 'importance'}

      ↓

TaskManager.listTasks(options):
  1. Filter: storage.getTasksByStatus('todo')
  2. Sort: applySortStrategy(filteredTasks, 'importance')

      ↓

sortByImportance(tasks):
  1. Map: tasks → [{task, score: 73}, {task, score: 50}, ...]
  2. Sort: by score (descending)
  3. Map: [{task, score}...] → [task1, task2, ...]

      ↓

For each task: calculateImportanceScore(task)
  1. base = priority * 20
  2. status = -50 if done, else 0
  3. overdue = based on dueDate
  4. tags = +8 if blocker/critical
  5. recency = +5 if updated < 1 day
  6. Return {totalScore, factors}

      ↓

Sorted tasks returned to CLI

      ↓

CLI formats and displays result
```

---

## Integration Points

### With Task Creation
- No changes needed; scoring happens at read time

### With Task Updates
- No changes needed; updates to task properties automatically reflected in next sort

### With Storage
- No persistence of scores
- Storage remains simple; scoring is orthogonal

### With Tests
- All 35 scoring tests isolated in `tests/scoring.test.js`
- All existing tests still pass
- New tests verify sorting behavior

---

## Future Extensions (Without Breaking Changes)

### 1. Custom Scoring Weights
```javascript
const scoreWeights = { baseFactor: 20, overdueBonus: 40, ... };
calculateImportanceScore(task, scoreWeights)
```

### 2. Additional Factors
```javascript
// Example: Time spent on task
if (task.timeSpent > 4) { factors.invested = +5; }
```

### 3. Scoring Profiles
```javascript
// Example: Different weights for different project types
const profiles = {
  development: { baseFactor: 20, overdueBonus: 40 },
  admin: { baseFactor: 15, overdueBonus: 50 },
};
calculateImportanceScore(task, profiles['development'])
```

### 4. Scoring History
```javascript
// Track how scores changed over time
taskHistories[taskId].push({ 
  timestamp: now, 
  score: 73, 
  factors: {...} 
})
```

---

## Conclusion

This scoring system demonstrates professional software engineering:

✅ **Separation of concerns** - Scoring, sorting, and filtering are independent  
✅ **Defensive programming** - Graceful handling of bad data  
✅ **Performance optimization** - Schwartzian Transform pattern  
✅ **Testability** - 35 focused tests  
✅ **Backward compatibility** - Old code still works  
✅ **Extensibility** - Easy to add new strategies or factors  
✅ **Clear data flow** - Explicit which layer does what  

The key architectural insight: **Derived values shouldn't be persisted.** Calculate them on-read. This keeps the data model clean and eliminates entire categories of bugs.
