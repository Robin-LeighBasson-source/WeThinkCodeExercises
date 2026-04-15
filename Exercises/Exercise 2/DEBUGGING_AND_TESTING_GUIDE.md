# Task Completion Flow - Debugging & Testing Guide

## Quick Reference: Debugging Checklist

### Is the Task Actually Being Updated?

```bash
# 1. Before completing
node cli.js show abc123
# Expected: status=[^d]* (anything but 'done')

# 2. Complete it
node cli.js status abc123 done
# Expected: "Updated task status to done"

# 3. After completing
node cli.js show abc123
# Expected: status=[✓] done

# 4. Check JSON file
cat tasks.json | jq '.[] | select(.id == "abc123")'
# Expected: "status": "done", "completedAt": <timestamp>
```

---

## Scenario 1: "Task Shows Done in CLI But Not in JSON"

### Symptoms
- `node cli.js list` shows task as done
- But `cat tasks.json` shows task as todo
- After restarting app, task reverts to todo

### Diagnosis
```
Likely Cause: save() failed silently
Vulnerability Window: markAsDone() succeeded, but save() failed
Consequence: In-memory and on-disk are OUT OF SYNC
```

### Debug Steps
```javascript
// Add this to storage.js save() method
save() {
  try {
    const tasksArray = Object.values(this.tasks);
    fs.writeFileSync(this.storagePath, JSON.stringify(tasksArray, null, 2));
    console.log('[STORAGE] Successfully saved', tasksArray.length, 'tasks');  // ← Add this
  } catch (error) {
    console.error('[STORAGE] CRITICAL: Write failed!', error.message);       // ← Add this
    throw error;                                                               // ← Rethrow
  }
}
```

### Verification
```bash
# Run with debug enabled
node cli.js status abc123 done
# Should see:
# [STORAGE] Successfully saved 4 tasks
# Updated task status to done

# If you see error instead, disk is full or permission denied
```

---

## Scenario 2: "Task Still Shows Todo But I Ran status Command"

### Symptoms
- Ran: `node cli.js status abc123 done`
- Got: "Updated task status to done"
- But: `node cli.js show abc123` still shows todo
- Manually check JSON: Still todo

### Diagnosis
```
Possibility 1: Wrong task ID (typo in command)
Possibility 2: Task doesn't exist (already deleted)
Possibility 3: Application reloaded from disk (process restarted)
```

### Debug Steps

**Step 1: Verify exact ID**
```bash
# List all tasks
node cli.js list

# Find the exact UUID of target task
# E.g.: "e597c115 - !! Overdue follow-up"
# Full ID: "e597c115-40d8-46c2-9f33-7f1149e316dc"

# Then run command with FULL id
node cli.js status "e597c115-40d8-46c2-9f33-7f1149e316dc" done
```

**Step 2: Check if task after command**
```bash
# Immediately after completing
node cli.js show "e597c115-40d8-46c2-9f33-7f1149e316dc"
# If it shows "done", then system worked
# If it shows "todo", then something failed

# Check the JSON file
cat tasks.json | jq '.[] | select(.id == "e597c115-40d8-46c2-9f33-7f1149e316dc")'
```

**Step 3: Add logging to trace**
```javascript
// In app.js updateTaskStatus()
updateTaskStatus(taskId, newStatusValue) {
  console.log('[TRACE] updateTaskStatus called with:', {taskId, newStatusValue});
  
  if (newStatusValue === TaskStatus.DONE) {
    const task = this.storage.getTask(taskId);
    console.log('[TRACE] Retrieved from storage:', {
      taskFound: !!task,
      currentStatus: task?.status,
      taskId: task?.id
    });
    
    if (task) {
      task.markAsDone();
      console.log('[TRACE] After markAsDone:', {
        status: task.status,
        completedAt: task.completedAt
      });
      this.storage.save();
      console.log('[TRACE] After save()');
      return true;
    }
  }
  return false;
}
```

---

## Scenario 3: "error: .markAsDone is not a function"

### Symptoms
```
TypeError: task.markAsDone is not a function
at TaskManager.updateTaskStatus
```

