# AGENTS.md

## Mission
Build the smallest useful version of Post-Sale Insight OS that supports the complete real-world loop from external conversation to insight, connection, relationship next step, and weekly synthesis.

## Read first
Before implementation or product changes, read:
1. `docs/PRODUCT.md`
2. `docs/PRODUCT-SPEC.md`
3. `docs/DECISIONS.md`
4. `reference/FIVE-SEEDS.md`
5. `reference/POST-SALE-OS.md`

For AI behavior, also read `docs/AI-BEHAVIOR.md`.

## Non-negotiable product rules
- Original source text/comments are never silently rewritten by AI.
- Derived objects retain provenance to source objects.
- AI suggestions must be distinguishable from user-confirmed conclusions.
- Never invent LinkedIn replies, connection acceptance, meetings, or outcomes.
- Do not scrape LinkedIn or assume a URL can be ingested.
- Do not add gamification, streaks, engagement scores, authority scores, or activity quotas.
- Do not turn Relationships into a CRM.
- Do not turn Connections into a free-form Miro clone.
- The Five Seeds are stable strategic lenses; themes are flexible tags.
- A synthesized insight never replaces its source insights.

## Engineering behavior
- Prefer simple, reversible implementations.
- Do not expand scope without an explicit product decision.
- For material behavior changes, update `docs/DECISIONS.md` in the same PR.
- Keep acceptance criteria close to the implementation task.
- Preserve user data on AI/API failure.
- Use structured AI outputs where practical.
- Keep secrets out of source control; update `.env.example` for required variables.

## v1 build gate
Do not broaden scope until five real LinkedIn conversations can run through the full loop and the resulting Weekly Review is genuinely useful.
