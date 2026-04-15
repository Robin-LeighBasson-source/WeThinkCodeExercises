
/**
 * Calculates a composite importance score for a task based on multiple factors.
 * 
 * This function implements a weighted multi-factor scoring system that combines:
 * priority level, due date urgency, task status, special tags, and recent activity
 * to produce a single numerical score. Higher scores indicate higher priority.
 *
 *
 * BUSINESS PHILOSOPHY:
 * The scoring hierarchy follows: Priority (base ×10) > Due Date Adjustments > Status & Tags
 * This design prioritizes explicit priority levels while allowing time pressure and special
 * tags to provide context-based adjustments. The function optimizes for IMMEDIATE TACTICAL
 * URGENCY rather than strategic long-term business value.
 *
 *
 * @param {Object} task - The task object to score
 * @param {string} task.priority - Priority level from TaskPriority enum (LOW, MEDIUM, HIGH, URGENT)
 * @param {string} [task.dueDate] - ISO 8601 date string or Date object; optional
 * @param {string} task.status - Task status from TaskStatus enum (e.g., IN_PROGRESS, DONE, REVIEW)
 * @param {Array<string>} task.tags - Array of tag strings; may contain "blocker", "critical", "urgent"
 * @param {string|Date} task.updatedAt - ISO 8601 date string or Date object of last update
 *
 *
 * @returns {number} Composite importance score. Typically ranges from -50 (completed high-priority 
 *                   task) to 60+ (urgent overdue blocker updated today). Used for task ranking/sorting.
 *                   Negative scores indicate deprioritized tasks (e.g., DONE status).
 *
 *
 * MAGIC NUMBERS EXPLAINED:
 *
 * Priority Base (×10):
 *   - LOW: 1 × 10 = 10 points
 *   - MEDIUM: 2 × 10 = 20 points
 *   - HIGH: 3 × 10 = 30 points
 *   - URGENT: 4 × 10 = 40 points
 *   INTENT: Priority is the foundation; everything else is adjustment. Even a LOW task with every
 *   bonus (+30 +8 +5 = +43) maxes out at 53, barely beating a baseline URGENT task (40).
 *
 *
 * Due Date Urgency Bonuses:
 *   - Overdue (daysUntilDue < 0): +30 points
 *   - Due Today (daysUntilDue === 0): +20 points
 *   - Due in 1-2 days (daysUntilDue <= 2): +15 points
 *   - Due within week (daysUntilDue <= 7): +10 points
 *   INTENT: "All overdue tasks equally urgent; prevents 100-day-old tasks from accumulating massive
 *   penalties." Recent deadlines are urgency signals, not absolute scorers.
 *
 *
 * Status Penalties:
 *   - DONE: -50 points
 *   - REVIEW: -15 points
 *   INTENT: "Done tasks are not your problem anymore. Waiting on review is lower priority than
 *   active work." A completed task can end up with negative scores (e.g., completed HIGH task:
 *   30 + adjustments - 50 = negative), signaling removal from active focus.
 *
 *
 * Special Tag Bonus:
 *   - Contains "blocker", "critical", or "urgent": +8 points
 *   INTENT: "Tags provide context but don't override priority." The +8 is small relative to
 *   priority differences (10 points per priority level), so a tagged LOW task won't beat an
 *   untagged MEDIUM task. Applied if ANY tag matches the list.
 *
 *
 * Recency Bonus:
 *   - Updated within 24 hours (daysSinceUpdate < 1): +5 points
 *   INTENT: "Recently touched tasks = active, relevant work. Encourages continuous engagement."
 *   Creates an activity signal: developers who update tasks frequently see them ranked higher.
 *
 *
 * @example
 * const task = {
 *   priority: TaskPriority.HIGH,
 *   dueDate: new Date('2026-04-17'),
 *   status: TaskStatus.IN_PROGRESS,
 *   tags: ['blocker'],
 *   updatedAt: new Date()
 * };
 * 
 * const score = calculateTaskScore(task); // Returns approximately 58
 * Calculation: (3 × 10) + 15 + 0 + 8 + 5 = 58


 * TIMING & EVOLUTION:
 * Task scoring is time-dependent and changes dynamically:
 *
 *   Day 1 (created, due in 7 days):      (2 × 10) + 10 = 30
 *   Day 5 (now due in 2 days):           (2 × 10) + 15 = 35  [+5 urgency increase]
 *   Day 8 (now 2 days overdue):          (2 × 10) + 30 = 50  [+20 time pressure]
 *   Day 8 (marked DONE):                 (2 × 10) + 30 - 50 = -10  [removed from queue]
 *
 * This time-dependency means scores are only valid at the moment of calculation.
 * Scores will change daily without any task modifications.
 *
 *
 * @note CRITICAL DESIGN CONSIDERATION - THE RECENCY TRAP:
 * The +5 bonus for tasks updated within 24 hours creates a GAMEABLE SYSTEM.
 * 
 * A developer could artificially inflate task scores by:
 *   - Adding meaningless updates every 23 hours
 *   - Adjusting tags without functional changes
 *   - Re-commenting code to trigger "recent update" signals
 * 
 * This bonus was likely intended to identify actively worked tasks, but it rewards
 * FREQUENCY OF UPDATES over COMPLETION PROGRESS. If your team has competitive
 * prioritization or gamified workflows, this creates perverse incentives.
 * 
 * Consider whether this +5 bonus serves your actual goals, or if it should be tied to
 * commits/PRs/completions instead of arbitrary "updatedAt" timestamps.
 *
 *
 * @note TIME-DEPENDENT BEHAVIOR:
 * This function relies on the current system time. Calculations assume the system clock
 * is accurate. If your application:
 *   - Runs across multiple timezones (use UTC for dueDate and updatedAt)
 *   - Uses mocked or frozen time in tests (pass actual timestamps, not relative dates)
 *   - Caches scores (remember they expire after 24 hours for recency bonuses)
 * 
 * Scores are NOT cached—each call recalculates all Date math. For 1000+ tasks,
 * consider caching with a TTL (time-to-live) or batch sorting.
 *
 *
 * @note Edge Cases:
 *   - Tasks with no dueDate skip all time-based bonuses (added score = 0 from timing)
 *   - DONE tasks get -50 penalty AFTER all additions; final score can be negative
 *   - Tasks updated 23 hours 59 minutes ago get 0 bonus; updated 1 hour ago get +5
 *   - Overdue by 1 day = +30; overdue by 365 days = +30 (no escalation)
 *   - daysSinceUpdate uses Math.floor(); a task updated 2 seconds ago counts as 0 days
 *   - Tag matching is case-sensitive; "Blocker" ≠ "blocker"
 *
 *
 * @note Performance: O(1) time complexity. Creates 2-3 new Date objects per call.
 * For large task arrays, consider sorting once rather than recalculating per element.
 *
 */
function calculateTaskScore(task) {
  // ... function body
}
