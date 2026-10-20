# Product Specification v1

## Goals
- Make daily discovery and engagement easier to manage.
- Preserve source post, relevant comments, and provenance.
- Create durable insights from conversations.
- Connect insights and synthesize larger conclusions.
- Track lightweight relationships and next actions.
- Generate useful weekly synthesis and content recommendations.
- Keep AI assistive and user-controlled.

## Non-goals
- LinkedIn scraping or automation.
- Generic note-taking.
- Rebuilding Miro as a free-form diagramming tool.
- Full CRM behavior.
- Gamification or activity-volume optimization.
- Silent AI modification of source material or conclusions.

## Core objects
### Source Conversation
Required: id, source_type, original_text, created_at. Optional: source_url, relevant_comments, attachments, source_date, author_id.

### Person
Required: id, name. Optional: role, company, LinkedIn URL, tags, notes.

### Interaction Event
Required: id, person_id, event_type, event_date. Optional: conversation_id, note.

### Insight
Required: id, title, summary, created_at. Optional: takeaways, seeds, themes, source conversation IDs, notes, favorite.

### Insight Connection
Required: id, insight_a, insight_b, relationship_type. Optional: direction, user_confirmed, AI_suggested.

Connection vocabulary for v1: Supports, Extends, Contradicts, Example of, Leads to, Related to.

### Synthesis
Stored as an Insight with source insight IDs and lineage. It never replaces source insights.

### Next Action
Required: id, action_type, status. Optional: person_id, insight_id, due_date, note.

### Content Idea
Required: id, title, content_type, status. Optional: insight IDs, seeds, angle, draft.

### Search
Required: id, seed, query. Optional: audience, last_used.

### Weekly Review
Week range plus learning, patterns, content recommendations, relationship recommendations, next-week focus, and optional technical health.

## Screen behavior
### Today
Choose 1–2 seed lenses; run saved searches; add a post/conversation; show due next actions; quick capture; recent activity without quotas or scores.

### Post Workspace
Paste original post text and optionally comments/URL/attachments. Preserve source exactly. AI may suggest seeds/themes, draft a comment, propose an insight, suggest content and next actions. User approves edits. Relationship events are manually recorded.

### Insights Library
Search/filter durable insights. Show summary, takeaways, seeds, themes, source lineage, people, content ideas, notes, usage and next steps.

### Connections
Map and list views. Create connections manually or approve AI suggestions. Multi-select 2+ insights and synthesize a larger conclusion into a new lineage-preserving Insight. The map supports pan/zoom/fit/drag/filter but is not a general drawing canvas.

### Relationships
Initials by default. Name required; role/company/profile URL optional. Timeline shows source conversations and manual events. One primary open next action plus history.

### Weekly Review
Summarize strongest learning; patterns/connections; meaningful tensions; a small number of content recommendations; relationships to deepen; next-week seed focus; optional collapsed SEO/AEO technical health.

## Critical acceptance flows
1. A LinkedIn post can move from pasted source → comment draft → approved insight → person/event → next action → saved lineage without screenshot or profile photo.
2. Two insights can be connected, edited, or disconnected without altering either source insight.
3. Two or more insights can produce an editable synthesized insight that retains all source lineage.
4. Manual relationship events can produce a suggested next action and appear on Today when due.
5. Weekly Review can synthesize the week's saved evidence without inventing activity or patterns.

## v1 done
The user can reliably move from a discovered conversation to a preserved source, useful response, durable insight, connected body of thinking, relationship next step, and weekly synthesis without Miro or a separate tracking system.
