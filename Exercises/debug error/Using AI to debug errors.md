Error Analysis: Variable Shadowing in JavaScript
Error Description
The application suffered from a logic error where the user interface failed to update after adding a task. While the console showed the task being created, the global state remained unchanged. This is known as a "silent failure" because the code doesn't crash, it simply targets the wrong data.

Root Cause Identification
The root cause was Variable Shadowing. Inside the addTask function, the code used let tasks = ....

Global Scope: There is an array called tasks that the whole app uses.

Local Scope: The let keyword inside the function created a new variable also named tasks.

The Conflict: JavaScript prioritized the local version. The new task was added to a temporary "shadow" variable that disappeared once the function finished, leaving the global array empty.

Suggested Solution
Remove Redeclaration: Remove the let keyword before tasks inside the function.

Use Descriptive Naming: Rename the local variable to newTask to clearly distinguish a single object from the global array collection.

Target Global State: Use tasks.push(newTask) to ensure the data is added to the global array that the rest of the application monitors.

Corrected Code Snippet:

JavaScript
function addTask(taskName) {
  const newTask = { id: Date.now(), name: taskName, completed: false };
  tasks.push(newTask); // Correctly targets the global array
  displayTasks();
}
Learning Points
Naming Clarity: Use plural names for arrays (tasks) and singular names for individual items (task or newTask) to prevent accidental shadowing.

Scope Awareness: Understand that let and const create a new scope. If you intend to update an existing variable, do not use a declaration keyword.

Defensive Logging: When debugging "missing data," always log the length of your global array (console.log(tasks.length)) to see if the data is actually making it into the central store.

Reflection Questions
1. How did the AI’s explanation compare to documentation you found online?
Standard documentation defines shadowing as a concept, but the AI showed the operational impact. It explained why the console.log worked (it was looking at the local bubble) while the UI failed (it was looking at the global bubble). This context made the theory much easier to visualize.

2. What aspects of the error would have been difficult to diagnose manually?
The fact that the code was syntactically perfect meant no red error messages appeared in the console. Without knowing about scope shadowing, I might have wasted hours trying to "fix" the displayTasks function, assuming the UI rendering was broken rather than the data source.

3. How would you modify your code to provide better error messages in the future?
I would avoid using global variables where possible. By encapsulating the tasks in a Class or a State Object, it becomes much harder to accidentally shadow the data. I would also add a "State Guard" that alerts me if a function runs but the total task count doesn't increase.

4. Did the AI help you understand not just the fix, but the underlying concepts?
Yes. It taught me about the Scope Chain. I now understand that JavaScript looks for a variable name starting from the most immediate "inner" scope and moves outward. Knowing this hierarchy helps me predict how my variables will behave in nested functions.