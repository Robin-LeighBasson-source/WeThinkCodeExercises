# Task Completion Data Flow - Complete Analysis

## Executive Summary

When a user runs `node cli.js status <id> done`, the application triggers a carefully orchestrated journey through 4 layers of the system. This document maps that journey, explains the state transitions, identifies failure points, and shows how to debug and extend it.

**Key Insight:** The application uses a **Semantic Method Pattern** (`markAsDone()`) to ensure that completing a task does more than just change a string—it captures critical metadata (completion time) needed by other features.

---

## The Complete Data Flow

### Visual Flow Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 1: CLI Input                                                 │
│ $ node cli.js status abc123 done                                   │
│                                                                    │
│ Input: taskId="abc123", status="done"                             │
└───────────────────┬────────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────────┐
│ Layer 2: CLI Handler (cli.js)                                      │
│                                                                    │
│ .action((taskId, status) => {                                     │
│   success = taskManager.updateTaskStatus(taskId, status)          │
│   if (success) console.log('Updated task status to done')         │
│   else console.log('Failed to update...')                         │
│ })                                                                 │
│                                                                    │
│ Output: Boolean (success/failure)                                 │
└───────────────────┬────────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────────┐
│ Layer 3: Business Logic (app.js - TaskManager)                    │
│                                                                    │
│ updateTaskStatus(taskId, newStatusValue) {                        │
│   if (newStatusValue === TaskStatus.DONE) {                       │
│     const task = this.storage.getTask(taskId)                    │
│     if (task) {                                                   │
│       task.markAsDone()          ← Semantic method call           │
│       this.storage.save()        ← Persist changes                │
│       return true                ← Signal success                  │
│     }                                                             │
│     return false    ← Task not found                              │
│   } else {                                                        │
│     return this.storage.updateTask(taskId, {status: ...})       │
│   }                                                               │
│ }                                                                 │
│                                                                    │
│ Decision Point:                                                   │
│   - If status === 'done': Use semantic markAsDone()              │
│   - Else: Use generic updateTask({status: ...})                  │
└───────────────────┬────────────────────────────────────────────────┘
                    │
                    ├─────────────────────────────────────┐
                    │                                     │
                    ↓                                     ↓
        ┌──────────────────────────┐      ┌──────────────────────────┐
        │ Path A: Status = 'done'  │      │ Path B: Other statuses   │
        │                          │      │                          │
        │ task.markAsDone()        │      │ storage.updateTask()     │
        │   - Set status='done'    │      │   - Set status value     │
        │   - Capture completedAt  │      │   - Update updatedAt     │
        │   - Update updatedAt     │      │   - Call save()          │
        │   - Call save() needed   │      │                          │
        │     explicitly           │      └──────────────────────────┘
        └──────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────────┐
│ Layer 4: Model & Storage (models.js & storage.js)                │
│                                                                    │
│ Task.markAsDone() {                                              │
│   this.status = TaskStatus.DONE      ← State change              │
│   this.completedAt = new Date()      ← Metadata capture          │
│   this.updatedAt = this.completedAt  ← Timestamp alignment       │
│ }                                                                 │
│                                                                    │
│ Storage.save() {                                                 │
│   const tasksArray = Object.values(this.tasks)                  │
│   fs.writeFileSync(this.storagePath, JSON.stringify(...))       │
│ }                                                                 │
│                                                                    │
│ Modified Task Object:                                            │
│ {                                                                 │
│   id: 'abc123...',                                               │
│   status: 'done',         ← Changed                              │
│   completedAt: 2026-04-15T14:30:00Z,  ← Newly populated         │
│   updatedAt: 2026-04-15T14:30:00Z,    ← Changed                 │
│   ...other fields unchanged...                                   │
│ }                                                                 │
│                                                                    │
│ Persisted to: tasks.json                                         │
└────────────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌────────────────────────────────────────────────────────────────────┐
│ Layer 5: User Feedback (cli.js)                                   │
│                                                                    │
│ Console Output: "Updated task status to done"                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## State Management Throughout the Flow

