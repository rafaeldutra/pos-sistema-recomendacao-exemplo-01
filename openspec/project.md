<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open '@/openspec/AGENTS.md' when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use '@/openspec/AGENTS.md' to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Project Context

## Overview

This project is a browser-based e-commerce recommendation system prototype.
It lets users view products, simulate purchases, persist user state in
`sessionStorage`, and train a TensorFlow.js model (via Web Worker) to support
recommendations.

## Tech Stack

- Language: JavaScript (ES Modules)
- Runtime: Browser (no Node backend)
- Build/serve: `browser-sync` (`npm start`)
- ML: TensorFlow.js + tfjs-vis (training and visualization)
- Async processing: Web Workers (`src/workers/modelTrainingWorker.js`)
- Data source: Local JSON files in `data/`
- Storage: Browser `sessionStorage`

## Architecture Conventions

- Pattern: MVC-like separation using `view/`, `controller/`, and `service/`.
- Communication: Event-driven workflow with `CustomEvent` wrappers in
  `src/events/events.js`.
- Bootstrap: `src/index.js` composes services, views, controllers, and worker.
- Templates: HTML fragments loaded from `src/view/templates/`.
- Controllers expose `static init(deps)` and register callbacks/listeners.

## Code Style Conventions

- Use ES module `import`/`export` syntax in all JS files.
- Prefer classes for app modules (controllers, services, views).
- Use private class fields (`#field`) for internal state.
- Keep business logic in services and DOM updates in views.
- Use async/await for IO-style operations (`fetch`, storage workflows).
- Keep event names centralized in `src/events/constants.js`.
- Use semicolons and single quotes, following current repository style.

## Domain Conventions

- A `user` has `id`, `name`, `age`, and `purchases`.
- A `product` has catalog metadata used for rendering and recommendation input.
- Purchase flow dispatches events and updates user purchase history.
- Recommendation flow should avoid blocking the main UI thread.

## Run and Validation

- Install dependencies: `npm install`
- Start dev server: `npm start`
- Manual validation:
  - Select user and verify profile/past purchases rendering
  - Buy a product and verify purchase update events
  - Trigger training and verify recommendation/model progress events
