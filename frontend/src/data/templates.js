export const TEMPLATES = [
  {
    id: "code-review",
    title: "Thorough code review",
    category: "Coding",
    platform: "ChatGPT",
    description: "Get structured, actionable feedback on a pull request or snippet.",
    prompt:
      "Act as a senior software engineer reviewing my code.\n\nContext: [paste language, framework, and what the code should do]\n\nCode:\n```\n[paste code here]\n```\n\nReview it for:\n1. Correctness and edge cases\n2. Readability and naming\n3. Performance concerns\n4. Security issues\n5. Test coverage gaps\n\nFor each issue give: severity (high/medium/low), file/line, what's wrong, and a concrete fix with revised code. End with a 3-line summary of the most important changes.",
  },
  {
    id: "debug",
    title: "Systematic debugging",
    category: "Coding",
    platform: "ChatGPT",
    description: "Turn a cryptic error into a diagnosed fix with minimal back-and-forth.",
    prompt:
      "Act as a debugging specialist. Help me fix this error step by step.\n\nEnvironment: [language, version, OS, framework]\nWhat I was trying to do: [one sentence]\nError message:\n```\n[paste full error and stack trace]\n```\nRelevant code:\n```\n[paste minimal reproduction]\n```\nWhat I already tried: [list]\n\nGive me:\n1. The most likely root cause (with reasoning)\n2. Two alternative hypotheses\n3. Exact commands or code changes to verify each\n4. The recommended fix with corrected code\n5. How to prevent this class of bug next time",
  },
  {
    id: "blog-post",
    title: "Engaging blog post draft",
    category: "Writing",
    platform: "Claude",
    description: "Draft a well-structured article from rough notes.",
    prompt:
      "Act as an experienced content writer. Turn my rough notes into a polished blog post.\n\nTopic: [topic]\nAudience: [who is reading, and what they already know]\nTone: clear, conversational, no hype\nTarget length: 900-1200 words\n\nMy notes:\n[paste bullet points, anecdotes, data]\n\nStructure:\n1. Hook opening (problem or story, under 80 words)\n2. 3-4 sections with descriptive subheadings\n3. One concrete example per section\n4. Closing with 3 actionable takeaways\n\nRules: short paragraphs, no filler phrases, no exclamation marks, include a working title and a 150-character meta description.",
  },
  {
    id: "marketing-plan",
    title: "Launch marketing plan",
    category: "Marketing",
    platform: "Gemini",
    description: "A focused 30-day plan for a small team with a small budget.",
    prompt:
      "Act as a growth marketing strategist for an early-stage SaaS.\n\nProduct: [one-sentence description]\nTarget customer: [role, company size, pain]\nBudget: [amount] for 30 days\nTeam: [size and skills]\nGoal: [e.g. 200 qualified signups]\n\nDeliver a 30-day plan with:\n1. Positioning statement (under 40 words)\n2. 3 channels ranked by expected ROI, with why\n3. Weekly content calendar (topics + formats + owner)\n4. One low-budget experiment per week with success metric\n5. Landing page copy outline (headline, subhead, 3 benefits, CTA)\n6. Top 3 risks and how to mitigate them\n\nBe specific and realistic. No generic advice.",
  },
  {
    id: "study-guide",
    title: "Active-recall study guide",
    category: "Education",
    platform: "ChatGPT",
    description: "Convert dense material into questions, examples, and a quiz.",
    prompt:
      "Act as a patient tutor. I am learning [subject] at [beginner/intermediate] level.\n\nMaterial to learn:\n[paste notes or chapter summary]\n\nCreate:\n1. A plain-language explanation of the 5 key ideas (with one everyday analogy each)\n2. Common misconceptions and how to avoid them\n3. 10 active-recall questions ordered easy to hard (answers separately at the end)\n4. A 5-question quiz I can attempt now — ask me one question at a time and wait for my answer before continuing\n\nKeep language simple. Flag anything ambiguous in my notes before explaining.",
  },
  {
    id: "research-brief",
    title: "Balanced research brief",
    category: "Research",
    platform: "Claude",
    description: "Survey a topic with sources, trade-offs, and open questions.",
    prompt:
      "Act as a research analyst. Brief me on [topic] so I can make a decision about [decision].\n\nDepth: thorough but skimmable (under 800 words plus sources)\nPerspectives: include at least two credible opposing views\n\nCover:\n1. Background in 5 bullets\n2. Current consensus vs. open debate\n3. Key numbers with dates and units\n4. Trade-offs table (option / upside / downside / best for)\n5. What to read next (3 sources with one-line verdicts)\n6. Open questions that would change the recommendation\n\nDistinguish facts from opinions. Say 'I don't know' where evidence is thin rather than guessing.",
  },
  {
    id: "business-plan",
    title: "One-page business plan",
    category: "Business",
    platform: "ChatGPT",
    description: "Pressure-test an idea before writing a full plan.",
    prompt:
      "Act as a startup advisor giving honest, direct feedback.\n\nMy idea: [2-3 sentences]\nCustomer: [who pays, and why now]\nRevenue model: [how I charge]\nUnfair advantage: [what I have that others don't]\n\nProduce a one-page plan:\n1. Problem and who feels it most acutely\n2. Solution in one paragraph\n3. Target customer profile\n4. Revenue model with rough unit economics\n5. Go-to-market: first 10 customers, concretely\n6. Top 3 risks ranked by lethality, each with a test I can run this week\n7. Verdict: what would make you more or less confident\n\nChallenge weak assumptions explicitly.",
  },
  {
    id: "social-calendar",
    title: "Week of social posts",
    category: "Marketing",
    platform: "Gemini",
    description: "Seven platform-native posts from one core idea.",
    prompt:
      "Act as a social media manager. My core idea: [one sentence].\n\nBrand voice: [e.g. helpful, dry-humored, zero hype]\nPlatforms: LinkedIn and X\nAudience: [who, and what outcome I want: replies, signups, shares]\n\nWrite 5 LinkedIn posts (120-180 words each, hook in line 1, line breaks for readability, 3 hashtags max) and 5 X posts (under 240 characters each, one idea each, no hashtags unless essential).\n\nEvery post needs: a distinct angle, one concrete detail or number, and a soft CTA as a question. No emojis unless I ask. List them day by day with a suggested posting time and why.",
  },
];
