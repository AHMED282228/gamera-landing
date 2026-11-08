'use client'

import { useEffect, useRef, useState } from 'react'

import { BASE_PATH, BRAND, PHONE_DISPLAY, REGION_SHORT } from '@/lib/config'

/**
 * «Сохранить номер» и «Поделиться» — для тех, кто сейчас не едет, но хочет,
 * чтобы эвакуатор был под рукой у себя или у близких (цель лендинга: сайт
 * хочется сохранить и переслать).
 *
 * Обе — тихие ссылки, а не кнопки: главное действие на экране одно, бот.
 *
 * «Поделиться» без JS ничего не умеет, поэтому появляется только после запуска
 * скриптов. Где есть системное меню (телефоны) — открывает его; где нет
 * (большинство компьютеров) — копирует строку с номером и адресом страницы.
 * Адрес берётся у открытой страницы, а не из SITE_URL: пока сайт не выложен на
 * домен, ссылка на домен вела бы в 404.
 */
const LINK =
  'inline-flex min-h-11 items-center gap-2 font-medium text-ink ' +
  'underline decoration-line-strong underline-offset-4 transition-tint hover:decoration-amber cursor-pointer'

export function SaveShare({ className = '' }: { className?: string }) {
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState('')
  const timer = useRef(0)
  useEffect(() => {
    setReady(true)
    return () => window.clearTimeout(timer.current)
  }, [])

  function say(text: string) {
    // Повторное нажатие продлевает надпись, а не гасит её таймером прошлого.
    window.clearTimeout(timer.current)
    setNote(text)
    timer.current = window.setTimeout(() => setNote(''), 4000)
  }

  async function share() {
    const url = `${location.origin}${BASE_PATH}/`
    const text = `Эвакуатор ${BRAND}, ${REGION_SHORT}, 24/7: ${PHONE_DISPLAY}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `${BRAND} — эвакуатор 24/7`, text, url })
        return
      } catch (e) {
        // Закрыл меню — это не ошибка, сообщать нечего. Любой другой отказ
        // (меню запрещено, браузер не смог) — копируем, как на компьютере.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} — ${url}`)
      say('Скопировано: номер и ссылка')
    } catch {
      say(`Не удалось скопировать — адрес: ${url}`)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-6 ${className}`}>
      {/* Без атрибута download: с ним Safari на iPhone молча кладёт файл в
          «Загрузки», а без него открывает карточку «Создать контакт». Имя
          файла и так задаёт сервер (Content-Disposition). */}
      <a href={`${BASE_PATH}/gamera.vcf`} className={LINK}>
        Сохранить номер
      </a>
      {ready && (
        <button type="button" onClick={share} className={LINK}>
          Поделиться
        </button>
      )}
      <span role="status" className="text-label text-ink-2">
        {note}
      </span>
    </div>
  )
}
