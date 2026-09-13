import { useProducts } from '@/modules/products/hooks/useProducts'
import { tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { BookOpen, Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

export function RecipesPage() {
  const { data: products, isLoading } = useProducts()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen size={22} className="text-brasa-500" />
        <h1 className="text-2xl font-semibold text-neutral-50">Recetas</h1>
      </div>
      <p className="text-sm text-neutral-400">
        Cada plato tiene su propia receta versionada. Selecciona un plato para ver o editar su receta actual.
      </p>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Plato</th>
              <th className={thClass}>Versión activa</th>
              <th className={thClass}>Costo estimado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={4}>
                  Cargando…
                </td>
              </tr>
            )}
            {products?.map((product) => (
              <tr key={product.id}>
                <td className={tdClass}>{product.name}</td>
                <td className={tdClass}>
                  {product.activeRecipeVersion ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      v{product.activeRecipeVersion}
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-300">
                      Sin receta
                    </span>
                  )}
                </td>
                <td className={tdClass}>${product.estimatedCost.toFixed(2)}</td>
                <td className={`${tdClass} text-right`}>
                  <Link to={`/recipes/${product.id}`} className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    {product.activeRecipeVersion ? <Pencil size={13} /> : <Plus size={13} />}
                    {product.activeRecipeVersion ? 'Editar receta' : 'Crear receta'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
