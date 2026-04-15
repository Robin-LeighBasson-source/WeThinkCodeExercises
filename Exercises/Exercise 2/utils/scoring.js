// utils/scoring.js

/**
 * Calculates an importance score for a task based on multiple factors.
 * 
 * Returns an object with:
 * - totalScore: The calculated importance score
 * - factors: Breakdown of each factor's contribution
 * 
 * @param {Object} task - The task object to score
 * @returns {Object} { totalScore: number, factors: Object }
 */
function calculateImportanceScore(task) {
  // 1. Calculate base priority (default to 1 if missing)
  const basePriority = task.priority || 1;
  const baseScore = basePriority * 20;

  // Initialize factors breakdown
  let factors = {
    base: baseScore,
    status: 0,
    overdue: 0,
    tags: 0,
    recency: 0
  };

  // 2. Calculate recency bonus FIRST (before circuit breaker)
  // This ensures recently completed tasks can still rank higher
  if (task.updatedAt) {
    try {
      const now = new Date();
      const updated = new Date(task.updatedAt);
      const diffMs = now - updated;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 1) {
        factors.recency = 5;
      }
    } catch (e) {
      factors.recency = 0;
    }
  }

  // 3. Status penalty
  if (task.status === 'done') {
    factors.status = -50;
  } else if (task.status === 'review') {
    factors.status = -15;
  } else {
    factors.status = 0;
  }

  // 4. Circuit breaker: DONE tasks don't get overdue or tag bonuses
  if (task.status === 'done') {
    // Skip overdue and tag bonuses
    // But keep recency and status penalty
    let totalScore = factors.base + factors.status + factors.recency;
    return { totalScore, factors };
  }

  // 5. Overdue logic (only for non-done tasks)
  if (task.dueDate) {
    try {
      const now = new Date();
      const due = new Date(task.dueDate);

      // Calculate difference in days
      // Set both times to midnight for accurate day comparison
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

      const diffMs = dueDate - nowDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 0) {
        // Overdue
        factors.overdue = 30;
      } else if (diffDays === 0) {
        // Due today
        factors.overdue = 20;
      } else if (diffDays <= 2) {
        // Due in 1-2 days
        factors.overdue = 15;
      } else if (diffDays <= 7) {
        // Due in 3-7 days
        factors.overdue = 10;
      } else {
        // Due in 8+ days
        factors.overdue = 0;
      }
    } catch (e) {
      // Fail gracefully on date parsing error
      factors.overdue = 0;
    }
  }

  // 6. Tag logic (only for non-done tasks)
  if (task.tags && Array.isArray(task.tags)) {
    if (task.tags.includes('blocker') || task.tags.includes('critical')) {
      factors.tags = 8;
    } else {
      factors.tags = 0;
    }
  } else {
    factors.tags = 0;
  }

  // 7. Calculate final total
  let totalScore = factors.base + factors.status + factors.overdue + factors.tags + factors.recency;

  return { totalScore, factors };
}

module.exports = { calculateImportanceScore };
