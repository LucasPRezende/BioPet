import 'server-only'
import fs from 'fs'

const WIN_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME ?? 'user') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
]

const LINUX_CHROME_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
]

const CHROMIUM_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'

const PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']

function findLocalChrome(): string | null {
  const paths = process.platform === 'win32' ? WIN_CHROME_PATHS : LINUX_CHROME_PATHS
  return paths.find(p => fs.existsSync(p)) ?? null
}

export async function launchBrowser() {
  const puppeteer = await import('puppeteer-core')

  // 1. Explicit override via env var
  if (process.env.CHROMIUM_PATH) {
    return puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: PUPPETEER_ARGS,
    })
  }

  // 2. Auto-detect locally installed Chrome/Chromium (Windows + Linux VPS)
  const localChrome = findLocalChrome()
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: PUPPETEER_ARGS,
    })
  }

  // 3. Vercel / Lambda — download Chromium from Sparticuz
  const chromium = await import('@sparticuz/chromium-min')
  return puppeteer.launch({
    args:            chromium.default.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath:  await chromium.default.executablePath(
      process.env.CHROMIUM_DOWNLOAD_URL ?? CHROMIUM_URL,
    ),
    headless: true,
  })
}
