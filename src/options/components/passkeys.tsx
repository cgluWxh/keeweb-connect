import { FunctionComponent } from 'preact';
import { res } from 'options/utils';
import { model } from 'options/settings-model';

const Passkeys: FunctionComponent = () => {
    const setPasskeysEnabled = (event: Event) => {
        model.setPasskeysEnabled((event.currentTarget as HTMLInputElement).checked);
    };
    const setPasskeysFallback = (event: Event) => {
        model.setPasskeysFallback((event.currentTarget as HTMLInputElement).checked);
    };

    return (
        <>
            <h2 id="passkeys">{res('optionsPasskeys')}</h2>
            <p>
                <label>
                    <input
                        type="checkbox"
                        checked={model.passkeysEnabled}
                        onChange={setPasskeysEnabled}
                    />{' '}
                    {res('optionsPasskeysEnable')}
                </label>
            </p>
            <p>
                <label>
                    <input
                        type="checkbox"
                        checked={model.passkeysFallback}
                        onChange={setPasskeysFallback}
                    />{' '}
                    {res('optionsPasskeysFallback')}
                </label>
            </p>
        </>
    );
};

export { Passkeys };
