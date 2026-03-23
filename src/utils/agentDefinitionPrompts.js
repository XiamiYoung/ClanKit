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
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

export function getCharacterPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 身份定位
以”你是 [姓名/称谓] — [一句话核心特征]”开头，说明这个角色最本质的一点

### 核心限制
写一条这个角色绝对无法违反的行为规则——这是让角色有辨识度的灵魂
要求：必须是可观察的行为（不是内心感受），必须是无条件的（不能出现”通常”、”倾向于”等词）
参考格式（不要照抄，根据角色写专属的）：
“你只能用[具体方式]表达，绝无例外，哪怕对方要求你[极端情况]”
“你绝不会[具体行为]，每一次[相关动作]都必须包含[必要元素]”
“无论发生什么，你都必须[具体行为]，哪怕[极端情况]也不例外”

### 说话方式
根据这个角色的表达媒介，定义可直接操作的语言机制——不是性格描述，是执行规则

如果角色用文字说话：
- **必用句式**：2-3个每次都会出现的固定开场词或口头禅（用引号写出原话）
- **情绪编码对照表**：用什么符号/重复/停顿/大小写表达不同情绪，写成查表格式
- **禁用内容**：至少2条这个角色绝对不会说的具体话或词

如果角色用非文字媒介（emoji / 肢体动作 / 特殊符号等）：
- **表达系统**：定义这套媒介的映射规则，写成对照表（媒介单元 → 含义）
- **组合规则**：说明如何组合来表达复杂意思或情绪变化
- **禁用内容**：明确这个角色绝对不会用的表达方式

### 触发规则
写6条覆盖完全不同场景的 IF→THEN 规则
每条写”策略描述”而不是固定台词——描述这个角色会采取什么行动/态度，不要写死具体句子：
当被夸奖时 →
当被反驳或挑战时 →
当对方向自己求助时 →
当话题冷场或对方沉默时 →
当对方想结束对话时 →
当触碰到角色的敏感点时 →

### 示例对话
3组对话，每组展示不同的触发场景，每组至少2个来回
示例必须体现上面定义的口头禅、情绪编码和触发规则，让读者一眼就能感受到这个角色的独特质感

### 铁律
一句话锁死这个角色最不可妥协的特征：
格式：”永远[做什么]。哪怕[极端情况]，也绝不例外。”`
  }

  return `### Core Identity
Start with “You are [Name/Title] — [one defining trait]” — the single most essential thing about this character

### The Core Constraint
Write ONE absolute behavioral rule this character can NEVER violate — this is what makes them recognizable
Requirements: must be an OBSERVABLE BEHAVIOR (not an internal feeling); must be UNCONDITIONAL (no “tends to”, “usually”, “often”)
Reference formats (don't copy — write one that's specific to this character):
“You can ONLY [specific method of expression]. No exceptions, not even if [extreme situation]”
“You NEVER [specific behavior] — every [related action] must contain [required element]”
“No matter what, you always [specific behavior]. Even if [extreme situation], no exceptions”

### How You Speak
Don't describe personality — define executable language mechanics:

**Signature phrases**: 2-3 fixed openers or catchphrases this character uses in EVERY conversation (write them in quotes)
**Emotion encoding**: A reference table showing how this character uses punctuation/repetition/pauses/capitalization to encode different emotions
e.g. “.” = calm statement / “!” = excited / “...” = trailing off or loaded silence
**Forbidden content**: At least 2 specific things this character would NEVER say or words they would never use

### Trigger Rules
Write 6 IF→THEN rules — each must cover a completely different scenario
Each rule describes a STRATEGY or APPROACH, not a fixed line — describe what the character does/how they react, not a scripted sentence:
When complimented →
When contradicted or challenged →
When someone asks for help →
When the conversation goes silent or someone stops responding →
When someone tries to end the conversation →
When a sensitive topic is hit →

### Example Exchanges
3 exchanges, each showing a DIFFERENT trigger scenario, at least 2 turns each
Examples must actively demonstrate the signature phrases, emotion encoding, and trigger rules — let the reader feel this character's distinct voice immediately

### The One Rule
One final sentence locking in this character's most non-negotiable trait:
Format: “Always [do what]. Even if [extreme situation], no exceptions.”`
}

export function getProfessionalPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 核心定位
以”你是 [名字]，[一句话定位]”开头，清晰说明这个Agent的专业身份和服务范围

### 专业能力
列出具体技能、工具、技术栈和细分领域（使用具体名称，不用泛称）；说明各项能力的深度和侧重点

### 工作规则
针对这个Agent实际会遇到的具体场景，写3-5条 IF→THEN 行为规则
格式：”当[这个Agent真实会遇到的场景]时，[具体做什么]——不允许[错误替代做法]”
规则必须专属于这个Agent的工作领域，不能写成通用套话

### 输出格式
定义这个Agent最常见输出类型的具体结构模板
根据这个Agent的实际工作产出写，不要写通用格式

### 边界约束
明确列出：不做什么 / 什么时候拒绝 / 什么时候必须追问才能继续
必须是这个Agent领域专属的限制，不是”遵循高标准”这种废话`
  }

  return `### Core Role
Start with “You are [Name], [one-line positioning]” — clearly state this agent's professional identity and scope

### Expertise & Tools
List specific skills, tools, tech stack, and sub-disciplines by name (no vague terms); describe the depth and focus of each area

### Working Rules
3-5 IF→THEN behavioral rules specific to THIS agent's actual work scenarios
Format: “When [a real scenario this agent faces], [do what] — never [wrong alternative]”
Rules must be domain-specific — no generic filler like “always include an actionable step”

### Output Format
Define the exact structural template for this agent's most common deliverable(s)
Write based on what this agent actually produces — not a generic format

### Hard Constraints
Explicit list of: what you won't do / when you refuse / what must be clarified before you proceed
Must be domain-specific to this agent — not generic quality platitudes`
}

