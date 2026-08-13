/*
 * Web Push handlers for the TPA PWA.
 *
 * This file is *imported into* the Workbox-generated service worker
 * (`vite.config.ts` → `workbox.importScripts`) rather than replacing it.
 * The alternative — switching vite-plugin-pwa to the `injectManifest`
 * strategy — would mean hand-maintaining the precache and runtime-cache
 * setup that already works, in order to add two event listeners. See
 * TAD ADR-015.
 *
 * The payload arrives already localized and already reduced to what a
 * lock screen may show (DPIA R6); this file renders it and does not
 * decide anything about content. Keep it that way — the payload builder
 * (`netlify/functions/lib/notifications.ts`) is where the content rules
 * live and where they are tested.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // A push with no body, or a body we can't parse, still deserves to
    // show *something*: on Android a push event handled without calling
    // showNotification() makes the browser display its own "This site
    // has been updated in the background" notice, which is worse than a
    // generic one of ours.
    payload = {}
  }

  const title = payload.title || 'TPA PPME Den Haag'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same tag ⇒ the newer notification replaces the older one instead
    // of stacking. `renotify` stays false so a replacement doesn't buzz
    // the phone a second time for the same event.
    tag: payload.tag || 'tpa-notification',
    renotify: false,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Prefer an already-open tab: opening a second one would leave the
      // family with two copies of the app and a fresh Supabase session
      // handshake for no reason.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              // navigate() rejects if the client is in an unexpected
              // state; a focused app on the wrong screen still beats
              // no app at all.
            }
          }
          return
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
