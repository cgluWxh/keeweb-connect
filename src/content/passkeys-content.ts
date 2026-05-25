interface PasskeysPageRequest {
    action: 'passkeys-get' | 'passkeys-register';
    publicKey: unknown;
    requestId: string;
}

interface PasskeysBackgroundResponse {
    response?: Record<string, unknown>;
}

const RequestEvent = 'kw-passkeys-request';
const ResponseEvent = 'kw-passkeys-response';
const CancelEvent = 'kw-passkeys-cancel';
const DefaultKeeWebUrl = 'https://app.keeweb.info/';

let passkeysEnabled = false;
let passkeysFallback = true;
let keeWebUrl = DefaultKeeWebUrl;

chrome.storage.local.get(['passkeysEnabled', 'passkeysFallback', 'keeWebUrl'], (result) => {
    passkeysEnabled = Boolean(result.passkeysEnabled);
    passkeysFallback = <boolean>(result.passkeysFallback ?? true);
    keeWebUrl = <string>(result.keeWebUrl || DefaultKeeWebUrl);
    if (canInjectPasskeys()) {
        injectPageScript();
    }
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.passkeysEnabled) {
        passkeysEnabled = Boolean(changes.passkeysEnabled.newValue);
        if (canInjectPasskeys()) {
            injectPageScript();
        }
    }
    if (changes.passkeysFallback) {
        passkeysFallback = <boolean>(changes.passkeysFallback.newValue ?? true);
    }
    if (changes.keeWebUrl) {
        keeWebUrl = <string>(changes.keeWebUrl.newValue || DefaultKeeWebUrl);
    }
});

document.addEventListener(RequestEvent, (event) => {
    const detail = (event as CustomEvent<PasskeysPageRequest>).detail;
    if (detail?.action !== 'passkeys-get' && detail?.action !== 'passkeys-register') {
        return;
    }
    if (!passkeysEnabled) {
        document.dispatchEvent(
            new CustomEvent(ResponseEvent, {
                detail: {
                    errorCode: '31',
                    errorMessage: 'Passkeys are disabled',
                    fallback: passkeysFallback,
                    requestId: detail.requestId
                }
            })
        );
        return;
    }

    chrome.runtime.sendMessage(
        {
            action: detail.action,
            publicKey: detail.publicKey,
            origin: location.origin,
            requestId: detail.requestId
        },
        (response: PasskeysBackgroundResponse) => {
            const lastError = chrome.runtime.lastError;
            document.dispatchEvent(
                new CustomEvent(ResponseEvent, {
                    detail: {
                        ...(response?.response || {
                            errorCode: '31',
                            errorMessage: lastError?.message
                        }),
                        fallback: passkeysFallback,
                        requestId: detail.requestId
                    }
                })
            );
        }
    );
});

document.addEventListener(CancelEvent, (event) => {
    const detail = (event as CustomEvent<{ requestId?: string }>).detail;
    if (!detail?.requestId) {
        return;
    }
    void chrome.runtime.sendMessage({
        action: 'passkeys-cancel',
        requestId: detail.requestId
    });
});

function injectPageScript() {
    if (isKeeWebOrigin()) {
        return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/passkeys-page.js');
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
}

function canInjectPasskeys() {
    return passkeysEnabled && !isKeeWebOrigin();
}

function isKeeWebOrigin() {
    try {
        return new URL(keeWebUrl).origin === location.origin;
    } catch (e) {
        return new URL(DefaultKeeWebUrl).origin === location.origin;
    }
}

export {};
