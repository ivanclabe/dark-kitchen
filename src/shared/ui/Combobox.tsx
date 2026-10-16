import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
  /** Small visual before the label (e.g. a dish photo). */
  leading?: ReactNode
}

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  required?: boolean
  /** Muestra una fila "+ Crear …" al final de la lista cuando hay texto escrito. */
  onCreateNew?: (query: string) => void
  createLabel?: (query: string) => string
  /** The typed text, for options searched in the database (ADR 0030). */
  onQueryChange?: (query: string) => void
  /** false when the options already come filtered by the database (do not filter them again). */
  filterLocally?: boolean
  /** Accesibilidad — FormField los inyecta vía render-prop; úsalos directo cuando no hay label visible. */
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

function normalize(s: string) {
  return s.trim().toLowerCase()
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  emptyMessage = 'Sin resultados',
  disabled,
  required,
  onCreateNew,
  createLabel = (q) => `Crear «${q}»`,
  onQueryChange,
  filterLocally = true,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: ComboboxProps) {
  const selected = options.find((o) => o.value === value) ?? null
  const [inputValue, setInputValue] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // ARIA combobox (ADR 0065): the list is a listbox and the input points at the highlighted option.
  const listId = useId()
  const optionId = (i: number) => `${listId}-option-${i}`

  // Sincroniza el texto mostrado cuando el value (o la opción que representa)
  // cambia externamente — reset de formulario, o los `options` se recargan.
  // El guard de `activeElement` evita pisar lo que el usuario esté escribiendo.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(selected?.label ?? '')
    }
  }, [value, selected])

  const filtered = useMemo(() => {
    const q = normalize(inputValue)
    if (!q || !filterLocally) return options
    return options.filter((o) => normalize(o.label).includes(q) || (o.sublabel && normalize(o.sublabel).includes(q)))
  }, [options, inputValue, filterLocally])

  const showCreateRow = !!onCreateNew && inputValue.trim().length > 0
  const totalRows = filtered.length + (showCreateRow ? 1 : 0)

  // The highlighted row stays in view while moving with the arrows.
  useEffect(() => {
    if (open) document.getElementById(optionId(highlighted))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, open])

  useEffect(() => {
    if (!rootRef.current) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInputValue(selected?.label ?? '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selected])

  function selectOption(option: ComboboxOption) {
    onChange(option.value)
    setInputValue(option.label)
    setOpen(false)
  }

  function handleCreate() {
    onCreateNew?.(inputValue.trim())
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // A key that confirms a word on a predictive/IME keyboard is not a choice.
    if (e.nativeEvent.isComposing) return
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, totalRows - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted < filtered.length) {
        const option = filtered[highlighted]
        if (option) selectOption(option)
      } else if (showCreateRow) {
        handleCreate()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setInputValue(selected?.label ?? '')
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-neutral-500" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && totalRows > 0 ? optionId(highlighted) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          value={inputValue}
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          onFocus={() => {
            setInputValue('')
            setHighlighted(0)
            setOpen(true)
          }}
          onChange={(e) => {
            setInputValue(e.target.value)
            onQueryChange?.(e.target.value)
            setHighlighted(0)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          // Leaving with Tab closes the list and shows the chosen option again (it used to stay empty).
          onBlur={() => {
            setOpen(false)
            setInputValue(selected?.label ?? '')
          }}
          className="mt-1.5 w-full min-w-0 rounded-lg border border-neutral-600 bg-neutral-900 py-2.5 pl-9 pr-16 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 hover:border-neutral-500 focus:border-focus focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500"
        />
        <div className="absolute right-2 top-1/2 mt-[3px] flex -translate-y-1/2 items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange('')
                setInputValue('')
                inputRef.current?.focus()
              }}
              className="rounded p-0.5 text-neutral-500 hover:text-neutral-200"
              aria-label="Limpiar selección"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className="text-neutral-600" />
        </div>
      </div>

      {open && !disabled && (
        <div id={listId} role="listbox" className="animate-fade-in absolute z-20 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-float">
          {filtered.length === 0 && !showCreateRow && (
            <p role="presentation" className="px-3 py-2 text-sm text-neutral-500">
              {emptyMessage}
            </p>
          )}
          {filtered.map((option, i) => (
            <div
              key={option.value}
              id={optionId(i)}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(e) => {
                e.preventDefault()
                selectOption(option)
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm pointer-coarse:py-3 ${
                i === highlighted ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-200'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {option.leading}
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.sublabel && <span className="block truncate text-xs text-neutral-500">{option.sublabel}</span>}
                </span>
              </span>
              {option.value === value && <Check size={14} className="shrink-0 text-brasa-500" aria-hidden />}
            </div>
          ))}
          {showCreateRow && (
            <div
              id={optionId(filtered.length)}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault()
                handleCreate()
              }}
              onMouseEnter={() => setHighlighted(filtered.length)}
              className={`flex w-full cursor-pointer items-center gap-1.5 border-t border-neutral-800 px-3 py-2 text-left text-sm text-brasa-400 pointer-coarse:py-3 ${
                highlighted === filtered.length ? 'bg-neutral-800' : ''
              }`}
            >
              <Plus size={14} aria-hidden /> {createLabel(inputValue.trim())}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
