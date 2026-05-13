# AGENTS.md

Project conventions for AI coding agents working on
`map-generate-demo` — a procedural map generator with Web and Python implementations.

> **Two-file split.** This file (`AGENTS.md`) holds the stable **rules** (sections 1–12). The sibling [`CODEBASE_STATE.md`](./CODEBASE_STATE.md) holds the project's _history_: directory map (§13.1), technical details (§14), and any WIP/decision logs. Agents read the sibling freely while coding; edits happen only in a user-initiated pre-commit sync (see §0).

---

## 0. Multi-agent collaboration protocol

### Doc edit policy (read this first)

- **Do NOT modify `CODEBASE_STATE.md` during feature work.** Finish the code. Do not bump `Last updated` dates, do not append to WIP/decision log sections — not as part of the same turn you wrote the code.
- **`CODEBASE_STATE.md` is edited only when the user explicitly asks**, typically right before they request a commit. Common phrasings that unlock doc edits: _"update the codebase state"_, _"sync the codebase state"_, _"prep for commit"_, _"fill in the change log"_. Without an explicit request, leave the doc alone.
- **When the user does ask**, batch all deferred updates from the session into one coherent edit in `CODEBASE_STATE.md`.
- **`AGENTS.md` (this file) changes only when the user asks to change a rule.** Feature work never touches it.
- Use only English for better understanding and token saving.

### The contract

1. **Before coding**, skim §1–§12 of this file once per session, then check `CODEBASE_STATE.md` for any relevant technical details.
2. **While coding**, the canonical _registry_ of names is the code itself. Before adding a new key/function, confirm it doesn't conflict with existing code.
3. **After coding**, **do not edit either doc.** Keep a short mental (or scratchpad) list of what would need to change so you can produce a clean batch when the user asks.
4. **Pre-commit doc sync (user-initiated only).** When the user explicitly asks to update the codebase state, document all significant changes.

### Conflict-avoidance rules

- **Namespaces are unique.** Function names, variable names, route names must be unique globally within their module.
- **One owner per feature.** When you start a multi-turn feature, note it in chat so other agents know you're claiming that area.
- **Code wins, doc follows.** `CODEBASE_STATE.md` is human-curated history; if it ever conflicts with the code, the code is right.
- **Atomic doc updates.** One feature → one coherent doc edit at commit time.

### Read-before-write checklist (copy into your plan)

- [ ] Skim `CODEBASE_STATE.md` §13.1 to understand the current directory structure.
- [ ] Check if the feature area is already documented in `CODEBASE_STATE.md`.
- [ ] Verify no naming collision with existing functions/constants.
- [ ] Remember: do NOT edit `CODEBASE_STATE.md`, `CHANGELOG`, `AGENTS.md` in this turn.Save doc updates for when the user asks.

---

## 1. Role & Context

You are an AI developer proficient in **procedural generation**, **Web technologies**, and **Python**. The mission is building and iterating on a procedural map generator that creates island-based terrain with environmental features.

The project has **two implementations**:

- `python-map-generator/` — Python version (Flask web server + optional Pygame preview)
- `web-map-generator/` — Pure browser version (HTML/CSS/JS, no dependencies)

Use the appropriate stack for your task. The Web version is more portable; the Python version offers more algorithmic flexibility.

---

## 2. Tech Stack (hard constraints)

| Implementation       | Language    | Framework/Libraries                                | Entry Point                 |
| -------------------- | ----------- | -------------------------------------------------- | --------------------------- |
| python-map-generator | Python      | Flask, Pygame (optional)                           | `app.py` / `simple_demo.py` |
| web-map-generator    | HTML/CSS/JS | Frameworks unrestricted, Phaser/Three.js supported | `v2/index.html`             |

**Version Policy:**

- `web-map-generator/v1/` — legacy, kept for reference
- `web-map-generator/v2/` — current active version
- All new web work goes into `v2/` unless specified otherwise

**Do not add new top-level dependencies without appending a decision log entry.**

---

## 3. Architecture overview

See CODEBASE_STATE.md §13.1 for directory structure.

### Key Architectural Patterns

**Web Version (`v1.`, `v2/`):**

- Single HTML file with embedded CSS and JS for portability
- Canvas-based rendering with pixel-style output
- Seeded RNG (Linear Congruential Generator) for reproducibility
- Grid-based data structure using `Uint8Array`

**Python Version:**

- `generator.py` — core algorithm (can run headless)
- `app.py` — Flask web server exposing the generator
- `simple_demo.py` — Pygame preview (can run standalone)

### Canvas size / Grid resolution

Both versions use a grid-based approach:

- **Web**: `Uint8Array` grid, each cell stores terrain type as single byte
- **Python**: 2D list/grid representation

Grid cell size affects visual fidelity vs. performance. Default grid size is implementation-specific (see `CODEBASE_STATE.md` §14).

---

## 4. Procedural Generation Rules

### Island Generation Algorithms

Both implementations share conceptual approaches but may differ in details:

| Aspect            | python-map-generator             | web-map-generator v2                    |
| ----------------- | -------------------------------- | --------------------------------------- |
| Island Layout     | Chain growth (Bresenham bridges) | Grid partitioning + collision detection |
| Island Shape      | Noisy polygon (circular drift)   | Noisy polygon (same concept)            |
| Feature Placement | Flood-fill spreading             | Spatial hashing uniform selection       |

