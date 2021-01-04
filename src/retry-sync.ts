import {
    stringReplace,
    hashTarget,
    randomString,
    getTargetUrl
} from './util'
import { InnerAssetsRetryOptions } from './assets-retry'
import { extractInfoFromUrl, splitUrl } from './url'
import {
    retryTimesProp,
    failedProp,
    succeededProp,
    doc,
    retryIdentifier,
    onRetryProp,
    onSuccessProp,
    onFailProp,
    domainProp,
    maxRetryCountProp,
    ImageElementCtor,
    ignoreIdentifier
} from './constants'

const retryCache: { [x: string]: boolean } = {}

/**
 * init synchronous retrying of assets,
 * this includes the retrying of
 * script, link and img tags
 *
 * @export
 * @param {InnerAssetsRetryOptions} opts
 */
export default function initSync(opts: InnerAssetsRetryOptions) {
    const onRetry = opts[onRetryProp]
    const onSuccess = opts[onSuccessProp]
    const onFail = opts[onFailProp]
    const domainMap = opts[domainProp]
    /**
     * capture error on window
     * when js / css / image failed to load
     * reload the target with new domain
     *
     * @param {ErrorEvent} event
     * @returns
     */
    const errorHandler = function(event: Event) {
        if (!event) {
            return
        }
        const target = event.target || event.srcElement
        const originalUrl = getTargetUrl(target)
        if (!originalUrl) {
            // not one of script / link / image element
            return
        }
        const [currentDomain, currentCollector] = extractInfoFromUrl(originalUrl, domainMap)
        const hasIgnoreIdentifier = target instanceof HTMLElement && target.hasAttribute(ignoreIdentifier);
        if (!currentCollector || !currentDomain || hasIgnoreIdentifier) {
            return
        }
        currentCollector[retryTimesProp]++
        currentCollector[failedProp].push(originalUrl)
        const isFinalRetry = currentCollector[retryTimesProp] > opts[maxRetryCountProp]
        if (isFinalRetry) {
            const [srcPath] = splitUrl(originalUrl, domainMap)
            onFail(srcPath)
        }
        if (!domainMap[currentDomain] || isFinalRetry) {
            // can not find a domain to switch
            // or failed too many times
            return
        }
        const newDomain = domainMap[currentDomain]
        const newUrl = stringReplace(originalUrl, currentDomain, newDomain)
        const userModifiedUrl = onRetry(newUrl, originalUrl, currentCollector)
        // if onRetry returns null, do not retry this url
        if (userModifiedUrl === null) {
            return
        }
        // eslint-disable-next-line
        if (typeof userModifiedUrl !== 'string') {
            throw new Error('a string should be returned in `onRetry` function')
        }
        // cache retried elements
        const elementId = hashTarget(target)
        if (retryCache[elementId]) {
            return
        }
        retryCache[elementId] = true
        const onloadCallback = () => {
            currentCollector[succeededProp].push(userModifiedUrl)
        }
        if (target instanceof ImageElementCtor && target.src) {
            target.setAttribute(retryIdentifier, randomString())
            target.src = userModifiedUrl
            target.onload = onloadCallback
        }
    }

    /**
     * test is link element loaded in load event
     *
     * @param {Event} event
     */
    const loadHandler = function(event: Event) {
        if (!event) {
            return
        }
        const target = event.target || event.srcElement
        const originalUrl = getTargetUrl(target)
        if (!originalUrl) {
            // not one of script / link / image element
            return
        }
        if ((target as HTMLElement).getAttribute(retryIdentifier)) {
            const [srcPath] = splitUrl(originalUrl, domainMap)
            onSuccess(srcPath)
        }
    }

    doc.addEventListener('error', errorHandler, true)
    doc.addEventListener('load', loadHandler, true)
}
