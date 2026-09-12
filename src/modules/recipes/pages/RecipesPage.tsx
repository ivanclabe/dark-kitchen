import { useProducts } from '@/modules/products/hooks/useProducts'
import { tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { Link } from 'react-router-dom'

export function RecipesPage() {
  const { data: products, isLoading } = useProducts()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Recetas</h1>
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
                  {product.activeRecipeVersion ? `v${product.activeRecipeVersion}` : 'Sin receta'}
                </td>
                <td className={tdClass}>${product.estimatedCost.toFixed(2)}</td>
                <td className={`${tdClass} text-right`}>
                  <Link to={`/recipes/${product.id}`} className="text-orange-500 hover:underline">
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
