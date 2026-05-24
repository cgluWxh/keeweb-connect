// generic request types

export interface KeeWebConnectRequest {
    action: string;
}

export interface KeeWebConnectEncryptedRequest extends KeeWebConnectRequest {
    message: string;
    nonce: string;
    clientID: string;
}

export interface KeeWebConnectRequestKey {
    id: string;
    key: string;
}

// generic response types

export interface KeeWebConnectResponse {
    action?: string;
    success?: string;
    error?: string;
    errorCode?: string;
    version?: string;
    keeWebConnectError?: string;
}

export interface KeeWebConnectEncryptedResponse extends KeeWebConnectResponse {
    message: string;
    nonce: string;
}

// ping

export interface KeeWebConnectPingRequest extends KeeWebConnectRequest {
    action: 'ping';
    data: string;
}

export interface KeeWebConnectPingResponse extends KeeWebConnectResponse {
    data: string;
}

// change-public-keys

export interface KeeWebConnectChangePublicKeysRequest extends KeeWebConnectRequest {
    action: 'change-public-keys';
    extensionName: string;
    version: string;
    publicKey: string;
    nonce: string;
    clientID: string;
}

export interface KeeWebConnectChangePublicKeysResponse extends KeeWebConnectResponse {
    action: 'change-public-keys';
    appName: string;
    publicKey: string;
    nonce: string;
}

// get-databasehash

export interface KeeWebConnectGetDatabaseHashRequestPayload extends KeeWebConnectRequest {
    action: 'get-databasehash';
}

export interface KeeWebConnectGetDatabaseHashResponsePayload extends KeeWebConnectResponse {
    hash: string;
}

// generate-password

export interface KeeWebConnectGeneratePasswordRequest extends KeeWebConnectRequest {
    action: 'generate-password';
    nonce: string;
    clientID: string;
}

export interface KeeWebConnectGeneratedPassword {
    // entropy: number;
    // login: number; // number, wtf?
    password: string;
}

export interface KeeWebConnectGeneratePasswordResponsePayload extends KeeWebConnectResponse {
    entries: KeeWebConnectGeneratedPassword[];
}

// lock-database

export interface KeeWebConnectLockDatabaseRequestPayload extends KeeWebConnectRequest {
    action: 'lock-database';
}

// get-logins

export interface KeeWebConnectGetLoginsRequestPayload extends KeeWebConnectRequest {
    action: 'get-logins';
    url: string;
    submitUrl?: string;
    httpAuth?: string;
    keys?: KeeWebConnectRequestKey[];
}

export interface KeeWebConnectGetLoginsResponseEntry {
    group: string;
    login: string;
    name: string;
    password: string;
    uuid: string;
}

export interface KeeWebConnectGetLoginsResponsePayload extends KeeWebConnectResponse {
    count: number;
    entries: KeeWebConnectGetLoginsResponseEntry[];
    hash: string;
}

// get-totp-by-url

export interface KeeWebConnectGetTotpByUrlRequestPayload extends KeeWebConnectRequest {
    action: 'get-totp-by-url';
    url: string;
    title: string;
}

export interface KeeWebConnectGetTotpByUrlResponsePayload extends KeeWebConnectResponse {
    totp: string;
}

// get-any-field

export interface KeeWebConnectGetAnyFieldRequestPayload extends KeeWebConnectRequest {
    action: 'get-any-field';
    url: string;
    title: string;
}

export interface KeeWebConnectGetAnyFieldResponsePayload extends KeeWebConnectResponse {
    field: string;
    value: string;
}

// passkeys

export interface KeeWebConnectPasskeyCredentialDescriptor {
    id: string;
    transports?: string[];
    type: 'public-key';
}

export interface KeeWebConnectPasskeysGetPublicKey {
    allowCredentials?: KeeWebConnectPasskeyCredentialDescriptor[];
    challenge: string;
    extensions?: unknown;
    relatedOrigins?: string[];
    rpId?: string;
    timeout?: number;
    userVerification?: string;
}

export interface KeeWebConnectPasskeysRegisterPublicKey {
    attestation?: string;
    authenticatorSelection?: {
        residentKey?: string;
        requireResidentKey?: boolean;
        userVerification?: string;
    };
    challenge: string;
    excludeCredentials?: KeeWebConnectPasskeyCredentialDescriptor[];
    extensions?: unknown;
    pubKeyCredParams?: Array<{ type: 'public-key'; alg: number }>;
    relatedOrigins?: string[];
    rp: { id: string; name?: string };
    timeout?: number;
    user: { displayName: string; id: string; name: string };
}

export interface KeeWebConnectPasskeysGetRequestPayload extends KeeWebConnectRequest {
    action: 'passkeys-get';
    publicKey: KeeWebConnectPasskeysGetPublicKey;
    origin: string;
}

export interface KeeWebConnectPasskeysRegisterRequestPayload extends KeeWebConnectRequest {
    action: 'passkeys-register';
    publicKey: KeeWebConnectPasskeysRegisterPublicKey;
    origin: string;
}

export interface KeeWebConnectPasskeysGetResponseData {
    id?: string;
    rawId?: string;
    type?: 'public-key';
    authenticatorAttachment?: string;
    response?: {
        authenticatorData?: string;
        attestationObject?: string;
        clientDataJSON?: string;
        publicKey?: string;
        publicKeyAlgorithm?: number;
        signature?: string;
        transports?: string[];
        userHandle?: string;
        errorCode?: string;
    };
    errorCode?: string;
    errorMessage?: string;
}

export interface KeeWebConnectPasskeysGetResponsePayload extends KeeWebConnectResponse {
    response: KeeWebConnectPasskeysGetResponseData;
}

export interface KeeWebConnectPasskeysRegisterResponsePayload extends KeeWebConnectResponse {
    response: KeeWebConnectPasskeysGetResponseData;
}
