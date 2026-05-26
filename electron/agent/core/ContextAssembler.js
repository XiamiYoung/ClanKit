/**
 * ContextAssembler — composition root for pre-call history assembly.
 * Replaces the bare sliceToLastNTurns call in agentLoop.js.
 *
 * Pipeline: resolveBudget → windowHistory → (ensureSummary ∥ retrieve) →
 *           [summaryBlock?, retrievalBlock?, ...kept].
 * Fast path: when nothing is evicted, return messages unchanged.
 */
const { resolveBudget } = require('./BudgetResolver')
const { windowHistory } = require('./HistoryWindower')
const { ensureSummary } = require('./Summarizer')
const { retrieve } = require('./RetrievalInjector')

function _lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return typeof messages[i].content === 'string' ? messages[i].content : ''
    }
  }
  return ''
}

// Synthetic context is injected as a user message so it survives provider
// message-format conversion uniformly (matches how trim notices are injected).
function _contextMessage(label, text) {
  return { role: 'user', content: `[${label}]\n${text}` }
}

async function assemble({
  messages, chatId, agentKey, modelId, providerType, modelContextWindow,
  chatStore, utilityModelCaller, estimateTokens,
}) {
  const budget = resolveBudget({ modelId, providerType, modelContextWindow })
  const { kept, evicted } = windowHistory(messages, budget.verbatimBudget, { estimateTokens })

  // Fast path: whole history fits — behave like today (minus the 20-turn cap).
  if (evicted.length === 0) {
    return { messages: kept, budget, summaryStrategy: null }
  }

  const keptIds = new Set(kept.map(m => m.id).filter(Boolean))
  const query = _lastUserText(messages)

  const [summary, retrieval] = await Promise.all([
    ensureSummary({ chatId, agentKey, providerType, evicted, chatStore, utilityModelCaller }),
    retrieve({ chatId, query, excludeIds: keptIds, budget: budget.retrievalReserve, chatStore }),
  ])

  const prefix = []
  if (summary.strategy === 'text' && summary.summaryBlock) {
    prefix.push(_contextMessage('Summary of earlier conversation', summary.summaryBlock))
  }
  if (retrieval.retrievalBlock) {
    prefix.push(_contextMessage('Relevant earlier messages', retrieval.retrievalBlock))
  }

  return {
    messages: [...prefix, ...kept],
    budget,
    summaryStrategy: summary.strategy,
  }
}

module.exports = { assemble }
