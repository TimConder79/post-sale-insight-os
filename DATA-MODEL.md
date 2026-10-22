# Data Model — v1

## Primary entities
- users
- source_conversations
- conversation_responses
- people
- interaction_events
- insights
- insight_sources
- insight_connections
- insight_seeds
- insight_themes (legacy text labels)
- themes
- theme_memberships
- next_actions
- content_ideas
- content_idea_insights
- saved_searches
- weekly_reviews

## Key relationships
- A Source Conversation may have one author/person and may generate many Insights.
- An Insight may have many Source Conversations through `insight_sources`.
- An Insight may connect to many other Insights through `insight_connections`.
- A synthesized Insight is still an Insight; its source Insights are represented as lineage, not copied/deleted.
- A Person has many Interaction Events and may be linked to many Source Conversations.
- A Next Action may point to a Person, Insight, or Source Conversation.
- A Content Idea may draw from many Insights.

## Provenance fields
Derived records should include creation method (`user`, `ai_suggested`, `ai_then_edited`) where useful, timestamps, and source IDs. Source text remains separate from derived summaries.

## Phase 1 durable response (Issue #5)
A conversation may have one latest explicitly saved response in `conversation_responses`, with its owner and save timestamp. Response text is separate from immutable source and from approved Insights. No response row means empty response text when reopening older conversations. An explicit save replaces or clears the response; it does not claim posting or create interaction events.

## Phase 3 relationships and synthesis (Issue #9)
`insight_connections` contains explicit approved relationships between two approved Insights of the same owner. Supports, Extends, Example of, and Leads to use A → B; Contradicts and Related to are symmetric. Confirmed equivalent relationships are unique per owner/type/pair. Removing a connection does not remove Insights.

A synthesis is a row in `insights`, with direct source Insight IDs in `insight_lineage`; it is not a separate document type and does not require a direct conversation of its own. Every selected source is retained and remains traceable through its existing provenance. Nested syntheses retain direct lineage links without copying/flattening source records. Seeds and Takeaways remain optional. No destructive Insight deletion API is introduced.

## Phase 4 Themes (Issue #11)
`themes` stores owner-scoped, user-authored subjects with stable IDs, name, optional working definition, creation timestamp and user creation method. `theme_memberships` links Themes to approved Insights with same-owner composite foreign keys and a unique Theme/Insight pair. Membership is independent of `insight_seeds`, source provenance and synthesis lineage; removal affects only membership. Both objects and associations require explicit user action. The old `insight_themes` text labels remain unchanged for Phase 1 compatibility and are not automatically converted into durable Themes.

Theme overview counts direct approved member Insights separately from distinct original source conversations reached through those members and their approved synthesis ancestors. Recursive set traversal deduplicates shared/nested provenance, remains owner-scoped and terminates on cycles. These descriptive counts do not rank Themes or imply importance.

## Phase 5A AI approval (Issue #13)
No schema migration is required. Drafts remain transient; signed expiring approval receipts bind a genuine AI proposal to its source/synthesis selection or relationship/membership. Existing Insight/Connection creation methods distinguish approved unchanged AI suggestions (`ai_suggested`), edited AI suggestions (`ai_then_edited`) and manual content (`user`). `user_confirmed` remains true only on explicit save. Response history and Theme membership retain their existing schema; their AI proposal state is UI/session state, not invented durable metadata. Existing source, lineage, Seed and membership records are not rewritten by assistance.
