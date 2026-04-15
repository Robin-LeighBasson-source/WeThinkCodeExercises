// tests/scoring.test.js
const { calculateImportanceScore } = require('../utils/scoring');

describe('calculateImportanceScore', () => {
  // ============================================
  // TEST SUITE 1: Base Priority Calculation
  // ============================================
  describe('Base Priority Calculation', () => {
    test('Priority 1 (LOW) calculates base score of 20', () => {
      const task = { priority: 1, status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.base).toBe(20);
    });

    test('Priority 2 (MEDIUM) calculates base score of 40', () => {
      const task = { priority: 2, status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.base).toBe(40);
    });

    test('Priority 3 (HIGH) calculates base score of 60', () => {
      const task = { priority: 3, status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.base).toBe(60);
    });

    test('Priority 4 (URGENT) calculates base score of 80', () => {
      const task = { priority: 4, status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.base).toBe(80);
    });

    test('Missing priority defaults to 1 (base = 20)', () => {
      const task = { status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.base).toBe(20);
    });
  });

  // ============================================
  // TEST SUITE 2: Status Penalties
  // ============================================
  describe('Status Penalties', () => {
    test('TODO status receives status factor of 0', () => {
      const task = { priority: 2, status: 'todo', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.status).toBe(0);
    });

    test('IN_PROGRESS status receives status factor of 0', () => {
      const task = { priority: 2, status: 'in_progress', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.status).toBe(0);
    });

    test('REVIEW status receives status penalty of -15', () => {
      const task = { priority: 2, status: 'review', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.status).toBe(-15);
    });

    test('DONE status receives status penalty of -50', () => {
      const task = { priority: 2, status: 'done', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.status).toBe(-50);
    });
  });

  // ============================================
  // TEST SUITE 3: Overdue Logic
  // ============================================
  describe('Overdue Logic', () => {
    test('Task with no dueDate receives 0 overdue bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(0);
    });

    test('Task overdue by 1+ days receives +30 bonus', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const task = { priority: 2, status: 'todo', dueDate: yesterday, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(30);
    });

    test('Task due today receives +20 bonus', () => {
      const today = new Date();
      today.setHours(23, 59, 59); // Make sure it's still today
      const task = { priority: 2, status: 'todo', dueDate: today, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(20);
    });

    test('Task due in 1-2 days receives +15 bonus', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const task = { priority: 2, status: 'todo', dueDate: tomorrow, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(15);
    });

    test('Task due in 3-7 days receives +10 bonus', () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 5);
      const task = { priority: 2, status: 'todo', dueDate: nextWeek, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(10);
    });

    test('Task due in 8+ days receives 0 overdue bonus', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const task = { priority: 2, status: 'todo', dueDate: future, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(0);
    });

    test('Corrupted dueDate (invalid string) fails gracefully with 0 bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: 'not-a-date', tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(0);
    });
  });

  // ============================================
  // TEST SUITE 4: Tag Logic
  // ============================================
  describe('Tag Logic', () => {
    test('Task with no tags receives 0 tag bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(0);
    });

    test('Task with "blocker" tag receives +8 bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: ['blocker'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(8);
    });

    test('Task with "critical" tag receives +8 bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: ['critical'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(8);
    });

    test('Task with both "blocker" and "critical" receives +8 (not double counted)', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: ['blocker', 'critical'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(8);
    });

    test('Task with irrelevant tags receives 0 bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: ['bug', 'feature'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(0);
    });

    test('Missing tags property fails gracefully with 0 bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(0);
    });
  });

  // ============================================
  // TEST SUITE 5: Recency Logic
  // ============================================
  describe('Recency Logic', () => {
    test('Task updated today receives +5 recency bonus', () => {
      const now = new Date();
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [], updatedAt: now };
      const score = calculateImportanceScore(task);
      expect(score.factors.recency).toBe(5);
    });

    test('Task updated 1 day ago receives +5 recency bonus', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [], updatedAt: yesterday };
      const score = calculateImportanceScore(task);
      expect(score.factors.recency).toBe(5);
    });

    test('Task updated 2+ days ago receives 0 recency bonus', () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [], updatedAt: twoDaysAgo };
      const score = calculateImportanceScore(task);
      expect(score.factors.recency).toBe(0);
    });

    test('Missing updatedAt receives 0 recency bonus', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      expect(score.factors.recency).toBe(0);
    });
  });

  // ============================================
  // TEST SUITE 6: Circuit Breaker Logic (DONE Tasks)
  // ============================================
  describe('Circuit Breaker: DONE Task Behavior', () => {
    test('DONE task does NOT receive overdue bonus even if overdue', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const task = { priority: 4, status: 'done', dueDate: yesterday, tags: ['blocker'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.overdue).toBe(0);
      expect(score.factors.tags).toBe(0);
    });

    test('DONE task does NOT receive tag bonus even if tagged "blocker"', () => {
      const task = { priority: 4, status: 'done', dueDate: null, tags: ['blocker'] };
      const score = calculateImportanceScore(task);
      expect(score.factors.tags).toBe(0);
    });

    test('Recently DONE task DOES receive recency bonus', () => {
      const now = new Date();
      const task = { priority: 2, status: 'done', dueDate: null, tags: [], updatedAt: now };
      const score = calculateImportanceScore(task);
      expect(score.factors.recency).toBe(5);
    });

    test('Recently DONE tasks outrank old DONE tasks', () => {
      const now = new Date();
      const oldTime = new Date('2020-01-01');
      
      const recentDone = { priority: 2, status: 'done', dueDate: null, tags: [], updatedAt: now };
      const oldDone = { priority: 2, status: 'done', dueDate: null, tags: [], updatedAt: oldTime };
      
      const scoreRecent = calculateImportanceScore(recentDone);
      const scoreOld = calculateImportanceScore(oldDone);
      
      expect(scoreRecent.totalScore).toBeGreaterThan(scoreOld.totalScore);
    });
  });

  // ============================================
  // TEST SUITE 7: Weighting Scenarios
  // ============================================
  describe('Weighting & Prioritization Scenarios', () => {
    test('Overdue LOW task < Non-overdue URGENT task', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const overdueLow = { priority: 1, status: 'todo', dueDate: yesterday, tags: [] };
      const urgentFuture = { priority: 4, status: 'todo', dueDate: null, tags: [] };
      
      const scoreLow = calculateImportanceScore(overdueLow);
      const scoreUrgent = calculateImportanceScore(urgentFuture);
      
      expect(scoreLow.totalScore).toBeLessThan(scoreUrgent.totalScore);
    });

    test('Non-overdue URGENT task > Overdue MEDIUM task with blocker tag', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const urgentFuture = { priority: 4, status: 'todo', dueDate: null, tags: [] };
      const overdueBlocker = { priority: 2, status: 'todo', dueDate: yesterday, tags: ['blocker'] };
      
      const scoreUrgent = calculateImportanceScore(urgentFuture);
      const scoreOverdue = calculateImportanceScore(overdueBlocker);
      
      expect(scoreUrgent.totalScore).toBeGreaterThan(scoreOverdue.totalScore);
    });
  });

  // ============================================
  // TEST SUITE 8: Return Value Structure
  // ============================================
  describe('Return Value Structure', () => {
    test('Returns object with totalScore and factors', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      
      expect(score).toHaveProperty('totalScore');
      expect(score).toHaveProperty('factors');
    });

    test('factors contains all required keys', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      
      expect(score.factors).toHaveProperty('base');
      expect(score.factors).toHaveProperty('status');
      expect(score.factors).toHaveProperty('overdue');
      expect(score.factors).toHaveProperty('tags');
      expect(score.factors).toHaveProperty('recency');
    });

    test('totalScore equals sum of all factors', () => {
      const task = { priority: 2, status: 'todo', dueDate: null, tags: [] };
      const score = calculateImportanceScore(task);
      
      const expectedTotal = 
        score.factors.base + 
        score.factors.status + 
        score.factors.overdue + 
        score.factors.tags + 
        score.factors.recency;
      
      expect(score.totalScore).toBe(expectedTotal);
    });
  });
});
