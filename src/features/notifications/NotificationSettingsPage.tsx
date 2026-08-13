import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { getErrorMessage } from '../../lib/errors'
import { canReceiveNotifications } from '../../lib/notificationRoles'
import { ROLE_I18N_KEY } from '../../lib/roleLabels'
import {
  permissionState,
  pushCapability,
  subscribe,
  subscriptionState,
  unsubscribe,
  type PushCapability,
  type SubscriptionState,
} from '../../lib/push'

/**
 * Notification settings — the only place a family turns push on or off.
 *
 * Rendered for every role, but it does not pretend the switch means the
 * same thing to all of them: notifications are family-facing (TAD
 * ADR-015), so a tutor or admin is told plainly that nothing would be
 * sent to them rather than being offered a toggle that stores a
 * subscription and then goes quiet forever.
 *
 * The three states that are easy to get wrong, and are handled here
 * explicitly rather than falling through to a dead button:
 *
 *   - **permission denied** — `Notification.requestPermission()` will
 *     never prompt again once refused, so we explain where to undo it
 *     instead of re-asking on every click;
 *   - **iOS not installed** — Web Push exists on iOS 16.4+ only for a
 *     site launched from the Home Screen, so we give the install steps
 *     (checklist §5) rather than reporting the browser as unsupported;
 *   - **genuinely unsupported** — said once, without a button.
 */
export function NotificationSettingsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()

  const [capability, setCapability] = useState<PushCapability>('unsupported')
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [state, setState] = useState<SubscriptionState>('off')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRecipient = profile ? canReceiveNotifications(profile.role) : false
  const subscribedHere = state === 'on-this-device'

  useEffect(() => {
    setCapability(pushCapability())
    setPermission(permissionState())
    void subscriptionState().then(setState)
  }, [])

  async function handleEnable() {
    setBusy(true)
    setError(null)
    try {
      await subscribe()
      setPermission(permissionState())
      // Re-read rather than assuming: `subscribe()` reporting success
      // means the row was written, and this is the same check that would
      // catch it if it somehow wasn't.
      setState(await subscriptionState())
    } catch (err) {
      // `subscribe()` marks the one failure a family can do something
      // about — the browser's push service not answering — with a
      // sentinel, so it gets a plain explanation rather than a raw
      // error string.
      setError(
        getErrorMessage(err) === 'push-service-unreachable'
          ? t('notifications.settings.pushServiceUnreachable')
          : getErrorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    setError(null)
    try {
      await unsubscribe()
      setState('off')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-ppme-primary">{t('notifications.settings.title')}</h1>
        <p className="mt-2 text-sm text-ppme-text/70">{t('notifications.settings.intro')}</p>
      </div>

      {!isRecipient && profile && (
        <div className="rounded-lg bg-ppme-bg-alt p-4 text-sm text-ppme-text/80 shadow-sm">
          {t('notifications.settings.notARecipient', { role: t(ROLE_I18N_KEY[profile.role]) })}
        </div>
      )}

      {isRecipient && (
        <div className="rounded-lg bg-white p-6 shadow-sm">
          {capability === 'unsupported' && (
            <p className="text-sm text-ppme-text/70">{t('notifications.settings.unsupported')}</p>
          )}

          {capability === 'ios-install-required' && (
            <div className="space-y-2">
              <h2 className="font-medium text-ppme-text">
                {t('notifications.settings.iosInstallTitle')}
              </h2>
              <p className="text-sm text-ppme-text/70">
                {t('notifications.settings.iosInstallBody')}
              </p>
            </div>
          )}

          {capability === 'ready' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-ppme-text">
                {state === 'on-this-device' && t('notifications.settings.enabled')}
                {state === 'on-another-device' && t('notifications.settings.enabledOtherDevice')}
                {state === 'off' && t('notifications.settings.disabled')}
              </p>

              {permission === 'denied' ? (
                <p className="text-sm text-ppme-text/70">
                  {t('notifications.settings.permissionDenied')}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void (subscribedHere ? handleDisable() : handleEnable())}
                  disabled={busy}
                  className={`min-h-11 w-full rounded-md px-4 font-medium transition-colors disabled:opacity-60 ${
                    subscribedHere
                      ? 'bg-ppme-bg-alt text-ppme-text hover:bg-ppme-bg-alt/70'
                      : 'bg-ppme-primary text-white hover:bg-ppme-primary/90'
                  }`}
                >
                  {busy
                    ? t('notifications.settings.working')
                    : subscribedHere
                      ? t('notifications.settings.disable')
                      : state === 'on-another-device'
                        ? t('notifications.settings.moveHere')
                        : t('notifications.settings.enable')}
                </button>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>
      )}

      {isRecipient && (
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="font-medium text-ppme-text">{t('notifications.settings.whatYouGet')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ppme-text/70">
            <li>{t('notifications.settings.itemAbsence')}</li>
          </ul>
        </div>
      )}

      {/* Shown to every role, recipient or not: it describes what the
          system does with children's data, which a tutor or admin has
          as much reason to be able to read as a parent. */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium text-ppme-text">{t('notifications.settings.privacyTitle')}</h2>
        <p className="mt-2 text-sm text-ppme-text/70">{t('notifications.settings.privacyBody')}</p>
      </div>
    </div>
  )
}
