/**
 * YouTube Pure: Extended YouTube Feature Engine & Liquid Glass Controls
 */
(function () {
    'use strict';

    if (!document.documentElement || !['m.youtube.com', 'www.youtube.com', 'youtube.com'].includes(location.hostname)) return;
    if (window.ytPureInitialized) return;
    window.ytPureInitialized = true;

    // 1. Force Background Playback: Prevent YouTube from pausing when tab/screen is unfocused
    try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });

        document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
        window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);
    } catch (e) {}

    // 2. Block External "Open In App" / Play Store Redirects
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

    function leaveShorts() {
        if (/^\/shorts(?:\/|$)/.test(location.pathname)) {
            location.replace('/');
            return true;
        }
        return false;
    }

    if (leaveShorts()) return;

    function onNavigate() {
        if (!leaveShorts()) handleVideoChange();
    }

    for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        history[method] = function (...args) {
            const result = original.apply(this, args);
            onNavigate();
            return result;
        };
    }
    window.addEventListener('popstate', onNavigate);

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

        const skipButtons = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton, .ytp-ad-skip-button-slot');
        skipButtons.forEach((btn) => btn.click());
    }

    // 6. Floating Indicators (Seek & 2x Speed)
    let floatingPill = null;
    let speedPill = null;
    let hideSeekTimeout = null;

    function getOrCreatePill() {
        if (!floatingPill || !document.body.contains(floatingPill)) {
            floatingPill = document.createElement('div');
            floatingPill.className = 'yt-pure-floating-pill';
            document.body.appendChild(floatingPill);
        }
        return floatingPill;
    }

    function getOrCreateSpeedPill() {
        if (!speedPill || !document.body.contains(speedPill)) {
            speedPill = document.createElement('div');
            speedPill.className = 'yt-pure-speed-pill';
            speedPill.innerText = '⚡ 2× Speed';
            document.body.appendChild(speedPill);
        }
        return speedPill;
    }

    function showSeekFeedback(text, isRightSide) {
        const pill = getOrCreatePill();
        pill.innerText = text;
        pill.style.left = isRightSide ? 'auto' : '15%';
        pill.style.right = isRightSide ? '15%' : 'auto';
        pill.classList.add('visible');

        clearTimeout(hideSeekTimeout);
        hideSeekTimeout = setTimeout(() => {
            pill.classList.remove('visible');
        }, 650);
    }

    // 7. Video Gestures: Double-Tap Seek & Hold for 2× Speed
    let lastTapTime = 0;
    let lastTapSide = null;
    let holdTimer = null;
    let isHoldingSpeed = false;
    let previousRate = 1.0;
    let isScreenLocked = false;

    function setupPlayerGestures() {
        const player = document.querySelector('.video-player-container, #player, .player-container, video');
        if (!player || player.dataset.ytPureGesturesAttached) return;
        player.dataset.ytPureGesturesAttached = 'true';

        player.addEventListener('touchstart', (e) => {
            if (isScreenLocked) return;
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const rect = player.getBoundingClientRect();
            const relativeX = touch.clientX - rect.left;
            const width = rect.width;
            const now = Date.now();

            const isLeft = relativeX < width * 0.4;
            const isRight = relativeX > width * 0.6;
            const side = isLeft ? 'left' : (isRight ? 'right' : 'center');

            // Setup Hold for 2x Speed
            const video = document.querySelector('video');
            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
                if (video && !video.paused) {
                    isHoldingSpeed = true;
                    previousRate = video.playbackRate || 1.0;
                    video.playbackRate = 2.0;
                    getOrCreateSpeedPill().classList.add('visible');
                }
            }, 450);

            // Double tap to seek
            if (isLeft || isRight) {
                if (now - lastTapTime < 320 && lastTapSide === side) {
                    clearTimeout(holdTimer); // Cancel hold 2x if double tapping
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

        function cancelHoldSpeed() {
            clearTimeout(holdTimer);
            if (isHoldingSpeed) {
                isHoldingSpeed = false;
                const video = document.querySelector('video');
                if (video) {
                    video.playbackRate = previousRate;
                }
                getOrCreateSpeedPill().classList.remove('visible');
            }
        }

        player.addEventListener('touchend', cancelHoldSpeed);
        player.addEventListener('touchcancel', cancelHoldSpeed);
    }

    // 8. Custom Liquid Glass Control Bar (Lock, Loop, Sleep Timer, Native Share)
    function injectFeatureControlBar() {
        const metadataContainer = document.querySelector('ytm-item-section-renderer, .slim-video-metadata-header, #app');
        if (!metadataContainer || document.getElementById('yt-pure-control-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'yt-pure-control-bar';
        bar.className = 'yt-pure-control-bar';

        // 1. Screen Lock Button
        const lockBtn = document.createElement('button');
        lockBtn.className = 'yt-pure-btn';
        lockBtn.innerText = '🔒 Lock Screen';
        lockBtn.onclick = () => {
            isScreenLocked = !isScreenLocked;
            lockBtn.innerText = isScreenLocked ? '🔓 Screen Locked' : '🔒 Lock Screen';
            lockBtn.classList.toggle('active', isScreenLocked);

            let shield = document.getElementById('yt-pure-lock-shield');
            if (!shield) {
                shield = document.createElement('div');
                shield.id = 'yt-pure-lock-shield';
                shield.className = 'yt-pure-lock-shield';
                document.body.appendChild(shield);
            }
            shield.classList.toggle('active', isScreenLocked);

            if (window.AndroidBridge) {
                window.AndroidBridge.showToast(isScreenLocked ? 'Player locked: touches disabled' : 'Player unlocked');
            }
        };
        bar.appendChild(lockBtn);

        // 2. Loop Video Button
        const loopBtn = document.createElement('button');
        loopBtn.className = 'yt-pure-btn';
        loopBtn.innerText = '🔁 Loop';
        loopBtn.onclick = () => {
            const video = document.querySelector('video');
            if (video) {
                video.loop = !video.loop;
                loopBtn.classList.toggle('active', video.loop);
                if (window.AndroidBridge) {
                    window.AndroidBridge.showToast(video.loop ? 'Video looping enabled' : 'Video looping disabled');
                }
            }
        };
        bar.appendChild(loopBtn);

        // 3. Sleep Timer Button
        const sleepBtn = document.createElement('button');
        sleepBtn.className = 'yt-pure-btn';
        sleepBtn.innerText = '⏱️ Sleep Timer';
        sleepBtn.onclick = () => {
            const minutes = prompt('Set Sleep Timer (minutes to auto-pause):', '30');
            if (minutes !== null) {
                const parsed = parseInt(minutes, 10);
                if (!isNaN(parsed) && window.AndroidBridge) {
                    window.AndroidBridge.setSleepTimer(parsed);
                    sleepBtn.classList.toggle('active', parsed > 0);
                }
            }
        };
        bar.appendChild(sleepBtn);

        // 4. Native Share Button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'yt-pure-btn';
        shareBtn.innerText = '↗️ Share';
        shareBtn.onclick = () => {
            const title = document.title || 'YouTube Video';
            const url = window.location.href;
            if (window.AndroidBridge) {
                window.AndroidBridge.share(title, url);
            } else if (navigator.share) {
                navigator.share({ title, url });
            }
        };
        bar.appendChild(shareBtn);

        // Insert after video player container
        const playerContainer = document.querySelector('.video-player-container, #player-container-id, ytm-player');
        if (playerContainer && playerContainer.parentNode) {
            playerContainer.parentNode.insertBefore(bar, playerContainer.nextSibling);
        } else {
            metadataContainer.prepend(bar);
        }
    }

    // 9. Return YouTube Dislike Integration
    let currentVideoId = null;
    function fetchAndShowDislikes() {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        if (!videoId || videoId === currentVideoId) return;
        currentVideoId = videoId;

        fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data && typeof data.dislikes === 'number') {
                    const formatted = formatNumber(data.dislikes);
                    const dislikeBtn = document.querySelector('[aria-label*="Dislike" i], .slim-video-action-bar-actions button:nth-child(2)');
                    if (dislikeBtn && !dislikeBtn.querySelector('.yt-pure-dislike-count')) {
                        const countSpan = document.createElement('span');
                        countSpan.className = 'yt-pure-dislike-count';
                        countSpan.innerText = ` ${formatted}`;
                        dislikeBtn.appendChild(countSpan);
                    }
                }
            })
            .catch(() => {});
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function handleVideoChange() {
        setTimeout(() => {
            fetchAndShowDislikes();
            injectFeatureControlBar();
            setupPlayerGestures();
        }, 800);
    }

    // 10. MutationObserver Engine
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => {

                handleVideoAds();
                setupPlayerGestures();
                injectFeatureControlBar();
                fetchAndShowDislikes();
                scheduled = false;
            });
        }
    });

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });

    setInterval(() => {

        handleVideoAds();
        setupPlayerGestures();
        injectFeatureControlBar();
    }, 1500);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {

            setupPlayerGestures();
            injectFeatureControlBar();
        });
    } else {

        setupPlayerGestures();
        injectFeatureControlBar();
    }

    console.log('YouTubePure: Liquid Glass & Extended App Features loaded.');
})();
