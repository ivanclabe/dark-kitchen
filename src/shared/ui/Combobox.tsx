import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
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
  /** Accesibilidad — FormField los inyecta vía render-prop; úsalos directo cuando no hay label visible. */
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
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
  createLabel = (q) => `Crear "${q}"`,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: ComboboxProps) {
  const selected = options.find((o) => o.value === value) ?? null
  const [inputValue, setInputValue] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    if (!q) return options
    return options.filter((o) => normalize(o.label).includes(q) || (o.sublabel && normalize(o.sublabel).includes(q)))
  }, [options, inputValue])

  const showCreateRow = !!onCreateNew && inputValue.trim().length > 0
  const totalRows = filtered.length + (showCreateRow ? 1 : 0)

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
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
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
            setHighlighted(0)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className="mt-1.5 w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pl-9 pr-16 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="animate-fade-in absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-float">
          {filtered.length === 0 && !showCreateRow && (
            <p className="px-3 py-2 text-sm text-neutral-500">{emptyMessage}</p>
          )}
          {filtered.map((option, i) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                selectOption(option)
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === highlighted ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-200'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.sublabel && <span className="block truncate text-xs text-neutral-500">{option.sublabel}</span>}
              </span>
              {option.value === value && <Check size={14} className="shrink-0 text-brasa-500" />}
            </button>
          ))}
          {showCreateRow && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                handleCreate()
              }}
              onMouseEnter={() => setHighlighted(filtered.length)}
              className={`flex w-full items-center gap-1.5 border-t border-neutral-800 px-3 py-2 text-left text-sm text-brasa-400 ${
                highlighted === filtered.length ? 'bg-neutral-700' : ''
              }`}
            >
              <Plus size={14} /> {createLabel(inputValue.trim())}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
