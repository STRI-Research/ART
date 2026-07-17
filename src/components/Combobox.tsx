'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { LibraryCategory, SuggestHit } from '@shared/types'

/**
 * Free-type picklist backed by the personal library. Suggestions are ranked by the current
 * crop (implicit scope) and past usage. Typing anything is always allowed; the value is recorded
 * into the library server-side when the field is saved, so no explicit "add" is needed here.
 * The resolved label is fetched from the library for the current value and shown as a hint.
 */
interface Props {
  category: LibraryCategory
  value: string
  onChange: (value: string) => void
  /** Current protocol crop, for crop-aware ranking. Omit for the crop field itself. */
  crop?: string
  disabled?: boolean
  placeholder?: string
}

export function Combobox({ category, value, onChange, crop = '', disabled, placeholder }: Props) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [options, setOptions] = useState<SuggestHit[]>([])
  const [label, setLabel] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => setText(value), [value])

  // Resolve the current value's label from the library.
  useEffect(() => {
    if (!value) {
      setLabel('')
      return
    }
    let cancelled = false
    api.library.suggest(category, value, crop).then((hits) => {
      if (cancelled) return
      setLabel(hits.find((h) => h.value === value)?.label ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [category, value, crop])

  const runSearch = (q: string): void => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      api.library.suggest(category, q, crop).then((hits) => {
        setOptions(hits)
        setActive(0)
      })
    }, 120)
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const commit = (v: string): void => {
    const next = v.trim()
    setText(next)
    setOpen(false)
    if (next !== value) onChange(next)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      runSearch(text)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(open && options[active] ? options[active].value : text)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setText(value)
    }
  }

  return (
    <div className="combobox" ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          runSearch(e.target.value)
        }}
        onFocus={() => {
          if (disabled) return
          setOpen(true)
          runSearch(text)
        }}
        onBlur={() => commit(text)}
        onKeyDown={onKeyDown}
      />
      {label && (
        <div className="muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.3 }}>
          {label}
        </div>
      )}
      {open && options.length > 0 && (
        <ul className="combobox-menu">
          {options.map((o, i) => (
            <li
              key={o.value}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(o.value)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combobox-code">{o.value}</span>
              {o.label && <span className="combobox-label"> — {o.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
