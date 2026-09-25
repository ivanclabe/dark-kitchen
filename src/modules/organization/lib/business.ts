/**
 * Listas del registro y de la configuración de la organización (ADR 0008,
 * sección 8). Las claves son las mismas que acepta la base (CHECK de
 * dk_organizations.sector / category); cambiarlas exige una migración.
 */
export const SECTORS = [
  { value: 'dark_kitchen', label: 'Dark kitchen' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'fast_food', label: 'Comida rápida' },
  { value: 'cafe', label: 'Cafetería' },
  { value: 'bakery', label: 'Panadería y pastelería' },
  { value: 'bar', label: 'Bar' },
  { value: 'catering', label: 'Catering y eventos' },
  { value: 'food_truck', label: 'Food truck' },
  { value: 'other', label: 'Otro' },
] as const

export const CATEGORIES = [
  { value: 'burgers', label: 'Hamburguesas' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'chicken', label: 'Pollo' },
  { value: 'asian', label: 'Asiática' },
  { value: 'mexican', label: 'Mexicana' },
  { value: 'traditional', label: 'Típica' },
  { value: 'grill', label: 'Parrilla' },
  { value: 'healthy', label: 'Saludable' },
  { value: 'vegetarian', label: 'Vegetariana / vegana' },
  { value: 'seafood', label: 'Mariscos' },
  { value: 'desserts', label: 'Postres' },
  { value: 'coffee', label: 'Café' },
  { value: 'breakfast', label: 'Desayunos' },
  { value: 'international', label: 'Internacional' },
  { value: 'other', label: 'Otra' },
] as const

/** País → zona horaria y moneda por defecto (se pueden cambiar después). */
export const COUNTRIES = [
  { value: 'CO', label: 'Colombia', timezone: 'America/Bogota', currency: 'COP' },
  { value: 'MX', label: 'México', timezone: 'America/Mexico_City', currency: 'MXN' },
  { value: 'PE', label: 'Perú', timezone: 'America/Lima', currency: 'PEN' },
  { value: 'EC', label: 'Ecuador', timezone: 'America/Guayaquil', currency: 'USD' },
  { value: 'CL', label: 'Chile', timezone: 'America/Santiago', currency: 'CLP' },
  { value: 'AR', label: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', currency: 'ARS' },
  { value: 'PA', label: 'Panamá', timezone: 'America/Panama', currency: 'USD' },
  { value: 'VE', label: 'Venezuela', timezone: 'America/Caracas', currency: 'USD' },
  { value: 'US', label: 'Estados Unidos', timezone: 'America/New_York', currency: 'USD' },
  { value: 'ES', label: 'España', timezone: 'Europe/Madrid', currency: 'EUR' },
] as const

export function countryDefaults(country: string) {
  return COUNTRIES.find((c) => c.value === country) ?? COUNTRIES[0]
}
