1. High-Level Architecture Overview
The Task Manager follows a Layered Architecture pattern. This ensures that the code is modular and easy to maintain.

The CLI Layer: Handles user commands and raw input parsing. It never touches the database directly.

The Business Logic Layer (TaskManager): The "brain" of the app. It validates data and orchestrates complex operations like the prioritization we analyzed.

The Domain Model: Defines the "Task" object and the specific rules (the Scoring Algorithm) that govern it.

The Persistence Layer: Manages the tasks.json file. It ensures that even if the app crashes, the state of the tasks is saved.

2. How Key Features Work
Task Creation: Uses a "Constructor" pattern to ensure every task starts with a unique ID, a "TODO" status, and a valid timestamp.

Prioritization: Uses a Weighted Additive Scoring Model. It doesn't just look at one number; it looks at the "Context" (deadlines and tags) to determine what actually needs attention right now.

Task Completion: Implements a Status Penalty (-50). This effectively acts as a "Circuit Breaker" to move completed tasks to the bottom of the list without deleting them from the system.

3. Interesting Design Pattern: Semantic Scoring
The most interesting approach I discovered was Semantic Scoring.

Instead of simple "if-else" sorting, the developers used "Magic Numbers" that have specific meanings.

For example, the -50 penalty for a finished task is intentionally larger than the +40 points of an Urgent task.

This is a mathematical way to ensure that "Done" always beats "Urgent," which is a clever way to handle complex sorting logic without writing deeply nested loops.

4. Challenges and AI Insights
The Challenge: The hardest part to grasp was the Time-Dependency. I originally thought a task's priority was a fixed value.

The AI Prompt Benefit: By using the "Business Intent" prompt, the AI helped me see that the score "ages." As a deadline gets closer, the code automatically increases the score.

The AI also pointed out the "Recency Trap"—where the +5 activity bonus could be gamed by developers making tiny, useless updates just to keep their tasks at the top. This was an insight I never would have found just by looking at the syntax.

5. Final Learning Point
The most valuable thing I learned is that Documentation is part of the code.

Writing a function that works is only 50% of the job; explaining the "Why" behind the "Magic Numbers" is what makes the code maintainable for a team.

Using AI as a "Senior Pair Programmer" allowed me to see the code through the eyes of an architect, rather than just a coder.