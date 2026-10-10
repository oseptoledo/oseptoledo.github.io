import type { Localized } from '../i18n/locale'

/**
 * "What we've accomplished": the partnership's milestones, newest first, as
 * the design orders them. The Milestones block in public/llms.txt repeats these
 * oldest first; src/__tests__/llms.test.ts checks every title appears there.
 *
 * `datetime` is a valid HTML date string for the `<time>` element where the
 * milestone has one (a month or a year). Seasonal labels such as "Summer 2026"
 * carry the year only, which is still true.
 */
export interface Milestone {
  when: Localized
  datetime: string
  title: Localized
  body: Localized
}

export const MILESTONES: readonly Milestone[] = [
  {
    when: { en: 'Summer 2026', es: 'Verano de 2026' },
    datetime: '2026',
    title: { en: 'New homes for Pilot Zone families', es: 'Nuevas casas para familias de la Zona Piloto' },
    body: {
      en: 'Historic South Initiative sold 2 new modular homes to Pilot Zone homeowners, LadderUp Housing poured foundations for 4 more, and Maumee Valley Habitat for Humanity completed 2 home projects.',
      es: 'Historic South Initiative vendió 2 casas modulares nuevas a propietarios de la Zona Piloto, LadderUp Housing colocó los cimientos de 4 más y Maumee Valley Habitat for Humanity completó 2 proyectos de vivienda.',
    },
  },
  {
    when: { en: 'Summer 2026', es: 'Verano de 2026' },
    datetime: '2026',
    title: { en: 'Recognized as a Rising Community Catalyst', es: 'Reconocidos como Rising Community Catalyst' },
    body: {
      en: 'The Greater Toledo Community Foundation recognized Historic South Initiative and the OSE Partnership for their work revitalizing the Old South End.',
      es: 'La Greater Toledo Community Foundation reconoció a Historic South Initiative y a la OSE Partnership por su trabajo para revitalizar el Old South End.',
    },
  },
  {
    when: { en: 'June 2026', es: 'Junio de 2026' },
    datetime: '2026-06',
    title: { en: 'Largest-ever Rock the Block cleanup', es: 'La limpieza Rock the Block más grande hasta ahora' },
    body: {
      en: 'Every partner volunteered at Maumee Valley Habitat for Humanity’s Rock the Block, the biggest Old South End cleanup yet.',
      es: 'Todos los socios participaron como voluntarios en Rock the Block de Maumee Valley Habitat for Humanity, la limpieza más grande del Old South End hasta la fecha.',
    },
  },
  {
    when: { en: 'April 2026', es: 'Abril de 2026' },
    datetime: '2026-04',
    title: { en: 'Walked the neighborhood together', es: 'Recorrimos el vecindario juntos' },
    body: {
      en: 'Led by the Lucas County Land Bank, all partners recorded conditions on 900 parcels across the Old South End. Next steps for each block will be shaped with homeowners, renters, and neighbors.',
      es: 'Bajo el liderazgo del Lucas County Land Bank, todos los socios registraron las condiciones de 900 terrenos en el Old South End. Los próximos pasos para cada cuadra se definirán junto con propietarios, inquilinos y vecinos.',
    },
  },
  {
    when: { en: 'March 2026', es: 'Marzo de 2026' },
    datetime: '2026-03',
    title: { en: 'Launched the housing pilot', es: 'Lanzamos el proyecto piloto de vivienda' },
    body: {
      en: 'Partners announced their first work in the Pilot Zone at a press conference at the Sofia Quintero Art & Cultural Center.',
      es: 'Los socios anunciaron su primer trabajo en la Zona Piloto en una conferencia de prensa en el Sofia Quintero Art & Cultural Center.',
    },
  },
  {
    when: { en: '2026', es: '2026' },
    datetime: '2026',
    title: { en: 'Old South End named a RISE area', es: 'El Old South End fue designado área RISE' },
    body: {
      en: 'The Lucas County Land Bank designated the neighborhood a Rebuild, Invest, Stabilize, and Engage area.',
      es: 'El Lucas County Land Bank designó al vecindario como área RISE (Reconstruir, Invertir, Estabilizar y Participar).',
    },
  },
  {
    when: { en: 'February 2026', es: 'Febrero de 2026' },
    datetime: '2026-02',
    title: { en: 'Became the Old South End Partnership', es: 'Nace la Old South End Partnership' },
    body: {
      en: 'The coalition took its official name and formed its Steering Committee and Pilot Project Team.',
      es: 'La coalición adoptó su nombre oficial y formó su Comité Directivo y su Equipo del Proyecto Piloto.',
    },
  },
  {
    when: { en: 'January 2026', es: 'Enero de 2026' },
    datetime: '2026-01',
    title: { en: 'Set shared goals', es: 'Definimos metas compartidas' },
    body: {
      en: 'Partners spent a full day building a shared plan for the goals and outcomes they’re working toward.',
      es: 'Los socios dedicaron un día completo a crear un plan compartido con las metas y los resultados que buscan lograr.',
    },
  },
  {
    when: { en: 'November 2025', es: 'Noviembre de 2025' },
    datetime: '2025-11',
    title: { en: 'The circle grew', es: 'El grupo creció' },
    body: {
      en: 'The Greater Toledo Community Foundation joined the effort, along with The Fair Housing Center and the Sofia Quintero Art & Cultural Center. The City of Toledo approved The Fair Housing Center as a Community Based Development Organization focused on the Old South End.',
      es: 'La Greater Toledo Community Foundation se sumó al esfuerzo, junto con The Fair Housing Center y el Sofia Quintero Art & Cultural Center. La Ciudad de Toledo aprobó a The Fair Housing Center como Organización de Desarrollo Comunitario enfocada en el Old South End.',
    },
  },
  {
    when: { en: 'September 2025', es: 'Septiembre de 2025' },
    datetime: '2025-09',
    title: { en: 'Partnership formed', es: 'Se formó la alianza' },
    body: {
      en: 'Six founding partners came together to start planning for the Old South End.',
      es: 'Seis socios fundadores se unieron para empezar a planificar el futuro del Old South End.',
    },
  },
]