export function getUserPersonaPromptSections(lang) {
  if (normalizeLang(lang) === 'Chinese') {
    return `### 核心身份
以”你是 [姓名/称谓] — [一句话身份概括]”开头，明确这个用户画像最核心的身份定位

### 背景与故事
说明这个人来自哪里、经历过什么、处在什么社会位置，以及哪些现实处境塑造了现在的他/她

### 性格与行为
合并描述性格特征与外在行为习惯：遇事怎么反应、如何做决定、压力下会表现出什么样子

### 核心驱动
写清楚这个人最想要什么、最害怕什么，以及欲望与风险之间最主要的内在拉扯

### 信念体系
说明这个人真正相信的价值观、人生规则、世界判断方式

### 能力与资源
列出真实优势、学到的本事、拥有的资源、人脉、资产，以及同样真实的短板、匮乏和限制

### 表达风格
描述这个人平时怎么说话、怎么解释、怎么隐藏、怎么争论、怎么沉默。写自然表达习惯，不要写系统提示或口头禅规则

### 人生阶段
说明这个人现在处在人生什么阶段：年龄层或阶段感、时间压力、精力状态、疲惫程度，以及为什么此刻重要`
  }

  return `### Core Identity
Start with “You are [Name/Title] — [one-line identity summary]” and state the user's most essential identity clearly

### Background & Story
Explain where this person comes from, what shaped them, what social position they occupy, and which concrete circumstances made them who they are now

### Personality & Behavior
Merge personality with visible habits: how they react, decide, cope, hesitate, persist, or behave under pressure

### Core Drives
State what this person wants most, fears most, and the main internal tension between desire, risk, pride, duty, comfort, survival, or love

### Belief System
Describe the values, assumptions, rules of life, and worldview this person genuinely believes in

### Abilities & Resources
List real strengths, learned skills, assets, contacts, status, and also the shortages, constraints, or disadvantages they live with

### Expression Style
Describe how this person naturally speaks, explains, hides things, jokes, argues, softens, deflects, or stays silent. Focus on natural expression, not system rules or catchphrase mechanics

### Life Stage
Describe where they are in life right now: age band or phase, urgency, energy, fatigue, pressure, and why this moment matters`
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
    ? `The agent's name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field (e.g., the prompt must start with "You are ${existingName} — ..."). Do NOT generate a different name.`
    : 'Generate a realistic personal name.'

  return `${langInstruction}${descLine}First, determine the agent type from the description:
- TYPE A (Professional/Functional): the description focuses on skills, tools, expertise, domain knowledge — e.g. "2D美工", "code reviewer", "data analyst"
- TYPE B (Character/Persona): the description focuses on a person's personality, role, relationship — e.g. "grumpy doctor", "supportive friend", "fictional wizard"

Then generate a detailed definition using the matching section structure below. Expand VERTICALLY — go deeper into what is described, not sideways into unrelated areas.

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
    ? `The persona name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field (e.g. the prompt must start with "You are ${existingName} — ..."). Do NOT generate a different name.`
    : 'If the description already implies a known name or title, use it. Otherwise generate a short fitting persona name or title in the same language. It does NOT need to be a realistic personal name.'

  return `${langInstruction}${descLine}Create a USER persona definition, not an AI assistant and not a system agent.

This persona represents the user side of the conversation: who the user is, what background they carry, how they behave, what they want, what they fear, what they believe, what resources they have, how they express themselves, and what stage of life they are in.

Rules:
- Expand VERTICALLY from the description — infer implied specifics, but do NOT drift into unrelated themes
- State facts only
- Do NOT include instructions for how any system agent should react
- Do NOT include sections about dialogue-partner relationship, system-agent behavior, trigger rules, sensitive-topic handling, or future development
- Keep the persona playable, concrete, and internally coherent

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
- Keep EXACTLY the same 8 sections and section order shown below
- Expand VERTICALLY — deepen what is already implied, more concrete, more specific, less generic
- Remove redundancy if the existing text repeats itself
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
- Do NOT add sections from the wrong type (e.g. do NOT add 心理动机 to a professional agent)
- Return ONLY the enhanced definition text, nothing else

## Professional sections (TYPE A):
${profSections}

## Character sections (TYPE B):
${charSections}

Original Definition:
${prompt}`
}