### Diagnosis
```
Task object is malformed. Missing markAsDone method.
Likely cause: Deserialization bug in storage.load()
```

### Debug Steps

**Step 1: Check storage.load() reconstruction**
```javascript
// In storage.js load() method
load() {
  // ... read file ...
  tasksData.forEach(taskData => {
    // ⚠️ CRITICAL: Must instantiate new Task() not just assign object
    const task = new Task(taskData.title, taskData.description);
    // Then restore properties:
    task.id = taskData.id;
    task.status = taskData.status;
    // ... etc ...
    
    // ❌ DON'T DO: this.tasks[taskId] = taskData;
    // ✅ DO: this.tasks[taskId] = task;
  });
}
```

**Step 2: Verify task is instance of Task**
```javascript
const task = storage.getTask(taskId);
console.log('Is Task?', task instanceof Task);
console.log('Has markAsDone?', typeof task.markAsDone);
console.log('Task keys:', Object.keys(task));
console.log('Object proto:', Object.getPrototypeOf(task).constructor.name);
```

---

## Scenario 4: "completedAt Is Null After Marking Done"

### Symptoms
```bash
node cli.js status abc123 done
# Shows: "Updated task status to done"

node cli.js show abc123
# Shows: status = [✓] done, completedAt = (empty)
```

### Diagnosis
```
markAsDone() was not called (generic updateTask path used)
```

### Debug Steps

**Step 1: Check the condition**
```javascript
// In app.js
if (newStatusValue === TaskStatus.DONE) {
  console.log('[DEBUG] Condition check:', {
    newStatusValue,
    TaskStatus.DONE,
    areEqual: newStatusValue === TaskStatus.DONE,
    typeOf_newStatusValue: typeof newStatusValue,
    typeOf_TaskStatus: typeof TaskStatus.DONE
  });
  // ... semantic path ...
} else {
  console.log('[DEBUG] Taking generic path (NOT semantic)');
  // This should NOT be printed for 'done'
}
```

**Step 2: Verify comparison**
```javascript
// Test in isolation
const TaskStatus = { DONE: 'done' };
console.log('done' === TaskStatus.DONE);  // Should be true
console.log('DONE' === TaskStatus.DONE);  // Should be false

// Check if case mismatch
console.log('done'.toLowerCase() === TaskStatus.DONE);  // true
```

**Step 3: Check what's actually passed**
```bash
# Explicitly log what CLI receives
# In cli.js status command handler
.action((taskId, status) => {
  console.log('[CLI] Exact status value:', JSON.stringify(status));
  console.log('[CLI] Status type:', typeof status);
  // ...
});

# Run:
node cli.js status abc123 done
# Output: [CLI] Exact status value: "done"
#         [CLI] Status type: string
```

---

## Testing the Flow: Three Levels

### Level 1: Unit Test (Model)

```javascript
test('markAsDone sets status and captures completedAt', () => {
  const task = new Task('Test', 'test');
  
  // Before
  assert.equal(task.status, 'todo');
  assert.equal(task.completedAt, null);
  
  // Act
  const beforeTime = new Date();
  task.markAsDone();
  const afterTime = new Date();
  
  // After
  assert.equal(task.status, 'done');
  assert.notEqual(task.completedAt, null);
  assert.ok(task.completedAt >= beforeTime);
  assert.ok(task.completedAt <= afterTime);
  assert.equal(task.completedAt, task.updatedAt);
});
```

**Run:**
```bash
npm test -- tests/task.test.js --testNamePattern="markAsDone"
```

---

### Level 2: Integration Test (Business Logic)

```javascript
test('updateTaskStatus("done") calls markAsDone and saves', () => {
  const manager = new TaskManager();
  
  // Create
  const taskId = manager.createTask('Test');
  const before = manager.getTaskDetails(taskId);
  assert.equal(before.status, 'todo');
  assert.equal(before.completedAt, null);
  
  // Update to done
  const success = manager.updateTaskStatus(taskId, 'done');
  
  // Verify return
  assert.equal(success, true);
  
  // Verify in-memory
  const after = manager.getTaskDetails(taskId);
  assert.equal(after.status, 'done');
  assert.notEqual(after.completedAt, null);
  
  // Verify on-disk (create new manager, should load state)
  const manager2 = new TaskManager();
  const reloaded = manager2.getTaskDetails(taskId);
  assert.equal(reloaded.status, 'done');
  assert.notEqual(reloaded.completedAt, null);
});
```

