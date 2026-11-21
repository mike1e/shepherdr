// To-dos (MSHEP-16): the Inbox of the window's herdr-tui-todo mod, above the Tasks list. The same list (shared
// "herdr-tui.todos"), worded by the same helpers (core/todos.js): open ones first, a tap on the box or the words ticks,
// × deletes, "Clear done" sweeps. A change goes to the service as one small action applied to the list as it is then, so
// the phone and the window never undo each other; the window's bridge hands it over within a few seconds.
import clsx from 'clsx'
import { useEffect, useState, type FormEvent } from 'react'
import { act, definePlugin, useSnap } from '@client/kernel.ts'
import { ic, NextIcon, DownIcon, XIcon, CheckIcon } from '@client/ui.tsx'
import * as TD from '@core/todos.js'
import type { Todo } from '@shared/types.ts'

const FOLD = 'shepherdr.todos.shut'
const wasShut = () => { try { return localStorage.getItem(FOLD) === '1' } catch { return false } }

export function TodosCard() {
  const snap = useSnap()
  const served: Todo[] = snap?.todos ?? []
  // what a tap just did shows at once; the server's list takes over when it arrives (or when the action failed)
  const [mine, setMine] = useState<Todo[] | null>(null)
  const [shut, setShut] = useState(wasShut)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const key = JSON.stringify(served)
  useEffect(() => setMine(null), [key])
  const list: Todo[] = TD.ordered(mine ?? served)
  const send = (next: Todo[], a: Parameters<typeof act>[0]) => {
    setMine(next)
    setNote('')
    act(a).catch(() => { setMine(null); setNote("Couldn't save that. Try again.") })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const next = TD.add(mine ?? served, t, Date.now())
    setText('')
    send(next, { type: 'todos', op: 'add', text: t })
  }
  const fold = () => setShut((s) => { try { localStorage.setItem(FOLD, s ? '0' : '1') } catch {} return !s })
  if (!snap) return null
  const open = list.filter((x) => !x.done).length
  const done = list.length - open
  const Fold = shut ? NextIcon : DownIcon
  return (
    <section data-todos className="px-1.5 pt-2 phone:px-2">
      <button type="button" aria-expanded={!shut} onClick={fold} className="press group/h flex min-h-8 w-full cursor-pointer items-center gap-3 rounded-row px-2 text-left outline-none select-none hover:bg-hover phone:min-h-11 phone:px-3 coarse:min-h-11">
        <Fold aria-hidden className={clsx(ic, '-mx-px text-fg3 phone:mx-0')} />
        <span className="min-w-0 truncate text-[0.75rem] font-medium text-fg2 phone:text-[0.875rem]">To-dos</span>
        <span data-todos-count className="shrink-0 text-[0.75rem] text-fg3 tabular-nums phone:text-[0.875rem]">{open} open{done ? ` · ${done} done` : ''}</span>
      </button>
      {shut ? null : (
        <div className="px-2 pb-2 phone:px-3">
          <form onSubmit={submit} className="flex gap-2 py-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              enterKeyHint="done"
              autoComplete="off"
              placeholder="Add a to-do…"
              aria-label="Add a to-do"
              className="min-h-9 min-w-0 flex-1 rounded-row bg-transparent px-3 text-base text-fg shadow-[inset_0_0_0_1px_var(--line2)] outline-none placeholder:text-fg3 focus:shadow-box-focus phone:min-h-11"
            />
            <button type="submit" disabled={!text.trim()} className="press min-h-9 shrink-0 cursor-pointer rounded-row px-3 text-[0.8125rem] text-fg2 outline-none hover:bg-hover disabled:cursor-default disabled:opacity-40 phone:min-h-11 phone:text-[0.9375rem]">Add</button>
          </form>
          {note ? <div role="alert" className="px-1 py-1 text-[0.8125rem] text-fg2">{note}</div> : null}
          <ul>
            {list.map((x) => (
              <li key={x.id} data-todo={x.id} data-done={x.done ? '' : undefined} className="flex items-stretch">
                {/* the box and the words are one target; × is its own, never also a tick */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={x.done}
                  onClick={() => send(TD.toggle(mine ?? served, x.id), { type: 'todos', op: 'toggle', id: x.id })}
                  className="press flex min-h-9 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-row px-1 py-2 text-left outline-none hover:bg-hover phone:min-h-11"
                >
                  <span aria-hidden className={clsx('mt-px grid size-5 shrink-0 place-items-center rounded-[5px] shadow-[inset_0_0_0_1.5px_var(--line2)]', x.done && 'bg-hover text-fg3')}>
                    {x.done ? <CheckIcon className="size-3.5" /> : null}
                  </span>
                  <span className={clsx('min-w-0 break-words text-base leading-5', x.done ? 'text-fg3 line-through' : 'text-fg')}>{x.text}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${x.text}`}
                  onClick={() => send(TD.remove(mine ?? served, x.id), { type: 'todos', op: 'remove', id: x.id })}
                  className="press grid min-h-9 w-11 shrink-0 cursor-pointer place-items-center rounded-row text-fg3 outline-none hover:bg-hover hover:text-fg phone:min-h-11"
                >
                  <XIcon aria-hidden className={ic} />
                </button>
              </li>
            ))}
          </ul>
          {!list.length ? <div className="px-1 py-2 text-[0.8125rem] text-fg3">Nothing to do.</div> : null}
          {done ? (
            <button type="button" onClick={() => send(TD.clearDone(mine ?? served), { type: 'todos', op: 'clear' })} className="press mt-1 min-h-9 cursor-pointer rounded-row px-2 text-[0.8125rem] text-fg2 outline-none hover:bg-hover phone:min-h-11 phone:text-[0.9375rem]">Clear done</button>
          ) : null}
        </div>
      )}
    </section>
  )
}

export default definePlugin({
  name: 'todos',
  setup(reg) {
    reg.tasksHead.push(TodosCard)
  },
})
