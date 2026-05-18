# /board-review — Multi-Agent Product Review & Improvement Council

Spawns four specialized agents — Senior Developer, Application Architect, End User, and Quality Analyst — who each audit the AnnotateMe codebase from their unique lens, then synthesize a prioritized improvement plan and implement the top findings.

## Usage
```
/board-review [focus-area]
```

## What it does

1. **Spawns four agents in parallel**, each reading the codebase from their role's perspective
2. **Synthesizes** all four reports into a ranked improvement plan
3. **Implements** the highest-impact changes immediately

## Agent roles

### Senior Developer
Looks at code quality, maintainability, missing features, technical debt, and implementation gaps. Identifies what's hard to extend, what's missing from the DX, and what quick wins exist.

### Application Architect
Reviews system design: data model, API contract, service boundaries, scalability, missing dataset type support, and AI integration architecture. Proposes structural improvements.

### End User (Annotator)
Acts as a labeler doing annotation work day-to-day. Identifies UX pain points: missing keyboard shortcuts, poor feedback, confusing workflows, missing undo/redo, slow AI feedback loops.

### Quality Analyst
Reviews test coverage, data validation, annotation consistency, export format correctness, and overall reliability. Flags areas where quality can slip undetected.

## Implementation
When invoked, the orchestrator runs all four agents in parallel, collects their reports, and immediately begins implementing the top-ranked improvements without waiting for user confirmation.
