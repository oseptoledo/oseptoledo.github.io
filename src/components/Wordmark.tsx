interface WordmarkProps {
  /** Footer size; the header uses the default. */
  large?: boolean
}

/**
 * "OSE Partnership", set as the design sets it: a heavy OSE, a lighter
 * Partnership.
 *
 * In the header, "Partnership" drops out below 360px: the mark, the EN/ES pill
 * and the menu button need about 370px side by side, and narrower phones
 * (320px iPhone SE, 280px folded Galaxy) would otherwise push the menu button
 * off the edge and make the whole page scroll sideways. The home link carries
 * the full name as its accessible label, so nothing is lost to screen readers.
 */
export default function Wordmark({ large = false }: WordmarkProps) {
  return (
    <span className="flex items-baseline gap-1 xl:gap-1.5">
      <span
        className={
          large
            ? 'text-[1.625rem] font-extrabold sm:text-[2rem]'
            : 'text-xl font-extrabold tracking-[-0.4px] xl:text-[1.625rem] xl:tracking-[-0.5px]'
        }
      >
        OSE
      </span>
      <span className={large ? 'text-xl sm:text-2xl' : 'text-base font-medium max-[359px]:hidden xl:text-xl'}>
        Partnership
      </span>
    </span>
  )
}
