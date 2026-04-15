// utils/sorting.js
const { calculateImportanceScore } = require('./scoring');

/**
 * Sorts tasks using the Schwartzian Transform pattern (Map-Sort-Map).
 * This avoids recalculating scores on every comparison.
 * 
 * Pattern:
 * 1. Map: Attach pre-calculated score to each task
 * 2. Sort: Sort by score property
 * 3. Map: Extract just the task objects
 */

/**
 * Sort by importance score (dynamic, calculated on-the-fly)
 * Higher scores appear first.
 */
function sortByImportance(tasks) {
  return tasks
    .map(task => ({
      task,
      score: calculateImportanceScore(task).totalScore
    }))
    .sort((a, b) => {
      // Primary sort: descending by score
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker 1: base priority (highest first)
      if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
      // Tiebreaker 2: due date (earliest first)
      if (a.task.dueDate && b.task.dueDate) {
        return new Date(a.task.dueDate) - new Date(b.task.dueDate);
      }
      if (b.task.dueDate) return -1; // b has due date, a doesn't
      if (a.task.dueDate) return 1;  // a has due date, b doesn't
      // Tiebreaker 3: creation date (oldest first)
      return new Date(a.task.createdAt) - new Date(b.task.createdAt);
    })
    .map(item => item.task);
}

/**
 * Sort by base priority (user-defined)
 * Higher priority values appear first.
 */
function sortByPriority(tasks) {
  return tasks
    .slice() // shallow copy to avoid mutating original
    .sort((a, b) => {
      // Primary sort: by priority (highest first)
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Tiebreaker: by creation date (oldest first)
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

/**
 * Sort by due date
 * Earliest deadlines appear first.
 */
function sortByDeadline(tasks) {
  return tasks
    .slice()
    .sort((a, b) => {
      // Tasks with due dates come first
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (!a.dueDate && !b.dueDate) {
        // Both have no due date: sort by creation date
        return new Date(a.createdAt) - new Date(b.createdAt);
      }
      // Both have due dates: sort by earliest first
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
}

/**
 * Sort by creation date (newest first)
 */
function sortByNewest(tasks) {
  return tasks
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Sort by creation date (oldest first)
 */
function sortByOldest(tasks) {
  return tasks
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Map of sort strategy names to sort functions
 */
const sortStrategies = {
  importance: sortByImportance,
  priority: sortByPriority,
  deadline: sortByDeadline,
  newest: sortByNewest,
  oldest: sortByOldest
};

/**
 * Apply a sort strategy to tasks
 * @param {Array} tasks - Array of task objects
 * @param {String} strategyName - Name of the sort strategy
 * @returns {Array} Sorted tasks
 * @throws {Error} If strategy name is invalid
 */
function applySortStrategy(tasks, strategyName = 'importance') {
  if (!sortStrategies[strategyName]) {
    throw new Error(`Unknown sort strategy: ${strategyName}`);
  }
  return sortStrategies[strategyName](tasks);
}

module.exports = {
  sortByImportance,
  sortByPriority,
  sortByDeadline,
  sortByNewest,
  sortByOldest,
  sortStrategies,
  applySortStrategy
};
