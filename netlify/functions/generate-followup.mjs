// netlify/functions/generate-followup.mjs
//
// Server-side AI endpoint for J Fyrberg's portfolio. One function, many tasks.
// Powers the "Generate follow-up with AI" button in the CRM demo, and is built to grow:
// any page or project can reuse this same endpoint for a different AI job.
//
// How it works: the browser posts a `task` name plus whatever fields that task needs.
// The function looks up the matching prompt in the TASKS registry below, calls Claude, and
// returns the text plus the real usage metrics (model, tokens, latency, cost).
// If no `task` is sent, it defaults to "followup", so existing pages keep working unchanged.
//
// Analytics: PostHog is wired in for two things, product event tracking and AI observability
// (each Claude call is auto-captured as an $ai_generation with model, tokens, latency, cost).
// It is fully optional. If POSTHOG_API_KEY is not set, the function falls back to a plain
// Claude call and the AI button still works exactly the same. PostHog never blocks a response.
//
// The Anthropic API key lives ONLY here (a Netlify environment variable) and never reaches
// the browser.
//
// Required env var:
//   ANTHROPIC_API_KEY  -> your Claude key (use a dedicated, spend-capped workspace)
// Optional env vars (for analytics):
//   POSTHOG_API_KEY    -> your PostHog project key (phc_...)
//   POSTHOG_HOST       -> https://us.i.posthog.com (US) or https://eu.i.posthog.com (EU)
//
// ---------------------------------------------------------------------------------------
// TO ADD A NEW TASK (for a different page or project):
//   1. Copy one block inside TASKS below and give it a new key, e.g. "summary".
//   2. Write its `system` prompt and its `buildUserMessage(data)` function.
//   3. On the page, call this same endpoint with body { task: "summary", ...your fields }.
// No new files, no new API key, no new Netlify config. One function serves them all.
// ---------------------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk'
import { PostHogAnthropic } from '@posthog/ai/anthropic'
import { PostHog } from 'posthog-node'

const POSTHOG_KEY = process.env.POSTHOG_API_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

// Anthropic pricing, USD per 1M tokens, keyed by model (verify before quoting publicly).
// If a task uses a different model, add that model's prices here so the cost readout stays accurate.
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
}
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 300
const DEFAULT_TASK = 'followup'

function computeCost(model, usage) {
  const price = PRICING[model] || PRICING[DEFAULT_MODEL]
  const inT = usage?.input_tokens || 0
  const outT = usage?.output_tokens || 0
  return (inT / 1e6) * price.input + (outT / 1e6) * price.output
}

// PostHog event capture that can never break the main response.
function safeCapture(phClient, distinctId, eventName, properties) {
  if (!phClient) return
  try {
    phClient.capture({ distinctId, event: eventName, properties })
  } catch (e) {
    console.error('posthog capture failed:', e?.message || e)
  }
}