### Algorithm Requirements

- **Reproducibility**: Use seeded RNG so same seed = same output
- **Collision Detection**: Islands must not overlap (min distance = sum of radii + buffer)
- **Noise**: Smooth drifting noise for natural island shapes (not perfect circles)
- **Performance**: Grid-based operations should use efficient data structures

### Lifecycle Hygiene

- Register event listeners properly (e.g., button clicks, input changes)
- Clean up event handlers when components unmount/are removed
- Never rely on garbage collection for resource cleanup

---

## 5. Vibe-coding Execution Strategy

- **Iterate on feel, not on architecture.** When the human says "make islands more organic", tweak noise parameters — don't refactor (unless they say so).
- **Ship runnable modules.** Prefer one working slice end-to-end over multiple half-wired subsystems.
- **Placeholder graphics are fine during development.** Ship logic first.
- **Debuggable by default.** Log key parameters and seed values for reproducibility.

---

## 6. Code Standards

- **Modularity.** Separate concerns: generation logic, rendering, UI controls.
- **Typed where beneficial.** Use JSDoc types in JS, type hints in Python.
- **Consistent naming.** Follow §9 naming conventions.
- **No magic numbers.** Define constants with meaningful names.
- **Loop hygiene.** Avoid heavy logic in tight loops. Pre-compute when possible.

### Web Version Specifics

- Use `const` / `let` only — no `var`
- Keep DOM manipulation minimal and centralized
- Canvas rendering should be requestAnimationFrame-based for smooth updates

### Python Version Specifics

- Follow PEP 8 style guidelines
- Use type hints where beneficial
- Keep functions focused and single-purpose

---

## 7. Forbidden

- `var` (use `const` / `let` in JS)
- Unnamed magic numbers scattered in code
- Blocking operations on the main thread (for UI responsiveness)
- Adding new dependencies without documenting the decision
- Silent renames of exported functions, constants, or public APIs
- **Taking over user actions after finishing a task.** Do not run the project yourself (the user runs it), and do not use `open`, `cat`, or similar commands to display file contents on behalf of the user. The user should run the project and view files themselves. (Exception: if the user explicitly asks you to start the dev server, run it in the background so the tool call doesn't block.)

---

## 8. Interaction Protocol

- **Ask before modifying.** When making any changes, always explain what will be modified and how, then wait for user approval before executing — do not modify files directly after thinking.
- When the human describes a **feel/vibe** (e.g., "islands look too regular", "transitions are too abrupt"), translate it directly into tunable parameters — noise scale, jitter amount, cohesion bias, etc.
- When asked to research or explain, do not edit code.
- When asked to implement, follow the Read-before-write checklist in §0.

---

## 9. Naming

- **Files**: `kebab-case` (e.g., `generator.py`, `main.js`, `index.html`)
- **Functions**: `camelCase` in JS, `snake_case` in Python
- **Constants**: `UPPER_SNAKE_CASE` in both JS and Python
- **Classes**: `PascalCase` in both JS and Python
- **HTML/CSS classes**: `kebab-case`
- **Canvas terrain types**: `UPPER_SNAKE_CASE` constants (e.g., `WATER`, `LAND`, `FOREST`)

---

## 10. UI/UX Guidelines

### Atomic-first (Web version)

- Write CSS utilities directly in templates
- Keep styles modular and component-scoped where possible

### Theme tokens

- Shared colors and tokens can be defined as CSS custom properties (e.g., `--color-water`, `--color-land`)
- Use semantic color names (water, land, forest) over generic ones

### Responsive Design

- Map generator should work at different viewport sizes
- Controls can be fixed-position or collapsible based on screen real estate

---

## 11. Component Organization

See CODEBASE_STATE.md §13.

### Dependency Rules

- `generator.py` should have no external dependencies (pure Python)
- Web version should have no external dependencies (vanilla JS)
- Flask app can depend on Flask only; core logic stays in `generator.py`

---

## 12. Performance Considerations

### Grid Operations

- Use `Uint8Array` (JS) or `array.array` / numpy (Python) for efficient grid storage
- Batch canvas operations where possible
- Consider using OffscreenCanvas for background generation (if supported)

### Generation Speed

- Aim for sub-second generation on modern hardware
- If slow, consider: reducing grid resolution, simplifying noise, or using typed arrays
- Log generation time for benchmarking

### Memory

- Reuse buffers where possible
- Avoid creating large objects in tight loops

---

## 13. Codebase State

[`CODEBASE_STATE.md`](./CODEBASE_STATE.md) at the repo root holds the project's _history_: directory map (§13.1), technical details (§14), algorithm comparisons, and run instructions.

Read the sibling freely; edit it only in a user-initiated pre-commit sync per §0.

---

## 14. Change Log

See [`CHANGELOG`](./CHANGELOG) §14 for the per-change history.

### CHANGELOG Policy

- **No content deletion.** CHANGELOG entries are never removed, only appended or reorganized.
- **Append only.** New changes are added as new entries at the top or bottom. Do NOT modify existing entries.
- **Conflict detection.** If new changes conflict with existing entries (e.g., "add X" vs "rename X to Y"), ask the user whether to modify or add a new entry instead.
- **Integration allowed.** You may consolidate or reformat existing entries for clarity, but the underlying content must remain intact.
