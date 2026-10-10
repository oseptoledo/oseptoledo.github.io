import type { Locale } from '../i18n/locale'

/**
 * Every visible string on the homepage that is not a partner, milestone, news
 * item or image (those live in their own modules), once per language.
 *
 * `SiteCopy` is the contract: the Spanish object has to have every key the
 * English one has, so a string added in one language and forgotten in the other
 * is a type error, not a silent English fallback on the Spanish page. Spanish
 * uses the formal "usted" throughout; organization and place names stay in
 * their official form (docs/brand-voice-guidelines.md).
 *
 * Eyebrows and labels are written in sentence case and uppercased with CSS, so
 * screen readers read words rather than spelling out capital letters.
 */

export type SectionId = 'about' | 'pilot' | 'partners' | 'progress' | 'next' | 'news' | 'contact'

export type AudienceKey = 'resident' | 'home-help' | 'supporter' | 'organization' | 'media' | 'other'

export interface ContactFormCopy {
  name: string
  email: string
  phone: string
  phoneHint: string
  language: string
  audience: string
  audiencePlaceholder: string
  audienceOptions: Record<AudienceKey, string>
  message: string
  updates: string
  required: string
  submit: string
  sending: string
  errors: {
    name: string
    emailMissing: string
    emailInvalid: string
    phone: string
    audience: string
    message: string
    summary: string
  }
  status: {
    sent: string
    mailto: (email: string) => string
    failed: (email: string) => string
  }
  mailSubject: string
  mailFieldLabels: {
    name: string
    email: string
    phone: string
    language: string
    audience: string
    updates: string
    yes: string
    no: string
  }
}

export interface SiteCopy {
  skipLink: string
  homeLinkLabel: string
  nav: {
    label: string
    items: { id: SectionId; label: string }[]
    cta: string
    openMenu: string
    closeMenu: string
    menuLabel: string
    languageLabel: string
  }
  hero: {
    eyebrow: string
    title: string
    lead: string
    primaryCta: string
    secondaryCta: string
  }
  about: {
    eyebrow: string
    mission: string
    body: string
    structureHeading: string
    groups: { title: string; body: string }[]
  }
  pilot: {
    eyebrow: string
    title: string
    body: string
    statLabel: string
    mapCaption: string
  }
  partners: {
    eyebrow: string
    title: string
    lead: string
    foundingBadge: string
  }
  progress: {
    eyebrow: string
    title: string
    galleryCaption: string
  }
  horizon: {
    eyebrow: string
    title: string
  }
  news: {
    heading: string
    readMore: string
    readMoreNote: string
  }
  contact: {
    eyebrow: string
    title: string
    lead: string
    form: ContactFormCopy
  }
  poweredBy: string
  footer: {
    place: string
    partnersLabel: string
    otherLanguage: string
  }
}

