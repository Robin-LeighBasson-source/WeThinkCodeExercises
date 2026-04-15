# Task Completion Flow - Live Execution Guide

## Real-World Walkthrough

Follow along with actual commands to see the data flow in action.

---

## Setup

```bash
cd "c:\Users\missr\OneDrive - belgiumcampus.ac.za\Desktop\Uni\Self Learning\WeThinkCode\Exercises\Exercise 2"

# Clean slate
rm tasks.json 2>/dev/null

# Create a test task
node cli.js create "Fix critical bug" -d "Production issue" -p 4
```

**Output:**
```
Created task with ID: 8d7e2b87-949c-4f87-9f8c-c65df7255d74
```

**Save this ID.** We'll use `8d7e2b87` as shorthand.

---

## Step 1: State Before Completion

```bash
node cli.js show 8d7e2b87
```

**Output:**
```
[ ] 8d7e2b87 - !!!! Fix critical bug
  Production issue
  No due date | No tags
  Created: 2026-04-15 14:15:10
```

**What you see:**
- `[ ]` = status indicator for "todo" (not done)
- Created timestamp

**Behind the scenes (in memory):**
```javascript
{
  id: "8d7e2b87-949c-4f87-9f8c-c65df7255d74",
  status: "todo",
  completedAt: null,
  updatedAt: "2026-04-15T14:15:10.000Z",
  createdAt: "2026-04-15T14:15:10.000Z",
  // ... other fields
}
```

**In the JSON file:**
```bash
cat tasks.json | jq '.[] | select(.id | startswith("8d7e2b87"))'
```

Output:
```json
{
  "id": "8d7e2b87-949c-4f87-9f8c-c65df7255d74",
  "status": "todo",
  "completedAt": null,
  "updatedAt": "2026-04-15T14:15:10.000Z",
  "createdAt": "2026-04-15T14:15:10.000Z",
  ...
}
```

---

## Step 2: Execute the Completion Command

```bash
node cli.js status 8d7e2b87 done
```

**Output:**
```
Updated task status to done
```

**What happened behind the scenes:**

### Layer 1: CLI Handler (cli.js)
```
Input:  taskId="8d7e2b87", status="done"
Action: taskManager.updateTaskStatus(taskId, status)
Output: Success (true) or failure (false)
```

### Layer 2: Business Logic (app.js)
```javascript
updateTaskStatus(taskId, newStatusValue) {
  // Check: Is this the DONE status?
  if (newStatusValue === TaskStatus.DONE) {  // 'done' === 'done' ✓
    
    // Fetch task from in-memory storage
    const task = this.storage.getTask('8d7e2b87');
    // Result: Task reference found ✓
    
    if (task) {
      // Call semantic method
      task.markAsDone();
      
      // Persist changes
      this.storage.save();
      
      return true;
    }
  }
}
```

### Layer 3: Model (models.js)
```javascript
markAsDone() {
  // Update state
  this.status = 'done';
  this.completedAt = new Date();           // Current timestamp captured!
  this.updatedAt = this.completedAt;       // Aligned timestamps
}

// After execution, in-memory task is:
{
  id: "8d7e2b87-949c-4f87-9f8c-c65df7255d74",
  status: "done",                          // ← Changed!
  completedAt: "2026-04-15T14:30:00.000Z", // ← Captured!
  updatedAt: "2026-04-15T14:30:00.000Z",   // ← Updated!
  createdAt: "2026-04-15T14:15:10.000Z",
  ...
}
```

### Layer 4: Storage (storage.js)
```javascript
save() {
  const tasksArray = Object.values(this.tasks);
  fs.writeFileSync('tasks.json', JSON.stringify(tasksArray, null, 2));
}

// File now contains:
{
  "id": "8d7e2b87-949c-4f87-9f8c-c65df7255d74",
  "status": "done",
  "completedAt": "2026-04-15T14:30:00.000Z",
  "updatedAt": "2026-04-15T14:30:00.000Z",
  ...
}
```

---

## Step 3: State After Completion

```bash
node cli.js show 8d7e2b87
```

**Output:**
```
[✓] 8d7e2b87 - !!!! Fix critical bug
  Production issue
  No due date | No tags
  Created: 2026-04-15 14:15:10
```

**What changed:**
- `[✓]` = status indicator now shows checkmark (done)

**Check the JSON:**
```bash
cat tasks.json | jq '.[] | select(.id | startswith("8d7e2b87"))'
```

Output:
```json
{
  "id": "8d7e2b87-949c-4f87-9f8c-c65df7255d74",
  "title": "Fix critical bug",
  "status": "done",
  "completedAt": "2026-04-15T14:30:00.000Z",
  "updatedAt": "2026-04-15T14:30:00.000Z",
  "createdAt": "2026-04-15T14:15:10.000Z",
  ...
}
```

**Key observation:** `completedAt` is now populated!

---

## Step 4: Verify Consistency