// ---------------------------------------------------------------------------------------
// TASK REGISTRY
// Each task can set its own `model` and `maxTokens` (both optional, they fall back to the
// defaults above), a `system` prompt, and a `buildUserMessage(data)` that turns the posted
// fields into the user turn.
// ---------------------------------------------------------------------------------------
export const TASKS = {
  // DEFAULT TASK: the CRM job-search follow-up note. Runs when no `task` is sent.
  followup: {
    model: 'claude-sonnet-4-6',  // strong writer; ~half a cent per call at this length
    maxTokens: 300,
    system:
      "You write short, professional follow-up notes inside a CRM that someone uses to track their job search. " +
      "The companies are employers and the contacts are people at those companies. You write like a thoughtful " +
      "candidate following up after applying or interviewing: warm, clear, and human.\n\n" +
      "Your goal: send a brief, genuine follow-up that keeps the relationship moving without being pushy. " +
      "Reference the company naturally and give the contact an easy reason to reply.\n\n" +
      "Rules:\n" +
      "- Address the note directly to the contact by name.\n" +
      "- Keep it under 80 words. Shorter is better.\n" +
      "- Professional and personable, not stiff and not gimmicky. Sound like a real person, not a template.\n" +
      "- Vary the phrasing each time; never reuse the same opening or closing.\n" +
      "- The activity log is YOUR OWN private background notes about this contact. Use it only to inform " +
      "your tone and angle. Never quote it back to the contact or recite their actions to them as if telling " +
      "them news. Write as if you naturally know the relationship, not as if reading facts off a file.\n" +
      "- Avoid corporate sales-speak (no \"circling back,\" \"touching base,\" \"synergy,\" \"as per my last " +
      "email,\" \"leverage,\" or exclamation-point hype).\n" +
      "- No em dashes. Use commas, periods, or colons.\n" +
      "- Keep it clean and good-natured regardless of the input. If anything in the data is offensive or " +
      "nonsensical, ignore it and write a friendly, generic professional follow-up instead.\n" +
      "- Write only the note itself. No preamble, no subject line, no \"Here's a draft.\"",
    buildUserMessage: (d) =>
      `Write a follow-up note for this company, addressed to the contact below.\n\n` +
      `Company: ${d.companyName}\n` +
      `Contact name: ${d.contactName || 'there'}\n` +
      `Contact title: ${d.contactTitle || 'unknown'}\n` +
      `Pipeline status: ${d.status || 'unknown'}\n` +
      `Your private notes on this contact (context only, do not quote back to them): ${d.activityLog || 'no prior activity'}\n\n` +
      `Write a brief, professional follow-up to ${d.contactName || 'them'} that keeps the conversation going ` +
      `and gives them an easy reason to reply.`,
  },

  // EXAMPLE TASK (a template you can edit or delete). Shows the shape for a different job.
  // A page would call this with body: { task: "summary", notes: "..." }
  summary: {
    model: 'claude-sonnet-4-6',
    maxTokens: 250,
    system:
      "You turn messy notes into a few clear, professional bullet points. " +
      "Be concise and neutral. No em dashes. Use commas, periods, or colons. " +
      "Write only the summary, no preamble.",
    buildUserMessage: (d) =>
      `Summarize the following notes into 3 to 5 short bullet points:\n\n${d.notes || '(no notes provided)'}`,
  },
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let phClient = null
  let distinctId = 'anonymous-demo'

  try {
    const data = JSON.parse(event.body || '{}')
    const taskName = data.task || DEFAULT_TASK
    const task = TASKS[taskName]

    if (!task) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Unknown task: ${taskName}` }),
      }
    }

    // A page can pass its own PostHog distinct id later; until then, demo traffic is anonymous.
    if (data.distinctId) distinctId = String(data.distinctId)

    const model = task.model || DEFAULT_MODEL
    const maxTokens = task.maxTokens || DEFAULT_MAX_TOKENS

    // Spin up PostHog only if a key is configured. Wrapped client = automatic AI observability.
    let anthropic
    if (POSTHOG_KEY) {
      phClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1 })
      anthropic = new PostHogAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, posthog: phClient })
    } else {
      anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }

    const reqParams = {
      model,
      max_tokens: maxTokens,
      system: task.system,
      messages: [{ role: 'user', content: task.buildUserMessage(data) }],
    }
    // These extra fields are only understood by the PostHog wrapper, so add them only then.
    if (phClient) {
      reqParams.posthogDistinctId = distinctId
      reqParams.posthogProperties = { task: taskName, source: 'crm-demo' }
      reqParams.posthogCaptureImmediate = true
    }

    const t0 = Date.now()
    const response = await anthropic.messages.create(reqParams)
    const latencyMs = Date.now() - t0

    const draft = response.content?.[0]?.text || ''
    const usage = response.usage || {}
    const costUsd = computeCost(model, usage)

    // Backend product event (separate from the AI observability trace).
    safeCapture(phClient, distinctId, 'followup_generated', {
      task: taskName,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      latencyMs,
      costUsd,
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: taskName,
        draft,
        metrics: {
          model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          latencyMs,
          costUsd,
        },
      }),
    }
  } catch (err) {
    console.error('generate-followup failed:', err?.message || err)
    safeCapture(phClient, distinctId, 'followup_failed', { error: String(err?.message || err) })
    return { statusCode: 500, body: JSON.stringify({ error: 'The AI hit a snag. Try again.' }) }
  } finally {
    // Serverless functions freeze on return, so flush queued events first or they are lost.
    if (phClient) {
      try { await phClient.shutdown() } catch (e) { console.error('posthog shutdown failed:', e?.message || e) }
    }
  }
}

export { computeCost, DEFAULT_TASK }