const en: SiteCopy = {
  skipLink: 'Skip to main content',
  homeLinkLabel: 'OSE Partnership home',
  nav: {
    label: 'Main',
    items: [
      { id: 'about', label: 'About' },
      { id: 'pilot', label: 'Pilot Zone' },
      { id: 'partners', label: 'Partners' },
      { id: 'progress', label: 'Progress' },
      { id: 'next', label: 'What’s Next' },
      { id: 'news', label: 'News' },
    ],
    cta: 'Get in Touch',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    menuLabel: 'Site menu',
    languageLabel: 'Language',
  },
  hero: {
    eyebrow: 'Old South End · Toledo, Ohio',
    title: 'Ten organizations. One neighborhood. A shared commitment to home.',
    lead: 'The Old South End Partnership brings ten Toledo organizations together so neighbors can find, keep, and strengthen the homes they love.',
    primaryCta: 'Meet the Partners',
    secondaryCta: 'Get in Touch',
  },
  about: {
    eyebrow: 'About the partnership',
    mission:
      'The Old South End Partnership exists to accelerate the renewal of Toledo’s Old South End through coordinated, data-driven, and community-led investment in housing, infrastructure, and quality of life.',
    body: 'Ten organizations work side by side across five functions: direct housing support, land and blight, capital and gap financing, legal protection, and community anchors. After a year of planning together in 2025–2026, the partners are now carrying out a shared, multi-year plan, starting in the Pilot Zone.',
    structureHeading: 'How we’re organized',
    groups: [
      {
        title: 'Steering Committee',
        body: 'Leaders of the partner organizations and funders, steering key decisions and big-picture goals.',
      },
      {
        title: 'Pilot Project Team',
        body: 'Day-to-day partner staff developing the projects the Steering Committee guides.',
      },
      {
        title: 'Community Advisory Group',
        body: 'Community voices making sure residents and stakeholders are part of the team.',
      },
    ],
  },
  pilot: {
    eyebrow: 'The Pilot Zone',
    title: 'The place where we begin',
    body: 'The Old South End “Wedge” is split into zones. We started in the Pilot Zone, and future zones will follow. Our Neighborhood Inventory looked at every property there to guide where the partners focus first.',
    statLabel: 'properties in the Pilot Zone',
    mapCaption: 'The Old South End “Wedge”: the Pilot Zone (yellow) and future zones.',
  },
  partners: {
    eyebrow: 'Our partners',
    title: 'Ten organizations, each with deep roots in Toledo',
    lead: 'Here’s who we are and what each of us brings to the table.',
    foundingBadge: 'Founding partner',
  },
  progress: {
    eyebrow: 'What we’ve accomplished',
    title: 'Our first year, together',
    galleryCaption: 'Rock the Block neighborhood cleanup, June 2026',
  },
  horizon: {
    eyebrow: 'Where we’re going next',
    title: 'We’re just getting started',
  },
  news: {
    heading: 'In the news',
    readMore: 'Read the story',
    readMoreNote: '',
  },
  contact: {
    eyebrow: 'Get in touch',
    title: 'We’d love to hear from you',
    lead: 'Have a question, need help with your home, or want to support the work? Send us a note and the right partner will get back to you within 7–10 business days.',
    form: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      phoneHint: '(optional)',
      language: 'Preferred language',
      audience: 'I am a…',
      audiencePlaceholder: 'Choose one',
      audienceOptions: {
        resident: 'Neighbor or resident',
        'home-help': 'Looking for help with my home',
        supporter: 'Interested in supporting the partnership',
        organization: 'Partner or community organization',
        media: 'Media',
        other: 'Other',
      },
      message: 'Message',
      updates: 'Keep me updated on the partnership’s work',
      required: 'required',
      submit: 'Send message',
      sending: 'Sending…',
      errors: {
        name: 'Please enter your name.',
        emailMissing: 'Please enter your email address.',
        emailInvalid: 'Please enter a valid email address, like name@example.com.',
        phone: 'Please enter a valid phone number, or leave it blank.',
        audience: 'Please choose the option that best describes you.',
        message: 'Please write a message.',
        summary: 'Please fix the highlighted fields and send again.',
      },
      status: {
        sent: 'Thank you! Your message is on its way. The right partner will get back to you within 7–10 business days.',
        mailto: (email) =>
          `Your email app should open with your message ready to send. If it doesn’t, you can write to us at ${email}.`,
        failed: (email) =>
          `Sorry, your message didn’t go through. Please try again, or write to us at ${email}.`,
      },
      mailSubject: 'Message from the OSE Partnership website',
      mailFieldLabels: {
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        language: 'Preferred language',
        audience: 'I am a',
        updates: 'Keep me updated',
        yes: 'Yes',
        no: 'No',
      },
    },
  },
  poweredBy: 'Powered by',
  footer: {
    place: 'Old South End · Toledo, Ohio',
    partnersLabel: 'Partner organizations',
    otherLanguage: 'Ver en español',
  },
}

