import { legalHref } from '@/shared/legal/documents'
import { clearSavedPreferences, savePrivacyPreferences, usePrivacyPreferences, type ConsentCategory } from '@/shared/legal/privacyPreferences'
import { Button } from '@/shared/ui/Button'
import { Switch } from '@/shared/ui/Switch'
import { Check, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LegalLayout } from '../components/LegalLayout'
import { formatLegalDate } from '../lib'

function Category({ title, state, children, control }: { title: string; state: string; children: ReactNode; control?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-neutral-50">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{state}</p>
        </div>
        {control}
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">{children}</div>
    </section>
  )
}

/**
 * Preferencias de privacidad (ADR 0071): what Quanela keeps on this device, by category. Today nothing optional
 * exists (no analytics, no advertising); those categories stay off and block any future script until turned on.
 */
export function PrivacyPreferencesPage() {
  const saved = usePrivacyPreferences()
  const [choice, setChoice] = useState<Record<ConsentCategory, boolean>>({ analytics: saved.analytics, marketing: saved.marketing })
  const [status, setStatus] = useState<string | null>(null)
  const changed = choice.analytics !== saved.analytics || choice.marketing !== saved.marketing

  useEffect(() => {
    document.title = 'Preferencias de privacidad · quanela'
  }, [])

  return (
    <LegalLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">Preferencias de privacidad</h1>
        <p className="mt-2 text-neutral-400">
          Qué guarda quanela en este navegador y para qué. El detalle de cada cookie está en la{' '}
          <Link to={legalHref('cookies')} className="text-brasa-400 underline underline-offset-2">
            Política de Cookies
          </Link>
          .
        </p>

        <div className="mt-8 space-y-4">
          <Category title="Necesarias" state="Siempre activas">
            <p>Mantienen tu sesión abierta, protegen el registro contra robots y conservan el carrito de un pedido mientras lo armas. Sin ellas quanela no funciona, por eso no se pueden apagar.</p>
          </Category>
          <Category
            title="Preferencias"
            state="Se guardan solo cuando tú eliges algo"
            control={
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={() => {
                  const removed = clearSavedPreferences()
                  setStatus(removed ? 'Borramos las preferencias guardadas en este navegador.' : 'No había preferencias guardadas en este navegador.')
                }}
              >
                Borrar
              </Button>
            }
          >
            <p>Recuerdan lo que configuraste: el tema y el tamaño del texto, la última cuenta que abriste, la vista de la cocina, el sonido de pedidos nuevos y las opciones de voz. Si las borras, quanela vuelve a sus valores iniciales.</p>
          </Category>
          <Category
            title="Analítica"
            state={choice.analytics ? 'Permitida' : 'Apagada'}
            control={<Switch checked={choice.analytics} onChange={(v) => setChoice((c) => ({ ...c, analytics: v }))} label="Permitir analítica" />}
          >
            <p>Hoy quanela <strong className="text-neutral-100">no usa</strong> herramientas de analítica. Si algún día las usamos, solo se activarán si las permites aquí.</p>
          </Category>
          <Category
            title="Publicidad"
            state={choice.marketing ? 'Permitida' : 'Apagada'}
            control={<Switch checked={choice.marketing} onChange={(v) => setChoice((c) => ({ ...c, marketing: v }))} label="Permitir publicidad" />}
          >
            <p>Hoy quanela <strong className="text-neutral-100">no usa</strong> píxeles ni cookies de publicidad. Si algún día los usamos, solo se activarán si los permites aquí.</p>
          </Category>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            icon={Check}
            disabled={!changed}
            onClick={() => {
              savePrivacyPreferences(choice)
              setStatus('Guardamos tus preferencias en este navegador.')
            }}
          >
            Guardar preferencias
          </Button>
          {saved.updatedAt && <span className="text-xs text-neutral-500">Última elección: {formatLegalDate(saved.updatedAt.slice(0, 10))}</span>}
        </div>
        <p role="status" className="mt-3 min-h-5 text-sm text-emerald-400">
          {status}
        </p>
        <p className="mt-4 text-sm text-neutral-500">
          Estas preferencias se guardan en este navegador. También puedes borrar las cookies desde la configuración de tu navegador; al hacerlo se cerrará tu sesión.
        </p>
      </div>
    </LegalLayout>
  )
}
