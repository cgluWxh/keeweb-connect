import { backend } from './backend';
import { activateTab } from './utils';
import { BackendConnectionState } from 'common/backend-connection-state';
import { parse as parsePublicSuffix } from 'psl';
import {
    KeeWebConnectPasskeysGetPublicKey,
    KeeWebConnectPasskeysGetResponseData,
    KeeWebConnectPasskeysRegisterPublicKey
} from './protocol/types';

interface PasskeysRequest {
    action: 'passkeys-get' | 'passkeys-register' | 'passkeys-cancel';
    publicKey?: KeeWebConnectPasskeysGetPublicKey | KeeWebConnectPasskeysRegisterPublicKey;
    origin?: string;
    requestId?: string;
}

interface ActivePasskeysRequest {
    action: 'passkeys-get' | 'passkeys-register';
    publicKey: KeeWebConnectPasskeysGetPublicKey | KeeWebConnectPasskeysRegisterPublicKey;
    origin: string;
    requestId: string;
}

const activeRequests = new Map<string, AbortController>();
const cancelledRequests = new Set<string>();

function startPasskeysListener(): void {
    chrome.runtime.onMessage.addListener((message: PasskeysRequest, sender, sendResponse) => {
        if (
            sender.id !== chrome.runtime.id ||
            !['passkeys-get', 'passkeys-register', 'passkeys-cancel'].includes(message?.action)
        ) {
            return;
        }

        if (message.action === 'passkeys-cancel') {
            cancelPasskeysRequest(message.requestId);
            sendResponse({});
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
    if (!message.requestId || !message.publicKey || !message.origin) {
        return { errorCode: '31' };
    }
    const activeMessage = message as ActivePasskeysRequest;
    const abortController = new AbortController();
    activeRequests.set(activeMessage.requestId, abortController);
    cancelledRequests.delete(activeMessage.requestId);
    try {
        return await handleActivePasskeysRequest(activeMessage, abortController.signal);
    } finally {
        activeRequests.delete(activeMessage.requestId);
        cancelledRequests.delete(activeMessage.requestId);
    }
}

async function handleActivePasskeysRequest(
    message: ActivePasskeysRequest,
    signal: AbortSignal
): Promise<KeeWebConnectPasskeysGetResponseData> {
    const passkeysEnabled = await isPasskeysEnabled();
    if (!passkeysEnabled) {
        return { errorCode: '31', errorMessage: 'Passkeys are disabled' };
    }
    if (isRequestCancelled(message.requestId)) {
        return { errorCode: '22', errorMessage: 'Abort signalled' };
    }
    await backend.connect();
    if (
        backend.state !== BackendConnectionState.Connected ||
        isRequestCancelled(message.requestId)
    ) {
        return { errorCode: '31' };
    }
    if (message.action === 'passkeys-register') {
        const publicKey = message.publicKey as KeeWebConnectPasskeysRegisterPublicKey;
        publicKey.relatedOrigins = await getRelatedOrigins(publicKey.rp.id, signal);
        if (isRequestCancelled(message.requestId)) {
            return { errorCode: '22', errorMessage: 'Abort signalled' };
        }
        return backend.passkeysRegister(publicKey, message.origin);
    }

    const publicKey = message.publicKey as KeeWebConnectPasskeysGetPublicKey;
    publicKey.relatedOrigins = await getRelatedOrigins(publicKey.rpId, signal);
    if (isRequestCancelled(message.requestId)) {
        return { errorCode: '22', errorMessage: 'Abort signalled' };
    }
    return backend.passkeysGet(publicKey, message.origin);
}

function cancelPasskeysRequest(requestId?: string): void {
    if (!requestId) {
        return;
    }
    cancelledRequests.add(requestId);
    activeRequests.get(requestId)?.abort();
}

function isRequestCancelled(requestId: string): boolean {
    return cancelledRequests.has(requestId);
}

function isPasskeysEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['passkeysEnabled'], (result) => {
            resolve(Boolean(result.passkeysEnabled));
        });
    });
}

async function getRelatedOrigins(rpId: string | undefined, signal: AbortSignal): Promise<string[]> {
    const canonicalRpId = canonicalizeDomain(rpId);
    if (!canonicalRpId || isPublicSuffix(canonicalRpId)) {
        return [];
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        signal.addEventListener('abort', () => controller.abort(), { once: true });
        const response = await fetch(`https://${canonicalRpId}/.well-known/webauthn`, {
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            return [];
        }
        if (!response.headers.get('content-type')?.includes('application/json')) {
            return [];
        }
        const json = (await response.json()) as { origins?: unknown };
        if (!Array.isArray(json.origins) || !json.origins.length || json.origins.length > 60) {
            return [];
        }
        const origins = json.origins
            .filter((origin): origin is string => typeof origin === 'string')
            .map(canonicalizeOrigin)
            .filter((origin): origin is string => Boolean(origin));
        return [...new Set(origins)];
    } catch {
        return [];
    }
}

function canonicalizeOrigin(origin: string): string | undefined {
    let url;
    try {
        url = new URL(origin);
    } catch {
        return undefined;
    }
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        !canonicalizeDomain(url.hostname)
    ) {
        return undefined;
    }
    return url.origin;
}

function canonicalizeDomain(host?: string): string | undefined {
    if (!host) {
        return undefined;
    }
    let url;
    try {
        url = new URL(`https://${host}`);
    } catch {
        return undefined;
    }
    if (
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.port
    ) {
        return undefined;
    }
    const hostname = url.hostname.toLowerCase();
    if (
        !/^[a-z0-9.-]+$/i.test(hostname) ||
        !hostname.includes('.') ||
        hostname.endsWith('.') ||
        isIpAddress(hostname) ||
        !hostname
            .split('.')
            .every((label) => label && !label.startsWith('-') && !label.endsWith('-'))
    ) {
        return undefined;
    }
    return hostname;
}

function isPublicSuffix(hostname: string): boolean {
    const parsed = parsePublicSuffix(hostname);
    return Boolean(parsed.error || !parsed.domain);
}

function isIpAddress(hostname: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

export { startPasskeysListener };
