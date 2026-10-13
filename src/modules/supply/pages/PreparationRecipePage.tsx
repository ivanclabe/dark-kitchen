import { RecipeForm } from '@/modules/recipes/pages/RecipeEditorPage'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { useParams } from 'react-router-dom'
import { useIngredients } from '../hooks/useIngredients'
import { useCreatePreparationVersion, usePreparation } from '../hooks/usePreparations'

/**
 * ADR 0057: a preparation's recipe, in the same editor as a dish's — its lines
 * in any compatible unit, plus what a batch yields and, optionally, a portion.
 */
export function PreparationRecipePage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: preparation, isLoading, isError, error, refetch } = usePreparation(id)
  const { data: ingredients } = useIngredients()
  const createVersion = useCreatePreparationVersion(id)

  if (isError) {
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    )
  }
  if (isLoading || !preparation || !ingredients) {
    return (
      <Page>
        <LoadingState variant="block" label="Cargando receta…" />
      </Page>
    )
  }

  const recipe = preparation.recipe
  return (
    <RecipeForm
      key={recipe?.id ?? 'new'}
      owner={{
        kind: 'preparation',
        id: preparation.id,
        name: preparation.name,
        code: preparation.code,
        baseUnitCode: preparation.baseUnitCode,
        yieldQuantity: recipe?.yieldQuantity ?? null,
        yieldUnitCode: recipe?.yieldUnitCode ?? null,
        yieldUnitQuantity: recipe?.yieldUnitQuantity ?? null,
        portion: preparation.portion,
      }}
      version={recipe?.version ?? null}
      initialRows={preparation.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.enteredQuantity !== null ? Number(item.enteredQuantity) : Number(item.quantity),
        unitCode: item.enteredUnitCode,
      }))}
      ingredients={ingredients.filter((i) => i.active || preparation.items.some((item) => item.ingredientId === i.id))}
      onSave={async (items, settings) => {
        await createVersion.mutateAsync({
          items,
          yieldQuantity: settings?.yieldQuantity ?? 0,
          yieldUnitId: settings?.yieldUnitId ?? null,
          portion: settings?.portion ?? 0,
          portionUnitId: settings?.portionUnitId ?? null,
        })
      }}
      saving={createVersion.isPending}
    />
  )
}
