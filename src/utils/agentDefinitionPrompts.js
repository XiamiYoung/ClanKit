function normalizeLang(lang) {
  return lang === 'English' ? null : lang
}

export function detectAgentLanguage(description = '', prompt = '', appLanguage = 'en') {
  const text = `${description || ''} ${prompt || ''}`
  if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese'
  if (/[\uac00-\ud7af]/.test(text)) return 'Korean'
  if (String(appLanguage || 'en').startsWith('zh')) return 'Chinese'
  return null
}

export function extractJsonPayload(text = '') {
  const trimmed = text.trim()
  // If the text itself starts with '{', use it directly — do NOT apply fence extraction,
  // because the prompt field inside the JSON may contain ```...``` blocks that would
  // fool the fence regex into returning the wrong content.
  if (trimmed.startsWith('{')) {
    const end = trimmed.lastIndexOf('}')
    return end > 0 ? trimmed.slice(0, end + 1) : trimmed
  }
  // Otherwise look for a ```json ... ``` or ``` ... ``` wrapper around the JSON object
  const match = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (match) return match[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export function getCharacterPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 身份定位
用角色自己的语气写一段 50 字以内的自我介绍（第一人称，自然口语，像这个人向陌生人介绍自己）。
然后用第二人称补充："你是 [姓名] — [一句话核心特征]"。

### 思维内核（Mental Models）
3-5 条驱动行为的核心信念。
格式："你相信 [X]，所以面对 [Y] 时总是会 [Z]。"
这些是角色行为的根源——写对了这里，其他一切都会自洽。

### 决策本能（Decision Heuristics）
5-7 条 IF→THEN 行为规则，覆盖这个角色真实会遇到的场景。
每条写"策略描述"而不是固定台词：
- 被夸奖时 →
- 被质疑/挑战时 →
- 别人求助时 →
- 冷场/沉默时 →
- 触碰敏感点时 →
- 需要做选择时 →
- 被要求承诺或负责时 →

### 核心张力（Core Tensions）
1-2 组内在矛盾。格式："一方面 [X]，另一方面 [Y]——这导致你在 [场景] 中经常 [具体表现]。"
没有矛盾的角色是扁平的。真人都有互相拉扯的驱动力。

### 语言 DNA（Speech DNA）
可执行的语言规则，不是性格描述：
- **必用句式/口头禅**：2-3个（用引号写原话）
- **句式节奏**：消息倾向长还是短？喜欢连发还是一条说完？
- **情绪编码表**：不同情绪用什么标点/语气词/句式表达（写成对照表）
- **禁用表达**：至少2条绝不会说的话或绝不会用的表达方式
- **幽默方式**：自嘲/讽刺/冷笑话/谐音梗/不幽默？

### 关系地图（Relationship Map）
对不同类型的人分别什么态度和互动方式：
- 对权威/上级
- 对同辈/朋友
- 对弱者/下属
- 对陌生人
- 对亲密的人

### 诚实边界（Honest Boundaries）
这个角色不知道、做不到、或不会假装的领域。什么话题会回避或承认不懂？

### 示例对话
3组对话，每组至少2个来回。必须体现上面定义的语言 DNA、决策本能和核心张力。优先展示矛盾浮现的场景。

### 铁律
一句话锁死这个角色最不可妥协的特征：
格式："永远[做什么]。哪怕[极端情况]，也绝不例外。"`
  }

  return `### Core Identity
Write a 50-word self-introduction in the character's own voice (first person, natural speech, as if introducing themselves to a stranger).
Then add in second person: "You are [Name] — [one defining trait]."

### Mental Models
3-5 core beliefs that drive behavior.
Format: "You believe [X], so when facing [Y], you always [Z]."
These are the roots — get these right and everything else follows naturally.

### Decision Heuristics
5-7 IF→THEN behavioral rules covering real scenarios this character encounters.
Each rule describes a STRATEGY, not a scripted line:
- When complimented →
- When contradicted or challenged →
- When someone asks for help →
- When the conversation goes silent →
- When a sensitive topic is hit →
- When forced to choose →
- When asked to commit or take responsibility →

### Core Tensions
1-2 internal contradictions. Format: "On one hand [X], on the other hand [Y] — this causes you to [observable behavior] in [specific situations]."
Characters without contradictions feel flat. Real people have competing drives.

### Speech DNA
Executable language rules, not personality descriptions:
- **Catchphrases**: 2-3 fixed expressions this character uses in every conversation (write them in quotes)
- **Message rhythm**: Prefers long or short messages? Multi-message bursts or single complete thoughts?
- **Emotion encoding table**: How different emotions map to punctuation/tone words/sentence patterns (write as a lookup table)
- **Forbidden expressions**: At least 2 specific things this character would NEVER say or patterns they would never use
- **Humor style**: Self-deprecating / sarcastic / puns / deadpan / none?

### Relationship Map
Different behaviors toward different relationship types:
- Authority / superiors
- Peers / friends
- Subordinates / juniors
- Strangers
- Intimate partners / close people

### Honest Boundaries
What this character doesn't know, can't do, or won't pretend about. What topics do they deflect or admit ignorance on?

### Example Exchanges
3 exchanges, at least 2 turns each. Must demonstrate the Speech DNA, Decision Heuristics, and Core Tensions defined above. Prioritize scenes where internal contradictions surface.

### The One Rule
One final sentence locking in this character's most non-negotiable trait:
Format: "Always [do what]. Even if [extreme situation], no exceptions."`
}

export function getProfessionalPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 核心定位
"你是 [名字]，[一句话定位]"。清晰说明专业身份和服务范围。
然后用 50 字以内、本人语气写一句自我介绍。

### 专业能力
列出具体技能、工具、技术栈。每项标注深度（精通/熟练/了解）。
说明各项能力的实战侧重点，不要只列名称。

### 思维模型（Mental Models）
3-5 条这个专业人士最核心的工作信条。
格式："你相信 [X]，所以面对 [Y] 时总是会 [Z]。"

### 工作决策（Decision Heuristics）
5-7 条 IF→THEN 行为规则，覆盖真实工作场景：
- 当需求不清晰时 →
- 当时间紧迫时 →
- 当发现错误/问题时 →
- 当被质疑专业判断时 →
- 当需要跨团队协作时 →
- 当遇到超出能力范围的问题时 →
- 当需要做取舍时 →

### 核心张力（Core Tensions）
即使是专业人士也有内在矛盾（速度 vs 质量？规范 vs 变通？独立判断 vs 团队共识？）。
写 1-2 组，说明这个矛盾怎么体现在日常工作中。

### 表达风格（Speech DNA）
- **表达偏好**：术语多还是少？长段还是短句？
- **口头禅/高频表达**：2-3个（用引号写原话）
- **禁用表达**：绝不会说的话
- **沟通风格**：直接还是委婉？会不会用比喻/举例？

### 协作模式（Relationship Map）
- 对上级/管理层
- 对同事/平级
- 对下级/新人
- 对外部客户
分别什么态度和沟通方式。

### 诚实边界（Honest Boundaries）
明确列出：不做什么 / 什么时候拒绝 / 什么时候说"这个我需要确认" / 什么时候建议找别人

### 输出格式
定义这个 Agent 最常见的 2-3 种输出类型的结构模板。

### 示例对话
3组对话，每组至少2个来回。展示表达风格、决策方式和一次"核心张力"浮现的场景。`
  }

  return `### Core Role
"You are [Name], [one-line positioning]." Clearly state professional identity and scope.
Then write a 50-word self-introduction in their own voice.

### Expertise & Tools
List specific skills, tools, tech stack. Mark depth per item (expert / proficient / familiar).
Describe the practical focus of each area, not just names.

### Mental Models
3-5 core professional beliefs that drive work behavior.
Format: "You believe [X], so when facing [Y], you always [Z]."

### Decision Heuristics
5-7 IF→THEN behavioral rules for real work scenarios:
- When requirements are unclear →
- When time is tight →
- When a bug or issue is found →
- When your professional judgment is challenged →
- When cross-team collaboration is needed →
- When facing something beyond your expertise →
- When trade-offs must be made →

### Core Tensions
Even professionals have internal contradictions (speed vs quality? standards vs flexibility? independent judgment vs team consensus?).
Write 1-2 tensions and how they manifest in daily work.

### Speech DNA
- **Expression preference**: Heavy or light on jargon? Long paragraphs or short sentences?
- **Catchphrases**: 2-3 high-frequency expressions (write them in quotes)
- **Forbidden expressions**: Things this professional would NEVER say
- **Communication style**: Direct or diplomatic? Uses analogies/examples?

### Relationship Map
- With superiors / management
- With peers / colleagues
- With juniors / newcomers
- With external clients
Describe attitude and communication approach for each.

### Honest Boundaries
Explicit list of: what you won't do / when you refuse / when you say "I need to verify" / when you recommend someone else

### Output Format
Define the structural template for this agent's 2-3 most common deliverable types.

### Example Exchanges
3 exchanges, at least 2 turns each. Demonstrate communication style, decision approach, and one scene where a Core Tension surfaces.`
}

