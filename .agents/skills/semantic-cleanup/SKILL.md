---
name: semantic-cleanup
description: Remove low-information, redundant, verbose, or meaningless wording from code comments, docstrings, descriptions, documentation, UI copy, and developer-facing text. Use when asked to clean up noise, remove unnecessary explanations, shorten descriptions, or improve information density without changing code behavior. Do not use for deleting functional code or performing general refactors.
---

# Semantic Cleanup

Improve information density by removing text that contributes no meaningful information. Prefer deletion to paraphrasing when the surrounding code or context already communicates the same thing.

## Scope

- Code comments and docstrings, including Dart, TypeScript, JavaScript, Python, SQL, and other repository languages.
- README files, Markdown documents, developer documentation, configuration descriptions, and generated explanations when they are editable source material.
- UI labels, helper text, error messages, tooltips, and descriptions only when meaning is preserved and clarity improves.
- Existing code **only for incidental whitespace** necessary after removing comments. Do not change executable logic, names, public APIs, schemas, tests, or behavior unless explicitly asked.

## Procedure

1. Determine the requested scope (selection, file, directory, or repository). If not specified, restrict edits to files relevant to the current task; do not recursively rewrite the whole repository by default.
2. Read surrounding code or text before editing. Understand who reads it and whether it contains non-obvious constraints.
3. Classify each candidate as `REMOVE`, `SHORTEN`, or `KEEP`:
   - `REMOVE`: repeats an identifier or obvious implementation; narrates line-by-line mechanics; generic filler; empty introductions/conclusions; decorative headings; comments that no longer match code; redundant descriptions.
   - `SHORTEN`: useful information buried in repetition, hedging, inflated language, or unnecessary examples. Preserve the actionable fact.
   - `KEEP`: rationale or tradeoffs, business rules, unusual edge cases, security/privacy constraints, compatibility requirements, invariants, units, state transitions, side effects, failure modes, accessibility guidance, meaningful examples, and externally required wording.
4. Edit directly and conservatively. When in doubt about an information-bearing statement, keep it. Never shorten at the expense of specificity, traceability, or correctness.
5. Inspect the diff. Revert incidental formatting churn or unrelated edits. Use existing formatters or checks only if they can run without creating unrelated changes.
6. Report briefly: files changed, general categories removed/shortened, and anything intentionally retained because it carried important meaning.

## Decision rules

- Ask: **What would a competent reader lose if this sentence disappeared?** If the answer is “nothing,” delete it.
- A comment is valuable when it explains **why**, a surprising **what**, or a constraint not obvious from code. Comments merely restating **how** are usually removable.
- Avoid filler such as “basically,” “simply,” “as you can see,” “it is important to note that,” “in order to,” or repetitive section summaries when they add nothing.
- Replace inflated text with direct language, e.g. “A boolean value indicating whether the sidebar is currently expanded” → “Whether the sidebar is expanded,” only if a description is needed at all.
- Preserve search-critical terminology, domain-specific names, protocol fields, legal text, user-visible semantics, and meaningful distinctions.
- Never mechanically strip all comments, all descriptions, or every short sentence. Evaluate semantic value in context.
- Do not modify vendored, generated, minified, lock, build-output, or dependency files unless explicitly included in scope.
- Do not delete TODO/FIXME notes containing real pending work, citations, license headers, required notices, lint directives, coverage directives, localization keys, or machine-parsed annotations.
- Do not rewrite deliberately user-authored marketing copy, translations, accessibility descriptions, or contractual text without explicit scope.

## Examples

### REMOVE

```ts
// Get the user by ID
const user = await getUserById(id);
```

Result:

```ts
const user = await getUserById(id);
```

### SHORTEN

Before:

```dart
/// This property is a boolean value that indicates whether or not
/// the sidebar is currently in an expanded state.
final bool isSidebarExpanded;
```

After (if a public API description is needed):

```dart
/// Whether the sidebar is expanded.
final bool isSidebarExpanded;
```

### KEEP

```ts
// Must update the outbox in the same transaction to avoid losing events after a crash.
await createOutboxEvent(tx, event);
```

The comment records a non-obvious correctness invariant.

## Output requirements

- Make the edits, not just recommendations, when editing is authorized.
- Preserve the original language of each document/comment unless explicitly asked to translate.
- Keep the final explanation brief; do not replace removed textual noise with a verbose cleanup report.
- If no safely removable content exists, say so without creating cosmetic changes.
