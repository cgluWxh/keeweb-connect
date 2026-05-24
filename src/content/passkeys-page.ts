declare global {
    interface Window {
        kwPasskeysInstalled?: boolean;
    }
}

const RequestEvent = 'kw-passkeys-request';
const ResponseEvent = 'kw-passkeys-response';

interface PasskeysRequest {
    action: 'passkeys-get' | 'passkeys-register';
    publicKey: unknown;
    timeout: number;
    abortable: boolean;
}

interface PasskeysAssertionResponse {
    attestationObject?: string;
    authenticatorData: string;
    clientDataJSON: string;
    publicKey?: string;
    publicKeyAlgorithm?: number;
    signature?: string;
    transports?: string[];
    userHandle?: string;
    clientExtensionResults?: Record<string, unknown>;
}

interface PasskeysCredentialResponse {
    id?: string;
    rawId?: string;
    type?: 'public-key';
    authenticatorAttachment?: string;
    errorCode?: string;
    errorMessage?: string;
    response?: PasskeysAssertionResponse;
}

if (!window.kwPasskeysInstalled) {
    window.kwPasskeysInstalled = true;
    installPasskeysProxy();
}

function installPasskeysProxy() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
        return;
    }

    const originalCredentials = navigator.credentials;

    const credentialsProxy = {
        async create(options?: CredentialCreationOptions): Promise<Credential | null> {
            const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
            if (!options?.publicKey) {
                return originalCredentials.create(options);
            }
            checkPasskeysRequest(signal);

            const publicKey = buildCredentialCreationOptions(options.publicKey);
            if (!publicKey) {
                throw new TypeError('Invalid passkey creation options.');
            }

            const response = await postPasskeysRequest(
                {
                    action: 'passkeys-register',
                    publicKey,
                    timeout: getRequestTimeout(publicKey.timeout, true),
                    abortable: false
                },
                signal
            );

            if (!response) {
                return originalCredentials.create(options);
            }
            if (response.errorCode) {
                throwPasskeysError(response.errorCode, response.errorMessage);
            }
            if (!response.response) {
                throwPasskeysError('31');
            }

            return createPublicKeyCredential(response);
        },

        async get(options?: CredentialRequestOptions): Promise<Credential | null> {
            const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
            if (!options?.publicKey || options.mediation === 'silent') {
                return originalCredentials.get(options);
            }
            if ((options as { mediation?: string }).mediation === 'conditional') {
                return originalCredentials.get(options);
            }
            checkPasskeysRequest(signal);

            const publicKey = buildCredentialRequestOptions(options.publicKey);
            if (!publicKey) {
                throw new TypeError('challenge is shorter than required minimum length.');
            }

            const response = await postPasskeysRequest(
                {
                    action: 'passkeys-get',
                    publicKey,
                    timeout: getRequestTimeout(publicKey.timeout, false),
                    abortable: true
                },
                signal
            );

            if (!response) {
                return originalCredentials.get(options);
            }
            if (response.errorCode) {
                throwPasskeysError(response.errorCode, response.errorMessage);
            }
            if (!response.response) {
                throwPasskeysError('31');
            }

            return createPublicKeyCredential(response);
        },

        async store(credential: Credential): Promise<Credential | null> {
            return originalCredentials.store(credential);
        }
    };

    try {
        Object.defineProperty(navigator, 'credentials', { value: credentialsProxy });
        Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', {
            value: () => Promise.resolve(false)
        });
        Object.defineProperty(
            window.PublicKeyCredential,
            'isUserVerifyingPlatformAuthenticatorAvailable',
            {
                value: () => Promise.resolve(true)
            }
        );
    } catch (e) {
        // Ignore pages where the browser does not allow replacing credentials.
    }
}

function postPasskeysRequest(
    request: PasskeysRequest,
    signal?: AbortSignal
): Promise<PasskeysCredentialResponse | undefined> {
    return new Promise((resolve) => {
        let completed = false;
        let timeoutId = 0;
        const finish = (response?: PasskeysCredentialResponse) => {
            if (completed) {
                return;
            }
            completed = true;
            clearTimeout(timeoutId);
            if (request.abortable) {
                signal?.removeEventListener('abort', abortListener);
            }
            document.removeEventListener(ResponseEvent, listener);
            resolve(response);
        };
        const abortListener = () => {
            finish({ errorCode: '22', errorMessage: 'Abort signalled' });
        };
        const listener = (event: Event) => {
            finish((event as CustomEvent<PasskeysCredentialResponse>).detail);
        };
        timeoutId = window.setTimeout(
            () => finish({ errorCode: '30', errorMessage: 'lifetimeTimer has expired' }),
            request.timeout
        );
        if (request.abortable) {
            signal?.addEventListener('abort', abortListener, { once: true });
        }
        document.addEventListener(ResponseEvent, listener);
        document.dispatchEvent(new CustomEvent(RequestEvent, { detail: request }));
    });
}

function buildCredentialRequestOptions(pkOptions: PublicKeyCredentialRequestOptions) {
    if (!pkOptions.challenge || pkOptions.challenge.byteLength < 16) {
        return undefined;
    }

    return {
        challenge: bufferSourceToBase64Url(pkOptions.challenge),
        extensions: pkOptions.extensions,
        rpId: pkOptions.rpId,
        timeout: getTimeout(pkOptions.userVerification, pkOptions.timeout),
        userVerification: pkOptions.userVerification,
        allowCredentials: (pkOptions.allowCredentials || []).map((cred) => ({
            id: bufferSourceToBase64Url(cred.id),
            transports: cred.transports ? [...cred.transports, 'internal'] : ['internal'],
            type: cred.type
        }))
    };
}