### State 0: Before Command
```javascript
// In memory (storage.tasks)
task = {
  id: 'abc123-def456',
  title: 'Fix bug',
  status: 'todo',              // ← Not done
  completedAt: null,           // ← Never completed
  updatedAt: '2026-04-15T10:00:00Z',
  createdAt: '2026-04-15T09:00:00Z',
  // ... other properties
}

// On disk (tasks.json)
[
  {"id": "abc123-def456", "status": "todo", "completedAt": null, ...},
  // ... other tasks
]
```

### State 1: After markAsDone() Called (Before Save)
```javascript
task = {
  id: 'abc123-def456',
  title: 'Fix bug',
  status: 'done',              // ← Changed!
  completedAt: '2026-04-15T14:30:00Z',  // ← Captured!
  updatedAt: '2026-04-15T14:30:00Z',    // ← Updated!
  createdAt: '2026-04-15T09:00:00Z',
  // ... other properties
}

// In-memory state updated, but...
// On disk (tasks.json) - UNCHANGED YET
[
  {"id": "abc123-def456", "status": "todo", "completedAt": null, ...},
  // ... other tasks
]
```

**Critical Point:** Between `markAsDone()` and `save()`, the in-memory state is "dirty"—in-memory and on-disk are **out of sync**. This is a vulnerable window.

### State 2: After save() Called
```javascript
// In memory - already updated
task = {
  status: 'done',
  completedAt: '2026-04-15T14:30:00Z',
  // ...
}

// On disk (tasks.json) - NOW UPDATED!
[
  {"id": "abc123-def456", "status": "done", "completedAt": "2026-04-15T14:30:00Z", ...},
  // ... other tasks
]
```

**Consistency Achieved:** In-memory and on-disk are now synchronized.

---

## Data Transformations at Each Step

### Transformation 1: CLI Parsing
```
Input:  $ node cli.js status abc123 done
Output: {
  taskId: 'abc123',
  status: 'done',
  command: 'status'
}
```

**What happens:** Commander.js parses the command line arguments into JavaScript values. No validation yet.

---

### Transformation 2: Business Logic Decision
```
Input:  taskId='abc123', newStatusValue='done'
Check:  Is newStatusValue === TaskStatus.DONE?
        Is TaskStatus.DONE === 'done'?
        YES → Take the semantic path

Output: Route decision made
        Fetch task from storage
        Call task.markAsDone()
```

---

### Transformation 3: Semantic State Change
```
Input:  Task object with {status: 'todo', completedAt: null}

Executed:
  this.status = 'done'                    // Status flag change
  this.completedAt = new Date()           // Timestamp capture
  this.updatedAt = new Date()             // Lifecycle update

Output: Task object with {status: 'done', completedAt: <timestamp>}
```

**Key Insight:** This isn't just a property assignment—it's applying business logic that captures related metadata.

---

### Transformation 4: Serialization for Persistence
```
Input:  JavaScript Task object
        {
          id: <UUID>,
          status: <string>,
          completedAt: <Date object>,
          updatedAt: <Date object>,
          createdAt: <Date object>,
          // ... other properties
        }

Serialization:
  JSON.stringify(tasks, null, 2)
  
  ⚠️ IMPORTANT: Date objects become strings!
     new Date() → "2026-04-15T14:30:00.000Z"

Output: JSON string written to disk
        {
          "id": "...",
          "status": "done",
          "completedAt": "2026-04-15T14:30:00.000Z",  // String now!
          "updatedAt": "2026-04-15T14:30:00.000Z",    // String now!
          "createdAt": "2026-04-15T09:00:00Z",        // String now!
        }
```

**Critical Transformation:** JavaScript Date objects become ISO-8601 strings during JSON serialization.

---

### Transformation 5: Return Value Propagation
```
Input:  updateTaskStatus() completes successfully

Execution path:
  markAsDone()      ← Mutates task object
  save()            ← Writes to disk
  return true       ← Signal: operation succeeded

Output (to CLI):  Boolean true

CLI Handler:
  if (true) {
    console.log('Updated task status to done')
  }

User sees: "Updated task status to done"
```

---

## Failure Points and Error Handling

