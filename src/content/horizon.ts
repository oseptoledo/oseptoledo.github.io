import type { Localized } from '../i18n/locale'
import type { PartnerId } from './partners'

/**
 * "Where we're going next": what each partner is working on now, in the order
 * the design shows them. Cards are labeled with the partner's official name
 * from src/content/partners.ts, never retyped here.
 */
export interface HorizonItem {
  partnerId: PartnerId
  body: Localized
}

export const HORIZON: readonly HorizonItem[] = [
  {
    partnerId: 'historic-south',
    body: {
      en: 'Two more new homes under construction in the Pilot Zone, plus 17 sidewalk replacements on Knower Street.',
      es: 'Dos casas nuevas más en construcción en la Zona Piloto, además del reemplazo de 17 aceras en Knower Street.',
    },
  },
  {
    partnerId: 'ladderup-housing',
    body: {
      en: 'Foundations are poured for 4 new modular homes in the Pilot Zone, with more homes on the way.',
      es: 'Ya colocó los cimientos de 4 casas modulares nuevas en la Zona Piloto, y vienen más casas en camino.',
    },
  },
  {
    partnerId: 'lucas-county-land-bank',
    body: {
      en: 'Scheduled 8 Pilot Zone buildings for demolition, with 32 planned across the neighborhood.',
      es: 'Programó la demolición de 8 edificios en la Zona Piloto, con 32 planificados en todo el vecindario.',
    },
  },
  {
    partnerId: 'mv-habitat',
    body: {
      en: 'Opened its Financial Opportunity Center with coaching opportunities for OSE residents. Five more homes are under construction.',
      es: 'Abrió su Centro de Oportunidades Financieras, con asesoría para los residentes del Old South End. Otras cinco casas están en construcción.',
    },
  },
  {
    partnerId: 'toledo-lisc',
    body: {
      en: 'Gave HSI a Core City grant and an interest-free loan to buy, remodel, and sell the home at 204 South.',
      es: 'Otorgó a HSI una subvención Core City y un préstamo sin intereses para comprar, remodelar y vender la casa en 204 South.',
    },
  },
  {
    partnerId: 'fair-housing-center',
    body: {
      en: 'Partnering with the Broadway Corridor Coalition and the Land Bank to bring vacant properties under receivership.',
      es: 'Colabora con la Broadway Corridor Coalition y el Land Bank para poner propiedades vacías bajo administración judicial.',
    },
  },
  {
    partnerId: 'sofia-quintero',
    body: {
      en: 'Coordinating resident engagement and trust-building, and hosting partner meetings, including The Fair Housing Center’s monthly community meetings.',
      es: 'Coordina la participación de los residentes y la creación de confianza, y ofrece su espacio para reuniones de los socios, como las reuniones comunitarias mensuales de The Fair Housing Center.',
    },
  },
  {
    partnerId: 'believe-center',
    body: {
      en: 'Helping residents navigate housing needs while continuing its youth and family programs.',
      es: 'Ayuda a los residentes con sus necesidades de vivienda mientras continúa sus programas para jóvenes y familias.',
    },
  },
]
