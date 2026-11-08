import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BRAND, PHONE_E164, REGION, SITE_URL, TG_BOT, TG_CONFIGURED } from '@/lib/config'

/**
 * Визитка для кнопки «Сохранить номер»: /gamera.vcf.
 *
 * Эвакуатор ищут, когда машина уже встала, — и второй раз искать заново не
 * хочется. Визитка кладёт номер в контакты одним нажатием, а с ним адрес сайта
 * и бота: в следующий раз человек находит «G.AMERA» в телефонной книге.
 *
 * Собирается при сборке из lib/config.ts, как robots.txt: номер меняется в
 * одном месте. force-static обязателен при `output: export`.
 *
 * Сервер должен отдавать .vcf как text/vcard (nginx: `text/vcard vcf;` в
 * mime.types). Без этого телефон скачает файл, а не предложит «Добавить контакт».
 */
export const dynamic = 'force-static'

// В vCard запятая, точка с запятой и обратная косая — служебные.
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`)

/*
 * Фото контакта — знак G на тёмном квадрате (public/brand/contact-photo.jpg,
 * 256×256, 4,5 КБ): в списке контактов эвакуатор узнаётся по логотипу, а не
 * по серому кружку. Вшивается в визитку при сборке. Строки по стандарту не
 * длиннее 75 знаков, продолжение — с пробела.
 */
const PHOTO = readFileSync(join(process.cwd(), 'public/brand/contact-photo.jpg')).toString('base64')
const fold = (line: string) => line.replace(/(.{74})(?=.)/g, '$1\r\n ')

export function GET() {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(BRAND)};Эвакуатор;;;`,
    `FN:${esc(`${BRAND} — эвакуатор 24/7`)}`,
    `ORG:${esc(BRAND)}`,
    `TEL;TYPE=CELL,VOICE:${PHONE_E164}`,
    `URL:${SITE_URL}/`,
    ...(TG_CONFIGURED ? [`X-SOCIALPROFILE;TYPE=telegram:https://t.me/${TG_BOT}`] : []),
    fold(`PHOTO;ENCODING=b;TYPE=JPEG:${PHOTO}`),
    `NOTE:${esc(`Эвакуатор 24/7. ${REGION}.${TG_CONFIGURED ? ` Заявка в Telegram: t.me/${TG_BOT}` : ''}`)}`,
    'END:VCARD',
    '',
  ]
  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gamera.vcf"',
    },
  })
}
