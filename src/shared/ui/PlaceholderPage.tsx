export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-50">{title}</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Módulo pendiente de implementación — llega en {phase}.
      </p>
    </div>
  )
}