**Run:**
```bash
npm test -- tests/taskManager.test.js --testNamePattern="updateTaskStatus"
```

---

### Level 3: End-to-End Test (CLI)

```bash
#!/bin/bash
# test-completion-e2e.sh

# Cleanup
rm -f test-tasks.json

# Create task
echo "1. Creating task..."
OUT=$(node cli.js create "E2E Test" | grep -oE "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
TASK_ID=$OUT

echo "Task ID: $TASK_ID"

# Verify created
echo "2. Verifying created..."
node cli.js show $TASK_ID | grep -q "todo" && echo "✓ Created as todo"

# Mark done
echo "3. Marking done..."
node cli.js status $TASK_ID done

# Verify in CLI
echo "4. Verifying in CLI..."
node cli.js show $TASK_ID | grep -q "done" && echo "✓ Shows done in CLI"

# Verify in JSON
echo "5. Verifying in JSON..."
cat test-tasks.json | jq ".[] | select(.id == \"$TASK_ID\" | .status )" | grep -q "done" && echo "✓ Shows done in JSON"

# Verify completedAt set
echo "6. Verifying completedAt..."
cat test-tasks.json | jq ".[] | select(.id == \"$TASK_ID\") | .completedAt" | grep -q "[0-9]" && echo "✓ completedAt is set"

echo "✅ All E2E tests passed!"
```

---

## Failure Point Validation Tests

### Test: Invalid Status Should Be Rejected

```javascript
test('updateTaskStatus rejects invalid status values', () => {
  const manager = new TaskManager();
  const taskId = manager.createTask('Test');
  
  // These should fail
  const invalid = [
    'DONE',           // Wrong case
    'Done',           // Wrong case
    'finished',       // Not a valid status
    '',               // Empty
    'todo,done',      // Multiple values
  ];
  
  invalid.forEach(status => {
    console.log('Testing:', status);
    const success = manager.updateTaskStatus(taskId, status);
    
    // Current code: ❌ Actually allows it (BUG!)
    // Should be:    ✅ assert.equal(success, false);
  });
});
```

**This test will FAIL because the system doesn't validate!**

---

### Test: Disk Write Failure Should Rollback

```javascript
test('If save() fails, in-memory state should rollback', () => {
  const manager = new TaskManager();
  const taskId = manager.createTask('Test');
  
  // Intercept fs.writeFileSync to simulate failure
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = () => {
    throw new Error('Disk full');
  };
  
  try {
    const success = manager.updateTaskStatus(taskId, 'done');
    
    // Current code: ❌ Returns false but state is corrupted (BUG!)
    // Should be:    ✅ Rolls back and returns false
    
    const task = manager.getTaskDetails(taskId);
    assert.equal(task.status, 'todo');    // Should still be todo
    assert.equal(task.completedAt, null); // Should still be null
  } finally {
    fs.writeFileSync = originalWrite;
  }
});
```

**This test will FAIL because there's no rollback!**

---

## State Consistency Checks

### Check 1: Memory vs Disk Sync

```javascript
function validateSync(manager) {
  const inMemory = manager.storage.tasks;
  const onDisk = JSON.parse(fs.readFileSync('tasks.json'));
  
  const inMemoryKeys = new Set(Object.keys(inMemory));
  const onDiskIds = new Set(onDisk.map(t => t.id));
  
  // Check: All in-memory tasks on disk
  for (let id of inMemoryKeys) {
    if (!onDiskIds.has(id)) {
      console.error('❌ SYNC ERROR: Task', id, 'in memory but not on disk');
      return false;
    }
  }
  
  // Check: All on-disk tasks in memory
  for (let id of onDiskIds) {
    if (!inMemoryKeys.has(id)) {
      console.error('❌ SYNC ERROR: Task', id, 'on disk but not in memory');
      return false;
    }
  }
  
  console.log('✅ Memory and disk are in sync');
  return true;
}

// Usage
const manager = new TaskManager();
manager.createTask('Test');
manager.updateTaskStatus(taskId, 'done');
validateSync(manager);
```

