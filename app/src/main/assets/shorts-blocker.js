/**
 * YouTube Pure: Shorts Eradication, Ad Skipping, Gesture Controls & Liquid Glass UI
 */
(function () {
    'use strict';

    // 1. Force Background Playback: Prevent YouTube from pausing when tab/screen is unfocused
    try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });

        document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
        window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);
    } catch (e) {}

    // 2. Block External "Open In App" / Play Store Redirects in JavaScript
    const origOpen = window.open;
    window.open = function (url) {
        if (typeof url === 'string') {
            const lower = url.toLowerCase();
            if (lower.includes('market://') || lower.includes('com.google.android.youtube') || lower.includes('open_app')) {
                console.log('YouTubePure: Blocked open-in-app redirect:', url);
                return null;
            }
        }
        return origOpen.apply(this, arguments);
    };

    // 3. URL Interceptor: Redirect any /shorts/ID immediately to standard /watch?v=ID
    function redirectShortsUrl(url) {
        try {
            const parsed = new URL(url || window.location.href);
            if (parsed.pathname.startsWith('/shorts/')) {
                const parts = parsed.pathname.split('/');
                const id = parts[2] || parts[1];
                if (id) {
                    const cleanId = id.split('?')[0].split('&')[0];
                    const target = '/watch?v=' + cleanId;
                    console.log('YouTubePure: Redirecting Short -> Normal Watch:', target);
                    window.location.replace(target);
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    redirectShortsUrl();

    // Hook SPA History pushState/replaceState
    const originalPushState = history.pushState;
    history.pushState = function () {
        originalPushState.apply(this, arguments);
        redirectShortsUrl(arguments[2]);
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        redirectShortsUrl(arguments[2]);
    };
    window.addEventListener('popstate', () => redirectShortsUrl());

    // 4. Selectors to purge from DOM (Shorts, Open in App, Ads)
    const PURGE_SELECTORS = [
        // "Open in app" & Upsell banners
        'ytm-app-banner',
        '.mobile-topbar-header .open-in-app',
        '.topbar-action-button:has(a[href*="app"])',
        'ytm-header-bar .open-in-app',
        '.ytm-open-app-banner',
        '.app-promo-banner',
        'ytm-upsell-dialog-renderer',
        '.upsell-dialog',
        '.promo-interstitial',
        '.mealbar-promo-renderer',
        'ytm-mealbar-promo-renderer',
        '[aria-label*="Open app" i]',
        '[aria-label*="Get app" i]',
        '[aria-label*="Get YouTube" i]',
        '[aria-label*="Open in app" i]',
        // Shorts
        'ytm-reel-shelf-renderer',
        'ytm-shorts-lockup-view-model-v2',
        'ytm-shorts-lockup-view-model',
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer[is-shorts]',
        'ytm-reel-item-renderer',
        'ytm-pivot-bar-item-renderer:has([aria-label*="Shorts" i])',
        'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
        'ytm-pivot-bar-item-renderer[aria-label*="Shorts" i]',
        'a[href^="/shorts"]',
        // Ads & Sponsored
        'ytm-promoted-sparkles-web-renderer',
        'ytm-promoted-video-renderer',
        'ytm-companion-ad-renderer',
        'ytm-ad-slot-renderer',
        '#player-ads'
    ];

    function purgeElements(root = document) {
        for (let i = 0; i < PURGE_SELECTORS.length; i++) {
            const elements = root.querySelectorAll(PURGE_SELECTORS[i]);
            for (let j = 0; j < elements.length; j++) {
                elements[j].remove();
            }
        }

        // Pivot bar check
        const pivotItems = document.querySelectorAll('ytm-pivot-bar-item-renderer');
        pivotItems.forEach((item) => {
            const text = (item.innerText || item.getAttribute('aria-label') || '').toLowerCase();
            const link = item.querySelector('a');
            const href = (link?.getAttribute('href') || '').toLowerCase();
            if (text.includes('shorts') || href.includes('/shorts') || text.includes('open') || href.includes('app')) {
                item.remove();
            }
        });
    }

    // 5. Video Ad Fast-Forward & Auto-Skip
    function handleVideoAds() {
        const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
        const video = document.querySelector('video');

        if (adShowing && video && !isNaN(video.duration)) {
            try {
                video.muted = true;
                video.playbackRate = 16.0;
                video.currentTime = video.duration - 0.1;
            } catch (e) {}
        }

        // Click any skip button instantly
        const skipButtons = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton, .ytp-ad-skip-button-slot');
        skipButtons.forEach((btn) => btn.click());
    }

    // 6. Double-Tap to Seek (10s Forward / Backward) with Liquid Glass Indicator
    let lastTapTime = 0;
    let lastTapSide = null;
    let seekIndicator = null;
    let hideSeekTimeout = null;

    function getOrCreateSeekIndicator() {
        if (!seekIndicator || !document.body.contains(seekIndicator)) {
            seekIndicator = document.createElement('div');
            seekIndicator.className = 'yt-pure-seek-indicator';
            document.body.appendChild(seekIndicator);
        }
        return seekIndicator;
    }

    function showSeekFeedback(text, isRightSide) {
        const indicator = getOrCreateSeekIndicator();
        indicator.innerText = text;
        indicator.style.left = isRightSide ? 'auto' : '15%';
        indicator.style.right = isRightSide ? '15%' : 'auto';
        indicator.classList.add('visible');

        clearTimeout(hideSeekTimeout);
        hideSeekTimeout = setTimeout(() => {
            indicator.classList.remove('visible');
        }, 650);
    }

    function setupDoubleTapSeek() {
        const player = document.querySelector('.video-player-container, #player, .player-container, video');
        if (!player || player.dataset.ytPureSeekAttached) return;
        player.dataset.ytPureSeekAttached = 'true';

        player.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const rect = player.getBoundingClientRect();
            const relativeX = touch.clientX - rect.left;
            const width = rect.width;
            const now = Date.now();

            const isLeft = relativeX < width * 0.4;
            const isRight = relativeX > width * 0.6;

            if (isLeft || isRight) {
                const side = isLeft ? 'left' : 'right';
                if (now - lastTapTime < 320 && lastTapSide === side) {
                    const video = document.querySelector('video');
                    if (video) {
                        e.preventDefault();
                        if (side === 'left') {
                            video.currentTime = Math.max(0, video.currentTime - 10);
                            showSeekFeedback('◀◀ 10 sec', false);
                        } else {
                            video.currentTime = Math.min(video.duration || 99999, video.currentTime + 10);
                            showSeekFeedback('10 sec ▶▶', true);
                        }
                    }
                    lastTapTime = 0;
                    lastTapSide = null;
                    return;
                }
                lastTapTime = now;
                lastTapSide = side;
            } else {
                lastTapTime = 0;
                lastTapSide = null;
            }
        }, { passive: false });
    }

    // 7. High-Performance MutationObserver
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => {
                purgeElements();
                handleVideoAds();
                setupDoubleTapSeek();
                scheduled = false;
            });
        }
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    setInterval(() => {
        purgeElements();
        handleVideoAds();
        setupDoubleTapSeek();
    }, 1000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            purgeElements();
            setupDoubleTapSeek();
        });
    } else {
        purgeElements();
        setupDoubleTapSeek();
    }

    console.log('YouTubePure: Liquid Glass & Extended App Features loaded.');
})();