function buildCredentialCreationOptions(pkOptions: PublicKeyCredentialCreationOptions) {
    if (!pkOptions.challenge || pkOptions.challenge.byteLength < 16 || !pkOptions.rp) {
        return undefined;
    }

    return {
        attestation: pkOptions.attestation,
        authenticatorSelection: pkOptions.authenticatorSelection,
        challenge: bufferSourceToBase64Url(pkOptions.challenge),
        extensions: pkOptions.extensions,
        pubKeyCredParams: (pkOptions.pubKeyCredParams || []).map((param) => ({
            type: param.type,
            alg: Number(param.alg || 0)
        })),
        rp: {
            id: pkOptions.rp.id || location.hostname,
            name: pkOptions.rp.name
        },
        timeout: getTimeout(pkOptions.authenticatorSelection?.userVerification, pkOptions.timeout),
        excludeCredentials: (pkOptions.excludeCredentials || []).map((cred) => ({
            id: bufferSourceToBase64Url(cred.id),
            transports: cred.transports,
            type: cred.type
        })),
        user: {
            displayName: pkOptions.user.displayName,
            id: bufferSourceToBase64Url(pkOptions.user.id),
            name: pkOptions.user.name
        }
    };
}

function createPublicKeyCredential(publicKey: PasskeysCredentialResponse): PublicKeyCredential {
    if (!publicKey.id || !publicKey.response) {
        throw new Error('Empty passkey response');
    }
    const response = publicKey.response;

    const isAttestation = Boolean(response.attestationObject);
    const authenticatorResponse = isAttestation
        ? {
              attestationObject: base64UrlToArrayBuffer(response.attestationObject || ''),
              clientDataJSON: base64UrlToArrayBuffer(response.clientDataJSON),
              getAuthenticatorData: () => base64UrlToArrayBuffer(response.authenticatorData),
              getPublicKey: () =>
                  response.publicKey ? base64UrlToArrayBuffer(response.publicKey) : null,
              getPublicKeyAlgorithm: () => response.publicKeyAlgorithm,
              getTransports: () => response.transports || ['internal']
          }
        : {
              authenticatorData: base64UrlToArrayBuffer(response.authenticatorData),
              clientDataJSON: base64UrlToArrayBuffer(response.clientDataJSON),
              signature: base64UrlToArrayBuffer(response.signature || ''),
              userHandle: response.userHandle ? base64UrlToArrayBuffer(response.userHandle) : null
          };

    Object.setPrototypeOf(
        authenticatorResponse,
        isAttestation
            ? AuthenticatorAttestationResponse.prototype
            : AuthenticatorAssertionResponse.prototype
    );

    const credential = {
        authenticatorAttachment: publicKey.authenticatorAttachment || 'platform',
        id: publicKey.id,
        rawId: base64UrlToArrayBuffer(publicKey.rawId || publicKey.id),
        response: authenticatorResponse,
        type: publicKey.type || 'public-key',
        getClientExtensionResults: () => response.clientExtensionResults || {},
        toJSON: () => ({
            id: publicKey.id,
            rawId: publicKey.rawId || publicKey.id,
            response: {
                attestationObject: response.attestationObject,
                authenticatorData: response.authenticatorData,
                clientDataJSON: response.clientDataJSON,
                publicKey: response.publicKey,
                publicKeyAlgorithm: response.publicKeyAlgorithm,
                signature: response.signature,
                transports: response.transports,
                userHandle: response.userHandle || undefined
            },
            authenticatorAttachment: publicKey.authenticatorAttachment || 'platform',
            clientExtensionResults: response.clientExtensionResults || {},
            type: publicKey.type || 'public-key'
        })
    };

    return Object.setPrototypeOf(credential, PublicKeyCredential.prototype) as PublicKeyCredential;
}

function getTimeout(userVerification?: string, timeout?: number) {
    const minimum = 15000;
    const maximum = 120000;
    const fallback = userVerification === 'discouraged' ? maximum : 30000;

    if (!timeout || Number(timeout) < minimum || Number(timeout) > maximum) {
        return fallback;
    }
    return Number(timeout);
}

function getRequestTimeout(timeout: number | undefined, isRegistration: boolean) {
    const registrationTimeout = 300000;
    if (isRegistration) {
        return Math.max(Number(timeout) || 0, registrationTimeout);
    }
    return timeout || 30000;
}

function checkPasskeysRequest(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new DOMException('Abort signalled', 'AbortError');
    }
    if (!window.isSecureContext || !isSameOriginWithAncestors()) {
        throw new DOMException(
            'Cross-origin passkey authentication is not allowed.',
            'NotAllowedError'
        );
    }
    if (!(navigator as { userActivation?: { isActive?: boolean } }).userActivation?.isActive) {
        throw new DOMException('User activation is required.', 'NotAllowedError');
    }
}

function isSameOriginWithAncestors() {
    try {
        return window.origin === window.top?.origin;
    } catch {
        return false;
    }
}

function throwPasskeysError(errorCode: string, errorMessage?: string): never {
    const message = errorMessage || `KeeWeb passkeys error ${errorCode}`;
    if (errorCode === '28' || errorCode === '27') {
        throw new DOMException(message, 'SecurityError');
    }
    if (errorCode === '32') {
        throw new TypeError(message);
    }
    throw new DOMException(message, 'NotAllowedError');
}

function bufferSourceToBase64Url(buf: BufferSource) {
    const bytes =
        buf instanceof ArrayBuffer
            ? new Uint8Array(buf)
            : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const str = [...bytes].map((ch) => String.fromCharCode(ch)).join('');
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToArrayBuffer(str: string) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0)).buffer;
}

export {};