---

### Check 2: Invariant Validation

```javascript
function validateInvariants(manager) {
  const tasks = manager.storage.getAllTasks();
  let violations = 0;
  
  tasks.forEach(task => {
    // Invariant 1: If status=done, completedAt must be set
    if (task.status === 'done' && task.completedAt === null) {
      console.error('❌ INVARIANT VIOLATION: Task', task.id, 'is done but completedAt is null');
      violations++;
    }
    
    // Invariant 2: If completedAt is set, status must be done
    if (task.completedAt !== null && task.status !== 'done') {
      console.error('❌ INVARIANT VIOLATION: Task', task.id, 'has completedAt but status is not done');
      violations++;
    }
    
    // Invariant 3: updatedAt >= createdAt
    if (task.updatedAt < task.createdAt) {
      console.error('❌ INVARIANT VIOLATION: Task', task.id, 'has updatedAt before createdAt');
      violations++;
    }
    
    // Invariant 4: completedAt >= createdAt (if set)
    if (task.completedAt !== null && task.completedAt < task.createdAt) {
      console.error('❌ INVARIANT VIOLATION: Task', task.id, 'has completedAt before createdAt');
      violations++;
    }
  });
  
  if (violations === 0) {
    console.log('✅ All invariants satisfied');
  } else {
    console.log(`❌ ${violations} invariant violation(s) detected`);
  }
  return violations === 0;
}

// Usage
const manager = new TaskManager();
manager.createTask('Test 1');
manager.createTask('Test 2');
manager.updateTaskStatus(id1, 'done');
validateInvariants(manager);
```

---

## Comparison: Semantic vs Generic Approach Test

```javascript
test('Semantic markAsDone ensures completedAt; generic approach does not', () => {
  // Approach 1: SEMANTIC (Current implementation)
  const task1 = new Task('Semantic');
  task1.markAsDone();
  assert.equal(task1.status, 'done');
  assert.notEqual(task1.completedAt, null);  // ✅ Guaranteed!
  
  // Approach 2: GENERIC (What could happen)
  const task2 = new Task('Generic');
  task2.status = 'done';  // ← Developer forgets completedAt
  assert.equal(task2.status, 'done');
  assert.equal(task2.completedAt, null);  // ❌ Oops!
  
  // Later code breaks:
  // getStatistics() assumes completedAt is populated
  // isOverdue() may malfunction
  // Time-based queries fail
  
  console.log('✅ Semantic method enforces correctness');
});
```

---

## Summary: Testing Strategy

| Level | What to Test | Tool | Run |
|-------|---|---|---|
| **Unit** | `markAsDone()` behavior | Jest | `npm test -- testNamePattern="markAsDone"` |
| **Integration** | `updateTaskStatus()` flow | Jest | `npm test -- testNamePattern="updateTaskStatus"` |
| **E2E** | CLI to JSON | Bash script | `./test-completion-e2e.sh` |
| **Invariant** | State consistency | Manual validation | `validateInvariants(manager)` |
| **Failure** | Error handling | Jest + mock | Mock fs.writeFileSync |
| **Sync** | Memory vs disk | Manual check | `validateSync(manager)` |

---

## When You're Lost: Decision Tree

```
Is the task showing as done?
  ├─ YES
  │  └─ Check JSON file
  │     ├─ JSON shows done
  │     │  └─ ✅ System works! (CLI and file in sync)
  │     └─ JSON shows todo
  │        └─ ❌ Save failed (sync problem)
  │
  └─ NO
     └─ Check if ID is correct
        ├─ ID correct, task exists
        │  └─ Check updateTaskStatus return value
        │     ├─ Returns true
        │     │  └─ ❌ Not saved to disk (in-memory only)
        │     └─ Returns false
        │        └─ ❌ Task not found OR invalid status
        └─ ID wrong / task doesn't exist
           └─ Verify with: node cli.js list
```
