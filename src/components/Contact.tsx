import ContactForm from './ContactForm'
import { useCopy } from '../i18n/useCopy'

/** Get in touch: the invitation on the left, the form on the right (stacked below xl). */
export default function Contact() {
  const t = useCopy().contact
  return (
    <section id="contact" aria-labelledby="contact-heading" className="bg-white py-10 md:py-[72px]">
      <div className="site-container grid gap-5 md:gap-8 xl:grid-cols-[440px_minmax(0,1fr)] xl:gap-20">
        <div className="flex flex-col gap-3 md:gap-5">
          <p className="eyebrow m-0 text-brick">{t.eyebrow}</p>
          <h2 id="contact-heading" className="section-title">
            {t.title}
          </h2>
          <p className="m-0 text-base leading-[1.6] text-umber md:text-lg">{t.lead}</p>
        </div>
        <ContactForm />
      </div>
    </section>
  )
}
