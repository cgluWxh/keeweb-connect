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

let passkeysEnabled = false;

chrome.storage.local.get(['passkeysEnabled'], (result) => {
    passkeysEnabled = Boolean(result.passkeysEnabled);
    if (passkeysEnabled) {
        injectPageScript();
    }
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.passkeysEnabled) {
        passkeysEnabled = Boolean(changes.passkeysEnabled.newValue);
        if (passkeysEnabled) {
            injectPageScript();
        }
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
                        requestId: detail.requestId
                    }
                })
            );
        }
    );
});

function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/passkeys-page.js');
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
}

export {};
