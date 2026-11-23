/**
 * YouTube Pure: Shorts Eradication & Ad-Skipping Engine
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
    } catch (e) {
        console.warn('YouTubePure: Failed to patch visibilityState', e);
    }

    // 2. URL Interceptor: Redirect any /shorts/ID immediately to standard /watch?v=ID
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

    // 3. Selectors to purge from DOM
    const SHORTS_SELECTORS = [
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
        'ytm-promoted-sparkles-web-renderer',
        'ytm-promoted-video-renderer'
    ];

    function purgeShortsAndAds(root = document) {
        // Fast-path: query and remove
        for (let i = 0; i < SHORTS_SELECTORS.length; i++) {
            const elements = root.querySelectorAll(SHORTS_SELECTORS[i]);
            for (let j = 0; j < elements.length; j++) {
                elements[j].remove();
            }
        }

        // Check pivot bar directly
        const pivotItems = document.querySelectorAll('ytm-pivot-bar-item-renderer');
        pivotItems.forEach((item) => {
            const text = (item.innerText || item.getAttribute('aria-label') || '').toLowerCase();
            const link = item.querySelector('a');
            if (text.includes('shorts') || (link && link.getAttribute('href') && link.getAttribute('href').includes('/shorts'))) {
                item.remove();
            }
        });
    }

    // 4. Video Ad Fast-Forward & Auto-Skip
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

    // 5. High-Performance MutationObserver
    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => {
                purgeShortsAndAds();
                handleVideoAds();
                scheduled = false;
            });
        }
    });

    // Start observing as early as possible
    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    // Fallback periodic check for dynamic feed scrolling
    setInterval(() => {
        purgeShortsAndAds();
        handleVideoAds();
    }, 1000);

    // Initial pass
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => purgeShortsAndAds());
    } else {
        purgeShortsAndAds();
    }

    console.log('YouTubePure: Shorts and Ad blocker initialized successfully.');
})();
