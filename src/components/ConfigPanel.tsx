import { LENGTH_OPTIONS } from '../engines/config'
import { describeProfile, itemsForDuration } from '../engines/difficulty'
import { THEME_OPTIONS } from '../engines/layout/theme'
import { getGenerator } from '../engines/registry'
import {
  DIFFICULTIES, GRADES, MATH_TOPICS, PLAYER_OPTIONS, SUBJECTS,
  type DifficultyProfile, type GameConfig,
} from '../types'
import { randomSeed } from '../utils/rng'
import { Button, Field, SectionHeading, Segmented, Select, Slider, TextInput, Toggle, type Option } from './ui/controls'

/**
 * Configuration panel.
 *
 * Controls that the selected generator does not use are hidden rather than
 * disabled - a player-count slider on a solo word search is noise. Everything
 * the panel offers is read from the generator's own declaration, so it stays
 * correct as generators are added.
 */
export function ConfigPanel({
  config,
  profile,
  onChange,
}: {
  config: GameConfig
  profile: DifficultyProfile
  onChange: (patch: Partial<GameConfig>) => void
}): JSX.Element {
  const generator = getGenerator(config.gameType)
  if (!generator) return <p className="text-sm text-danger">Unknown game type.</p>

  const subjectOptions: Array<Option<GameConfig['subject']>> = SUBJECTS
    .filter((s) => generator.subjects.includes(s.id))
    .map((s) => ({ value: s.id, label: s.label }))

  const showMathTopic = config.subject === 'mathematics' || generator.category === 'math'
  const [itemMin, itemMax] = generator.itemRange ?? [0, 0]

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading>Level</SectionHeading>
        <div className="space-y-4">
          <Field label="Grade / age" htmlFor="cfg-grade">
            <Select
              id="cfg-grade"
              value={config.grade}
              onChange={(grade) => onChange({ grade })}
              options={GRADES.map((g) => ({ value: g.id, label: `${g.label}  (age ${g.age})` }))}
            />
          </Field>

          <Field label="Difficulty" hint={`score ${Math.round(profile.score)}/100`}>
            <Segmented
              value={config.difficulty}
              onChange={(difficulty) => onChange({ difficulty })}
              options={DIFFICULTIES.map((d) => ({
                value: d.id,
                label: d.label.replace('Very ', 'V.'),
                description: d.label,
              }))}
            />
          </Field>

          <div className="rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-line">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              What this produces
            </p>
            <ul className="space-y-0.5">
              {describeProfile(profile).map((line) => (
                <li key={line} className="text-xs leading-snug text-ink-muted">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading>Content</SectionHeading>
        <div className="space-y-4">
          <Field label="Subject" htmlFor="cfg-subject">
            <Select
              id="cfg-subject"
              value={config.subject}
              onChange={(subject) => onChange({ subject })}
              options={subjectOptions}
            />
          </Field>

          {showMathTopic && (
            <Field label="Maths topic" htmlFor="cfg-topic">
              <Select
                id="cfg-topic"
                value={config.mathTopic}
                onChange={(mathTopic) => onChange({ mathTopic })}
                options={MATH_TOPICS.map((t) => ({ value: t.id, label: t.label }))}
              />
            </Field>
          )}

          {generator.itemRange && (
            <Field label={generator.itemLabel} hint={`${config.itemCount}`} htmlFor="cfg-items">
              <Slider
                id="cfg-items"
                value={config.itemCount}
                min={itemMin}
                max={itemMax}
                onChange={(itemCount) => onChange({ itemCount })}
              />
            </Field>
          )}

          {generator.usesPlayers && (
            <Field label="Players" htmlFor="cfg-players">
              <Select
                id="cfg-players"
                value={config.players}
                onChange={(players) => onChange({ players })}
                options={PLAYER_OPTIONS.map((p) => ({ value: p.id, label: p.label }))}
              />
            </Field>
          )}

          <Field
            label="Game length"
            hint={
              generator.itemRange
                ? `about ${itemsForDuration(config.lengthMinutes, 45)} ${generator.itemLabel.toLowerCase()}`
                : `${config.lengthMinutes} min`
            }
            htmlFor="cfg-length"
          >
            <div className="flex flex-wrap gap-1.5">
              {LENGTH_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => onChange({ lengthMinutes: minutes })}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    config.lengthMinutes === minutes
                      ? 'bg-accent text-accent-ink shadow-panel'
                      : 'bg-surface-sunken text-ink-muted hover:text-ink ring-1 ring-inset ring-line'
                  }`}
                >
                  {minutes}m
                </button>
              ))}
              <input
                type="number"
                min={3}
                max={120}
                value={config.lengthMinutes}
                onChange={(e) => onChange({ lengthMinutes: Number(e.target.value) })}
                aria-label="Custom length in minutes"
                className="w-16 rounded-md border border-line px-2 py-1 text-xs tabular-nums outline-none focus:border-accent"
              />
            </div>
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading>Look &amp; paper</SectionHeading>
        <div className="space-y-4">
          <Field label="Theme">
            <div className="grid grid-cols-5 gap-1.5">
              {THEME_OPTIONS.map((theme) => {
                const active = theme.id === config.theme
                return (
                  <button
                    key={theme.id}
                    type="button"
                    title={`${theme.label} — ${theme.description}`}
                    onClick={() => onChange({ theme: theme.id })}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition ${
                      active ? 'bg-accent-soft ring-2 ring-accent' : 'ring-1 ring-line hover:ring-line-strong'
                    }`}
                  >
                    <span
                      className="h-4 w-full rounded-sm ring-1 ring-black/10"
                      style={{ background: theme.swatch }}
                    />
                    <span className="text-[10px] leading-none text-ink-muted">{theme.label}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Paper size">
              <Segmented
                value={config.pageSize}
                onChange={(pageSize) => onChange({ pageSize })}
                options={[
                  { value: 'a4', label: 'A4' },
                  { value: 'letter', label: 'Letter' },
                ]}
              />
            </Field>
            <Field label="Orientation">
              <Segmented
                value={config.orientation}
                onChange={(orientation) => onChange({ orientation })}
                options={generator.orientations.map((o) => ({
                  value: o,
                  label: o === 'portrait' ? 'Portrait' : 'Landscape',
                }))}
              />
            </Field>
          </div>

          <div className="space-y-0.5">
            <Toggle
              checked={config.includeInstructions}
              onChange={(includeInstructions) => onChange({ includeInstructions })}
              label="Instructions"
              description="Print a how-to-play panel on the sheet."
            />
            <Toggle
              checked={config.includeAnswerKey}
              onChange={(includeAnswerKey) => onChange({ includeAnswerKey })}
              label="Answer key"
              description="Add solution pages at the end."
            />
            <Toggle
              checked={config.cutLines}
              onChange={(cutLines) => onChange({ cutLines })}
              label="Cutting guides"
              description="Dashed lines around cards and tiles."
            />
            <Toggle
              checked={config.nameLine}
              onChange={(nameLine) => onChange({ nameLine })}
              label="Name and date line"
              description="Rules under the title for the student's name."
            />
            <Toggle
              checked={config.inkSaver}
              onChange={(inkSaver) => onChange({ inkSaver })}
              label="Ink saver"
              description="Drop solid fills and decoration to save toner."
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeading>Advanced</SectionHeading>
        <div className="space-y-4">
          <Field label="Seed" hint="same seed = same game" htmlFor="cfg-seed">
            <div className="flex gap-2">
              <TextInput id="cfg-seed" value={config.seed} onChange={(seed) => onChange({ seed })} mono />
              <Button onClick={() => onChange({ seed: randomSeed() })} title="New random seed">
                New
              </Button>
            </div>
          </Field>

          <Field label="Custom title" htmlFor="cfg-title">
            <TextInput
              id="cfg-title"
              value={config.customTitle ?? ''}
              onChange={(customTitle) => onChange({ customTitle: customTitle || undefined })}
              placeholder="Leave blank to use the generated title"
            />
          </Field>

          <Field label="Subtitle line" htmlFor="cfg-subtitle">
            <TextInput
              id="cfg-subtitle"
              value={config.customSubtitle ?? ''}
              onChange={(customSubtitle) => onChange({ customSubtitle: customSubtitle || undefined })}
              placeholder="e.g. Class 5B — Monday warm-up"
            />
          </Field>
        </div>
      </section>
    </div>
  )
}