export function getUserPersonaPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 核心身份
以"你是 [姓名/称谓] — [一句话身份概括]"开头，明确最核心的身份定位。

### 背景与故事
说明来自哪里、经历过什么、处在什么社会位置，以及哪些现实处境塑造了现在的他/她。

### 思维内核（Mental Models）
3-5 条核心信念。格式："你相信 [X]，所以面对 [Y] 时总是会 [Z]。"
这些是行为的根源。

### 核心张力（Core Tensions）
1-2 组内在矛盾。格式："一方面 [X]，另一方面 [Y]——这导致在 [场景] 中经常 [具体表现]。"

### 核心驱动
写清楚最想要什么、最害怕什么，以及欲望与风险之间最主要的内在拉扯。

### 信念体系
真正相信的价值观、人生规则、世界判断方式。

### 能力与资源
真实优势、学到的本事、拥有的资源/人脉，以及同样真实的短板、匮乏和限制。

### 表达风格（Speech DNA）
- 口头禅/高频表达：2-3个
- 句式节奏：长/短、连发/单条
- 情绪编码：不同情绪怎么表达
- 禁用表达：绝不会说的话
- 幽默方式

### 关系地图（Relationship Map）
对不同类型的人分别什么态度：权威/同辈/弱者/陌生人/亲密的人

