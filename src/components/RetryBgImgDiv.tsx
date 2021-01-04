import React from 'react'
import { AssetsRetryOptions, InnerAssetsRetryOptions } from '../assets-retry'
import { extractInfoFromUrl, prepareDomainMap, splitUrl } from '../url'
import {
    maxRetryCountProp,
    onRetryProp,
    onSuccessProp,
    onFailProp,
    domainProp,
    failedProp,
    succeededProp,
    retryTimesProp
} from '../constants'
import { identity, noop, stringReplace } from '../util'

export interface BgImgDivProps extends React.HTMLAttributes<HTMLDivElement> {
    imgSrc: string
    options: AssetsRetryOptions
}

/**
 * 侵入式的背景图片元素
 * 重试策略：在 div backgroundImage 加载的同时用 Image 模拟请求，根据请求的情况切换 URL 重试
 */
export default class RetryBgImgDiv extends React.Component<BgImgDivProps> {
    state = {
        propSrc: '',
        currentSrc: '',
        hasRetry: false
    }

    // 解析后的配置
    innerOptions: InnerAssetsRetryOptions

    // 图片相关
    imgElem: null | HTMLImageElement

    constructor(props: BgImgDivProps) {
        super(props)

        const { options: opts, imgSrc } = this.props
        this.innerOptions = {
            [maxRetryCountProp]: opts[maxRetryCountProp] || 3,
            [onRetryProp]: opts[onRetryProp] || identity,
            [onSuccessProp]: opts[onSuccessProp] || noop,
            [onFailProp]: opts[onFailProp] || noop,
            [domainProp]: prepareDomainMap(opts[domainProp])
        } as InnerAssetsRetryOptions

        // init
        this.state.propSrc = imgSrc
    }

    componentDidMount() {
        const { imgSrc } = this.props

        // 启动加载
        this.setState(
            {
                currentSrc: imgSrc
            },
            () => {
                this.loadImage(imgSrc)
            }
        )
    }

    componentDidUpdate() {
        const { imgSrc } = this.props
        const { propSrc } = this.state

        // 若是 props 发生了改变，重置组件状态，并重新加载
        if (propSrc !== imgSrc) {
            this.setState({
                propSrc: imgSrc,
                currentSrc: imgSrc,
                hasRetry: false
            })
        }
    }

    componentWillUnmount() {
        // 清理无用图片元素
        this.imgElem = null
    }

    loadImage(src: string) {
        if (!src) {
            return
        }

        this.imgElem = new Image()
        this.imgElem.onload = this.imgOnLoad
        this.imgElem.onerror = this.imgOnError
        this.imgElem.src = src
    }

    imgOnLoad() {
        const {
            options: { onSuccess }
        } = this.props
        const { [domainProp]: domainMap } = this.innerOptions
        const { currentSrc: originalUrl, hasRetry } = this.state
        const [, currentCollector] = extractInfoFromUrl(originalUrl, domainMap)

        if (hasRetry) {
            const [srcPath] = splitUrl(originalUrl, domainMap)
            onSuccess(srcPath)
            // 重试成功才触发统计收集
            currentCollector[succeededProp].push(originalUrl)
        }
    }

    imgOnError() {
        const { currentSrc: originalUrl } = this.state
        const {
            [domainProp]: domainMap,
            [maxRetryCountProp]: maxRetryCount,
            onFail,
            onRetry
        } = this.innerOptions
        const [currentDomain, currentCollector] = extractInfoFromUrl(originalUrl, domainMap)
        if (!currentCollector || !currentDomain) {
            return
        }
        currentCollector[retryTimesProp]++
        currentCollector[failedProp].push(originalUrl)
        const isFinalRetry = currentCollector[retryTimesProp] > maxRetryCount
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
        this.setState(
            {
                currentSrc: userModifiedUrl,
                hasRetry: true
            },
            () => {
                this.loadImage(userModifiedUrl)
            }
        )
    }

    render() {
        const { children, imgSrc, style, ...otherProps } = this.props
        const { propSrc, currentSrc } = this.state
        const img = currentSrc || propSrc
        const styleObj = {
            ...style,
            ...(img ? { backgroundImage: img } : {})
        }
        return (
            <div style={styleObj} {...otherProps}>
                {children}
            </div>
        )
    }
}
