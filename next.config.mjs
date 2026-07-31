/*
 * Подкаталог сайта.
 *
 * Пусто — сайт стоит в корне домена, и это боевой случай. Непусто бывает только
 * у витрины на GitHub Pages: проектная страница живёт по адресу вида
 * user.github.io/имя-репозитория/, и без приставки все пути ведут в никуда.
 *
 * basePath отвечает за то, что Next выпускает сам: свои скрипты, стили, ссылки.
 * За пути, написанные строками — постер, клипы, логотип, — он не отвечает, их
 * префиксует lib/config.ts из той же переменной. Меняя одно, надо помнить про
 * второе, иначе половина файлов уедет мимо.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический HTML: страница должна читаться поисковиком и работать без сервера.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
}

export default nextConfig
