import {
    ContentScriptMessage,
    ContentScriptMessageAutoFill,
    ContentScriptReturn
} from 'common/content-script-interface';

declare global {
    interface Window {
        kwExtensionInstalled: boolean;
    }
}

if (!window.kwExtensionInstalled) {
    window.kwExtensionInstalled = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id) {
            return;
        }

        const response = run(message as ContentScriptMessage);
        if (response) {
            sendResponse(response);
        }

        function run(message: ContentScriptMessage): ContentScriptReturn | undefined {
            if (location.href !== message.url) {
                return;
            }
            switch (message.action) {
                case 'auto-fill':
                    autoFill(message);
                    break;
                case 'get-next-auto-fill-command':
                    return getNextAutoFillCommand();
            }
        }

        function getNextAutoFillCommand() {
            const activeInput = getActiveInput();
            const input = activeInput || findOtpInput();
            if (!input) {
                return;
            }

            let nextCommand;
            if (isOtpInput(input)) {
                nextCommand = 'insert-otp';
            } else if (input.type === 'password') {
                nextCommand = 'submit-password';
            } else {
                const passInput = getNextFormPasswordInput(input);
                if (passInput) {
                    nextCommand = 'submit-username-password';
                } else {
                    nextCommand = 'submit-username';
                }
            }
            return { nextCommand };
        }

        function isOtpInput(input: HTMLInputElement) {
            const type = input.type.toLowerCase();
            const otpTypes = new Set(['text', 'tel', 'number', 'search', 'password']);
            if (!otpTypes.has(type) || !isVisibleInput(input)) {
                return false;
            }

            const text = [
                input.name,
                input.id,
                input.autocomplete,
                input.placeholder,
                input.getAttribute('aria-label') || ''
            ]
                .join(' ')
                .toLowerCase();

            return (
                input.inputMode === 'numeric' ||
                input.autocomplete === 'one-time-code' ||
                input.maxLength === 6 ||
                input.getAttribute('maxlength') === '6' ||
                text.includes('otp') ||
                text.includes('totp') ||
                text.includes('2fa') ||
                text.includes('mfa') ||
                text.includes('verification') ||
                text.includes('authenticator') ||
                /\bcode\b/.test(text)
            );
        }

        function findOtpInput(): HTMLInputElement | undefined {
            const visibleInputs = getVisibleInputs();
            const otpInput = visibleInputs.find((input) => isOtpInput(input));
            if (otpInput) {
                return otpInput;
            }

            return findSegmentedOtpInput(visibleInputs);
        }

        function findSegmentedOtpInput(
            visibleInputs = getVisibleInputs()
        ): HTMLInputElement | undefined {
            const singleCharInputs = visibleInputs.filter((input) => isSingleCharOtpInput(input));
            for (let ix = 0; ix < singleCharInputs.length; ix++) {
                const group = singleCharInputs.slice(ix, ix + 8);
                if (group.length < 4) {
                    continue;
                }
                const container = getSmallestCommonContainer(group.slice(0, 4));
                const containerText = [
                    container?.textContent || '',
                    ...group
                        .slice(0, 8)
                        .map((input) =>
                            [
                                input.name,
                                input.id,
                                input.autocomplete,
                                input.placeholder,
                                input.getAttribute('aria-label') || ''
                            ].join(' ')
                        )
                ]
                    .join(' ')
                    .toLowerCase();
                if (
                    group[0].autocomplete === 'one-time-code' ||
                    containerText.includes('otp') ||
                    containerText.includes('totp') ||
                    containerText.includes('2fa') ||
                    containerText.includes('mfa') ||
                    containerText.includes('verification') ||
                    containerText.includes('authenticator') ||
                    /\bcode\b/.test(containerText)
                ) {
                    return group.find((input) => !input.value) || group[0];
                }
            }
        }

        function autoFill(arg: ContentScriptMessageAutoFill) {
            const { text, password, otp, targetId, submit } = arg;

            let input = getMarkedInput(targetId) || (otp ? getOtpTargetInput() : getActiveInput());
            if (!input) {
                return;
            }

            if (!text) {
                return;
            }

            input.focus();
            if (otp) {
                setOtpText(input, text);
            } else {
                setInputText(input, text);
            }

            const form = input.form;

            if (password) {
                input = getNextFormPasswordInput(input);
                if (!input) {
                    return;
                }

                input.focus();
                setInputText(input, password);
            }

            if (form && submit) {
                submitForm(form);
            }
            input.removeAttribute('data-kw-autofill-target-id');
        }

        function getActiveInput(): HTMLInputElement | undefined {
            const input = document.activeElement;
            if (input instanceof HTMLInputElement && isVisibleInput(input)) {
                return input;
            }
        }

        function getOtpTargetInput(): HTMLInputElement | undefined {
            const input = getActiveInput();
            if (input && isOtpInput(input)) {
                return input;
            }
            return findOtpInput();
        }

        function getMarkedInput(targetId?: string): HTMLInputElement | undefined {
            if (!targetId) {
                return;
            }
            const input = document.querySelector(`input[data-kw-autofill-target-id="${targetId}"]`);
            if (input instanceof HTMLInputElement && isVisibleInput(input)) {
                return input;
            }
        }

        function setOtpText(input: HTMLInputElement, text: string) {
            const otpGroup = getOtpInputGroup(input, text);
            if (otpGroup.length > 1) {
                for (let ix = 0; ix < otpGroup.length && ix < text.length; ix++) {
                    setInputText(otpGroup[ix], text[ix]);
                }
                otpGroup[Math.min(text.length, otpGroup.length) - 1]?.focus();
            } else {
                setInputText(input, text);
            }
        }

        function getOtpInputGroup(input: HTMLInputElement, text: string): HTMLInputElement[] {
            if (text.length <= 1 || !isSingleCharOtpInput(input)) {
                return [input];
            }

            const inputs = getVisibleInputs(input.form || document).filter((item) =>
                isSingleCharOtpInput(item)
            );
            const inputIndex = inputs.indexOf(input);
            if (inputIndex < 0) {
                return [input];
            }

            const group = inputs.slice(inputIndex, inputIndex + text.length);
            return group.length > 1 ? group : [input];
        }

        function setInputText(input: HTMLInputElement, text: string) {
            const valueDescriptor = Object.getOwnPropertyDescriptor(input, 'value');
            const prototypeValueDescriptor = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(input),
                'value'
            );
            if (prototypeValueDescriptor?.set) {
                // eslint-disable-next-line @typescript-eslint/unbound-method
                prototypeValueDescriptor.set.call(input, text);
            } else if (valueDescriptor?.set) {
                // eslint-disable-next-line @typescript-eslint/unbound-method
                valueDescriptor.set.call(input, text);
            } else {
                input.value = text;
            }
            input.dispatchEvent(
                new InputEvent('input', { inputType: 'insertFromPaste', data: text, bubbles: true })
            );
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function getVisibleInputs(root: ParentNode = document): HTMLInputElement[] {
            return [...root.querySelectorAll('input')].filter((input) => isVisibleInput(input));
        }

        function isVisibleInput(input: HTMLInputElement) {
            return !input.disabled && !input.readOnly && input.getClientRects().length > 0;
        }

        function isSingleCharOtpInput(input: HTMLInputElement) {
            const type = input.type.toLowerCase();
            return (
                ['text', 'tel', 'number', 'password'].includes(type) &&
                (input.maxLength === 1 || input.getAttribute('maxlength') === '1') &&
                isVisibleInput(input)
            );
        }

        function getSmallestCommonContainer(inputs: HTMLInputElement[]): HTMLElement | undefined {
            let container = inputs[0]?.parentElement;
            while (container) {
                if (inputs.every((input) => container?.contains(input))) {
                    return container;
                }
                container = container.parentElement;
            }
        }

        function getNextFormPasswordInput(input: HTMLInputElement): HTMLInputElement | undefined {
            if (!input.form) {
                const inputs = [...document.querySelectorAll('input')];
                if (!inputs.includes(input)) {
                    return undefined;
                }
                for (let ix = inputs.indexOf(input) + 1; ix < inputs.length; ix++) {
                    const nextInput = inputs[ix] as HTMLInputElement;
                    if (nextInput.form) {
                        return undefined;
                    }
                    switch (nextInput.type) {
                        case 'password':
                            return nextInput;
                        case 'checkbox':
                        case 'hidden':
                            continue;
                        default:
                            return undefined;
                    }
                }
                return undefined;
            }
            let found = false;
            for (const element of input.form.elements) {
                if (found) {
                    if (element.tagName === 'INPUT') {
                        const inputEl = element as HTMLInputElement;
                        if (inputEl.type === 'password') {
                            return inputEl;
                        }
                    }
                }
                if (element === input) {
                    found = true;
                }
            }
            return undefined;
        }

        function submitForm(form: HTMLFormElement) {
            const submitButton = <HTMLInputElement | undefined>(
                form.querySelector('input[type=submit],button[type=submit]')
            );
            if (typeof form.requestSubmit === 'function') {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                form.requestSubmit(submitButton);
            } else if (submitButton) {
                submitButton.click();
            } else {
                const btn = document.createElement('input');
                btn.type = 'submit';
                btn.hidden = true;
                form.appendChild(btn);
                btn.click();
                form.removeChild(btn);
            }
        }
    });
}

export {};
