import { ScrubStage } from '@/components/scrub/ScrubStage'
import { UnloadStage } from '@/components/scrub/UnloadStage'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { ChapterBar, type Chapter } from '@/components/layout/ChapterBar'
import { UNLOAD_SCENE } from '@/lib/config'
import { StickyCallBar } from '@/components/StickyCallBar'
import { RevealBoot } from '@/components/ui/RevealBoot'
import { HeroStatic } from '@/components/sections/HeroStatic'
import { Tape } from '@/components/sections/Tape'
import { Cases } from '@/components/sections/Cases'
import { OrderDemo } from '@/components/sections/OrderDemo'
import { Truck } from '@/components/sections/Truck'
import { CallPhotos } from '@/components/sections/CallPhotos'
import { Coverage } from '@/components/sections/Coverage'
import { Faq } from '@/components/sections/Faq'
import { FinalCta } from '@/components/sections/FinalCta'

/**
 * Вариант «клип в середине»: страница рассказывает один вызов по шагам —
 * встали → заявка → едем → грузим (тут клип) → довезли. Первый экран без
 * промотки: что это и как позвать. Прежний порядок «клип сразу»: ScrubStage
 * без chapter вместо HeroStatic, остальное в прежнем порядке.
 */
const CHAPTERS: Chapter[] = [
  { label: 'Встали', ids: ['cases'] },
  { label: 'Заявка', ids: ['steps'] },
  { label: 'Едем', ids: ['coverage'] },
  { label: 'Грузим', ids: ['loading', 'truck'] },
  { label: 'Довезли', ids: ['photos'] },
]

export default function Page() {
  return (
    <main id="top" className="relative">
      <RevealBoot />
      <SiteHeader />
      <ChapterBar chapters={CHAPTERS} />
      <StickyCallBar />

      <HeroStatic />
      <Tape />
      <Cases />
      <OrderDemo />
      <Coverage />
      <ScrubStage chapter />
      <Truck />
      <CallPhotos />
      {/* Вторая сцена снята со страницы, вернуть — UNLOAD_SCENE в lib/config.ts. */}
      {UNLOAD_SCENE && <UnloadStage />}
      <Faq />
      <FinalCta />

      <SiteFooter />
    </main>
  )
}
