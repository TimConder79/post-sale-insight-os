# Data Model — v1

## Primary entities
- users
- source_conversations
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
