// ── Starter Pack: Skill Definitions ─────────────────────────────────────────
// Production skill definitions for the CoPilot Commander starter pack.
// Each skill includes a full XML-based skill_definition prompt that agents
// use to execute the skill with consistent, high-quality output.

import { StarterSkillDefinition } from '../../renderer/src/types/starter-pack'

export const STARTER_SKILLS: StarterSkillDefinition[] = [
  // ── 1. Audience & Tone Rewrite ────────────────────────────────────────────
  {
    id: 'audience-tone-rewrite',
    name: 'Audience & Tone Rewrite',
    description:
      'Rewrite text for a specific audience with appropriate tone, formality, length, and emphasis.',
    inputDescription:
      "Rough text + target audience (executive, peer, direct_report, customer, cross_functional, public) + optional channel and desired outcome",
    outputDescription:
      "Rewritten text + 'What changed' note + suggested subject line + optional alternative version",
    primaryAgents: ['communication-coach'],
    secondaryAgents: ['chief-of-staff', 'strategy-decision-partner'],
    skillPrompt: `<skill_definition>
  <name>Audience &amp; Tone Rewrite</name>
  <description>
    Rewrite text for a specific audience with appropriate tone, formality,
    length, and emphasis. Produces polished output calibrated to the reader
    and the communication channel.
  </description>

  <input>
    <required>
      <field name="raw_text">
        The original, rough text the user wants rewritten. Can be any length
        from a single sentence to multiple paragraphs. May include bullet
        points, incomplete thoughts, or informal shorthand.
      </field>
      <field name="target_audience">
        Who will read this. One of: executive, peer, direct_report, customer,
        cross_functional, public. Each audience type implies specific
        expectations for tone, detail level, and structure.
      </field>
    </required>
    <optional>
      <field name="channel">
        Where the message will be delivered. Examples: email, Slack, document,
        presentation slide, meeting agenda, announcement. Channel affects
        length, formatting, and formality.
      </field>
      <field name="desired_outcome">
        What the user wants the reader to do or feel after reading. Examples:
        approve a budget, understand a timeline change, feel motivated, take
        specific action, escalate an issue.
      </field>
      <field name="tone_override">
        Explicit tone preference that overrides the default for the audience.
        Examples: urgent, celebratory, empathetic, direct, diplomatic,
        cautious, enthusiastic.
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Analyze the raw text">
      Read the original text carefully. Identify:
      - The core message and key points being communicated
      - The current tone (informal, formal, aggressive, passive, etc.)
      - Any implicit meaning or subtext the user likely intends
      - Structural issues: rambling, repetition, missing context, burying the lead
      - Factual claims, numbers, or specifics that must be preserved exactly
      Do NOT alter the substance of what the user is saying. Your job is to
      improve how it is said, not what is said.
    </step>

    <step number="2" name="Identify audience priorities">
      Based on the target_audience, determine what the reader cares about:
      - executive: Lead with impact and decision needed. Be concise. Use
        numbers. State the ask clearly. Remove implementation details unless
        directly relevant to the decision.
      - peer: Be collaborative and direct. Assume shared context. Use
        professional but not stiff language. Include enough detail for them
        to act or respond.
      - direct_report: Be clear, supportive, and specific. Provide context
        for why. Make expectations explicit. Avoid ambiguity that creates
        anxiety. Use encouraging framing where appropriate.
      - customer: Be professional, empathetic, and solution-oriented. Lead
        with what matters to them. Avoid internal jargon. Acknowledge their
        perspective before presenting yours.
      - cross_functional: Minimize jargon from your domain. Provide context
        that a smart person outside your team would need. Be explicit about
        what you need from them and by when.
      - public: Use accessible language. Assume no insider knowledge. Be
        engaging and clear. Consider how it reads to someone with no prior
        context.
    </step>

    <step number="3" name="Restructure for clarity and impact">
      Reorganize the content following these principles:
      - Lead with the most important information (inverted pyramid)
      - Group related points together
      - Use parallel structure for lists and comparisons
      - Ensure logical flow from one point to the next
      - Add transitions where the reader needs them
      - Remove redundancy without losing nuance
      - If there is an ask or call to action, make it unmissable
      Apply channel-specific formatting:
      - Slack: Keep short. Use line breaks. Bold key points. Consider emoji
        if the culture supports it.
      - Email: Use a clear subject line structure. Front-load the purpose.
        Use paragraphs and bullets. End with clear next steps.
      - Document: Use headers, sections, and formatting for scannability.
      - Presentation: Distill to key phrases. One idea per bullet.
    </step>

    <step number="4" name="Apply tone and style preferences">
      Set the tone based on audience defaults, channel norms, desired_outcome,
      and any tone_override:
      - Match formality to the audience and channel
      - If desired_outcome is specified, ensure the emotional arc of the
        message supports that outcome
      - If tone_override is set, use it as the primary tone guide
      - Eliminate filler words, hedging language (unless diplomatic hedging
        is appropriate), and passive voice (unless intentionally softening)
      - Ensure the rewrite sounds like a competent professional, not a robot
      - Preserve the user's voice where possible; improve it, don't replace it
    </step>

    <step number="5" name="Flag issues and provide alternatives">
      Before finalizing, check for:
      - Anything in the original that could be misread or cause unintended
        offense in the rewritten version
      - Claims that seem unsupported or risky to state as written
      - Sections where two reasonable approaches exist (e.g., direct vs.
        diplomatic framing for a sensitive point)
      If any of these apply, note them in the "What changed" section and
      offer an alternative version for the contentious passage.
    </step>
  </process>

  <output>
    <section name="Rewritten Text">
      The complete rewritten text, ready to send or paste. Formatted
      appropriately for the specified channel. No meta-commentary mixed in.
    </section>
    <section name="What Changed">
      A brief note (3-5 bullets) explaining the key changes made and why.
      This helps the user learn and decide if they agree with the changes.
      Flag anything that was ambiguous in the original that you interpreted
      a specific way.
    </section>
    <section name="Suggested Subject Line">
      If the channel is email or the text would benefit from a headline,
      provide a clear, specific subject line. For Slack, suggest a bold
      opening line instead.
    </section>
    <section name="Alternative Version" optional="true">
      If a meaningfully different approach exists (e.g., shorter vs. more
      detailed, direct vs. diplomatic), provide it here with a one-line
      note on when to prefer it.
    </section>
  </output>
</skill_definition>`,
  },

  // ── 2. Research Brief & Source Verification ───────────────────────────────
  {
    id: 'research-brief-source-verification',
    name: 'Research Brief & Source Verification',
    description:
      'Research a topic, verify findings against credible sources, and produce a structured brief ready to inform a decision.',
    inputDescription:
      'Research question + optional depth (quick/standard/deep), focus (exploratory/comparative/verification/trend), audience, constraints',
    outputDescription:
      'Headline finding, brief organized by theme, confidence level, gaps, recommendation, sourced evidence',
    primaryAgents: ['research-analyst'],
    secondaryAgents: ['strategy-decision-partner', 'technical-reviewer'],
    skillPrompt: `<skill_definition>
  <name>Research Brief &amp; Source Verification</name>
  <description>
    Research a topic, verify findings against credible sources, and produce
    a structured brief ready to inform a decision. Prioritizes accuracy,
    source transparency, and actionable synthesis over exhaustive coverage.
  </description>

  <input>
    <required>
      <field name="research_question">
        The specific question or topic to research. Can be a direct question
        ("What are the current best practices for X?"), a comparison ("How
        does A compare to B for our use case?"), a verification ("Is it true
        that X?"), or an exploration ("What should we know about X before
        deciding Y?").
      </field>
    </required>
    <optional>
      <field name="depth">
        How deep to go. One of: quick (5-10 min equivalent, key facts only),
        standard (thorough coverage of main angles), deep (comprehensive with
        multiple source cross-referencing and nuanced analysis). Default:
        standard.
      </field>
      <field name="focus">
        Research orientation. One of: exploratory (broad landscape scan),
        comparative (structured comparison of options), verification (fact-
        checking specific claims), trend (trajectory and forward-looking
        analysis). Default: inferred from the question.
      </field>
      <field name="audience">
        Who will read the brief. Affects depth of explanation, jargon level,
        and what context to include vs. assume.
      </field>
      <field name="constraints">
        Any boundaries on the research: time period, geography, industry,
        sources to prioritize or avoid, specific angles to include or exclude.
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Parse the research question">
      Break down the question to identify:
      - The core inquiry and what a good answer looks like
      - Implicit sub-questions that need answering to fully address the core
      - Key terms that need precise definition to avoid ambiguity
      - The decision or action this research is meant to support
      - What the user likely already knows vs. what they need to learn
      Restate the research question in precise terms and confirm scope.
    </step>

    <step number="2" name="Determine research strategy">
      Based on the question, depth, and focus:
      - Identify the 3-5 most important sub-topics or angles to cover
      - Prioritize primary sources (official documentation, peer-reviewed
        research, authoritative industry reports, direct data) over secondary
        sources (blog posts, news articles, opinion pieces)
      - Plan which types of evidence will be most convincing for this topic
      - Identify potential biases in available sources and plan to counterbalance
      - Set explicit criteria for what counts as a credible source for this topic
    </step>

    <step number="3" name="Gather information prioritizing primary sources">
      Collect information systematically:
      - Start with the most authoritative and recent sources available
      - For each key claim, note the source, its credibility level, and date
      - Look for quantitative data, case studies, and concrete examples
      - Capture direct quotes or specific data points that support key findings
      - Note where sources disagree and what might explain the disagreement
      - Track the provenance chain: where did this information originate?
      - Flag any information that relies on a single source
    </step>

    <step number="4" name="Verify key claims by cross-referencing 2+ sources">
      For every significant finding or claim in the brief:
      - Attempt to verify it against at least two independent sources
      - Check for recency: is this still true or has it been superseded?
      - Look for disconfirming evidence actively, not just confirming evidence
      - Note the verification status of each claim:
        * Verified: confirmed by 2+ independent credible sources
        * Likely: supported by one strong source, no contradicting evidence
        * Uncertain: limited or conflicting evidence
        * Unverified: single source, could not independently confirm
      - If a commonly cited "fact" fails verification, flag it explicitly
    </step>

    <step number="5" name="Synthesize findings by theme">
      Organize the research into a coherent narrative:
      - Group findings by theme or sub-topic, not by source
      - Lead each section with the key finding, then provide supporting evidence
      - Make connections between themes explicit
      - Highlight areas of consensus and areas of active debate
      - Present nuance without being wishy-washy: state what the evidence
        supports most strongly while acknowledging uncertainty
      - Use the audience's language and frame findings in terms of their concerns
    </step>

    <step number="6" name="Assess overall source credibility">
      Provide a meta-assessment of the research:
      - Overall confidence level in the findings (high/medium/low) with reasoning
      - Known gaps: what questions remain unanswered and why
      - Source quality summary: how strong is the evidence base overall?
      - Potential biases in the available literature or data
      - What would change the conclusions (sensitivity analysis)
      - Shelf life: how long will these findings remain relevant?
    </step>

    <step number="7" name="Formulate recommendation">
      Based on the synthesized findings:
      - State a clear, actionable recommendation tied to the original question
      - Explain the reasoning chain from evidence to recommendation
      - Identify conditions under which the recommendation would change
      - Suggest concrete next steps if the user wants to go deeper
      - If the evidence does not support a clear recommendation, say so
        explicitly and explain what additional information would be needed
    </step>
  </process>

  <output>
    <section name="Headline Finding">
      One to two sentences capturing the most important takeaway. This should
      be useful even if the reader goes no further.
    </section>
    <section name="Research Brief">
      The full brief organized by theme. Each theme section includes:
      - Key finding for that theme
      - Supporting evidence with source attribution
      - Verification status of major claims
      - Nuances, caveats, or areas of disagreement
    </section>
    <section name="Confidence Assessment">
      Overall confidence level with explanation. Source quality summary.
      Known limitations of the research.
    </section>
    <section name="Gaps &amp; Open Questions">
      What the research could not answer and why. Suggestions for how to
      fill those gaps.
    </section>
    <section name="Recommendation">
      Clear recommendation with reasoning. Conditions that would change it.
      Suggested next steps.
    </section>
    <section name="Sources">
      List of key sources used, with credibility notes and relevance to
      specific claims in the brief.
    </section>
  </output>
</skill_definition>`,
  },

  // ── 3. Meeting-to-Action ──────────────────────────────────────────────────
  {
    id: 'meeting-to-action',
    name: 'Meeting-to-Action',
    description:
      'Convert messy meeting notes into structured, actionable output with decisions, owners, deadlines, and follow-up messages.',
    inputDescription:
      'Meeting notes in any format + optional meeting type, attendees, related priorities',
    outputDescription:
      'Summary, decisions list, action items with owners and deadlines, open questions, parking lot, draft follow-up messages',
    primaryAgents: ['chief-of-staff'],
    secondaryAgents: ['communication-coach'],
    skillPrompt: `<skill_definition>
  <name>Meeting-to-Action</name>
  <description>
    Convert messy meeting notes into structured, actionable output. Extracts
    decisions, action items with owners and deadlines, open questions, and
    parking lot items. Drafts follow-up messages appropriate for each audience.
    Handles notes in any format: bullet points, stream of consciousness,
    partial sentences, voice transcripts, or structured agendas with inline notes.
  </description>

  <input>
    <required>
      <field name="meeting_notes">
        The raw meeting notes in any format. Can be messy, incomplete, or
        a mix of formats. May include bullet points, prose, shorthand,
        timestamps, speaker labels, action markers, or any combination.
        Voice transcripts with filler words and false starts are fine.
      </field>
    </required>
    <optional>
      <field name="meeting_type">
        The type of meeting. Examples: standup, 1:1, project review, sprint
        planning, stakeholder update, brainstorm, decision meeting, all-hands,
        incident review, kickoff. Affects what to prioritize extracting.
      </field>
      <field name="attendees">
        List of people in the meeting with optional roles. Helps assign
        action items to the right people and calibrate follow-up messages.
      </field>
      <field name="related_priorities">
        Current priorities or OKRs that provide context for what matters
        most. Helps flag when meeting outcomes affect known priorities.
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Parse raw input handling messy formats">
      Process the raw notes regardless of format:
      - Normalize shorthand, abbreviations, and incomplete sentences into
        clear statements
      - If it is a transcript, identify distinct topics and speakers
      - Separate signal from noise: identify substantive points vs. filler,
        side conversations, and repetition
      - Reconstruct any context that is implied but not stated (e.g., if
        notes say "agreed to push it back," infer what "it" refers to from
        surrounding context)
      - Preserve exact names, numbers, dates, and specific commitments
        verbatim; do not paraphrase precision
      - Flag anything genuinely ambiguous that cannot be resolved from context
    </step>

    <step number="2" name="Extract decisions">
      Identify every decision made during the meeting:
      - Look for explicit decision language: "we decided," "agreed," "going
        with," "approved," "confirmed," "the plan is"
      - Look for implicit decisions: when discussion converges and moves on,
        that often implies a decision was made
      - For each decision, capture:
        * What was decided (specific and unambiguous)
        * The rationale or key factor if mentioned
        * Who made or approved the decision
        * What alternatives were considered and rejected, if discussed
      - If something seems like it was almost decided but not finalized,
        put it in open questions instead
    </step>

    <step number="3" name="Extract action items ensuring specificity">
      Identify every commitment, task, or follow-up:
      - Look for action language: "will do," "needs to," "take the action,"
        "follow up," "let's," "someone should," "I'll handle"
      - For each action item, ensure it has:
        * A specific, concrete description (not vague like "look into X"
          without defining what that means)
        * An owner (a specific person, not "the team" or "we")
        * A deadline or timeframe (if mentioned; flag if missing)
        * Any dependencies or blockers mentioned
      - If an action was mentioned but no owner was assigned, flag it as
        "Owner: TBD" and note it needs assignment
      - If an action is vague, make your best specific interpretation and
        mark it with "[interpreted]" so the user can verify
      - Sort action items by deadline, then by owner
    </step>

    <step number="4" name="Identify open questions and parking lot">
      Separate two categories:
      Open questions: Items that were raised and need resolution but were
      not resolved in this meeting. Include:
      - The question itself, clearly stated
      - Who raised it or who it is directed at
      - Any partial answers or constraints discussed
      - Suggested next step to resolve it

      Parking lot: Items that were mentioned but explicitly deferred or
      deemed out of scope for this meeting. Include:
      - The topic
      - Why it was deferred (if stated)
      - When or where it should be addressed
    </step>

    <step number="5" name="Draft follow-up messages per audience">
      Create ready-to-send follow-up messages:
      - Meeting recap for all attendees: Summary + decisions + action items
        + open questions. Professional but efficient. Suitable for email or
        Slack.
      - If there are stakeholders who were NOT in the meeting but need to
        know outcomes, draft a separate shorter update focused on what
        matters to them (decisions and impact, not process)
      - If there are specific individuals with action items, draft brief
        personal follow-ups that clearly state their items and deadlines
      - Calibrate tone to the audience: formal for executives or external
        stakeholders, direct for peers, supportive for direct reports
    </step>

    <step number="6" name="Self-check for completeness">
      Before finalizing, verify:
      - Every person mentioned as having an action item appears in the
        action items list
      - No decisions were lost between the notes and the extracted list
      - Action items are specific enough that the owner could act on them
        without re-reading the full notes
      - Follow-up messages accurately reflect the decisions and actions
      - Ambiguities are flagged, not silently resolved
      - If related_priorities were provided, note any action items or
        decisions that affect those priorities
    </step>
  </process>

  <output>
    <section name="Meeting Summary">
      2-4 sentence summary of what the meeting covered and its key outcomes.
      Written so someone who was not present gets the essential picture.
    </section>
    <section name="Decisions">
      Numbered list of decisions made. Each entry includes the decision,
      rationale (if discussed), and who approved it.
    </section>
    <section name="Action Items">
      Table or structured list with columns: Action, Owner, Deadline, Status,
      Dependencies. Sorted by deadline. Items without owners or deadlines
      are flagged.
    </section>
    <section name="Open Questions">
      List of unresolved items with context and suggested next steps for
      resolution.
    </section>
    <section name="Parking Lot">
      Deferred items with notes on when/where to revisit.
    </section>
    <section name="Follow-Up Messages">
      Draft messages ready to send:
      - Full recap for attendees
      - Stakeholder update (if applicable)
      - Individual follow-ups for key action item owners (if applicable)
    </section>
  </output>
</skill_definition>`,
  },

  // ── 4. Priority & Execution Planner ───────────────────────────────────────
  {
    id: 'priority-execution-planner',
    name: 'Priority & Execution Planner',
    description:
      'Help prioritize and plan execution across competing demands. Triages incoming work, builds weekly plans, and identifies what to do, defer, delegate, or decline.',
    inputDescription:
      'Current task list or priorities + time available + optional constraints and energy patterns',
    outputDescription:
      'Prioritized plan with categories (do now/schedule/delegate/decline), time blocks, conflict warnings, recommended focus areas',
    primaryAgents: ['chief-of-staff'],
    secondaryAgents: ['strategy-decision-partner'],
    skillPrompt: `<skill_definition>
  <name>Priority &amp; Execution Planner</name>
  <description>
    Help prioritize and plan execution across competing demands. Triages
    incoming work, builds realistic weekly or daily plans, and identifies
    what to do now, schedule for later, delegate, or decline. Connects
    tactical tasks to stated priorities so effort goes where it matters most.
  </description>

  <input>
    <required>
      <field name="task_list">
        Current tasks, commitments, and incoming requests. Can be a bullet
        list, a brain dump, a forwarded email list, calendar screenshot
        description, or any format. Include deadlines and context where known.
      </field>
      <field name="time_available">
        How much time the user has for the planning period. Examples:
        "This week, roughly 35 hours of work time," "Today, 6 hours between
        meetings," "Next two weeks, full capacity except Thursday is offsite."
      </field>
    </required>
    <optional>
      <field name="constraints">
        Fixed commitments, immovable deadlines, dependencies, or blocks.
        Examples: "Board deck due Friday, no flexibility," "Waiting on
        legal review before I can proceed with the vendor contract,"
        "Team is at half capacity due to holidays."
      </field>
      <field name="energy_patterns">
        When the user does their best work for different types of tasks.
        Examples: "Deep focus mornings, meetings afternoon," "Tuesdays and
        Thursdays are my maker days," "I hit a wall after 3pm for anything
        creative." Used to place tasks in optimal time slots.
      </field>
      <field name="stated_priorities">
        The user's current top priorities, OKRs, or goals. Used as the
        primary filter for what matters. If provided, every task is evaluated
        against these.
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Gather and clarify all items">
      Process the task list into a normalized inventory:
      - Extract every distinct task, commitment, and request
      - For each item, identify or infer: what it is, rough effort estimate,
        deadline (hard, soft, or none), who it is for, and whether it
        requires the user specifically or could be done by someone else
      - Identify items that are actually multiple tasks bundled together
        and break them down
      - Flag items that are missing critical information (no deadline, unclear
        scope, unknown effort) and make reasonable assumptions marked as such
      - Note which items are new/incoming vs. already in progress
    </step>

    <step number="2" name="Apply urgency-importance matrix connected to stated priorities">
      Categorize every item using a two-axis evaluation:

      Importance (connected to priorities):
      - High: Directly advances a stated priority or has significant
        consequences if not done
      - Medium: Supports priorities indirectly or has moderate consequences
      - Low: Nice to have, maintenance, or not connected to current priorities

      Urgency (connected to deadlines and dependencies):
      - High: Due within the planning period, blocks others, or has an
        immovable external deadline
      - Medium: Due soon or has soft deadlines
      - Low: No pressing deadline, can be scheduled flexibly

      Assign each item to a quadrant:
      - Do Now: High importance + High urgency
      - Schedule: High importance + Low urgency (protect time for these)
      - Delegate: Low importance + High urgency (get off your plate)
      - Decline/Defer: Low importance + Low urgency (say no or push out)

      For Medium/Medium items, use tiebreakers: downstream impact, effort
      required, and whether delaying creates future urgency.
    </step>

    <step number="3" name="Build realistic plan respecting capacity">
      Construct the execution plan:
      - Sum the estimated effort for "Do Now" and "Schedule" items
      - Compare total effort against available time, including buffer
      - Apply the 70% rule: only schedule 70% of available time to leave
        room for unexpected work, context switching, and recovery
      - If total effort exceeds capacity, force-rank and move lower items
        to delegate or defer, even if they feel important
      - Place tasks into time blocks, respecting:
        * Energy patterns (deep work in focus windows, admin in low-energy)
        * Dependencies (tasks that unblock others go first)
        * Deadlines (work backward from due dates)
        * Batching (group similar tasks to reduce context switching)
      - Include breaks, transition time, and at least one buffer block
    </step>

    <step number="4" name="Identify conflicts and overcommitments">
      Stress-test the plan:
      - Are there days with more than 8 hours of scheduled work?
      - Are there dependencies where Task B needs Task A done first, but
        Task A is scheduled after Task B?
      - Are there days with too much context switching between different
        types of work?
      - Is the delegate list realistic? Does the user actually have someone
        to delegate to?
      - Are there items in "Decline" that the user will face pushback on?
      - What happens if the biggest task takes 50% longer than estimated?
      For each conflict, propose a specific resolution.
    </step>

    <step number="5" name="Create actionable schedule with buffer">
      Produce the final plan:
      - Daily breakdown with specific time blocks (or weekly overview with
        day assignments, based on the planning period)
      - Each block: task name, estimated duration, why it is placed there
      - Highlight the top 3 items for each day (if everything else falls
        apart, do these)
      - Include one "flex block" per day for overflow and unexpected requests
      - Add a "delegation brief" for each delegated item: who, what, by when,
        any context they need
      - Add talking points for declining deferred items if the user needs to
        communicate that
      - End with a "week in review" prompt: at the end of the period, what
        should the user check to see if the plan worked?
    </step>
  </process>

  <output>
    <section name="Priority Matrix">
      All items categorized into Do Now, Schedule, Delegate, and Decline/Defer
      with the reasoning for each placement.
    </section>
    <section name="Execution Plan">
      Day-by-day (or block-by-block) schedule with time allocations. Includes
      the top 3 must-do items for each day and buffer blocks.
    </section>
    <section name="Conflict Warnings">
      Identified overcommitments, dependency issues, or capacity concerns
      with proposed resolutions.
    </section>
    <section name="Delegation Briefs">
      For each delegated item: who to delegate to, what to communicate,
      deadline, and any context they need.
    </section>
    <section name="Decline Scripts">
      For items being deferred or declined: suggested language for
      communicating this to the requester.
    </section>
    <section name="Focus Recommendations">
      Top focus areas for the planning period, connected to stated priorities.
      What success looks like at the end of this period.
    </section>
  </output>
</skill_definition>`,
  },

  // ── 5. Feedback & Difficult Conversation Prep ─────────────────────────────
  {
    id: 'feedback-difficult-conversation-prep',
    name: 'Feedback & Difficult Conversation Prep',
    description:
      'Prepare for feedback conversations and difficult discussions. Produces structured conversation plans with phrasing options, predicted reactions, and de-escalation strategies.',
    inputDescription:
      'Situation description + who the conversation is with + desired outcome + optional relationship context',
    outputDescription:
      'Conversation plan with opening, key points with phrasing alternatives, predicted reactions (2-3 scenarios), de-escalation phrases, closing',
    primaryAgents: ['communication-coach'],
    secondaryAgents: ['chief-of-staff'],
    skillPrompt: `<skill_definition>
  <name>Feedback &amp; Difficult Conversation Prep</name>
  <description>
    Prepare for feedback conversations and difficult discussions. Produces
    a structured conversation plan with phrasing options for sensitive
    moments, predicted reactions with prepared responses, and de-escalation
    strategies. Helps the user feel prepared and confident, not scripted.
  </description>

  <input>
    <required>
      <field name="situation">
        Description of the situation requiring a conversation. What happened,
        what the issue is, and any relevant background. Be as specific as
        possible about behaviors, events, and impact.
      </field>
      <field name="conversation_with">
        Who the conversation is with. Include their role, level relative to
        the user (direct report, peer, manager, skip-level, external partner),
        and any relevant context about them.
      </field>
      <field name="desired_outcome">
        What the user wants to happen as a result of this conversation. Be
        specific: a behavior change, an agreement, mutual understanding,
        a decision, clearing the air, setting expectations.
      </field>
    </required>
    <optional>
      <field name="relationship_context">
        History and dynamics of the relationship. Examples: "We've always
        had a good relationship but this is the first performance issue,"
        "There's been tension since the reorg," "This person tends to get
        defensive when given feedback," "I'm new to managing them."
        Significantly affects the approach.
      </field>
      <field name="constraints">
        Any constraints on the conversation. Examples: "HR says I need to
        document this," "This is a skip-level so I need to be careful about
        undermining their manager," "Cultural context: they are from a
        culture where direct criticism is very uncomfortable."
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Understand the situation and stakes">
      Analyze the situation deeply:
      - What specifically happened or is happening? Separate facts from
        interpretations and emotions
      - What is the impact? On the team, on work output, on the user, on
        the other person, on the broader organization
      - What are the stakes? What happens if this conversation goes well
        vs. poorly vs. not at all?
      - Is this a one-time issue or a pattern? Pattern conversations require
        different approaches than first-time feedback
      - What is the user's emotional state? Are they frustrated, anxious,
        sad, angry, conflicted? This affects their ability to stay composed
      - Is there any chance the user is missing context or their read on
        the situation is incomplete?
    </step>

    <step number="2" name="Map relationship dynamics">
      Consider the interpersonal landscape:
      - Power dynamics: who has formal and informal power in this relationship?
      - Trust level: is there a foundation of trust to draw on, or does trust
        need to be built during this conversation?
      - Communication style: based on what the user has shared, how does this
        person typically receive feedback? Do they process verbally or need
        time to reflect?
      - History: are there previous conversations on this topic? If so, what
        happened and what was the outcome?
      - Cultural factors: are there cultural, generational, or personality
        factors that affect how feedback should be delivered?
      - The other person's likely perspective: what might they think is going
        on? How might they see the situation differently?
    </step>

    <step number="3" name="Build conversation structure with opening, body, close">
      Create a three-part conversation plan:

      Opening (2-3 minutes):
      - Set the frame: what this conversation is about and why it matters
      - Establish psychological safety: "I value this relationship and want
        to address something to make it stronger"
      - State your intent: "I want to share my perspective and hear yours"
      - Avoid: burying the lead, excessive preamble, starting with blame
      Provide 2-3 opening options ranging from direct to gentle.

      Body (the core conversation):
      - Present the specific situation, behavior, and impact (SBI model or
        similar framework appropriate to the situation)
      - Use "I" language for impact: "I noticed..." "The impact I see is..."
      - Create space for their perspective: plan specific questions to ask
      - Address the desired outcome: what you are asking for going forward
      - If this is a pattern, name the pattern without attacking character

      Close (2-3 minutes):
      - Confirm shared understanding of what was discussed
      - Agree on specific next steps or changes
      - Reaffirm the relationship and your confidence in them (if genuine)
      - Set a follow-up checkpoint
    </step>

    <step number="4" name="Create phrasing alternatives for the hardest moments">
      For each sensitive point in the conversation, provide 2-3 phrasing
      options:
      - Direct version: clear and unambiguous, no softening
      - Diplomatic version: same substance but with more cushioning,
        collaborative framing
      - Question-led version: approach the point by asking a question that
        leads the other person to the insight

      Focus phrasing alternatives on:
      - The moment you name the issue
      - The moment you describe the impact
      - The moment you make the ask or set the expectation
      - Any moment where you anticipate the other person will feel defensive
        or emotional

      For each alternative, note when to use it: "Use the direct version
      if they seem unaware of the issue. Use the question-led version if
      they are someone who responds better to discovering the issue
      themselves."
    </step>

    <step number="5" name="Predict likely reactions and prepare responses">
      Map out 2-3 reaction scenarios:

      Scenario A (Best case): They receive the feedback well.
      - What this looks like: acknowledgment, curiosity, willingness to change
      - Your response: affirm, collaborate on solutions, express appreciation
      - Watch for: performative agreement without real understanding

      Scenario B (Defensive): They push back, deflect, or get upset.
      - What this looks like: "That's not what happened," blame-shifting,
        bringing up other issues, shutting down
      - Your response: validate their feelings, restate the impact without
        retreating from the feedback, use prepared de-escalation phrases
      - Watch for: getting pulled into a debate about facts instead of impact

      Scenario C (Emotional): They become visibly upset, cry, or express
      strong emotion.
      - What this looks like: tears, anger, withdrawal, anxiety
      - Your response: pause, acknowledge the emotion, offer a break if
        needed, separate the emotional response from the substance
      - Watch for: abandoning the feedback because of discomfort with emotion

      For each scenario, provide specific phrases and a recovery path back
      to the desired outcome.
    </step>

    <step number="6" name="Add de-escalation toolkit">
      Provide a set of versatile de-escalation tools the user can deploy
      at any point if the conversation becomes heated:

      Pause and acknowledge:
      - "I can see this is landing hard. Let's take a breath."
      - "I hear that you see it differently. I want to understand your view."

      Redirect to shared ground:
      - "We both want [shared goal]. Let's focus on how to get there."
      - "I think we agree on the destination, we're just seeing the path
        differently."

      Lower the temperature:
      - "I'm not trying to criticize you as a person. I'm raising this
        because I care about [the work / the team / your growth]."
      - "Let me restate what I'm saying, because I think it might be coming
        across differently than I intend."

      Offer an off-ramp:
      - "Would it help to take a break and come back to this tomorrow?"
      - "I've shared what I wanted to share. Would you like time to think
        about it before we discuss next steps?"

      Boundary setting (if needed):
      - "I understand you're frustrated, and I want to hear you out. I do
        need us to stay respectful in how we talk to each other."
      - "I'm going to pause here because I think we both need some space.
        Let's reconvene [specific time]."
    </step>
  </process>

  <output>
    <section name="Conversation Plan">
      Structured plan with Opening, Body, and Close sections. Each section
      includes specific talking points and phrasing options.
    </section>
    <section name="Key Points with Phrasing Alternatives">
      For each critical moment in the conversation: direct version, diplomatic
      version, and question-led version with guidance on when to use each.
    </section>
    <section name="Predicted Reactions">
      2-3 scenarios (best case, defensive, emotional) with specific signs
      to watch for, prepared responses, and recovery paths.
    </section>
    <section name="De-Escalation Phrases">
      Ready-to-use phrases organized by purpose: acknowledge, redirect,
      lower temperature, offer off-ramp, set boundary.
    </section>
    <section name="Closing &amp; Follow-Up">
      How to end the conversation well regardless of how it went. Specific
      follow-up actions and timeline.
    </section>
  </output>
</skill_definition>`,
  },

  // ── 6. Document Builder ───────────────────────────────────────────────────
  {
    id: 'document-builder',
    name: 'Document Builder',
    description:
      'Build structured business documents -- one-pagers, proposals, status reports, project briefs, memos, ADRs -- with appropriate format, depth, and audience calibration.',
    inputDescription:
      'Document type + content/topic + target audience + optional format preferences',
    outputDescription:
      'Complete document formatted for the specified type with appropriate sections, depth, and professional polish',
    primaryAgents: [],
    secondaryAgents: [
      'communication-coach',
      'chief-of-staff',
      'research-analyst',
      'strategy-decision-partner',
      'technical-reviewer',
    ],
    skillPrompt: `<skill_definition>
  <name>Document Builder</name>
  <description>
    Build structured business documents with appropriate format, depth, and
    audience calibration. Supports common document types including one-pagers,
    proposals, status reports, project briefs, memos, ADRs (Architecture
    Decision Records), executive summaries, postmortems, RFCs, and more.
    A utility skill that any agent can invoke when the output needs to be
    a polished document rather than conversational text.
  </description>

  <input>
    <required>
      <field name="document_type">
        The type of document to produce. Common types:
        - one-pager: Single-page summary of a proposal, initiative, or concept
        - proposal: Structured argument for a course of action with costs/benefits
        - status_report: Progress update on a project or initiative
        - project_brief: Overview of a project for stakeholders
        - memo: Internal communication on a specific topic
        - adr: Architecture Decision Record documenting a technical decision
        - executive_summary: Condensed version of a longer document or analysis
        - postmortem: Structured review of an incident or failure
        - rfc: Request for Comments on a proposed change
        - meeting_agenda: Structured agenda with objectives and time allocations
        - custom: User specifies the format they want
      </field>
      <field name="content">
        The substance to be structured into the document. Can be rough notes,
        key points, data, a description of the topic, or a combination. The
        more specific the input, the more accurate the output.
      </field>
      <field name="target_audience">
        Who will read this document. Determines jargon level, depth of
        explanation, what context to include, and how to frame the content.
      </field>
    </required>
    <optional>
      <field name="format_preferences">
        Specific formatting requests. Examples: "Keep it to one page,"
        "Use our company template with Problem/Solution/Impact sections,"
        "Include an appendix for technical details," "No bullet points,
        narrative style."
      </field>
      <field name="tone">
        Desired tone. Examples: authoritative, consultative, urgent, neutral,
        optimistic, cautious. Default is inferred from document type.
      </field>
      <field name="context">
        Background information that helps calibrate the document. Examples:
        "This is going to the board next week," "This follows up on a
        previous proposal that was rejected," "The audience is skeptical
        about this approach."
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Identify document type and audience requirements">
      Based on the document_type and target_audience:
      - Select the appropriate structural template (see step 2)
      - Determine the right level of detail: executives want impact and
        decisions, practitioners want specifics and how-to, mixed audiences
        need layered depth (summary up front, details below)
      - Identify the document's primary job: to inform, to persuade, to
        document, to align, or to request action
      - Set length expectations:
        * One-pager: strict 1 page
        * Memo: 1-2 pages
        * Status report: 1-3 pages depending on complexity
        * Proposal: 2-5 pages plus appendices
        * ADR: 1-2 pages
        * Postmortem: 2-4 pages
        * RFC: 3-10 pages depending on scope
      - Note any organizational conventions mentioned in format_preferences
    </step>

    <step number="2" name="Select and customize template structure">
      Choose the section structure appropriate for the document type:

      One-pager: Problem/Opportunity, Proposed Solution, Key Benefits,
      Risks &amp; Mitigations, Ask/Next Steps

      Proposal: Executive Summary, Background, Problem Statement, Proposed
      Approach, Alternatives Considered, Cost/Benefit Analysis, Timeline,
      Risks, Recommendation, Appendices

      Status Report: Summary/TL;DR, Progress Since Last Update, Key Metrics,
      Risks &amp; Blockers, Next Period Plan, Help Needed

      Project Brief: Project Name &amp; Sponsor, Objective, Scope (In/Out),
      Key Stakeholders, Timeline &amp; Milestones, Success Criteria,
      Dependencies, Budget

      Memo: Purpose, Background, Analysis/Key Points, Recommendation,
      Next Steps

      ADR: Title, Status, Context, Decision, Consequences, Alternatives
      Considered

      Postmortem: Incident Summary, Timeline, Root Cause, Impact, What Went
      Well, What Went Wrong, Action Items, Lessons Learned

      RFC: Summary, Motivation, Detailed Design, Drawbacks, Alternatives,
      Unresolved Questions

      Customize sections based on the specific content and audience. Remove
      sections that do not apply; add custom sections if the content demands it.
    </step>

    <step number="3" name="Fill sections with audience-calibrated content">
      For each section:
      - Extract relevant information from the user's input
      - Fill the section with clear, specific content
      - Calibrate depth to the audience:
        * For executives: lead with impact, use numbers, keep sections short
        * For technical audience: include specifics, data, methodology
        * For mixed audience: layer information (bold key points, details below)
      - Use concrete language: replace vague statements with specifics
      - Include data, metrics, and evidence where available
      - Where information is missing from the input, either mark it clearly
        as "[TO BE ADDED: specific data needed]" or make a reasonable
        inference and mark it as "[estimated]"
      - Ensure each section earns its place: if a section adds nothing for
        this specific document, remove it rather than filling it with fluff
    </step>

    <step number="4" name="Apply formatting and professional polish">
      Polish the document:
      - Ensure consistent formatting throughout (heading levels, bullet
        styles, numbering)
      - Add an executive summary or TL;DR at the top if the document is
        longer than 1 page (even if the template does not include one)
      - Use parallel structure in lists
      - Ensure all claims are supported or marked as needing support
      - Check that the document flows logically from section to section
      - Apply appropriate visual hierarchy: the most important information
        should be the most visually prominent
      - Add a clear call to action if the document requests a decision or
        action from the reader
      - If format_preferences were specified, verify compliance
    </step>

    <step number="5" name="Self-check for completeness and audience fit">
      Review the finished document:
      - Does it answer the question the reader will have? ("So what?"
        "Why should I care?" "What do you want me to do?")
      - Is it the right length for the type and audience?
      - Would the target audience understand every term used?
      - Is the tone appropriate for the context?
      - Are there any gaps where the reader would be left with an obvious
        unanswered question?
      - Does the opening make the reader want to keep reading?
      - Does the closing make the next step clear?
      - If this document will be shared upward, is it something the user
        would be proud to put their name on?
      Flag any sections that feel thin or where the user should add more
      specific information.
    </step>
  </process>

  <output>
    <section name="Document">
      The complete, formatted document ready for use. All sections filled,
      formatted appropriately for the document type, and calibrated to the
      target audience. Placeholders clearly marked where user input is needed.
    </section>
    <section name="Document Notes" optional="true">
      Brief notes for the user (not part of the document itself):
      - Sections that would benefit from additional specific data
      - Assumptions made that should be verified
      - Suggestions for how to present or distribute the document
      - Alternative framings considered
    </section>
  </output>
</skill_definition>`,
  },

  // ── 7. Concept Explainer ──────────────────────────────────────────────────
  {
    id: 'concept-explainer',
    name: 'Concept Explainer',
    description:
      "Explain complex concepts at the user's level using analogies, progressive complexity, and domain-relevant examples. Teaching tool that any agent can invoke.",
    inputDescription:
      "Concept to explain + user's current knowledge level (inferred from Work Profile or stated)",
    outputDescription:
      'Explanation starting from what the user knows, building to the concept with analogies, check-points, and practical implications',
    primaryAgents: [],
    secondaryAgents: ['research-analyst', 'technical-reviewer', 'communication-coach'],
    skillPrompt: `<skill_definition>
  <name>Concept Explainer</name>
  <description>
    Explain complex concepts at the user's level using analogies, progressive
    complexity, and domain-relevant examples. A teaching tool that any agent
    can invoke when the user encounters something they do not understand or
    asks "what does X mean?" Adapts explanations based on the user's
    background, role, and current knowledge rather than assuming a fixed
    audience level.
  </description>

  <input>
    <required>
      <field name="concept">
        The concept, term, framework, technology, or idea to explain. Can
        be a single term ("what is a microservice?"), a comparison ("what
        is the difference between REST and GraphQL?"), a process ("how does
        DNS resolution work?"), or a complex topic ("explain how LLMs
        generate text").
      </field>
    </required>
    <optional>
      <field name="knowledge_level">
        The user's current understanding. Can be explicit ("I'm a marketing
        manager with no technical background") or inferred from the Work
        Profile memory. Levels:
        - novice: No prior exposure to this domain
        - familiar: Has heard the term, knows it exists, cannot explain it
        - intermediate: Understands the basics, wants deeper understanding
        - advanced: Knows the concept but wants nuance, edge cases, or a
          specific angle explained
        Default: inferred from context and Work Profile.
      </field>
      <field name="context">
        Why the user is asking. Examples: "I need to understand this for a
        meeting with engineering tomorrow," "I'm evaluating whether we should
        adopt this," "Someone used this term and I didn't want to ask what
        it meant." Context affects what to emphasize and what practical
        applications to highlight.
      </field>
      <field name="domain">
        The user's domain or industry. Used to select the most resonant
        analogies and examples. Examples: marketing, finance, healthcare,
        education, operations, product management.
      </field>
    </optional>
  </input>

  <process>
    <step number="1" name="Assess the user's current understanding">
      Before explaining, determine the right starting point:
      - If knowledge_level is provided, use it directly
      - If a Work Profile memory is available, infer their background from
        their role, domain, and stated technical comfort
      - If neither is available, start with the "familiar" level and adjust
        based on their response
      - Identify what the user likely already knows that can serve as a
        foundation for the explanation
      - Identify potential misconceptions common at their level that should
        be proactively addressed
      - Determine the right depth: do they need a cocktail party explanation
        (30 seconds), a working understanding (3 minutes), or a deep dive
        (10+ minutes)?
    </step>

    <step number="2" name="Find a bridge from known to unknown using domain analogies">
      Build the explanatory bridge:
      - Start from something the user already understands from their domain
      - Find an analogy that maps to the concept's key attributes:
        * A good analogy preserves the structural relationships, not just
          surface similarity
        * The analogy should be from the user's domain when possible (a
          supply chain analogy for operations, a portfolio analogy for finance,
          a campaign analogy for marketing)
      - Identify where the analogy breaks down and flag that: "This analogy
        works for understanding X and Y, but it does not capture Z"
      - If the concept has no good single analogy, use a composite: "Think
        of it as part X (like...) and part Y (like...)"
      - Avoid analogies that are themselves complex or unfamiliar to the user
    </step>

    <step number="3" name="Build explanation in layers of increasing complexity">
      Structure the explanation in progressive layers:

      Layer 1 — The one-sentence version:
      A single sentence that captures the essence. If the user remembers
      nothing else, this is what sticks. Use plain language.

      Layer 2 — The working explanation:
      Expand to a paragraph that covers what it is, why it matters, and
      how it works at a high level. Use the analogy from step 2. Include
      the "so what?" — why should the user care about this concept?

      Layer 3 — Key details and nuances:
      Go deeper into how it works. Cover the 2-3 most important aspects
      or sub-concepts. Address the most common misconceptions at this point.
      Use concrete examples.

      Layer 4 — Edge cases and advanced nuance (if appropriate):
      For intermediate or advanced users, cover: when does this not work?
      What are the tradeoffs? What are experts debating about this? How
      is it evolving?

      Each layer should be self-contained: a novice can stop after Layer 2
      and have a useful understanding. An advanced user can skip to Layer 3-4.
    </step>

    <step number="4" name="Add practical implications and examples">
      Make the concept concrete and relevant to the user's world:
      - Provide at least one concrete example from their domain or context
      - If they provided context for why they are asking, connect the
        explanation directly to their situation
      - Answer implicit practical questions:
        * "How does this affect me/my team?"
        * "What decisions does understanding this help me make?"
        * "What questions should I now be able to ask?"
      - If the concept has common jargon associated with it, provide a
        mini-glossary of 3-5 related terms they might encounter
      - If relevant, provide a "how to sound smart about this" cheat sheet:
        the 2-3 things to say or ask that demonstrate understanding without
        requiring deep expertise
    </step>

    <step number="5" name="Check understanding and offer deeper dive">
      Close the explanation with built-in checkpoints:
      - Provide a simple self-test: "You'll know you understand this when
        you can explain why [specific scenario] happens"
      - Offer to go deeper on any specific aspect: "The areas where there
        is more to explore are: [list 2-3 natural extensions]"
      - If the concept connects to other concepts the user might encounter,
        briefly note the relationships: "This is closely related to X and
        Y, which you might hear mentioned together"
      - If there are common follow-up questions at their level, preemptively
        answer the top 1-2
      - Suggest a concrete next step if they want to learn more: a specific
        question to ask, something to read, or something to try
    </step>
  </process>

  <output>
    <section name="One-Line Summary">
      Single sentence capturing the essence of the concept in plain language.
    </section>
    <section name="Explanation">
      The layered explanation, starting from the user's existing knowledge
      and building progressively. Includes the domain analogy, key details,
      and nuances appropriate to their level.
    </section>
    <section name="Practical Implications">
      How this concept connects to the user's work, decisions they can now
      make, and questions they can now ask. Includes concrete examples from
      their domain.
    </section>
    <section name="Related Terms" optional="true">
      Mini-glossary of 3-5 related terms the user might encounter alongside
      this concept.
    </section>
    <section name="Go Deeper" optional="true">
      Natural extension topics, follow-up questions preemptively answered,
      and suggested next steps for further learning.
    </section>
  </output>
</skill_definition>`,
  },
]
