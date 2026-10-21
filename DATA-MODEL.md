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
- insight_themes
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
