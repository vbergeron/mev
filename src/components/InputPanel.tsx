import { useState } from 'react'
import { SAMPLES } from '../samples'

interface Props {
  initial: string
  error?: string
  onSubmit: (text: string) => void
}

export function InputPanel({ initial, error, onSubmit }: Props) {
  const [text, setText] = useState(initial)
  const [dragging, setDragging] = useState(false)

  const readFile = async (f: File) => {
    const t = await f.text()
    setText(t)
    onSubmit(t)
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Visualize a MongoDB query plan</h1>
        <p className="mt-1 text-sm text-stone-500">
          Paste the output of <code className="rounded bg-stone-100 px-1 font-mono text-[13px]">.explain("executionStats")</code> for a{' '}
          <code className="font-mono text-[13px]">find()</code> or an <code className="font-mono text-[13px]">aggregate()</code>. JSON,
          Extended JSON and mongosh output are accepted. Nothing leaves your browser.
        </p>
      </div>

      <div
        className={`relative flex min-h-0 flex-1 flex-col rounded-lg border bg-card shadow-sm ${dragging ? 'border-mongo-400 ring-2 ring-mongo-200' : 'border-stone-200'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) void readFile(f)
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit(text) }}
          spellCheck={false}
          placeholder={'{\n  explainVersion: \'2\',\n  queryPlanner: { … },\n  executionStats: { … }\n}'}
          className="min-h-[320px] flex-1 resize-none rounded-lg bg-transparent p-4 font-mono text-[13px] leading-relaxed text-stone-800 placeholder:text-stone-300 focus:outline-none"
        />
        {!text && (
          <div className="pointer-events-none absolute bottom-4 right-4 text-xs text-stone-400">or drop a .json file here</div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onSubmit(text)}
          disabled={!text.trim()}
          className="rounded-md bg-mongo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-mongo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Visualize
        </button>
        <span className="text-xs text-stone-400">Ctrl / ⌘ + Enter</span>
        <label className="ml-auto cursor-pointer text-sm text-stone-600 hover:text-stone-900">
          Open file…
          <input type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f) }} />
        </label>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">Examples</div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => { setText(s.text); onSubmit(s.text) }}
              className="rounded-md border border-stone-200 bg-card px-3 py-1.5 text-xs text-stone-700 hover:border-stone-300 hover:bg-stone-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
