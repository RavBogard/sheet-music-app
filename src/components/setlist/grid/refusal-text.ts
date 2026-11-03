import type { T } from '@/i18n/core'

/**
 * Words for why the server did not take a setlist change (setlist sync PR 3).
 * Shared by the editor's refused list and Perform's live-director modal.
 */
export function refusalReasonText(reason: string, t: T, field?: string): string {
    switch (reason) {
        case 'field':
            return t('setlistGrid.refusedReasonField', { field: field ?? '' })
        case 'row-gone':
            return t('setlistGrid.refusedReasonRowGone')
        case 'row-exists':
            return t('setlistGrid.refusedReasonRowExists')
        case 'forbidden':
            return t('setlistGrid.refusedReasonForbidden')
        case 'not-found':
            return t('setlistGrid.refusedReasonNotFound')
        case 'invalid':
        case 'too-large':
            return t('setlistGrid.refusedReasonInvalid')
        case 'unauthenticated':
            return t('setlistGrid.refusedReasonUnauthenticated')
        case 'offline':
            return t('setlistGrid.offlineStructureReason')
        default:
            return t('setlistGrid.refusedReasonOther')
    }
}
