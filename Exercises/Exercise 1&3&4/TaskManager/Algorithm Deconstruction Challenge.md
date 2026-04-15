EXERCISE: DECIPHERING COMPLEX ALGORITHMS
1. ALGORITHM PURPOSE & GUIDING LOGIC
This algorithm implements a Weighted Additive Scoring Model.

Its primary goal is to take a static task object and calculate a "Dynamic Importance Score."

This allows the application to rank tasks not just by what the user said was important (Priority), but by what is actually urgent based on current time and metadata.

2. BREAKDOWN OF KEY SECTIONS
Section A: Base Weighting
Converts the TaskPriority enum into a numeric base (10, 20, 30, or 40). This ensures the user's initial intent is the foundation of the score.

Section B: Temporal Urgency (The Deadline Factor)
Uses date math to compare the current time against the dueDate. It applies a "bonus" that increases as the deadline nears, capping at +30 for overdue tasks.

Section C: Status Circuit-Breakers
Applies heavy penalties for tasks in DONE (-50) or REVIEW (-15). This ensures that completed work "falls off" the top of the list regardless of its initial priority.

Section D: Semantic Boosting (Tags)
Looks for specific high-value strings like "blocker" or "critical" to provide a flat +8 boost.

Section E: Engagement Bonus (Recency)
Adds +5 points if the task was updated within the last 24 hours, favoring active tasks over stagnant ones.

3. EXAMPLE EXECUTION WALKTHROUGH
The Scenario:
A MEDIUM priority task (2), due today, marked as IN_PROGRESS, containing a "critical" tag, and updated today.

Base Priority: MEDIUM (2) * 10 = 20

Urgency: Due today = +20

Status: IN_PROGRESS = +0

Tags: Contains "critical" = +8

Recency: Updated today = +5

FINAL SCORE: 53

By comparison, a HIGH priority task (30 pts) that has no deadline and no tags would only score a 30, meaning our Medium task correctly outranks it due to its immediate urgency.

4. DESIGN PATTERNS & PRINCIPLES
Separation of Concerns: The data (Task object) is separated from the policy (Scoring Function). You can change the "rules" of the system without changing the data.

Deterministic Sorting: By returning a single integer, the sorting function can use a standard comparison (b - a) to create a stable, descending list of tasks.

Idempotency: The function is "pure"—given the same task and the same "current time," it will always produce the exact same score.

5. INSIGHTS & LEARNING POINTS
Insight 1: Weight Hierarchy
I discovered that the -50 penalty for being "Done" is the most powerful weight in the system. It is purposefully larger than the highest possible base priority (40), ensuring that completion is the ultimate de-prioritizer.

Insight 2: Performance Optimization
I learned about the Schwartzian Transform. In a large system, calculating these scores inside a sort loop is inefficient. A better approach is to calculate the scores once, store them, and then sort the results.

Insight 3: Date Math Precision
Using Math.ceil is essential in date calculations to ensure that a task due in 2 hours isn't rounded down to "zero days" and accidentally treated as "overdue" or "already past."

6. SELF-TEST QUESTIONS
Question 1: Why use penalties instead of filters?
Using penalties (-50) allows completed tasks to still exist in the list but stay at the bottom, whereas filtering would remove them entirely, making it impossible to see "Recently Completed" tasks in the same view.

Question 2: What is the "Recency" trap?
If a task is updated constantly but never actually progressed, it could stay at the top of the list purely because of the +5 recency bonus, potentially masking older, more important tasks.