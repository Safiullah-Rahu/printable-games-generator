import { useState } from 'react'
import { PROVIDERS } from '../ai/client'
import { looksLikeKey } from '../ai/store'
import { AiError, type AiProviderId, type AiSettings, type ContentPack } from '../ai/types'
import { Button, Field, SectionHeading, Segmented, TextInput, Toggle } from './ui/controls'

/**
 * AI boost panel.
 *
 * Deliberately framed as optional. The app's whole premise is that it works
 * with no network and no account, so this panel has to make the trade explicit:
 * what leaves the device, where the key is stored, and that the sheet is still
 * generated and validated locally either way.
 */

export interface AiPanelProps {
  settings: AiSettings
  onChange: (patch: Partial<AiSettings>) => void
  pack: ContentPack | null
  busy: 'content' | 'variation' | null
  error: AiError | null
  notes: string[]
  onGenerateContent: () => void
  onSurpriseMe: () => void
  onClearPack: () => void
  onForgetKey: () => void
}

export function AiPanel(props: AiPanelProps): JSX.Element {
  const { settings, onChange, pack, busy, error, notes } = props
  const provider = PROVIDERS[settings.provider]
  const [showKey, setShowKey] = useState(false)

  const hasKey = settings.apiKey.trim().length > 0
  const keyLooksWrong = hasKey && !looksLikeKey(settings.provider, settings.apiKey)

  const switchProvider = (id: AiProviderId): void => {
    onChange({ provider: id, model: PROVIDERS[id].defaultModel })
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading>Optional AI boost</SectionHeading>

        <p className="mb-4 text-xs leading-relaxed text-slate-600">
          Everything in this app already works offline. Add your own API key and a model can write
          <strong className="font-semibold text-slate-800"> fresh content on any topic</strong> you
          name, or pick a completely different game for you. The sheet is still built, validated and
          rendered on this device.
        </p>

        <div className="space-y-4">
          <Field label="Provider">
            <Segmented
              value={settings.provider}
              onChange={switchProvider}
              options={[
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
          </Field>

          <Field label={`${provider.label} API key`} hint={provider.keyHint} htmlFor="ai-key">
            <div className="flex gap-2">
              <input
                id="ai-key"
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={`${provider.keyPrefix}…`}
                onChange={(e) => onChange({ apiKey: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              />
              <Button onClick={() => setShowKey((v) => !v)} title={showKey ? 'Hide key' : 'Show key'}>
                {showKey ? 'Hide' : 'Show'}
              </Button>
            </div>
          </Field>

          {keyLooksWrong && (
            <p className="-mt-2 text-xs text-amber-700">
              That does not look like a {provider.label} key (expected it to start with{' '}
              <code className="font-mono">{provider.keyPrefix}</code>). It will still be sent if you
              continue.
            </p>
          )}

          <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
            <Toggle
              checked={settings.remember}
              onChange={(remember) => {
                onChange({ remember })
                if (!remember) props.onForgetKey()
              }}
              label="Remember this key in the browser"
              description="Stored in localStorage on this device. Any script on this page could read it. Leave off to keep it for this session only."
            />
          </div>

          <Field label="Model" hint={provider.docsNote} htmlFor="ai-model">
            <input
              id="ai-model"
              list="ai-model-options"
              value={settings.model}
              spellCheck={false}
              onChange={(e) => onChange({ model: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
            <datalist id="ai-model-options">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <Field label="Topic" hint="what the content should be about" htmlFor="ai-topic">
            <TextInput
              id="ai-topic"
              value={settings.topic}
              onChange={(topic) => onChange({ topic })}
              placeholder="e.g. the water cycle, Ancient Rome, coral reefs"
            />
          </Field>

          {!provider.browserReachable && (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
              <p className="text-xs font-semibold text-amber-900">A proxy is required for {provider.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                Their API does not allow calls straight from a browser, so a request from this page
                is blocked before it reaches them. Point the field below at your own proxy, or use
                Anthropic, which supports direct browser access.
              </p>
            </div>
          )}

          <Field
            label="API base URL"
            hint={provider.browserReachable ? 'optional' : 'required'}
            htmlFor="ai-base"
          >
            <TextInput
              id="ai-base"
              value={settings.baseUrl}
              onChange={(baseUrl) => onChange({ baseUrl })}
              placeholder={provider.baseUrl}
              mono
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Generate</SectionHeading>

        <div className="space-y-2">
          <Button
            variant="primary"
            className="w-full"
            disabled={!hasKey || busy !== null}
            onClick={props.onGenerateContent}
          >
            {busy === 'content' ? 'Writing content…' : 'Write fresh content on this topic'}
          </Button>
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            Fills the current game with model-written words, clues and questions. Works with word
            search, crossword, quiz and flash cards, matching, memory, trivia and the board game.
          </p>

          <Button
            className="mt-3 w-full"
            disabled={!hasKey || busy !== null}
            onClick={props.onSurpriseMe}
          >
            {busy === 'variation' ? 'Choosing a game…' : 'Surprise me with a different game'}
          </Button>
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            Lets the model pick the game type, subject, theme and size. Its choice is checked against
            what this app can actually build before anything is generated.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 ring-1 ring-red-200">
            <p className="text-xs font-semibold text-red-800">{error.message}</p>
            {error.kind === 'network' && (
              <p className="mt-1 text-[11px] leading-relaxed text-red-700">
                If you are offline this is expected — everything except this panel still works. If
                you are online, your browser or an extension may be blocking the request.
              </p>
            )}
            {error.detail && (
              <p className="mt-1 max-h-24 overflow-y-auto font-mono text-[10px] leading-snug text-red-600">
                {error.detail.slice(0, 500)}
              </p>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {notes.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-amber-700">
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pack && (
        <section>
          <SectionHeading
            action={
              <button
                type="button"
                onClick={props.onClearPack}
                className="text-[11px] font-medium text-slate-400 transition hover:text-red-600"
              >
                Remove
              </button>
            }
          >
            Active content pack
          </SectionHeading>

          <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-900">{pack.topic}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {pack.model} · {pack.facts.length} facts · {pack.questions.length} questions ·{' '}
              {pack.words.length} words
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              This content is used first, then topped up from the built-in libraries. Regenerating
              the game reuses it — no further requests are made.
            </p>
          </div>

          {pack.facts.length > 0 && (
            <details className="mt-2 rounded-lg ring-1 ring-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
                Preview what the model wrote
              </summary>
              <ul className="max-h-56 space-y-1 overflow-y-auto px-3 pb-3">
                {pack.facts.slice(0, 12).map((fact) => (
                  <li key={fact.term} className="text-[11px] leading-snug text-slate-600">
                    <span className="font-semibold text-slate-800">{fact.term}</span> — {fact.clue}
                  </li>
                ))}
                {pack.questions.slice(0, 8).map((q) => (
                  <li key={q.question} className="text-[11px] leading-snug text-slate-600">
                    {q.question} <span className="font-semibold text-slate-800">→ {q.answer}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section>
        <SectionHeading>What gets sent</SectionHeading>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-500">
          <li>
            <strong className="text-slate-700">Sent:</strong> your topic, the grade, difficulty and
            subject — and your API key, to that provider only.
          </li>
          <li>
            <strong className="text-slate-700">Not sent:</strong> generated games, your history, or
            anything else on this device.
          </li>
          <li>
            <strong className="text-slate-700">Checked:</strong> every returned item is length- and
            character-filtered, and any maths answer is re-derived and dropped if it does not verify.
          </li>
          <li>
            <strong className="text-slate-700">Billing:</strong> requests go to your own account at
            your provider's rates. Nothing is proxied through anyone else.
          </li>
        </ul>
      </section>
    </div>
  )
}