### Check 1: In-Memory and Disk Match

```bash
# Create a debug script
cat > verify-sync.js << 'EOF'
const { TaskManager } = require('./app');
const fs = require('fs');

const manager = new TaskManager();
const task = manager.getTaskDetails('8d7e2b87-949c-4f87-9f8c-c65df7255d74');

// In-memory
const inMemory = {
  status: task.status,
  completedAt: task.completedAt
};

// On-disk
const fileContent = JSON.parse(fs.readFileSync('tasks.json'));
const onDisk = fileContent.find(t => t.id === '8d7e2b87-949c-4f87-9f8c-c65df7255d74');

console.log('In-Memory:', JSON.stringify(inMemory, null, 2));
console.log('On-Disk:  ', JSON.stringify({
  status: onDisk.status,
  completedAt: onDisk.completedAt
}, null, 2));

const match = inMemory.status === onDisk.status &&
              inMemory.completedAt === onDisk.completedAt;

console.log('Match:', match ? '✅ YES' : '❌ NO');
EOF

node verify-sync.js
```

**Output:**
```
In-Memory: {
  "status": "done",
  "completedAt": "2026-04-15T14:30:00.000Z"
}
On-Disk: {
  "status": "done",
  "completedAt": "2026-04-15T14:30:00.000Z"
}
Match: ✅ YES
```

### Check 2: Invariant Validation

```bash
cat > validate-invariants.js << 'EOF'
const { TaskManager } = require('./app');

const manager = new TaskManager();
const task = manager.getTaskDetails('8d7e2b87-949c-4f87-9f8c-c65df7255d74');

// Invariant 1: If status='done', completedAt must be set
const inv1 = !(task.status === 'done' && task.completedAt === null);
console.log('✓ If done, completedAt exists:', inv1 ? '✅ PASS' : '❌ FAIL');

// Invariant 2: completedAt >= createdAt
const inv2 = task.completedAt >= task.createdAt;
console.log('✓ completedAt >= createdAt:', inv2 ? '✅ PASS' : '❌ FAIL');

// Invariant 3: updatedAt >= createdAt
const inv3 = task.updatedAt >= task.createdAt;
console.log('✓ updatedAt >= createdAt:', inv3 ? '✅ PASS' : '❌ FAIL');

// Invariant 4: completedAt == updatedAt (for done tasks)
const inv4 = task.completedAt === task.updatedAt;
console.log('✓ completedAt == updatedAt:', inv4 ? '✅ PASS' : '❌ FAIL');

const allPass = inv1 && inv2 && inv3 && inv4;
console.log('\nOverall:', allPass ? '✅ ALL INVARIANTS SATISFIED' : '❌ VIOLATIONS DETECTED');
EOF

node validate-invariants.js
```

**Output:**
```
✓ If done, completedAt exists: ✅ PASS
✓ completedAt >= createdAt: ✅ PASS
✓ updatedAt >= createdAt: ✅ PASS
✓ completedAt == updatedAt: ✅ PASS

Overall: ✅ ALL INVARIANTS SATISFIED
```

---

## Step 5: See the Semantic Method Benefit

### Create another task and complete it generically (WRONG WAY)

```bash
node cli.js create "Example task"
# Remember ID from output, e.g.: abc123def456

# Now complete it (correctly)
node cli.js status abc123def456 done

# Check it
node cli.js show abc123def456
```

**Why this approach works:** Because the system calls `markAsDone()`, which automatically captures `completedAt`.

### What WOULD happen with generic approach:

```javascript
// ❌ DON'T DO THIS (but let's see what would happen)
task.status = 'done';  // Just this
storage.save();        // And save

// Result:
{
  "id": "abc123def456",
  "status": "done",
  "completedAt": null,    // ← OOPS! Never set!
  ...
}
```

**This breaks downstream logic:**

```javascript
// getStatistics() assumes completedAt exists for done tasks
const completedRecently = tasks.filter(task =>
  task.completedAt && task.completedAt >= sevenDaysAgo  // ← Always false!
);

// isOverdue() expects the invariant
isOverdue() {
  return this.dueDate < new Date() && this.status !== TaskStatus.DONE;
  // Works, but semantic information (completedAt) is missing
}
```

---

## Step 6: Test the Scoring System Integration

Remember the scoring system we built? Let's see how it interacts with completed tasks.

```bash
# Create several tasks with different states
rm tasks.json
node cli.js create "Overdue task" -u "2026-04-10" -p 1
node cli.js create "High priority" -p 4
node cli.js create "Done task" && \
  node cli.js status $(node cli.js list | grep "Done task" | cut -d' ' -f2) done

# List by importance
node cli.js list --sort importance
```

**Expected output:**
```
[!!!] High priority
  ...
  
[ ] Overdue task
  ...
  
[✓] Done task
  ...
```

**Why is done task last?**

