import { ScrubStage } from '@/components/scrub/ScrubStage'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { StickyCallBar } from '@/components/StickyCallBar'
import { RevealBoot } from '@/components/ui/RevealBoot'
import { Cases } from '@/components/sections/Cases'
import { ContactWays } from '@/components/sections/ContactWays'
import { Steps } from '@/components/sections/Steps'
import { Coverage } from '@/components/sections/Coverage'
import { FinalCta } from '@/components/sections/FinalCta'

/**
 * Порядок секций идёт по вопросам, которые человек задаёт в этом же порядке:
 * возьмут ли мой случай → как позвать → что дальше → доедете ли и сколько → звоню.
 *
 * relative на <main> нужен метке прилипшей панели: она отмеряет высоту первого
 * экрана от верха страницы.
 */
export default function Page() {
  return (
    <main id="top" className="relative">
      <RevealBoot />
      <SiteHeader />
      <StickyCallBar />

      <ScrubStage />

      <Cases />
      <ContactWays />
      <Steps />
      <Coverage />
      <FinalCta />

      <SiteFooter />
    </main>
  )
}