### Failure Point 1: Task Not Found
```javascript
updateTaskStatus('nonexistent-id', 'done') {
  const task = this.storage.getTask('nonexistent-id');
  if (task) {         // ← NULL CHECK
    // ... update
  }
  return false;       // ← EARLY RETURN
}
```

**Consequence:**
- In-memory state: ✅ Unchanged
- On-disk state: ✅ Unchanged
- User sees: "Failed to update task status. Task not found."

**Risk Level:** ⚠️ Low - System handles gracefully

---

### Failure Point 2: Invalid Status Value
```javascript
// What if user provides: node cli.js status abc123 invalid_status

updateTaskStatus(taskId, 'invalid_status') {
  if ('invalid_status' === TaskStatus.DONE) {    // ← FALSE
    // semantic path skipped
  } else {
    return this.storage.updateTask(taskId, {status: 'invalid_status'});
  }
}

// ❌ PROBLEM: Invalid status allowed!
// Task goes into corrupted state
task = { ..., status: 'invalid_status' }
```

**Consequence:**
- Task has invalid status
- Other features check `task.status === TaskStatus.TODO` → fails
- Sorting breaks
- Statistics break

**Risk Level:** 🔴 HIGH - No validation!

**Missing Code:**
```javascript
// Should validate:
if (!Object.values(TaskStatus).includes(newStatusValue)) {
  console.error('Invalid status. Valid options: todo, in_progress, review, done');
  return false;
}
```

---

### Failure Point 3: Disk Write Failure
```javascript
save() {
  try {
    const tasksArray = Object.values(this.tasks);
    fs.writeFileSync(this.storagePath, JSON.stringify(tasksArray, null, 2));
  } catch (error) {
    console.error(`Error saving tasks: ${error.message}`);
    // ⚠️ Note: Exception is caught but...
    // In-memory state is ALREADY changed!
    // No rollback!
  }
}
```

**Scenario:** Disk is full, write fails
- In-memory state: 🔴 CHANGED (status='done')
- On-disk state: ✅ UNCHANGED (status='todo')
- **System is inconsistent!**

**Consequence:**
- User sees "Updated..." but next restart loads old state
- Task appears done until server restarts
- "Phantom" completion

**Risk Level:** 🔴 HIGH - Data loss potential

**Better approach:**
```javascript
save() {
  try {
    const tasksArray = Object.values(this.tasks);
    fs.writeFileSync(this.storagePath, JSON.stringify(...));
  } catch (error) {
    // Re-throw to caller, don't silently fail
    throw error;
  }
}

// Caller should handle:
if (task) {
  task.markAsDone();
  try {
    this.storage.save();  // May throw
    return true;
  } catch (error) {
    // undo the change!
    task.status = TaskStatus.TODO;
    task.completedAt = null;
    task.updatedAt = <previous value>;
    return false;
  }
}
```

---

### Failure Point 4: Corrupted Task Object
```javascript
// What if task.markAsDone is called on object missing methods?
// (Deserialization bug in storage)

const task = {  // Malformed object
  id: 'abc123',
  // ... missing markAsDone method from prototype
};

task.markAsDone();  // ❌ TypeError: markAsDone is not a function
```

**Risk Level:** 🔴 HIGH - Application crashes

---

### Failure Point 5: Race Condition (Concurrent Access)
```javascript
// User A: node cli.js status task1 done
// User B: node cli.js status task1 review
// Both run at same time

// Timeline:
// T0: Both read storage (both see status='todo')
// T1: A calls markAsDone() → status='done', completedAt=<T1>
// T2: B calls updateTask() → status='review', completedAt=null
// T3: A calls save() → writes Task with status='done'
// T4: B calls save() → writes Task with status='review', completedAt=null
//     B's write OVERWRITES A's change!

// Final result: Task has status='review' (A's change lost!)
```

**Risk Level:** 🟡 MEDIUM - Unlikely in CLI (single user), but possible in networked app

---

## Edge Case Handling