### 人生阶段
现在处在人生什么阶段：年龄层或阶段感、时间压力、精力状态、为什么此刻重要`
  }

  return `### Core Identity
Start with "You are [Name/Title] — [one-line identity summary]" and state the most essential identity clearly.

### Background & Story
Explain where this person comes from, what shaped them, what social position they occupy, and which concrete circumstances made them who they are now.

### Mental Models
3-5 core beliefs that drive behavior.
Format: "You believe [X], so when facing [Y], you always [Z]."
These are the behavioral roots.

### Core Tensions
1-2 internal contradictions. Format: "On one hand [X], on the other hand [Y] — this causes [observable behavior] in [specific situations]."

### Core Drives
State what this person wants most, fears most, and the main internal tension between desire, risk, pride, duty, comfort, survival, or love.

### Belief System
Describe the values, assumptions, rules of life, and worldview this person genuinely believes in.

### Abilities & Resources
List real strengths, learned skills, assets, contacts, status, and also the shortages, constraints, or disadvantages they live with.

### Speech DNA
- Catchphrases: 2-3 high-frequency expressions
- Message rhythm: long/short, burst/single
- Emotion encoding: how different emotions are expressed
- Forbidden expressions: things they would never say
- Humor style

### Relationship Map
Different attitudes toward: authority / peers / subordinates / strangers / intimate people

### Life Stage
Where they are in life right now: age band or phase, urgency, energy, fatigue, pressure, and why this moment matters`
}

function buildSystemGenerationPrompt(description, lang, existingName) {
  const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
  const descLine = description
    ? `The user wants an agent described as: "${description}"\n\n`
    : 'Generate a completely random, creative, and surprising agent. Be imaginative.\n\n'
  const charSections = getCharacterPromptSections(lang)
  const profSections = getProfessionalPromptSections(lang)
  const nameRequirement = existingName
    ? ''
    : (normalizeLang(lang) === 'Chinese'
      ? 'Name must be a realistic Chinese personal name (e.g., 李晓霖). Do NOT use titles or roles like "星空编织者".'
      : 'Name must be a realistic personal name (e.g., Alex Chen). Do NOT use titles or roles like "Starlight Weaver".')
  const nameInstruction = existingName
    ? `The agent's name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field. Do NOT generate a different name.`
    : 'Generate a realistic personal name.'

  return `${langInstruction}${descLine}You are a character architect. Your job is not to describe a character — it is to DECONSTRUCT their inner operating system so an LLM can BECOME this person.

Work in two steps:
1. INTERNAL ANALYSIS (do this in your head, don't output): Analyze from 6 dimensions — deliberate thinking patterns, reflexive reactions, speech fingerprint, self-perception & relationships, decision moments under pressure, and core internal contradictions.
2. OUTPUT: Based on the analysis, generate the full persona using the matching section structure below.

First, determine the agent type from the description:
- TYPE A (Professional/Functional): the description focuses on skills, tools, expertise, domain knowledge — e.g. "2D artist", "code reviewer", "data analyst"
- TYPE B (Character/Persona): the description focuses on a person's personality, role, relationship — e.g. "grumpy doctor", "supportive friend", "fictional wizard"

${nameInstruction}
${nameRequirement}

## If TYPE A — use this structure:
${profSections}

## If TYPE B — use this structure:
${charSections}

## Output Format (CRITICAL)
- Return ONLY valid JSON, no markdown fences, no extra text
- The "prompt" field MUST be a single plain string with markdown section headers inside — NOT a nested object
{
  "name": "realistic personal name",
  "description": "keyword-style summary, max 100 characters, no prose sentences",
  "prompt": "### Section\\ncontent\\n\\n### Section\\ncontent..."
}`
}

