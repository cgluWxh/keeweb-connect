import { backend } from './backend';
import { ContentScriptMessage, ContentScriptReturn } from 'common/content-script-interface';
import { BackendConnectionState } from 'common/backend-connection-state';
import { activateTab } from './utils';
import { model } from 'options/settings-model';

interface CommandArgs {
    command: string;
    tab: chrome.tabs.Tab;
    url?: string;
    frameId?: number;
    targetId?: string;
}

interface Frame {
    id: number;
    url: string;
    targetId?: string;
}

function startCommandListener(): void {
    chrome.commands.onCommand.addListener(async (command, tab) => {
        if (!tab) {
            [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) =>
                chrome.tabs.query({ active: true }, resolve)
            );
        }
        const activeFrame = await getActiveFrame(tab);
        await runCommand({
            command,
            tab,
            frameId: activeFrame.id,
            url: activeFrame.url,
            targetId: activeFrame.targetId
        });
    });
}

async function runCommand(args: CommandArgs): Promise<void> {
    if (args.command.includes('auto')) {
        const nextCommand = await getNextAutoFillCommand(args);
        if (nextCommand) {
            await runCommand(nextCommand);
        }
        return;
    }

    if (!args.url || !isValidUrl(args.url)) {
        return;
    }
    if (typeof args.frameId !== 'number') {
        return;
    }

    const options = {
        username: args.command.includes('username'),
        password: args.command.includes('password'),
        submit: args.command.includes('submit'),
        otp: args.command.includes('otp'),
        other: args.command.includes('other')
    };

    let shouldFill = false;

    try {
        await backend.connect();
        if (backend.state !== BackendConnectionState.Connected) {
            void chrome.runtime.openOptionsPage();
            return;
        }

        let text: string | undefined;
        let password: string | undefined;

        if (options.username || options.password) {
            const [entry] = await backend.getLogins(args.url);

            if (!entry) {
                return;
            }

            const user = entry.login;
            const pass = entry.password;

            text = options.username ? user : options.password ? pass : undefined;
            password = options.username ? (options.password ? pass : undefined) : undefined;
        } else if (options.otp) {
            text = await backend.getTotp(args.url, args.tab.title || '');
        } else {
            text = await backend.getAnyField(args.url, args.tab.title || '');
        }

        shouldFill = true;
        if (args.tab.id) {
            await activateTab(args.tab.id);
        }

        await autoFill(args.url, args.tab, args.frameId, {
            text,
            password,
            otp: options.otp,
            targetId: args.targetId,
            submit: options.submit
        });
    } finally {
        if (!shouldFill && args.tab.id) {
            await activateTab(args.tab.id);
        }
    }
}

function isValidUrl(url: string): boolean {
    return /^https?:/i.test(url) && !url.startsWith(backend.keeWebUrl);
}

async function getActiveFrame(tab: chrome.tabs.Tab): Promise<Frame> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: {
                    allFrames: true,
                    tabId: tab.id || 0
                },
                func: () => {
                    const activeElement = document.activeElement;
                    let targetId: string | undefined;
                    if (activeElement instanceof HTMLInputElement) {
                        targetId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                        activeElement.setAttribute('data-kw-autofill-target-id', targetId);
                    }
                    const isEditable =
                        activeElement instanceof HTMLInputElement ||
                        activeElement instanceof HTMLTextAreaElement ||
                        activeElement instanceof HTMLSelectElement ||
                        (activeElement instanceof HTMLElement && activeElement.isContentEditable);

                    return {
                        isActive: document.hasFocus() && isEditable,
                        url: location.href,
                        targetId
                    };
                }
            },
            (
                results: chrome.scripting.InjectionResult<{
                    isActive: boolean;
                    url: string;
                    targetId?: string;
                }>[]
            ) => {
                if (chrome.runtime.lastError) {
                    return resolve({ id: 0, url: tab.url || '' });
                }
                const activeFrame = results.find((result) => result.result?.isActive);
                resolve({
                    id: activeFrame?.frameId ?? 0,
                    url: activeFrame?.result?.url || tab.url || '',
                    targetId: activeFrame?.result?.targetId
                });
            }
        );
    });
}

async function getNextAutoFillCommand(args: CommandArgs): Promise<CommandArgs | undefined> {
    const frameCount = await injectPageContentScript(args.tab);
    let allFrames: Frame[];
    if (frameCount > 1) {
        allFrames = await getAllFrames(args.tab);
    } else if (args.tab.url) {
        allFrames = [{ id: 0, url: args.tab.url }];
    } else {
        allFrames = [];
    }
    for (const frame of allFrames) {
        if (!isValidUrl(frame.url)) {
            continue;
        }
        const resp = await sendMessageToTab(args.tab, frame.id, {
            action: 'get-next-auto-fill-command',
            url: frame.url
        });
        if (resp?.nextCommand) {
            const targetId = args.frameId === frame.id ? args.targetId : undefined;
            const nextCommand =
                model.extensionButtonAction === 'submit-auto'
                    ? resp.nextCommand
                    : resp.nextCommand.replace('submit-', 'insert-');
            args.command = nextCommand;
            args.frameId = frame.id;
            args.url = frame.url;
            args.targetId = targetId;
            return {
                command: nextCommand,
                tab: args.tab,
                frameId: frame.id,
                url: frame.url,
                targetId
            };
        }
    }
}

async function getAllFrames(tab: chrome.tabs.Tab): Promise<Frame[]> {
    return new Promise((resolve, reject) => {
        chrome.webNavigation.getAllFrames({ tabId: tab.id || 0 }, (frames) => {
            if (chrome.runtime.lastError || !frames) {
                const err = chrome.runtime.lastError?.message || 'empty frames';
                const msg = `Cannot get tab frames: ${err}`;
                return reject(new Error(msg));
            }
            resolve(frames.map((f) => ({ id: f.frameId, url: f.url })));
        });
    });
}

async function autoFill(
    url: string,
    tab: chrome.tabs.Tab,
    frameId: number,
    options: { text?: string; password?: string; otp: boolean; targetId?: string; submit: boolean }
): Promise<ContentScriptReturn | undefined> {
    return await sendMessageToTab(tab, frameId, {
        action: 'auto-fill',
        url,
        ...options
    });
}

async function sendMessageToTab(
    tab: chrome.tabs.Tab,
    frameId: number,
    message: ContentScriptMessage
): Promise<ContentScriptReturn | undefined> {
    await injectPageContentScript(tab);
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id || 0, message, { frameId }, (resp) => {
            if (chrome.runtime.lastError) {
                return resolve(undefined);
            }
            resolve(resp); // eslint-disable-line @typescript-eslint/no-unsafe-argument
        });
    });
}

function injectPageContentScript(tab: chrome.tabs.Tab): Promise<number> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            { files: ['js/content-page.js'], target: { allFrames: true, tabId: tab.id || 0 } },
            (results) => {
                if (chrome.runtime.lastError) {
                    return resolve(0);
                }
                resolve(results.length);
            }
        );
    });
}

export { startCommandListener, runCommand };
