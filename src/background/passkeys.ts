import { backend } from './backend';
import { activateTab } from './utils';
import { BackendConnectionState } from 'common/backend-connection-state';
import {
    KeeWebConnectPasskeysGetPublicKey,
    KeeWebConnectPasskeysGetResponseData,
    KeeWebConnectPasskeysRegisterPublicKey
} from './protocol/types';

interface PasskeysRequest {
    action: 'passkeys-get' | 'passkeys-register';
    publicKey: KeeWebConnectPasskeysGetPublicKey | KeeWebConnectPasskeysRegisterPublicKey;
    origin: string;
}

function startPasskeysListener(): void {
    chrome.runtime.onMessage.addListener((message: PasskeysRequest, sender, sendResponse) => {
        if (
            sender.id !== chrome.runtime.id ||
            (message?.action !== 'passkeys-get' && message?.action !== 'passkeys-register')
        ) {
            return;
        }

        handlePasskeysRequest(message)
            .then(async (response) => {
                if (sender.tab?.id) {
                    await activateTab(sender.tab.id);
                }
                sendResponse({ response });
            })
            .catch((e: Error) =>
                sendResponse({
                    response: {
                        errorCode: '31',
                        errorMessage: e.message
                    }
                })
            );

        return true;
    });
}

async function handlePasskeysRequest(
    message: PasskeysRequest
): Promise<KeeWebConnectPasskeysGetResponseData> {
    const passkeysEnabled = await isPasskeysEnabled();
    if (!passkeysEnabled) {
        return { errorCode: '31', errorMessage: 'Passkeys are disabled' };
    }
    await backend.connect();
    if (backend.state !== BackendConnectionState.Connected) {
        return { errorCode: '31' };
    }
    if (message.action === 'passkeys-register') {
        const publicKey = message.publicKey as KeeWebConnectPasskeysRegisterPublicKey;
        publicKey.relatedOrigins = await getRelatedOrigins(publicKey.rp.id);
        return backend.passkeysRegister(publicKey, message.origin);
    }

    const publicKey = message.publicKey as KeeWebConnectPasskeysGetPublicKey;
    publicKey.relatedOrigins = await getRelatedOrigins(publicKey.rpId);
    return backend.passkeysGet(publicKey, message.origin);
}

function isPasskeysEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['passkeysEnabled'], (result) => {
            resolve(Boolean(result.passkeysEnabled));
        });
    });
}

async function getRelatedOrigins(rpId?: string): Promise<string[]> {
    if (!rpId || !/^[a-z0-9.-]+$/i.test(rpId)) {
        return [];
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`https://${rpId}/.well-known/webauthn`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.headers.get('content-type')?.includes('application/json')) {
            return [];
        }
        const json = (await response.json()) as { origins?: unknown };
        if (!Array.isArray(json.origins) || json.origins.length > 60) {
            return [];
        }
        return json.origins.filter((origin): origin is string => typeof origin === 'string');
    } catch {
        return [];
    }
}

export { startPasskeysListener };