const es: SiteCopy = {
  skipLink: 'Saltar al contenido principal',
  homeLinkLabel: 'Inicio de OSE Partnership',
  nav: {
    label: 'Principal',
    items: [
      { id: 'about', label: 'Quiénes somos' },
      { id: 'pilot', label: 'Zona Piloto' },
      { id: 'partners', label: 'Socios' },
      { id: 'progress', label: 'Logros' },
      { id: 'next', label: 'Próximos pasos' },
      { id: 'news', label: 'Noticias' },
    ],
    cta: 'Contáctenos',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    menuLabel: 'Menú del sitio',
    languageLabel: 'Idioma',
  },
  hero: {
    eyebrow: 'Old South End · Toledo, Ohio',
    title: 'Diez organizaciones. Un vecindario. Un compromiso compartido con el hogar.',
    lead: 'La Old South End Partnership une a diez organizaciones de Toledo para que los vecinos puedan encontrar, conservar y mejorar los hogares que quieren.',
    primaryCta: 'Conozca a los socios',
    secondaryCta: 'Contáctenos',
  },
  about: {
    eyebrow: 'Quiénes somos',
    mission:
      'La Old South End Partnership existe para acelerar la renovación del Old South End de Toledo mediante inversiones coordinadas, basadas en datos y guiadas por la comunidad en vivienda, infraestructura y calidad de vida.',
    body: 'Diez organizaciones trabajan lado a lado en cinco áreas: apoyo directo a la vivienda, terrenos y propiedades deterioradas, capital y financiamiento complementario, protección legal y centros comunitarios. Después de un año de planificación conjunta en 2025–2026, los socios ahora llevan a cabo un plan compartido de varios años, empezando por la Zona Piloto.',
    structureHeading: 'Cómo nos organizamos',
    groups: [
      {
        title: 'Comité Directivo',
        body: 'Líderes de las organizaciones socias y de los financiadores, que guían las decisiones clave y las metas generales.',
      },
      {
        title: 'Equipo del Proyecto Piloto',
        body: 'Personal de los socios que desarrolla día a día los proyectos que guía el Comité Directivo.',
      },
      {
        title: 'Grupo Asesor Comunitario',
        body: 'Voces de la comunidad que aseguran que los residentes y otros interesados formen parte del equipo.',
      },
    ],
  },
  pilot: {
    eyebrow: 'La Zona Piloto',
    title: 'El lugar donde comenzamos',
    body: 'La “Cuña” del Old South End está dividida en zonas. Comenzamos en la Zona Piloto, y después seguirán otras zonas. Nuestro Inventario del Vecindario revisó cada propiedad allí para decidir dónde enfocarnos primero.',
    statLabel: 'propiedades en la Zona Piloto',
    mapCaption: 'La “Cuña” del Old South End: la Zona Piloto (amarillo) y las zonas futuras.',
  },
  partners: {
    eyebrow: 'Nuestros socios',
    title: 'Diez organizaciones con raíces profundas en Toledo',
    lead: 'Conozca quiénes somos y lo que cada uno aporta.',
    foundingBadge: 'Socio fundador',
  },
  progress: {
    eyebrow: 'Lo que hemos logrado',
    title: 'Nuestro primer año, juntos',
    galleryCaption: 'Limpieza vecinal Rock the Block, junio de 2026',
  },
  horizon: {
    eyebrow: 'Hacia dónde vamos',
    title: 'Apenas estamos comenzando',
  },
  news: {
    heading: 'En las noticias',
    readMore: 'Leer el artículo',
    readMoreNote: ' (en inglés)',
  },
  contact: {
    eyebrow: 'Contáctenos',
    title: 'Nos encantaría saber de usted',
    lead: '¿Tiene una pregunta, necesita ayuda con su casa o quiere apoyar este trabajo? Envíenos un mensaje y el socio indicado le responderá en un plazo de 7 a 10 días hábiles.',
    form: {
      name: 'Nombre',
      email: 'Correo electrónico',
      phone: 'Teléfono',
      phoneHint: '(opcional)',
      language: 'Idioma preferido',
      audience: 'Soy…',
      audiencePlaceholder: 'Elija una opción',
      audienceOptions: {
        resident: 'Vecino o residente',
        'home-help': 'Busco ayuda con mi casa',
        supporter: 'Me interesa apoyar la alianza',
        organization: 'Socio u organización comunitaria',
        media: 'Medios de comunicación',
        other: 'Otro',
      },
      message: 'Mensaje',
      updates: 'Quiero recibir noticias sobre el trabajo de la alianza',
      required: 'obligatorio',
      submit: 'Enviar mensaje',
      sending: 'Enviando…',
      errors: {
        name: 'Escriba su nombre.',
        emailMissing: 'Escriba su correo electrónico.',
        emailInvalid: 'Escriba un correo electrónico válido, por ejemplo nombre@ejemplo.com.',
        phone: 'Escriba un número de teléfono válido o deje este campo en blanco.',
        audience: 'Elija la opción que mejor le describa.',
        message: 'Escriba un mensaje.',
        summary: 'Corrija los campos marcados y vuelva a enviar.',
      },
      status: {
        sent: '¡Gracias! Su mensaje va en camino. El socio indicado le responderá en un plazo de 7 a 10 días hábiles.',
        mailto: (email) =>
          `Su aplicación de correo debería abrirse con su mensaje listo para enviar. Si no se abre, puede escribirnos a ${email}.`,
        failed: (email) =>
          `Lo sentimos, su mensaje no se pudo enviar. Inténtelo de nuevo o escríbanos a ${email}.`,
      },
      mailSubject: 'Mensaje desde el sitio web de OSE Partnership',
      mailFieldLabels: {
        name: 'Nombre',
        email: 'Correo electrónico',
        phone: 'Teléfono',
        language: 'Idioma preferido',
        audience: 'Soy',
        updates: 'Quiero recibir noticias',
        yes: 'Sí',
        no: 'No',
      },
    },
  },
  poweredBy: 'Con el apoyo de',
  footer: {
    place: 'Old South End · Toledo, Ohio',
    partnersLabel: 'Organizaciones socias',
    otherLanguage: 'View in English',
  },
}

export const COPY: Record<Locale, SiteCopy> = { en, es }
