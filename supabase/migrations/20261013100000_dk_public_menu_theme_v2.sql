-- ADR 0058: modern public menu templates and brand images.
-- The design validation (ADR 0053) gains three optional options and three fonts; every design saved
-- until today stays valid (nothing is removed):
--   header.logo           the business logo, from its own branding folder (like the cover);
--   header.coverPosition  how the header image is framed on a phone (top, center, bottom);
--   background.overlay    how strong the veil over a background photo is (light, medium, strong);
--   fonts                 + Plus Jakarta Sans, Outfit, Bricolage Grotesque.
create or replace function dk_public_menu_theme_problem(p jsonb, p_kitchen uuid)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v text;
  v_fonts text[] := array['Inter', 'Poppins', 'Nunito', 'Montserrat', 'Lora', 'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Fraunces', 'Caveat',
                     'Plus Jakarta Sans', 'Outfit', 'Bricolage Grotesque'];
  v_image text := '^kitchens/' || p_kitchen::text || '/branding/[A-Za-z0-9._-]+$';
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'object' then return 'El diseño no es válido'; end if;
  if length(p::text) > 4000 then return 'El diseño es demasiado grande'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('template', 'colors', 'fonts', 'background', 'header', 'cards', 'nav', 'buttons') then return 'Opción desconocida: ' || k; end if;
  end loop;
  if coalesce(p ->> 'template', 'modern') not in ('modern', 'elegant', 'artisan', 'dark', 'fresh', 'classic') then return 'Plantilla desconocida'; end if;

  if p ? 'colors' then
    if jsonb_typeof(p -> 'colors') <> 'object' then return 'Colores no válidos'; end if;
    for k, v in select key, value #>> '{}' from jsonb_each(p -> 'colors') loop
      if k not in ('primary', 'background', 'surface', 'text', 'muted', 'price') then return 'Color desconocido: ' || k; end if;
      if v is null or v !~ '^#[0-9A-Fa-f]{6}$' then return 'El color ' || k || ' no es un color válido'; end if;
    end loop;
  end if;

  if p ? 'fonts' then
    if jsonb_typeof(p -> 'fonts') <> 'object' then return 'Tipografía no válida'; end if;
    for k in select jsonb_object_keys(p -> 'fonts') loop
      if k not in ('heading', 'body', 'scale') then return 'Opción de tipografía desconocida: ' || k; end if;
    end loop;
    if (p #>> '{fonts,heading}') is not null and not ((p #>> '{fonts,heading}') = any (v_fonts)) then return 'Fuente de títulos no disponible'; end if;
    if (p #>> '{fonts,body}') is not null and not ((p #>> '{fonts,body}') = any (v_fonts)) then return 'Fuente de texto no disponible'; end if;
    if coalesce(p #>> '{fonts,scale}', 'M') not in ('S', 'M', 'L') then return 'Tamaño de letra no válido'; end if;
  end if;

  if p ? 'background' then
    if jsonb_typeof(p -> 'background') <> 'object' then return 'Fondo no válido'; end if;
    for k in select jsonb_object_keys(p -> 'background') loop
      if k not in ('kind', 'texture', 'image', 'overlay') then return 'Opción de fondo desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{background,kind}', 'solid') not in ('solid', 'gradient', 'texture', 'image') then return 'Tipo de fondo no válido'; end if;
    if coalesce(p #>> '{background,texture}', 'paper') not in ('paper', 'dots', 'lines') then return 'Textura no válida'; end if;
    if (p #>> '{background,image}') is not null and (p #>> '{background,image}') !~ v_image then return 'La imagen de fondo no es de esta cuenta'; end if;
    if coalesce(p #>> '{background,overlay}', 'medium') not in ('light', 'medium', 'strong') then return 'Intensidad del velo no válida'; end if;
  end if;

  if p ? 'header' then
    if jsonb_typeof(p -> 'header') <> 'object' then return 'Cabecera no válida'; end if;
    for k in select jsonb_object_keys(p -> 'header') loop
      if k not in ('style', 'cover', 'coverPosition', 'logo', 'showTagline', 'showHours') then return 'Opción de cabecera desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{header,style}', 'compact') not in ('compact', 'centered', 'cover', 'logo') then return 'Estilo de cabecera no válido'; end if;
    if (p #>> '{header,cover}') is not null and (p #>> '{header,cover}') !~ v_image then return 'La portada no es de esta cuenta'; end if;
    if (p #>> '{header,logo}') is not null and (p #>> '{header,logo}') !~ v_image then return 'El logo no es de esta cuenta'; end if;
    if coalesce(p #>> '{header,coverPosition}', 'center') not in ('top', 'center', 'bottom') then return 'Encuadre de la portada no válido'; end if;
    if p #> '{header,showTagline}' is not null and jsonb_typeof(p #> '{header,showTagline}') <> 'boolean' then return 'Opción de cabecera no válida'; end if;
    if p #> '{header,showHours}' is not null and jsonb_typeof(p #> '{header,showHours}') <> 'boolean' then return 'Opción de cabecera no válida'; end if;
  end if;

  if p ? 'cards' then
    if jsonb_typeof(p -> 'cards') <> 'object' then return 'Tarjetas no válidas'; end if;
    for k in select jsonb_object_keys(p -> 'cards') loop
      if k not in ('layout', 'style', 'image', 'imageShape', 'imagePosition', 'description') then return 'Opción de platos desconocida: ' || k; end if;
    end loop;
    if coalesce(p #>> '{cards,layout}', 'list') not in ('list', 'grid', 'large', 'compact', 'carousel', 'menu') then return 'Forma de las tarjetas no válida'; end if;
    if coalesce(p #>> '{cards,style}', 'shadow') not in ('flat', 'shadow', 'outline', 'rough', 'glass') then return 'Estilo de tarjeta no válido'; end if;
    if coalesce(p #>> '{cards,image}', 'show') not in ('show', 'hide') then return 'Opción de imagen no válida'; end if;
    if coalesce(p #>> '{cards,imageShape}', 'rounded') not in ('square', 'rounded', 'circle') then return 'Forma de imagen no válida'; end if;
    if coalesce(p #>> '{cards,imagePosition}', 'left') not in ('left', 'right', 'top') then return 'Posición de imagen no válida'; end if;
    if coalesce(p #>> '{cards,description}', 'clamp') not in ('full', 'clamp', 'hide') then return 'Opción de descripción no válida'; end if;
  end if;

  if coalesce(p ->> 'nav', 'chips') not in ('chips', 'tabs', 'select', 'none') then return 'Navegación no válida'; end if;
  if coalesce(p ->> 'buttons', 'pill') not in ('rounded', 'pill', 'square') then return 'Forma de botones no válida'; end if;
  return null;
end;
$$;
grant execute on function dk_public_menu_theme_problem(jsonb, uuid) to authenticated;