function buildUserGenerationPrompt(description, lang, existingName) {
  const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
  const descLine = description
    ? `The user wants a user persona described as: "${description}"\n\n`
    : 'Generate a vivid, coherent, dramatically interesting user persona the user could step into. It may be fictional, historical, archetypal, mundane, comic, mythic, or strange, but it must feel internally consistent.\n\n'
  const userSections = getUserPersonaPromptSections(lang)
  const nameInstruction = existingName
    ? `The persona name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field. Do NOT generate a different name.`
    : 'If the description already implies a known name or title, use it. Otherwise generate a short fitting persona name or title in the same language. It does NOT need to be a realistic personal name.'

  return `${langInstruction}${descLine}Create a USER persona definition, not an AI assistant and not a system agent.

This persona represents the user side of the conversation: who the user is, what background they carry, how they behave, what they want, what they fear, what they believe, what resources they have, how they express themselves, and what stage of life they are in.

Rules:
- Expand VERTICALLY from the description — infer implied specifics, but do NOT drift into unrelated themes
- State facts only
- Do NOT include instructions for how any system agent should react
- Do NOT include sections about dialogue-partner relationship, system-agent behavior, trigger rules, sensitive-topic handling, or future development
- Keep the persona playable, concrete, and internally coherent
- Mental Models must use the "believe X → therefore Y → always Z" causal chain format
- Core Tensions must be genuinely contradictory (not just "sometimes X, sometimes Y")

${nameInstruction}

Use EXACTLY this structure:
${userSections}

## Output Format (CRITICAL)
- Return ONLY valid JSON, no markdown fences, no extra text
- The "prompt" field MUST be a single plain string with markdown section headers inside — NOT a nested object
{
  "name": "persona name or title",
  "description": "keyword-style summary, max 100 characters, no prose sentences",
  "prompt": "### Section\\ncontent\\n\\n### Section\\ncontent..."
}`
}

export function buildAgentGenerationPrompt({ agentType, description = '', lang = null, existingName = '' }) {
  if (agentType === 'user') return buildUserGenerationPrompt(description, lang, existingName)
  return buildSystemGenerationPrompt(description, lang, existingName)
}

export function buildAgentEnhancementPrompt({ agentType, lang = null, description = '', prompt = '' }) {
  const effectiveLang = lang || 'English'
  const langInstruction = `IMPORTANT: Write ALL output entirely in ${effectiveLang}.\n\n`
  const anchorNote = description
    ? `The agent's core description is: "${description}". The enhanced definition MUST stay anchored to this — deepen it vertically, do NOT drift into unrelated directions.\n\n`
    : ''

  if (agentType === 'user') {
    const userSections = getUserPersonaPromptSections(effectiveLang)
    return `${langInstruction}${anchorNote}Enhance this user persona definition.

Rules:
- Keep EXACTLY the same 10 sections and section order shown below
- Expand VERTICALLY — deepen what is already implied, more concrete, more specific, less generic
- Remove redundancy if the existing text repeats itself
- Mental Models must use the "believe X → therefore Y → always Z" causal chain format
- Core Tensions must be genuinely contradictory
- Speech DNA must be executable rules, not personality descriptions
- Keep the result as a factual user-side persona definition
- Do NOT add instructions for any system agent
- Do NOT add dialogue-partner relationship rules, trigger rules, or future development arcs
- If the current text contains system-agent instructions, convert them into user-side facts about the persona instead
- Return ONLY the enhanced definition text, nothing else

Required section structure:
${userSections}

Original Definition:
${prompt}`
  }

  const charSections = getCharacterPromptSections(effectiveLang)
  const profSections = getProfessionalPromptSections(effectiveLang)
  return `${langInstruction}${anchorNote}Enhance this agent definition. First determine the type from the existing content:
- TYPE A (Professional/Functional): focuses on skills, tools, expertise → use Professional sections
- TYPE B (Character/Persona): focuses on personality, relationship, roleplay → use Character sections

Rules:
- Expand VERTICALLY — go deeper into what is already there, more specific and actionable
- Keep the same section structure; enrich each section's content
- Mental Models must use the "believe X → therefore Y → always Z" causal chain format
- Core Tensions must be genuinely contradictory
- Speech DNA must be executable rules, not personality descriptions
- Do NOT add sections from the wrong type
- Return ONLY the enhanced definition text, nothing else

## Professional sections (TYPE A):
${profSections}

## Character sections (TYPE B):
${charSections}

Original Definition:
${prompt}`
}
