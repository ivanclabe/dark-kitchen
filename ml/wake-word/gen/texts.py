"""Texts for synthetic clips (ADR 0016). "Cuanela" spelling gives /kwa/ in every G2P."""

POSITIVE = [
    'Oye Cuanela', 'Oye, Cuanela.', '¡Oye, Cuanela!', 'oye cuanela', '¿Oye, Cuanela?', 'Oye, Cuanela...',
    'Oye Quanela.', '¡Oye Kuanela!', 'Oye, Cuanela,', 'Oye Cuanela.', '¡Oye Cuanela!',
]

# Near misses said on purpose: must never activate.
ADVERSARIAL = [
    'Oye, panela.', 'Oye, canela.', 'Oye, cazuela.', 'Oye, Manuela.', 'Oye, candela.', 'Oye, ventana.',
    'Oye, nena.', 'Cuanela.', 'Quanela', '¡Cuanela!', 'Oye.', '¡Oye!', 'Oye, Daniela.', 'Oye, Gabriela.',
    'Oye, abuela.', 'Oye, Micaela.', 'Oye, Rafaela.', 'Oye, Graciela.', 'Oye, Estela.', 'Oye, Adela.',
    'Oye, Mariela.', 'Oye, Carmela.', 'Oye, Pamela.', 'Oye, Chela.', 'Oye, Consuelo.', 'Oye, cuñada.',
    'Oye, cuñado.', 'Oye, cuate.', 'Oye, guapa.', 'Oye, Juana.', 'Oye, Susana.', 'Oye, ¿cuánto vale?',
    '¿Oye, cuánto era?', 'Oye, cuando venga.', 'Oye, qué nena.', 'Oye, mira esto.', 'Oye, ¿qué tal?',
    'Oye, la panela.', 'Pásame la panela.', 'Trae la cazuela.', 'Un poco de canela.', 'La candela está alta.',
    'Cierra la ventana.', 'Venezuela.', 'Una aguapanela.', 'Oye, Manuela, trae la canela.', 'Oye, Quique.',
    'Hay panela en la cazuela.', 'Oye, Cuca.', 'Oye, Wilmer.', 'Oye, Juanita.', 'Oye, cuadra eso.',
    'Oye, cuarenta.', 'Oye, cualquiera.', 'Oye, ¿cuál era?', 'Ay, Manuela.', 'Hola, Daniela.', 'Oye, Fernanda.',
]

# Kitchen talk, including the voice commands themselves.
KITCHEN = [
    'Pedido dos mil cuarenta listo.', 'Pedido mil cuarenta y dos en preparación.', 'Pedido veinte cuarenta urgente.',
    'Confirmar pedido tres mil doscientos cinco.', 'Quitar prioridad al pedido mil quinientos.', 'Marchando una hamburguesa.',
    'Dos salchipapas para la mesa cuatro.', 'Se acabó la panela.', 'Sube el fuego de la plancha.', 'Faltan las papas del domicilio.',
    '¿Quién tiene el pedido de Rappi?', 'Listo el arroz.', 'Otra orden de alitas, por favor.', 'Cuidado, que está caliente.',
    'Voy con la bandeja paisa.', 'Necesito más cebolla picada.', 'El domiciliario ya llegó.', 'Apaga la freidora.',
]

# Round 3: the near misses that still fired in round 2 (name alone, "Oye" + Juan…, "Oye, cua…").
HARD = [
    'Cuanela.', '¡Cuanela!', 'Cuanela', 'Quanela.', '¿Cuanela?', 'Cuanela, ven.', 'Cuanela, mira.',
    'Oye, Juanita.', 'Oye, Juana.', 'Oye, Juan.', 'Oye, Juanito.', 'Oye, Wanda.',
    'Oye, cuarenta.', 'Oye, cuñada.', 'Oye, cuñado.', 'Oye, cuadra eso.', 'Oye, ¿cuánto?', 'Oye, ¿cuál era?',
    'Oye, cualquiera.', 'Oye, cuando venga.', 'Oye, cuate.', 'Oye, Cuca.', 'Oye, cuela eso.', 'Oye, ¿cuánta panela queda?',
    'Oye, Manuela.', 'Oye, panela.', 'Oye, canela.', 'Oye, cazuela.', 'Oye, Daniela.', 'Oye, Micaela.', 'Oye, Graciela.',
]