### Edge Case 1: Completing an Already-Done Task
```javascript
// Task already: {status: 'done', completedAt: '2026-04-15T10:00:00Z'}
// User runs: node cli.js status task1 done

updateTaskStatus(task1, 'done') {
  const task = storage.getTask(task1);  // Fetch already-done task
  if (task) {
    task.markAsDone();
    // ❌ Problem: Overwrites original completedAt!
    // Original: 2026-04-15T10:00:00Z
    // New:      2026-04-15T14:30:00Z (current time)
    //
    // Lost data: When was it actually completed? (Ambiguous now)
    this.storage.save();
    return true;
  }
}
```

**Current behavior:** Idempotent (re-running doesn't change state)—but updates timestamps!

**Better approach:**
```javascript
markAsDone() {
  if (this.status === 'done') {
    // Already done, don't re-capture completedAt
    return;
  }
  this.status = 'done';
  this.completedAt = new Date();
  this.updatedAt = this.completedAt;
}
```

---

### Edge Case 2: Completing a Task With No Due Date
```javascript
task = {
  id: 'abc123',
  dueDate: null,
  status: 'todo'
}

// Mark as done
task.markAsDone()

// Result: Still valid!
// getStatistics() checks:
// completedRecently = tasks.filter(t => 
//   t.completedAt && t.completedAt >= sevenDaysAgo
// );
// Works correctly regardless of dueDate
```

**Outcome:** ✅ No problem (null dueDate is fine)

---

### Edge Case 3: Completing a Blocked/Review Task
```javascript
task = {
  status: 'review',
  completedAt: null
}

updateTaskStatus(task, 'done') {
  // Takes DONE path (not the generic updateTask path)
  task.markAsDone();
  storage.save();
  // Result: Can complete a task in review
  //         completedAt gets captured
  //         Transition: review → done (valid)
}
```

**Outcome:** ✅ Works correctly (any status → done is valid)

---

### Edge Case 4: Time Skew (System Clock Goes Backward)
```javascript
// Task 1: markAsDone() at 2026-04-15T14:30:00Z
// System clock adjusted backward
// Task 2: markAsDone() at 2026-04-15T14:20:00Z

// Later, statistics code sorts by completedAt:
tasks.sort((a,b) => a.completedAt - b.completedAt)
// Result: Task 2 (14:20) appears before Task 1 (14:30)
// Even though Task 1 was actually completed first!

// getStatistics() counts completed in last 7 days:
// May be wrong if clock skewed

// isOverdue() compares dueDate < new Date()
// May give wrong results if clock skewed
```

**Risk Level:** 🟡 MEDIUM - Rare, but corrupts metrics

**Mitigation:**
```javascript
markAsDone() {
  // Use a sequence number instead?
  this.status = 'done';
  this.completedAt = new Date();
  this.completionSequence = ++globalSequence;  // Always increasing
  this.updatedAt = this.completedAt;
}
```

---

## Why Semantic Methods? (The markAsDone() Pattern)

### The Problem: Generic Property Mutation

```javascript
// ❌ BAD: Generic approach
task.status = 'done';
storage.save();

// Issues:
// 1. Who captured the completion timestamp?
//    → Missing! completedAt is never set
// 2. Can be called inconsistently
// 3. updatedAt might not be aligned with completedAt
// 4. No enforcement of business rules
```

---

### The Solution: Semantic Methods

```javascript
// ✅ GOOD: Semantic method
task.markAsDone();
storage.save();

// Benefits:
// 1. Encapsulation: All DONE-related state changes in one place
// 2. Consistency: completedAt ALWAYS captured
// 3. Completeness: updatedAt automatically aligned
// 4. Safety: Changes enforced, can't forget steps
// 5. Clarity: Intent is explicit (markAsDone vs just setting a property)
```

---

### Semantic Method Contract

```javascript
markAsDone() {
  // Contract: This method guarantees:
  // 1. status WILL be set to 'done'
  // 2. completedAt WILL be captured
  // 3. updatedAt WILL be set (and aligned with completedAt)
  // 4. INVARIANT: If status='done', then completedAt != null
  // 5. No other side effects
  
  this.status = TaskStatus.DONE;
  this.completedAt = new Date();
  this.updatedAt = this.completedAt;
}
```

**Why this matters:**

Later, other code can depend on this invariant:
```javascript
isOverdue() {
  if (!this.dueDate) return false;
  // Safe assumption: If done, no overdue
  return this.dueDate < new Date() && this.status !== TaskStatus.DONE;
}

getStatistics() {
  // Can trust this: if status='done', completedAt exists
  const completedRecently = tasks.filter(task =>
    task.completedAt && task.completedAt >= sevenDaysAgo  // ← works correctly
  );
}
```

---

### Pattern Comparison

| Aspect | Generic Assignment | Semantic Method |
|--------|---|---|
| **Enforcement** | Developer remembers all steps | Language enforces all steps |
| **Consistency** | Variables might get out of sync | All related state synchronized |
| **Documentation** | Not clear from call site intent | Intent is explicit |
| **Safety** | Easy to forget steps | Can't forget (in method) |
| **Extensibility** | Can't add business logic later | Easy to add later |
| **Testing** | Hard to verify all steps done | Easy to verify contract |
| **Refactoring** | Must update all call sites | Change method once, affects all |

---

## Complete State Transition Diagram

```
                    ┌─────────────────────┐
                    │ TASK CREATED        │
                    │ status: 'todo'      │
                    │ completedAt: null   │
                    └──────────┬──────────┘
                               │
                               │ updateTaskStatus('in_progress')
                               ↓
                    ┌──────────────────────────┐
                    │ IN_PROGRESS              │
                    │ status: 'in_progress'    │
                    │ completedAt: null        │
                    │ updatedAt: <updated>     │
                    └──────────┬───────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                    │
          node cli.js status <id> review │
                    ↓                    │
         ┌──────────────────────┐        │
         │ REVIEW               │        │
         │ status: 'review'     │        │
         │ completedAt: null    │        │
         │ updatedAt: <updated> │        │
         └──────────┬───────────┘        │
                    │                    │
      updateTaskStatus('done')    updateTaskStatus('done')
                    │                    │
                    └──────────┬─────────┘
                               ↓
                    ┌──────────────────────────────┐
                    │ DONE                         │
                    │ status: 'done'               │
                    │ completedAt: <timestamp> ← ★│  ★ SEMANTIC CHANGE
                    │ updatedAt: <timestamp>       │
                    │ (Never goes back!)           │
                    └──────────────────────────────┘

Note: All transitions update 'updatedAt'
      Only DONE captures 'completedAt'
      Completed tasks never transition out of DONE
```

---

## Debugging the Mark-as-Complete Flow

### Debug Strategy 1: Trace Points

Add logging at each layer:

```javascript
// CLI Layer
.action((taskId, status) => {
  console.log('[CLI] Received command:', {taskId, status});
  const success = taskManager.updateTaskStatus(taskId, status);
  console.log('[CLI] Result:', success);
});

// Business Logic Layer
updateTaskStatus(taskId, newStatusValue) {
  console.log('[BUSINESS] updateTaskStatus called:', {taskId, newStatusValue});
  if (newStatusValue === TaskStatus.DONE) {
    const task = this.storage.getTask(taskId);
    console.log('[BUSINESS] Retrieved task:', {
      found: !!task,
      id: task?.id,
      currentStatus: task?.status
    });
    if (task) {
      console.log('[BUSINESS] Before markAsDone:', {
        status: task.status,
        completedAt: task.completedAt,
        updatedAt: task.updatedAt
      });
      task.markAsDone();
      console.log('[BUSINESS] After markAsDone:', {
        status: task.status,
        completedAt: task.completedAt,
        updatedAt: task.updatedAt
      });
      return true;
    }
  }
}

// Storage Layer
save() {
  console.log('[STORAGE] Writing', Object.keys(this.tasks).length, 'tasks');
  try {
    const tasksArray = Object.values(this.tasks);
    fs.writeFileSync(this.storagePath, JSON.stringify(tasksArray, null, 2));
    console.log('[STORAGE] Write successful');
  } catch (error) {
    console.error('[STORAGE] Write failed:', error.message);
  }
}
```

**Example Output:**
```
[CLI] Received command: {taskId: 'abc123', status: 'done'}
[BUSINESS] updateTaskStatus called: {taskId: 'abc123', newStatusValue: 'done'}
[BUSINESS] Retrieved task: {found: true, id: 'abc123', currentStatus: 'todo'}
[BUSINESS] Before markAsDone: {status: 'todo', completedAt: null, updatedAt: '2026-04-15T10:00:00Z'}
[BUSINESS] After markAsDone: {status: 'done', completedAt: '2026-04-15T14:30:00Z', updatedAt: '2026-04-15T14:30:00Z'}
[STORAGE] Writing 4 tasks
[STORAGE] Write successful
[CLI] Result: true
```

---

### Debug Strategy 2: Inspect JSON File

After running `node cli.js status <id> done`, inspect the actual file:

```bash
cat tasks.json | jq '.[] | select(.id == "abc123")'
```

**Expected:**
```json
{
  "id": "abc123-def456",
  "status": "done",
  "completedAt": "2026-04-15T14:30:00.000Z",
  "updatedAt": "2026-04-15T14:30:00.000Z",
  "createdAt": "2026-04-15T09:00:00Z",
  "title": "Fix bug",
  ...
}
```

**Check these invariants:**
- ✅ `status` is exactly `'done'` (not `'DONE'` or `'Done'`)
- ✅ `completedAt` is not null
- ✅ `updatedAt` equals `completedAt`
- ✅ `createdAt` is older than `completedAt`

---

### Debug Strategy 3: Test Isolation

Create a minimal test to isolate the flow:

```javascript
test('Completing a task captures completedAt', () => {
  const manager = new TaskManager();
  
  // Create task
  const taskId = manager.createTask('Test', 'test');
  const before = manager.getTaskDetails(taskId);
  
  console.log('Before:', {
    status: before.status,
    completedAt: before.completedAt
  });
  
  // Complete task
  const success = manager.updateTaskStatus(taskId, 'done');
  const after = manager.getTaskDetails(taskId);
  
  console.log('After:', {
    status: after.status,
    completedAt: after.completedAt
  });
  
  // Assertions
  assert(success === true, 'updateTaskStatus should return true');
  assert(after.status === 'done', 'Status should be done');
  assert(after.completedAt !== null, 'completedAt should be set');
  assert(after.completedAt <= new Date(), 'completedAt should be now or earlier');
});
```

---

### Debug Strategy 4: State Inspection Points

Check state at each layer:

```javascript
// Check in-memory state
console.log('In-memory task:', JSON.stringify(taskManager.storage.tasks['abc123'], null, 2));

// Check on-disk state
const fileContent = fs.readFileSync('tasks.json', 'utf8');
const onDisk = JSON.parse(fileContent);
console.log('On-disk task:', JSON.stringify(onDisk.find(t => t.id === 'abc123'), null, 2));

// Compare
if (JSON.stringify(inMemory) !== JSON.stringify(onDisk.find(t => t.id === 'abc123'))) {
  console.error('INCONSISTENCY: Memory and disk states differ!');
}
```

---

## How to Extend: Adding a "Re-Open Task" Feature

### Current Problem
Once a task is marked done, there's no way to change it back. Let's add a `reopenTask()` method.

### Design Question 1: What Should Happen?

When reopening a completed task, should we:
- (A) Revert to previous status (todo)?
- (B) Require caller to specify new status?
- (C) Default to 'todo' but allow override?

**Answer: Option C** (defensive with flexibility)

```javascript
reopenTask(taskId, newStatus = TaskStatus.TODO) {
  // Validate
  if (!Object.values(TaskStatus).includes(newStatus)) {
    console.error('Invalid status:', newStatus);
    return false;
  }
  
  const task = this.storage.getTask(taskId);
  if (!task) return false;
  if (task.status !== TaskStatus.DONE) {
    console.error('Task is not done, cannot reopen');
    return false;
  }
  
  // Semantic state change
  task.status = newStatus;
  task.updatedAt = new Date();
  // ⚠️ QUESTION: Should we clear completedAt?
  
  this.storage.save();
  return true;
}
```

### Design Question 2: What About completedAt?

Options:
- **(A) Clear it completely:** `task.completedAt = null`
- **(B) Keep it as history:** `task.completedAt = <original completion time>`
- **(C) Add new field:** `task.reopenedAt = new Date()`

**Best answer: Do (B) + (C)**

```javascript
reopenTask(taskId, newStatus = TaskStatus.TODO) {
  // ... validation ...
  
  task.status = newStatus;
  task.reopenedAt = new Date();  // Track when reopened
  // completedAt stays as-is (historical)
  task.updatedAt = new Date();
  
  this.storage.save();
  return true;
}
```

**Why?** 
- Maintains completion history (for auditing)
- Doesn't lose data
- Can track how many times reopened
- Useful for metrics: "avg reopens per task"

### Design Question 3: Should This Be a Semantic Method Too?

Yes! Create methods for the full lifecycle:

```javascript
markAsDone() {
  // Only works if not already done
  if (this.status === 'done') return;
  
  this.status = TaskStatus.DONE;
  this.completedAt = new Date();
  this.updatedAt = this.completedAt;
}

reopenTask(newStatus = TaskStatus.TODO) {
  // Only works if done
  if (this.status !== 'done') {
    throw new Error('Only done tasks can be reopened');
  }
  
  this.status = newStatus;
  this.reopenedAt = new Date();
  this.updatedAt = new Date();
  // Note: Don't clear completedAt (keep audit trail)
}
```

### Adding to CLI:

```javascript
program
  .command('reopen <task_id>')
  .description('Re-open a completed task')
  .option('-s, --status <status>', 'New status (default: todo)', 'todo')
  .action((taskId, options) => {
    if (taskManager.reopenTask(taskId, options.status)) {
      console.log(`Reopened task with status: ${options.status}`);
    } else {
      console.log('Failed to reopen task. Is it completed?');
    }
  });
```

### Test Case:

```javascript
test('Reopening captures reopenedAt but preserves completedAt', () => {
  const manager = new TaskManager();
  const taskId = manager.createTask('Test');
  
  // Mark done
  manager.updateTaskStatus(taskId, 'done');
  const completed = manager.getTaskDetails(taskId);
  const originalCompletedAt = completed.completedAt;
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 100));
  
  // Reopen
  manager.reopenTask(taskId);
  const reopened = manager.getTaskDetails(taskId);
  
  // Verify
  assert(reopened.status === 'todo', 'Back to todo');
  assert(reopened.completedAt === originalCompletedAt, 'Kept original completion time');
  assert(reopened.reopenedAt > originalCompletedAt, 'New reopenedAt set');
  assert(reopened.updatedAt >= reopened.reopenedAt, 'updatedAt updated');
});
```

---

## Summary: Key Takeaways

| Concept | What to Remember |
|---------|------------------|
| **Data Flow** | CLI → Business Logic → Model → Storage → Disk |
| **State Changes** | Happen in-memory first, then persisted |
| **Vulnerability Window** | Between `markAsDone()` and `save()` |
| **Semantic Methods** | Enforce business rules, capture metadata |
| **Failure Point #1** | Missing task (handled) |
| **Failure Point #2** | Invalid status (NOT validated!) |
| **Failure Point #3** | Disk write fails (no rollback!) |
| **Invariants** | If `status='done'`, then `completedAt != null` |
| **Time Dependency** | Must capture timestamps at state change, not later |
| **Idempotency** | Completing twice updates timestamps (not truly idempotent) |
| **Completeness** | `markAsDone()` method ensures all related fields set |

---

## Mental Model: Data Flow Visualization

```
Input Layer:        USER INPUT (Raw string from terminal)
                    ↓
Parsing Layer:      CLI ARGUMENT PARSING (commander.js)
                    ↓
Validation Layer:   ⚠️ MISSING! (Status not validated)
                    ↓
Routing Layer:      DECISION (Is it DONE? Different path)
                    ↓
Retrieval Layer:    FETCH TASK (From in-memory storage)
                    ↓
Mutation Layer:     MARK AS DONE (Capture timestamps)
                    ↓
Serialization:      JSON CONVERSION (Objects → strings)
                    ↓
Persistence:        DISK WRITE (fs.writeFileSync)
                    ↓
Synchronization:    MEMORY & DISK NOW IN SYNC
                    ↓
Output Layer:       USER FEEDBACK (Success message)
```

Each layer can fail independently. Current code handles some failures gracefully, but others silently fail or crash.
