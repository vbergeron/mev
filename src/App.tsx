import { useMemo, useState } from 'react'
import { DetailPanel } from './components/DetailPanel'
import { InputPanel } from './components/InputPanel'
import { PlanTree } from './components/PlanTree'
import { SummaryBar } from './components/SummaryBar'
import { flatten, normalizeExplain, type Explain } from './lib/explain'
import { parseExplain } from './lib/parse'

type Tab = 'plan' | 'raw' | 'sbe'

export default function App() {
  const [text, setText] = useState('')
  const [explain, setExplain] = useState<Explain>()
  const [error, setError] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState<Tab>('plan')

  const submit = (t: string) => {
    setText(t)
    try {
      const e = normalizeExplain(parseExplain(t))
      setExplain(e)
      setError(undefined)
      setSelectedId(undefined)
      setTab('plan')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setExplain(undefined)
    }
  }

  const selected = useMemo(
    () => (explain && selectedId ? flatten(explain.root).find((n) => n.id === selectedId) : undefined),
    [explain, selectedId],
  )
  const totalTime = explain ? Math.max(explain.root.timeIncl ?? 0, explain.totals.timeMs ?? 0) : 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 bg-card px-5">
        <button onClick={() => setExplain(undefined)} className="flex items-baseline gap-2">
          <span className="flex items-center gap-1.5 font-serif text-xl font-bold tracking-tight text-mongo-950">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-mongo-400 ring-2 ring-mongo-700" />
            MEV
          </span>
          <span className="hidden text-sm italic text-stone-500 sm:inline">MongoDB Explain Visualizer</span>
        </button>
        {explain && (
          <>
            <nav className="ml-2 flex gap-1 text-sm sm:ml-6">
              <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>Plan</TabButton>
              <TabButton active={tab === 'raw'} onClick={() => setTab('raw')}>Raw</TabButton>
              {explain.engine === 'sbe' && <TabButton active={tab === 'sbe'} onClick={() => setTab('sbe')}>SBE plan</TabButton>}
            </nav>
            <button onClick={() => setExplain(undefined)} className="ml-auto whitespace-nowrap rounded-md border border-stone-200 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50">
              New plan
            </button>
          </>
        )}
      </header>

      {!explain ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <InputPanel initial={text} error={error} onSubmit={submit} />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <SummaryBar explain={explain} />
          {explain.notes.map((n) => (
            <div key={n} className="border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-xs text-amber-800">{n}</div>
          ))}
          <div className="flex min-h-0 flex-1">
            {tab === 'plan' && (
              <>
                <div className="min-w-0 flex-1">
                  <PlanTree root={explain.root} totalTime={totalTime} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
                {selected && <DetailPanel node={selected} onClose={() => setSelectedId(undefined)} />}
              </>
            )}
            {tab === 'raw' && <CodeView text={JSON.stringify(explain.raw, null, 2)} />}
            {tab === 'sbe' && (
              <CodeView
                text={[
                  explain.sbePlanText ? `// slotBasedPlan.stages\n${explain.sbePlanText}` : '',
                  explain.sbeTree ? `// executionStats.executionStages\n${JSON.stringify(explain.sbeTree, null, 2)}` : '',
                ].filter(Boolean).join('\n\n')}
              />
            )}
          </div>
        </main>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-3 py-1 ${active ? 'bg-mongo-950 text-mongo-50' : 'text-stone-600 hover:bg-stone-100'}`}
    >
      {children}
    </button>
  )
}

function CodeView({ text }: { text: string }) {
  return (
    <div className="relative min-w-0 flex-1 overflow-auto bg-card">
      <button
        onClick={() => void navigator.clipboard?.writeText(text)}
        className="sticky right-4 top-3 float-right mr-4 mt-3 rounded-md border border-stone-200 bg-card px-2.5 py-1 text-xs text-stone-600 shadow-sm hover:bg-stone-50"
      >
        Copy
      </button>
      <pre className="p-5 font-mono text-[12px] leading-relaxed text-stone-700">{text}</pre>
    </div>
  )
}