```javascript
// In utils/scoring.js
if (task.status === 'done') {
  factors.status = -50;  // ← Heavy penalty
  return { totalScore, factors };  // Circuit breaker
}

// Score calculation:
// High priority: 80 (base) + 0 (status) = 80
// Overdue:       20 (base) + 30 (overdue) = 50
// Done:          40 (base) - 50 (done penalty) = -10
```

The completed task appears last because `completedAt` was properly captured, and the scoring system can therefore identify it as done and deprioritize it.

---

## Step 7: Test Persistence (Restart)

```bash
# Create task
node cli.js create "Persistent task" -p 3

# Complete it
node cli.js status <id> done

# Verify it's done
node cli.js show <id>
# Output: [✓] ✓ done

# NOW: Simulate restart (create new process)
# Exit current Node process (if in interactive mode)
# Or just run a new instance:
node -e "
  const { TaskManager } = require('./app');
  const m = new TaskManager();
  const tasks = m.listTasks();
  console.log('After restart:');
  tasks.forEach(t => {
    console.log('  -', t.status === 'done' ? '[✓]' : '[ ]', t.title);
  });
"
```

**Output after restart:**
```
After restart:
  - [✓] Persistent task
```

**What this proves:** Data persists to disk correctly. The `completedAt` field ensures the task remains marked as done across restarts.

---

## Step 8: Examine What Would Break Without Semantic Methods

### Scenario: A Developer Forgets to Set completedAt

```javascript
// ❌ DANGEROUS CODE (hypothetical)
updateTaskStatus(taskId, newStatusValue) {
  const task = this.storage.getTask(taskId);
  if (task) {
    task.status = newStatusValue;  // Developer forgot markAsDone()!
    this.storage.save();
    return true;
  }
}
```

**What breaks:**

1. **Statistics break:**
```bash
node cli.js stats
# Output:
# Completed in last 7 days: 0  ← WRONG! Should be > 0
```

2. **Sorting breaks:**
```bash
node cli.js list --sort importance
# Completed task still shows in results (not deprioritized)
# Score calc tries to access completedAt: null
```

3. **Re-opening breaks** (if we implement it):
```javascript
reopenTask(taskId) {
  const task = this.storage.getTask(taskId);
  // ❌ Can't determine if it's truly completed
  if (!task.completedAt) {
    console.error('Not done (or corrupted data)');
  }
}
```

**The semantic method prevents all of this.**

---

## Step 9: Debug If Something Goes Wrong

### Scenario: Task appears done in CLI but not in JSON

```bash
# Try this:
node -e "
  const { TaskManager } = require('./app');
  const fs = require('fs');
  
  const m = new TaskManager();
  
  // In-memory check
  const inMem = m.storage.tasks;
  console.log('In-memory status:', inMem['<task-id>']?.status);
  
  // On-disk check
  const onDisk = JSON.parse(fs.readFileSync('tasks.json'));
  console.log('On-disk status:', onDisk.find(t => t.id === '<task-id>')?.status);
  
  if (inMem['<task-id>']?.status !== onDisk.find(t => t.id === '<task-id>')?.status) {
    console.error('❌ SYNC ERROR: States differ!');
  }
"
```

---

## Summary: Data Flow Checklist

When you complete a task with `node cli.js status <id> done`:

- ✅ CLI parses arguments (taskId, status)
- ✅ CLI handler calls `taskManager.updateTaskStatus()`
- ✅ Business logic checks: Is status 'done'? (YES)
- ✅ Business logic fetches task from storage
- ✅ Business logic calls `task.markAsDone()` (SEMANTIC)
  - ✅ Sets `status = 'done'`
  - ✅ Captures `completedAt = new Date()`
  - ✅ Aligns `updatedAt`
- ✅ Business logic calls `storage.save()`
  - ✅ Serializes task objects to JSON
  - ✅ Writes to tasks.json
- ✅ Business logic returns true
- ✅ CLI prints success message
- ✅ The system now sees task as done (in-memory and on-disk)

**If any step fails:**
- ❌ Task not found → return false
- ❌ Disk write error → (currently silent, but should throw)
- ❌ No semantic method → completedAt not set

---

## Real Files You Can Inspect

```bash
# See the actual changes in models.js
grep -A 5 "markAsDone" models.js

# See the business logic routing
grep -B 5 -A 10 "newStatusValue === TaskStatus.DONE" app.js

# See the serialization
grep -B 2 -A 5 "JSON.stringify" storage.js

# See the CLI integration
grep -B 2 -A 5 "status <task_id>" cli.js
```

---

## Exercises

Now that you understand the flow, try these:

1. **Add validation:** Modify `app.js` to reject invalid status values
2. **Add rollback:** If disk write fails, roll back in-memory state
3. **Add logging:** Add debug output at each layer
4. **Add re-open:** Implement a `reopenTask()` command
5. **Check invariants:** Create a validation function like we showed
6. **Test the edge case:** Mark a task done twice, verify completedAt doesn't change

These exercises will deepen your understanding of the full lifecycle!
